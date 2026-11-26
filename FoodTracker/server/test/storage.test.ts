import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newDb } from "pg-mem";
import { afterAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password.js";
import { AuthError, UserStore } from "../src/auth/users.js";
import { openPostgres, openSqlite, postgresFromPool, toPostgresPlaceholders, type Db, type PgPoolLike } from "../src/storage/db.js";
import { importLegacyUsers } from "../src/storage/legacy.js";
import { DatabaseTooNewError, MIGRATIONS, migrate } from "../src/storage/migrations.js";

// Speicherschicht (Vorrang 1, 9.2): dieselben Tests für SQLite (Datei bzw. im Speicher) und Postgres (pg-mem, eine
// nachgebaute Postgres-Datenbank im Speicher – kein echter Datenbank-Server nötig).

const FAST = { N: 1024, r: 8, p: 1 };
const tmp = mkdtempSync(join(tmpdir(), "foodtracker-speicher-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function pgMem(): Db {
  const { Pool } = newDb().adapters.createPg();
  return postgresFromPool(new Pool() as unknown as PgPoolLike, "Postgres (pg-mem)");
}

const BACKENDS: [string, () => Db][] = [
  ["SQLite", () => openSqlite(":memory:")],
  ["Postgres", pgMem],
];

describe("Platzhalter für Postgres", () => {
  it("macht aus ? der Reihe nach $1, $2 … – nicht in Texten", () => {
    expect(toPostgresPlaceholders("SELECT * FROM t WHERE a = ? AND b = '?' AND c = 'it''s ?' AND d = ?")).toBe(
      "SELECT * FROM t WHERE a = $1 AND b = '?' AND c = 'it''s ?' AND d = $2",
    );
  });
});

describe.each(BACKENDS)("Speicherschicht mit %s", (_name, open) => {
  it("legt die Tabellen per Migration an, ein zweites Mal ändert nichts", async () => {
    const db = open();
    expect(await migrate(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await migrate(db)).toEqual([]);
    const rows = await db.all<{ version: number; name: string }>("SELECT version, name FROM schema_migrations ORDER BY version");
    expect(rows.map((r) => Number(r.version))).toEqual([1, 2]);
    expect(rows[0]!.name).toContain("Konten");
    expect(rows[1]!.name).toContain("Abgleich");
    for (const table of ["users", "sessions", "password_resets", "storage_meta", "sync_records", "sync_revisions"]) {
      expect(Number((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n)).toBe(0);
    }
  });

  it("startet nicht mit einer Datenbank, die eine neuere Fassung umgebaut hat", async () => {
    const db = open();
    await migrate(db);
    await db.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [99, "aus der Zukunft", new Date().toISOString()]);
    await expect(migrate(db)).rejects.toBeInstanceOf(DatabaseTooNewError);
    await expect(migrate(db)).rejects.toThrow("neuer als dieser Server");
  });

  describe("Konten", () => {
    const store = async () => {
      const db = open();
      await migrate(db);
      return { db, users: new UserStore(db, ["chefin@example.com"], FAST) };
    };

    it("registriert, meldet an und ab und findet das Konto zum Token", async () => {
      const { users } = await store();
      const { token, user, created } = await users.register({ email: " Ida@Example.com ", password: "Kürbiskernöl!", name: "Ida" });
      expect(created).toBe(true);
      expect(user).toMatchObject({ email: "ida@example.com", provider: "password", role: "user", blocked: false, emailVerified: false });
      expect((await users.userForToken(token))?.id).toBe(user.id);
      const again = await users.register({ email: "ida@example.com", password: "Kürbiskernöl!", name: null });
      expect(again.created).toBe(false);
      await expect(users.register({ email: "ida@example.com", password: "falsch falsch", name: null })).rejects.toThrow(AuthError);
      await expect(users.loginWithPassword("niemand@example.com", "Kürbiskernöl!")).rejects.toMatchObject({ code: "invalid_credentials" });
      await users.logout(token);
      expect(await users.userForToken(token)).toBeUndefined();
      expect(await users.userForToken(again.token)).toBeDefined();
    });

    it("behält ein Konto pro Anmeldung bei Apple, Google bzw. Dev-Login", async () => {
      const { users } = await store();
      const first = await users.login({ provider: "dev", sub: "kim", email: "Kim@Example.com", name: "Kim" });
      const second = await users.login({ provider: "dev", sub: "kim", email: null, name: null });
      expect(second.user.id).toBe(first.user.id);
      expect(second.user.email).toBe("kim@example.com");
      expect(first.user.emailVerified).toBeUndefined();
      expect(await users.list()).toHaveLength(1);
      const admin = await users.login({ provider: "dev", sub: "chefin", email: "chefin@example.com", name: "Chefin" });
      expect(admin.user.role).toBe("admin");
      expect((await users.get(admin.user.id))?.role).toBe("admin");
    });

    it("lässt abgelaufene Sitzungen nicht mehr gelten und räumt sie beim nächsten Anmelden auf", async () => {
      const { db, users } = await store();
      const { token, user } = await users.register({ email: "alt@example.com", password: "Germknödel!!", name: null });
      await db.run("UPDATE sessions SET expires_at = ? WHERE user_id = ?", ["2020-01-01T00:00:00.000Z", user.id]);
      expect(await users.userForToken(token)).toBeUndefined();
      await users.loginWithPassword("alt@example.com", "Germknödel!!");
      expect(Number((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sessions"))!.n)).toBe(1);
    });

    it("zählt jeden Versuch mit dem Code, auch wenn viele gleichzeitig kommen", async () => {
      const { users } = await store();
      await users.register({ email: "eva@example.com", password: "Marillenknödel", name: null });
      const { code } = (await users.createResetCode("eva@example.com"))!;
      const wrong = code === "00000000" ? "11111111" : "00000000";
      const tries = await Promise.allSettled(Array.from({ length: 8 }, () => users.resetPassword("eva@example.com", wrong, "Neues Passwort!")));
      expect(tries.every((t) => t.status === "rejected")).toBe(true);
      // Nach fünf Versuchen gilt auch der richtige Code nicht mehr.
      await expect(users.resetPassword("eva@example.com", code, "Neues Passwort!")).rejects.toMatchObject({ code: "invalid_code" });
      // Ein neuer Code geht wieder – und bestätigt die Adresse.
      const fresh = (await users.createResetCode("eva@example.com"))!;
      const { user } = await users.resetPassword("eva@example.com", fresh.code, "Neues Passwort!");
      expect(user.emailVerified).toBe(true);
      expect((await users.get(user.id))?.emailVerified).toBe(true);
      await expect(users.resetPassword("eva@example.com", fresh.code, "Noch ein Passwort")).rejects.toMatchObject({ code: "invalid_code" });
    });

    it("ändert das Passwort und meldet die anderen Geräte ab", async () => {
      const { users } = await store();
      const a = await users.register({ email: "leo@example.com", password: "Speckknödel 1", name: null });
      const b = await users.loginWithPassword("leo@example.com", "Speckknödel 1");
      await expect(users.changePassword(a.user.id, "falsch falsch", "Speckknödel 2", a.token)).rejects.toMatchObject({ code: "invalid_credentials" });
      await users.changePassword(a.user.id, "Speckknödel 1", "Speckknödel 2", a.token);
      expect(await users.userForToken(a.token)).toBeDefined();
      expect(await users.userForToken(b.token)).toBeUndefined();
      await expect(users.loginWithPassword("leo@example.com", "Speckknödel 1")).rejects.toThrow(AuthError);
      await users.loginWithPassword("leo@example.com", "Speckknödel 2");
    });

    it("sperrt, schützt den letzten Admin und löscht mit Sitzungen und Codes", async () => {
      const { db, users } = await store();
      const admin = await users.login({ provider: "dev", sub: "chefin", email: "chefin@example.com", name: "Chefin" });
      const nutzer = await users.register({ email: "max@example.com", password: "Kaiserschmarrn", name: "Max" });
      expect(await users.update(admin.user.id, { role: "user" })).toBe("last_admin");
      expect(await users.update("gibt-es-nicht", { blocked: true })).toBeUndefined();
      expect(await users.update(nutzer.user.id, { blocked: true })).toMatchObject({ blocked: true });
      expect(await users.userForToken(nutzer.token)).toBeUndefined();
      await expect(users.loginWithPassword("max@example.com", "Kaiserschmarrn")).rejects.toMatchObject({ code: "blocked" });
      expect((await users.list("max")).map((u) => u.name)).toEqual(["Max"]);
      expect((await users.list()).map((u) => u.role)).toEqual(["admin", "user"]);
      expect((await users.rename(admin.user.id, "Die Chefin"))?.name).toBe("Die Chefin");

      await users.update(nutzer.user.id, { blocked: false });
      await users.createResetCode("max@example.com");
      await users.loginWithPassword("max@example.com", "Kaiserschmarrn");
      expect((await users.delete(nutzer.user.id))?.email).toBe("max@example.com");
      expect(await users.get(nutzer.user.id)).toBeUndefined();
      expect(await db.all("SELECT * FROM sessions WHERE user_id = ?", [nutzer.user.id])).toEqual([]);
      expect(await db.all("SELECT * FROM password_resets")).toEqual([]);
      expect(await users.delete(nutzer.user.id)).toBeUndefined();
    });
  });

  describe("Umzug aus data/users.json", () => {
    const legacyFile = async (name: string) => {
      const file = join(tmp, `${name}.json`);
      const hash = await hashPassword("Altes Passwort!", FAST);
      const future = new Date(Date.now() + 86_400_000).toISOString();
      writeFileSync(
        file,
        JSON.stringify({
          users: [
            { id: "u-pass", provider: "password", providerSub: "anna@example.com", email: "anna@example.com", name: "Anna", role: "admin", blocked: false, createdAt: "2026-11-25T10:00:00.000Z", lastLoginAt: "2026-11-26T10:00:00.000Z", passwordHash: hash, emailVerified: true },
            { id: "u-dev", provider: "dev", providerSub: "bert", email: null, name: "Bert", role: "user", blocked: false, createdAt: "2026-11-25T11:00:00.000Z", lastLoginAt: "2026-11-25T11:00:00.000Z" },
            { kaputt: true },
          ],
          sessions: [
            { tokenHash: sha256("token-anna"), userId: "u-pass", expiresAt: future },
            { tokenHash: sha256("token-alt"), userId: "u-pass", expiresAt: "2026-01-01T00:00:00.000Z" },
            { tokenHash: sha256("token-fremd"), userId: "u-gibt-es-nicht", expiresAt: future },
          ],
          resets: [{ userId: "u-pass", codeHash: sha256("12345678"), expiresAt: future, attempts: 1 }],
        }),
      );
      return file;
    };

    it("übernimmt Konten mit gleicher ID und gültigen Sitzungen und löscht die Datei", async () => {
      const db = open();
      await migrate(db);
      const file = await legacyFile(`users-${_name}`);
      expect(await importLegacyUsers(db, file)).toEqual({ users: 2, skipped: 1, sessions: 1 });
      expect(existsSync(file)).toBe(false);
      const users = new UserStore(db, [], FAST);
      expect((await users.userForToken("token-anna"))?.id).toBe("u-pass");
      expect(await users.userForToken("token-alt")).toBeUndefined();
      expect((await users.get("u-pass"))).toMatchObject({ role: "admin", emailVerified: true, name: "Anna" });
      expect((await users.get("u-dev"))?.emailVerified).toBeUndefined();
      expect((await users.loginWithPassword("anna@example.com", "Altes Passwort!")).user.id).toBe("u-pass");
      expect((await users.resetPassword("anna@example.com", "12345678", "Neues Passwort!")).user.id).toBe("u-pass");
      expect((await db.get<{ value: string }>("SELECT value FROM storage_meta WHERE key = ?", ["imported:users.json"]))?.value).toContain('"users":2');
      expect(await importLegacyUsers(db, file)).toBeNull();
    });

    it("lässt Konten der Datenbank, wie sie sind, und übernimmt keine fremden Sitzungen", async () => {
      const db = open();
      await migrate(db);
      const users = new UserStore(db, [], FAST);
      const mine = await users.register({ email: "anna@example.com", password: "Neueres Passwort", name: "Anna neu" });
      const file = await legacyFile(`users-konflikt-${_name}`);
      expect(await importLegacyUsers(db, file)).toEqual({ users: 1, skipped: 2, sessions: 0 });
      expect(await users.get("u-pass")).toBeUndefined();
      expect((await users.get(mine.user.id))?.name).toBe("Anna neu");
      expect(await users.userForToken("token-anna")).toBeUndefined();
      expect(await db.all("SELECT * FROM password_resets")).toEqual([]);
    });

    it("lässt eine unlesbare Datei liegen", async () => {
      const db = open();
      await migrate(db);
      const file = join(tmp, `kaputt-${_name}.json`);
      writeFileSync(file, "{ kein JSON");
      await expect(importLegacyUsers(db, file)).rejects.toThrow();
      expect(existsSync(file)).toBe(true);
    });
  });
});

describe("SQLite", () => {
  it("speichert nichts aus einer abgebrochenen Transaktion", async () => {
    const db = openSqlite(":memory:");
    await migrate(db);
    await expect(
      db.transaction(async (tx) => {
        await tx.run("INSERT INTO storage_meta (key, value) VALUES (?, ?)", ["a", "1"]);
        throw new Error("abgebrochen");
      }),
    ).rejects.toThrow("abgebrochen");
    expect(await db.all("SELECT * FROM storage_meta")).toEqual([]);
  });

  it("lässt andere Anfragen warten, bis eine Transaktion fertig ist", async () => {
    const db = openSqlite(":memory:");
    await migrate(db);
    const order: string[] = [];
    const tx = db.transaction(async (t) => {
      await t.run("INSERT INTO storage_meta (key, value) VALUES (?, ?)", ["a", "1"]);
      await new Promise((r) => setTimeout(r, 20));
      order.push("Transaktion fertig");
    });
    const read = db.all("SELECT * FROM storage_meta").then((rows) => order.push(`gelesen: ${rows.length}`));
    await Promise.all([tx, read]);
    expect(order).toEqual(["Transaktion fertig", "gelesen: 1"]);
  });

  it("behält die Daten nach dem Schließen in der Datei", async () => {
    const file = join(tmp, "unterordner", "foodtracker.db");
    const first = openSqlite(file);
    await migrate(first);
    await first.run("INSERT INTO storage_meta (key, value) VALUES (?, ?)", ["bleibt", "ja"]);
    await first.close();
    await first.close();
    const second = openSqlite(file);
    expect(await migrate(second)).toEqual([]);
    expect(await second.get("SELECT value FROM storage_meta WHERE key = ?", ["bleibt"])).toEqual({ value: "ja" });
    await second.close();
  });
});

describe("Postgres-Adresse", () => {
  it("meldet eine ungültige DATABASE_URL verständlich, ohne sie auszugeben", async () => {
    await expect(openPostgres("kein-link")).rejects.toThrow("DATABASE_URL ist keine gültige Adresse");
  });
});
