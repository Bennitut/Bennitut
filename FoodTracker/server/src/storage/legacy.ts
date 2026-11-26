import { existsSync, readFileSync, rmSync } from "node:fs";
import { INSERT_USER, ROLES, userValues, type AuthProvider, type User } from "../auth/users.js";
import type { Db } from "./db.js";

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
