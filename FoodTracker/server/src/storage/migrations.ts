import type { Db } from "./db.js";

// Versionierte Änderungen am Aufbau der Datenbank. Beim Start führt der Server alle aus, die noch fehlen – jede in
// einer eigenen Transaktion, gemerkt in schema_migrations. Regeln: nur hinten anhängen, eine schon eingecheckte nie
// mehr ändern (Server, die sie schon ausgeführt haben, führen sie kein zweites Mal aus); SQL so schreiben, dass SQLite
// und Postgres es gleich verstehen (siehe db.ts).

export interface Migration {
  version: number;
  name: string;
  up: string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "Konten, Sitzungen und Codes zum Zurücksetzen",
    up: [
      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_sub TEXT NOT NULL,
        email TEXT,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        blocked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login_at TEXT NOT NULL,
        password_hash TEXT,
        email_verified INTEGER,
        UNIQUE (provider, provider_sub)
      )`,
      `CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      )`,
      "CREATE INDEX sessions_by_user ON sessions (user_id)",
      "CREATE INDEX sessions_by_expiry ON sessions (expires_at)",
      `CREATE TABLE password_resets (
        user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      )`,
      // Merkzettel der Speicherschicht, z. B. wann alte JSON-Dateien übernommen wurden.
      `CREATE TABLE storage_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: "Abgleich mit der App (zuerst die Sicherung der Ernährungshistorie)",
    up: [
      // Ein Datensatz pro Besitzer („user:<Konto-ID>“ bzw. „device:<Geräte-ID>“), Art (z. B. „diary“) und Eintrags-ID:
      // Revision der letzten Änderung, deren Zeitpunkt (ISO-Text) und Inhalt als JSON – NULL ist eine Löschmarke.
      `CREATE TABLE sync_records (
        owner TEXT NOT NULL,
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        rev INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT,
        PRIMARY KEY (owner, kind, id)
      )`,
      "CREATE INDEX sync_records_by_rev ON sync_records (owner, kind, rev)",
      // Zähler pro Besitzer und Art: die zuletzt vergebene Revision (storage/sync.ts).
      `CREATE TABLE sync_revisions (
        owner TEXT NOT NULL,
        kind TEXT NOT NULL,
        rev INTEGER NOT NULL,
        PRIMARY KEY (owner, kind)
      )`,
    ],
  },
];

/** Die Datenbank wurde schon von einer neueren Server-Fassung umgebaut – lieber nicht starten als Daten verderben. */
export class DatabaseTooNewError extends Error {
  constructor(
    readonly found: number,
    readonly known: number,
  ) {
    super(
      `Die Datenbank ist neuer als dieser Server (Stand ${found}, dieser Server kennt bis ${known}). ` +
        "Bitte den neuesten Stand holen (start-test.cmd macht das beim Start selbst) und neu starten.",
    );
  }
}

/** Führt fehlende Migrationen aus und liefert deren Nummern (leer, wenn alles auf dem Stand war). */
export async function migrate(db: Db, migrations: readonly Migration[] = MIGRATIONS): Promise<number[]> {
  const applied = await appliedVersions(db);
  const known = Math.max(0, ...migrations.map((m) => m.version));
  const newest = Math.max(0, ...applied);
  if (newest > known) throw new DatabaseTooNewError(newest, known);
  const done: number[] = [];
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    await db.transaction(async (tx) => {
      for (const sql of migration.up) await tx.run(sql);
      await tx.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [
        migration.version,
        migration.name,
        new Date().toISOString(),
      ]);
    });
    done.push(migration.version);
  }
  return done;
}

/** Schon ausgeführte Migrationen; beim allerersten Start wird die Tabelle dafür angelegt. */
async function appliedVersions(db: Db): Promise<Set<number>> {
  const read = async () => new Set((await db.all<{ version: number | string }>("SELECT version FROM schema_migrations")).map((r) => Number(r.version)));
  try {
    return await read();
  } catch {
    // Noch keine Tabelle (erst nachsehen statt immer CREATE … IF NOT EXISTS – das versteht pg-mem in den Tests nicht).
    await db.run("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    return read();
  }
}
