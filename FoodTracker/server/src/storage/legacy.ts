import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { INSERT_OVERRIDE } from "../admin/overrides.js";
import { INSERT_USER, ROLES, userValues, type AuthProvider, type User } from "../auth/users.js";
import { FLAG_REASONS, INSERT_PHOTO } from "../community/feedback.js";
import { INSERT_COMMUNITY_RECIPE, storeRecipeImage } from "../community/store.js";
import { DIARY_KIND, diaryData } from "../diary/store.js";
import type { Recipe } from "../types.js";
import type { Db } from "./db.js";
import { decodeDataUri, newImageKey, type ImageStore } from "./images.js";
import { SyncStore, type StoredSyncRecord } from "./sync.js";

// Einmaliger Umzug aus den JSON-Dateien älterer Fassungen in die Datenbank (Vorrang 1, 9.2).

/** Merkzettel in storage_meta: wann welche Datei mit welchem Ergebnis übernommen wurde. */
async function markImported(db: Db, key: string, counts: object) {
  await db.run("INSERT INTO storage_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [
    `imported:${key}`,
    JSON.stringify({ at: new Date().toISOString(), ...counts }),
  ]);
}

/** Datei samt Zwischenstand vom Schreiben (`.tmp`) löschen. */
function removeLegacyFile(file: string) {
  rmSync(file, { force: true });
  rmSync(`${file}.tmp`, { force: true });
}

interface LegacyUsersFile {
  users?: unknown[];
  sessions?: unknown[];
  resets?: unknown[];
}

const PROVIDERS: readonly AuthProvider[] = ["apple", "google", "dev", "password"];
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function legacyUser(raw: unknown): User | undefined {
  const u = raw as Partial<User> | null;
  if (!u || !text(u.id) || !PROVIDERS.includes(u.provider as AuthProvider) || !text(u.providerSub) || !text(u.createdAt)) return undefined;
  return {
    id: u.id,
    provider: u.provider as AuthProvider,
    providerSub: u.providerSub,
    email: text(u.email) ? u.email : null,
    name: text(u.name) ? u.name : "Nutzer:in",
    role: ROLES.includes(u.role as User["role"]) ? (u.role as User["role"]) : "user",
    blocked: u.blocked === true,
    createdAt: u.createdAt,
    lastLoginAt: text(u.lastLoginAt) ? u.lastLoginAt : u.createdAt,
    ...(text(u.passwordHash) ? { passwordHash: u.passwordHash } : {}),
    ...(u.provider === "password" ? { emailVerified: u.emailVerified === true } : {}),
  };
}

export interface LegacyImport {
  /** Übernommene Konten. */
  users: number;
  /** Konten, die die Datenbank schon hatte (gleiche ID oder gleiche Anmeldung), oder unlesbare Einträge. */
  skipped: number;
  /** Übernommene, noch gültige Sitzungen – wer angemeldet war, bleibt es. */
  sessions: number;
}

/**
 * Bis 27.11.2026 lagen Konten, Sitzungen und Codes zum Zurücksetzen in `data/users.json`. Liegt diese Datei noch da,
 * kommt ihr Inhalt einmal in die Datenbank – mit denselben Konto-IDs (daran hängen Tagebuch-Sicherung, Fotos und
 * geteilte Rezepte) und den noch gültigen Sitzungen. Was die Datenbank schon hat, bleibt, wie es ist (nichts doppelt).
 * Danach wird die Datei gelöscht: Sonst kämen gelöschte Konten beim nächsten Start zurück, und Passwort-Hashes lägen
 * doppelt auf der Platte. Eine unlesbare Datei bleibt unangetastet (Fehler). Ohne Datei: null.
 */
export async function importLegacyUsers(db: Db, file: string): Promise<LegacyImport | null> {
  if (!existsSync(file)) return null;
  const data = JSON.parse(readFileSync(file, "utf8")) as LegacyUsersFile;
  const now = new Date().toISOString();
  const result = await db.transaction(async (tx) => {
    const counts: LegacyImport = { users: 0, skipped: 0, sessions: 0 };
    const imported = new Set<string>();
    for (const raw of data.users ?? []) {
      const user = legacyUser(raw);
      if (user && (await tx.run(INSERT_USER, userValues(user))) > 0) {
        counts.users++;
        imported.add(user.id);
      } else counts.skipped++;
    }
    // Sitzungen und Codes nur für Konten, die jetzt aus der Datei kommen – nie für ein anderes Konto gleicher ID.
    for (const raw of data.sessions ?? []) {
      const s = raw as { tokenHash?: unknown; userId?: unknown; expiresAt?: unknown } | null;
      if (!s || !text(s.tokenHash) || !text(s.userId) || !text(s.expiresAt) || !imported.has(s.userId) || s.expiresAt <= now) continue;
      counts.sessions += await tx.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", [
        s.tokenHash,
        s.userId,
        s.expiresAt,
      ]);
    }
    for (const raw of data.resets ?? []) {
      const r = raw as { userId?: unknown; codeHash?: unknown; expiresAt?: unknown; attempts?: unknown } | null;
      if (!r || !text(r.userId) || !text(r.codeHash) || !text(r.expiresAt) || !imported.has(r.userId) || r.expiresAt <= now) continue;
      await tx.run("INSERT INTO password_resets (user_id, code_hash, expires_at, attempts) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", [
        r.userId,
        r.codeHash,
        r.expiresAt,
        typeof r.attempts === "number" ? r.attempts : 0,
      ]);
    }
    await tx.run("INSERT INTO storage_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [
      "imported:users.json",
      JSON.stringify({ at: now, ...counts }),
    ]);
    return counts;
  });
  removeLegacyFile(file);
  return result;
}

export interface LegacyDiaryImport {
  /** Übernommene Sicherungen (eine Datei pro Konto bzw. Gerät). */
  owners: number;
  /** Übernommene Einträge und Löschmarken. */
  records: number;
  /** Unlesbare Dateien – sie bleiben liegen. */
  unreadable: number;
}

/** Höchste Revision, die Postgres in einer INTEGER-Spalte speichern kann. */
const MAX_REV = 2_147_483_647;
const revision = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_REV;

/** Eine Datei aus `data/diary/` lesen; null, wenn sie unlesbar ist oder nicht wie eine Sicherung aussieht. */
function legacyDiaryFile(file: string): { owner: string; rev: number; records: StoredSyncRecord[] } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const saved = raw as { owner?: unknown; rev?: unknown; records?: unknown } | null;
  if (!saved || typeof saved.owner !== "string" || !/^(user|device):./.test(saved.owner) || !revision(saved.rev)) return null;
  if (!saved.records || typeof saved.records !== "object") return null;
  const records = Object.values(saved.records).flatMap((value): StoredSyncRecord[] => {
    const r = value as { id?: unknown; updatedAt?: unknown; rev?: unknown; entry?: unknown } | null;
    if (!r || typeof r.id !== "string" || r.id.length === 0 || r.id.length > 100 || !revision(r.rev)) return [];
    if (typeof r.updatedAt !== "string" || Number.isNaN(Date.parse(r.updatedAt))) return [];
    if (r.entry !== null && (typeof r.entry !== "object" || Array.isArray(r.entry))) return [];
    return [{ id: r.id, rev: r.rev, updatedAt: new Date(r.updatedAt).toISOString(), data: r.entry === null ? null : diaryData(r.entry as object) }];
  });
  return { owner: saved.owner, rev: saved.rev, records };
}

/**
 * Bis 27.11.2026 lag die Sicherung der Ernährungshistorie in `data/diary/`: eine JSON-Datei pro Konto bzw. Gerät
 * (Name = Prüfsumme des Besitzers). Jede lesbare Datei kommt einmal in die Datenbank (Tabelle sync_records, Art
 * „diary“) – mit denselben Revisionen, damit Geräte, die schon abgeglichen haben, beim nächsten Mal nichts verpassen –
 * und wird danach gelöscht (sonst kämen gelöschte Konten beim nächsten Start zurück). Unlesbare Dateien bleiben liegen,
 * ein leerer Ordner verschwindet. Ohne Ordner bzw. ohne Dateien: null.
 */
export async function importLegacyDiary(db: Db, dir: string): Promise<LegacyDiaryImport | null> {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  const counts: LegacyDiaryImport = { owners: 0, records: 0, unreadable: 0 };
  const store = new SyncStore(db);
  for (const name of files.sort()) {
    const file = join(dir, name);
    const saved = legacyDiaryFile(file);
    if (!saved) {
      counts.unreadable++;
      continue;
    }
    counts.records += await store.importOwner(DIARY_KIND, saved.owner, saved.records, saved.rev);
    counts.owners++;
    removeLegacyFile(file);
  }
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
  if (files.length === 0) return null;
  await markImported(db, "diary", counts);
  return counts;
}

// Bis 27.11.2026 lagen Community-Rezepte, Fotos samt Sternen und Meldungen sowie die Admin-Änderungen an
// Katalogrezepten in je einer JSON-Datei, Fotos als data-URI mittendrin. Liegt eine davon noch da, kommt ihr Inhalt
// einmal in die Datenbank, die Fotos als Dateien in den Bildspeicher – mit denselben IDs (die App kennt sie, z. B. als
// geteiltes Rezept oder eigenes Foto in der Galerie). Was die Datenbank schon hat, bleibt, wie es ist (nichts doppelt);
// unlesbare Einträge zählen als übersprungen. Danach wird die Datei gelöscht, sonst kämen Gelöschtes und Fotos von
// gelöschten Konten beim nächsten Start zurück. Eine Datei, die sich nicht lesen lässt, bleibt unangetastet (Fehler).

const STARS = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
const shortText = (v: unknown, max = 200): v is string => text(v) && v.length <= max;
const timestamp = (v: unknown): v is string => text(v) && !Number.isNaN(Date.parse(v));
const plainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function readLegacyJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

/** Scheitert der Eintrag in die Datenbank, kommt das schon gespeicherte Bild wieder weg. */
async function withImageCleanup<T>(images: ImageStore, key: string | null, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (key) await images.delete(key).catch(() => undefined);
    throw e;
  }
}

export interface LegacyCommunityImport {
  /** Übernommene geteilte Rezepte. */
  recipes: number;
  /** Übernommene Favoriten („Likes“). */
  likes: number;
  /** Davon Rezepte mit eigenem Foto, das jetzt als Datei im Bildspeicher liegt. */
  images: number;
  /** Rezepte, die die Datenbank schon hatte, oder unlesbare Einträge. */
  skipped: number;
}

/** `data/community.json` (eine Liste geteilter Rezepte mit Favoriten) in die Datenbank; ohne Datei null. */
export async function importLegacyCommunity(db: Db, images: ImageStore, file: string): Promise<LegacyCommunityImport | null> {
  if (!existsSync(file)) return null;
  const data = readLegacyJson(file);
  if (!Array.isArray(data)) throw new Error("unerwarteter Inhalt (keine Liste)");
  const counts: LegacyCommunityImport = { recipes: 0, likes: 0, images: 0, skipped: 0 };
  for (const raw of data) {
    const r = plainObject(raw) ? raw : {};
    const recipe = plainObject(r.recipe) ? (r.recipe as unknown as Recipe) : undefined;
    if (!shortText(r.id, 100) || !recipe || !text(recipe.name) || !shortText(r.authorId) || !timestamp(r.createdAt)) {
      counts.skipped++;
      continue;
    }
    const id = r.id;
    if (await db.get("SELECT id FROM community_recipes WHERE id = ?", [id])) {
      counts.skipped++;
      continue;
    }
    const authorName = shortText(r.authorName, 80) ? r.authorName : "Nutzer:in";
    const createdAt = new Date(r.createdAt).toISOString();
    const stored = await storeRecipeImage(images, recipe);
    const likedBy = [...new Set(Array.isArray(r.likedBy) ? r.likedBy.filter((a) => shortText(a)) : [])] as string[];
    await withImageCleanup(images, stored.imageKey, () =>
      db.transaction(async (tx) => {
        await tx.run(INSERT_COMMUNITY_RECIPE, [id, r.authorId as string, authorName, recipe.name, createdAt, JSON.stringify(stored.recipe), stored.imageKey]);
        for (const actor of likedBy) await tx.run("INSERT INTO community_likes (recipe_id, actor, created_at) VALUES (?, ?, ?)", [id, actor, createdAt]);
      }),
    );
    counts.recipes++;
    counts.likes += likedBy.length;
    if (stored.imageKey) counts.images++;
  }
  await markImported(db, "community.json", counts);
  removeLegacyFile(file);
  return counts;
}

export interface LegacyFeedbackImport {
  /** Übernommene Fotos – jetzt als Dateien im Bildspeicher. */
  photos: number;
  /** Übernommene Sterne für Fotos und Rezepte. */
  ratings: number;
  /** Übernommene Meldungen („Problem melden“). */
  flags: number;
  /** Fotos und Meldungen, die die Datenbank schon hatte, oder unlesbare Einträge (z. B. ein Foto, das kein Bild ist). */
  skipped: number;
}

/** `data/feedback.json` (Fotos mit Sternen, Sterne für Rezepte, Meldungen) in die Datenbank; ohne Datei null. */
export async function importLegacyFeedback(db: Db, images: ImageStore, file: string): Promise<LegacyFeedbackImport | null> {
  if (!existsSync(file)) return null;
  const data = readLegacyJson(file);
  if (!plainObject(data)) throw new Error("unerwarteter Inhalt");
  const counts: LegacyFeedbackImport = { photos: 0, ratings: 0, flags: 0, skipped: 0 };

  for (const raw of Array.isArray(data.photos) ? data.photos : []) {
    const p = plainObject(raw) ? raw : {};
    const image = typeof p.uri === "string" ? decodeDataUri(p.uri) : null;
    if (!shortText(p.id, 100) || !shortText(p.recipeId) || !shortText(p.authorId) || !timestamp(p.createdAt) || !image) {
      counts.skipped++;
      continue;
    }
    if (await db.get("SELECT id FROM recipe_photos WHERE id = ?", [p.id])) {
      counts.skipped++;
      continue;
    }
    const key = newImageKey(image.type);
    await images.put(key, image);
    const author = p.authorId;
    const ratings = Object.entries(plainObject(p.ratings) ? p.ratings : {}).filter(([actor, stars]) => shortText(actor) && actor !== author && STARS(stars));
    await withImageCleanup(images, key, () =>
      db.transaction(async (tx) => {
        await tx.run(INSERT_PHOTO, [p.id as string, p.recipeId as string, author, shortText(p.authorName, 80) ? p.authorName : "", key, new Date(p.createdAt as string).toISOString()]);
        for (const [actor, stars] of ratings) await tx.run("INSERT INTO photo_ratings (photo_id, actor, stars) VALUES (?, ?, ?)", [p.id as string, actor, stars as number]);
      }),
    );
    counts.photos++;
    counts.ratings += ratings.length;
  }

  for (const [recipeId, ratings] of Object.entries(plainObject(data.recipeRatings) ? data.recipeRatings : {})) {
    if (!shortText(recipeId) || !plainObject(ratings)) continue;
    for (const [actor, stars] of Object.entries(ratings)) {
      if (!shortText(actor) || !STARS(stars)) continue;
      counts.ratings += await db.run("INSERT INTO recipe_ratings (recipe_id, actor, stars) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", [recipeId, actor, stars]);
    }
  }

  for (const raw of Array.isArray(data.flags) ? data.flags : []) {
    const f = plainObject(raw) ? raw : {};
    if (!shortText(f.id, 100) || !shortText(f.recipeId) || !shortText(f.authorId) || !FLAG_REASONS.includes(f.reason as never) || !timestamp(f.createdAt)) {
      counts.skipped++;
      continue;
    }
    const note = typeof f.note === "string" ? f.note.slice(0, 500) : "";
    const added = await db.run("INSERT INTO recipe_flags (id, recipe_id, author, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING", [
      f.id,
      f.recipeId,
      f.authorId,
      f.reason as string,
      note,
      new Date(f.createdAt).toISOString(),
    ]);
    if (added > 0) counts.flags++;
    else counts.skipped++;
  }

  await markImported(db, "feedback.json", counts);
  removeLegacyFile(file);
  return counts;
}

export interface LegacyOverridesImport {
  /** Übernommene Admin-Änderungen (eine pro Katalogrezept). */
  recipes: number;
  /** Rezepte, für die die Datenbank schon Änderungen hatte, oder unlesbare Einträge. */
  skipped: number;
}

/** `data/recipe-overrides.json` (Admin-Änderungen je Katalogrezept) in die Datenbank; ohne Datei null. */
export async function importLegacyOverrides(db: Db, file: string): Promise<LegacyOverridesImport | null> {
  if (!existsSync(file)) return null;
  const data = readLegacyJson(file);
  if (!plainObject(data)) throw new Error("unerwarteter Inhalt");
  const counts: LegacyOverridesImport = { recipes: 0, skipped: 0 };
  for (const [recipeId, raw] of Object.entries(data)) {
    const o = plainObject(raw) ? raw : {};
    if (!shortText(recipeId) || !plainObject(o.patch)) {
      counts.skipped++;
      continue;
    }
    const updatedAt = timestamp(o.updatedAt) ? new Date(o.updatedAt).toISOString() : new Date().toISOString();
    const added = await db.run(INSERT_OVERRIDE, [recipeId, JSON.stringify(o.patch), shortText(o.updatedBy, 80) ? o.updatedBy : "Admin", updatedAt]);
    if (added > 0) counts.recipes++;
    else counts.skipped++;
  }
  await markImported(db, "recipe-overrides.json", counts);
  removeLegacyFile(file);
  return counts;
}
