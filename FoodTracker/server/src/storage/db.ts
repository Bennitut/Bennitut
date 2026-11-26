import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";

// Speicherschicht (Vorrang 1, 9.2): dieselben SQL-Anweisungen für zwei Datenbanken.
//  - Ohne DATABASE_URL eine SQLite-Datei unter server/data/ – in Node.js eingebaut (node:sqlite), keine nativen Pakete,
//    übersteht auch ein hart geschlossenes Server-Fenster (Transaktionen mit Journal).
//  - Mit DATABASE_URL Postgres, z. B. kostenlos bei Neon oder Supabase.
// Regeln für das SQL, damit beide es gleich verstehen: Platzhalter immer „?“ (für Postgres wird daraus $1, $2 …), nur
// TEXT und INTEGER (Zeitpunkte als ISO-Text, JSON als Text, Ja/Nein als 0/1), Zeitpunkte aus dem Code statt now(),
// keine Postgres-Operatoren mit „?“. COUNT(*) kommt bei Postgres als Text an – immer mit Number() lesen.
// Der Server hält nichts davon im Speicher: Mehrere Anfragen gleichzeitig sind sicher, solange nur eine Server-Instanz
// dieselbe SQLite-Datei nutzt (bei Postgres auch mehrere).

/** Werte, die beide Datenbanken gleich speichern. */
export type SqlValue = string | number | null;
export type Row = Record<string, unknown>;

/** Lesen und Schreiben – innerhalb und außerhalb einer Transaktion gleich. */
export interface Queryable {
  readonly dialect: "sqlite" | "postgres";
  all<T = Row>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>;
  /** Führt eine Anweisung aus und liefert die Zahl geänderter Zeilen. */
  run(sql: string, params?: readonly SqlValue[]): Promise<number>;
}

export interface Db extends Queryable {
  /** Für die Startmeldung, ohne Passwort, z. B. „SQLite-Datei data/foodtracker.db“ oder „Postgres auf ep-….neon.tech“. */
  readonly description: string;
  /**
   * Alles oder nichts: Wirft `fn`, wird nichts davon gespeichert. In `fn` nur `tx` benutzen (bei SQLite wartet `db`
   * sonst auf das Ende dieser Transaktion) und nichts Langsames tun (z. B. Passwörter prüfen) – das vorher erledigen.
   */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** „?“ außerhalb von Texten in '…' wird zu $1, $2 … (Schreibweise von Postgres). */
export function toPostgresPlaceholders(sql: string): string {
  let n = 0;
  let quoted = false;
  let out = "";
  for (const ch of sql) {
    if (ch === "'") quoted = !quoted;
    out += ch === "?" && !quoted ? `$${++n}` : ch;
  }
  return out;
}

/** Zeilen als gewöhnliche Objekte (node:sqlite liefert Objekte ohne Prototyp). */
const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

class SqliteDb implements Db {
  readonly dialect = "sqlite" as const;
  private readonly statements = new Map<string, StatementSync>();
  /** Eine Verbindung für alle: Transaktionen laufen nacheinander, Anfragen dazwischen warten. */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly direct: Queryable;

  constructor(
    private readonly sqlite: DatabaseSync,
    readonly description: string,
  ) {
    const statement = (sql: string) => {
      let s = this.statements.get(sql);
      if (!s) {
        s = this.sqlite.prepare(sql);
        this.statements.set(sql, s);
      }
      return s;
    };
    this.direct = {
      dialect: "sqlite",
      all: async <T>(sql: string, params: readonly SqlValue[] = []) => statement(sql).all(...params).map((r) => plain<T>(r)),
      get: async <T>(sql: string, params: readonly SqlValue[] = []) => {
        const row = statement(sql).get(...params);
        return row === undefined ? undefined : plain<T>(row);
      },
      run: async (sql: string, params: readonly SqlValue[] = []) => Number(statement(sql).run(...params).changes),
    };
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => undefined);
    return result;
  }

  all<T = Row>(sql: string, params?: readonly SqlValue[]) {
    return this.exclusive(() => this.direct.all<T>(sql, params));
  }

  get<T = Row>(sql: string, params?: readonly SqlValue[]) {
    return this.exclusive(() => this.direct.get<T>(sql, params));
  }

  run(sql: string, params?: readonly SqlValue[]) {
    return this.exclusive(() => this.direct.run(sql, params));
  }

  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      this.sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn(this.direct);
        this.sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        try {
          this.sqlite.exec("ROLLBACK");
        } catch {
          // Schon zurückgerollt (z. B. nach einem Fehler beim COMMIT).
        }
        throw e;
      }
    });
  }

  close(): Promise<void> {
    return this.exclusive(async () => {
      if (this.closed) return;
      this.closed = true;
      this.sqlite.close();
    });
  }

  private closed = false;
}

/**
 * SQLite-Datei öffnen (wird mitsamt Ordner angelegt); ":memory:" = nur im Speicher, für Tests. Braucht Node.js ab 22.13
 * (dort ist node:sqlite ohne Schalter dabei).
 */
export function openSqlite(file: string): Db {
  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  } catch {
    throw new Error(
      `Diese Node.js-Version (${process.version}) hat keine eingebaute Datenbank (node:sqlite) – nötig ist Node.js ab 22.13. ` +
        "In PowerShell aktualisieren: winget upgrade OpenJS.NodeJS.LTS",
    );
  }
  const memory = file === ":memory:";
  if (!memory) mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new sqlite.DatabaseSync(file);
  // Kurz warten statt Fehler, falls z. B. ein Virenscanner die Datei gerade liest.
  db.exec("PRAGMA busy_timeout = 5000");
  // Write-Ahead-Log: robust bei abgebrochenen Schreibvorgängen, Lesen blockiert Schreiben nicht.
  if (!memory) db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  // Gelöschtes (z. B. ein gelöschtes Konto) mit Nullen überschreiben statt nur als frei zu markieren.
  db.exec("PRAGMA secure_delete = ON");
  return new SqliteDb(db, memory ? "SQLite im Speicher (nur für Tests)" : `SQLite-Datei ${file}`);
}

/** Was die Speicherschicht von node-postgres (pg) bzw. pg-mem in den Tests braucht. */
export interface PgClientLike {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}
export interface PgPoolLike extends PgClientLike {
  connect(): Promise<PgClientLike & { release(): void }>;
  end(): Promise<void>;
}

class PostgresDb implements Db {
  readonly dialect = "postgres" as const;
  private readonly direct: Queryable;

  constructor(
    private readonly pool: PgPoolLike,
    readonly description: string,
  ) {
    this.direct = PostgresDb.on(pool);
  }

  private static on(client: PgClientLike): Queryable {
    const query = (sql: string, params: readonly SqlValue[] = []) => client.query(toPostgresPlaceholders(sql), [...params]);
    return {
      dialect: "postgres",
      all: async <T>(sql: string, params?: readonly SqlValue[]) => (await query(sql, params)).rows.map((r) => plain<T>(r)),
      get: async <T>(sql: string, params?: readonly SqlValue[]) => {
        const row = (await query(sql, params)).rows[0];
        return row === undefined ? undefined : plain<T>(row);
      },
      run: async (sql: string, params?: readonly SqlValue[]) => (await query(sql, params)).rowCount ?? 0,
    };
  }

  all<T = Row>(sql: string, params?: readonly SqlValue[]) {
    return this.direct.all<T>(sql, params);
  }

  get<T = Row>(sql: string, params?: readonly SqlValue[]) {
    return this.direct.get<T>(sql, params);
  }

  run(sql: string, params?: readonly SqlValue[]) {
    return this.direct.run(sql, params);
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(PostgresDb.on(client));
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  close() {
    return this.pool.end();
  }
}

/** Postgres über einen schon angelegten Pool (Tests mit pg-mem). */
export function postgresFromPool(pool: PgPoolLike, description = "Postgres"): Db {
  return new PostgresDb(pool, description);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Verbindung zu Postgres. Ohne „sslmode“ in der Adresse verschlüsselt (Zertifikat wird geprüft), außer zum eigenen
 * Rechner. Prüft die Verbindung sofort, damit ein Tippfehler beim Start auffällt und nicht erst bei der ersten Anmeldung.
 */
export async function openPostgres(url: string): Promise<Db> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL ist keine gültige Adresse (sie beginnt mit postgresql://).");
  }
  const { default: pg } = await import("pg");
  const ssl = parsed.searchParams.has("sslmode") || LOCAL_HOSTS.has(parsed.hostname) ? {} : { ssl: true };
  const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 15_000, idleTimeoutMillis: 30_000, ...ssl });
  // Kostenlose Anbieter beenden ruhende Verbindungen (Neon nach ein paar Minuten ohne Anfragen); ohne diesen Handler
  // würde der Server dabei abstürzen. Der Pool baut beim nächsten Mal eine neue Verbindung auf.
  pool.on("error", (e: Error & { code?: string }) => console.error(`Datenbank: Verbindung beendet (${e.code ?? e.message}).`));
  const db = new PostgresDb(pool, `Postgres auf ${parsed.hostname}`);
  try {
    await db.get("SELECT 1 AS ok");
  } catch (e) {
    await pool.end().catch(() => undefined);
    throw e;
  }
  return db;
}

export interface DatabaseConfig {
  /** DATABASE_URL: Postgres; leer = SQLite-Datei. */
  url?: string;
  /** DATABASE_FILE: Pfad der SQLite-Datei (relativ zum Ordner server/). */
  file: string;
}

export function openDatabase({ url, file }: DatabaseConfig): Promise<Db> {
  return url ? openPostgres(url) : Promise.resolve(openSqlite(file));
}
