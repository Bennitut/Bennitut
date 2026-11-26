import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { INSERT_USER, ROLES, userValues, type AuthProvider, type User } from "../auth/users.js";
import { DIARY_KIND, diaryData } from "../diary/store.js";
import type { Db } from "./db.js";
import { SyncStore, type StoredSyncRecord } from "./sync.js";

// Einmaliger Umzug aus den JSON-Dateien älterer Fassungen in die Datenbank (Vorrang 1, 9.2).

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
  rmSync(file, { force: true });
  rmSync(`${file}.tmp`, { force: true });
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
    rmSync(file, { force: true });
    rmSync(`${file}.tmp`, { force: true });
  }
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
  if (files.length === 0) return null;
  await db.run("INSERT INTO storage_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [
    "imported:diary",
    JSON.stringify({ at: new Date().toISOString(), ...counts }),
  ]);
  return counts;
}
