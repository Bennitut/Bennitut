import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newDb } from "pg-mem";
import { afterAll, describe, expect, it } from "vitest";
import { Ai } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { DiaryFullError, DiaryStore, type DiaryRecord } from "../src/diary/store.js";
import { openSqlite, postgresFromPool, type Db, type PgPoolLike } from "../src/storage/db.js";
import { importLegacyDiary } from "../src/storage/legacy.js";
import { migrate } from "../src/storage/migrations.js";
import { SyncStore } from "../src/storage/sync.js";

const noAi = new Ai({ hasAnthropicKey: false, ollama: { url: "http://ollama.test", model: "gemma4:e4b", numCtx: 1024, timeoutMs: 1000 } }, async () => {
  throw new TypeError("offline");
});
const dir = mkdtempSync(join(tmpdir(), "foodtracker-diary-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const app = createApp({
  communityFile: null,
  auth: { appleAudiences: [], googleAudiences: [], adminEmails: [], allowDevLogin: true },
  ai: noAi,
});

const DEVICE_A = "device-aaaaaaaa";
const DEVICE_B = "device-bbbbbbbb";
const sync = (body: unknown, device = DEVICE_A, token?: string) =>
  app.request("/api/diary/sync", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "X-Device-Id": device, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
const devLogin = async (name: string) =>
  ((await (
    await app.request("/api/auth/dev", { method: "POST", body: JSON.stringify({ name }), headers: { "Content-Type": "application/json", "X-Device-Id": DEVICE_A } })
  ).json()) as { token: string; user: { id: string } });

const entry = (id: string, updatedAt: string, title = "Linsen-Bolognese") => ({
  id,
  updatedAt,
  entry: { date: updatedAt.slice(0, 10), time: "12:30", title, nutrients: { kcal: 612, protein: 28, carbs: 80, fat: 15 }, source: "plan" },
});
const tombstone = (id: string, updatedAt: string) => ({ id, updatedAt, entry: null });
/** Wie der Server Einträge zurückgibt: mit ID und Zeitpunkt im Eintrag. */
const stored = (r: ReturnType<typeof entry>): DiaryRecord => ({ ...r, entry: { ...r.entry, id: r.id, updatedAt: r.updatedAt } as DiaryRecord["entry"] });
type SyncBody = { owner: string; rev: number; changes: DiaryRecord[]; more: boolean };

describe("Sicherung der Ernährungshistorie (/api/diary/sync)", () => {
  it("bringt die Historie eines Kontos auf ein zweites Gerät, Gelöschtes kommt nicht zurück", async () => {
    const { token, user } = await devLogin("Benjamin");
    const first = await sync({ since: 0, changes: [entry("e1", "2026-11-20T08:00:00.000Z"), entry("e2", "2026-11-21T08:00:00.000Z")] }, DEVICE_A, token);
    expect(first.status).toBe(200);
    const a = (await first.json()) as SyncBody;
    expect(a.owner).toBe(`user:${user.id}`);
    expect(a.changes).toEqual([]); // nichts Neues außer dem gerade Geschickten

    // Neues Gerät (oder Browserdaten gelöscht): mit demselben Konto kommt alles zurück.
    const b = (await (await sync({ since: 0, changes: [] }, DEVICE_B, token)).json()) as SyncBody;
    expect(b.changes.map((r) => r.id).sort()).toEqual(["e1", "e2"]);
    expect(b.changes.find((r) => r.id === "e1")?.entry).toMatchObject({ id: "e1", title: "Linsen-Bolognese", updatedAt: "2026-11-20T08:00:00.000Z" });

    // Gerät A löscht e1; Gerät B bekommt die Löschmarke, ein späteres Hochladen der alten Fassung bringt e1 nicht zurück.
    await sync({ since: a.rev, changes: [tombstone("e1", "2026-11-22T09:00:00.000Z")] }, DEVICE_A, token);
    const b2 = (await (await sync({ since: b.rev, changes: [] }, DEVICE_B, token)).json()) as SyncBody;
    expect(b2.changes).toEqual([{ id: "e1", updatedAt: "2026-11-22T09:00:00.000Z", entry: null }]);
    const stale = (await (await sync({ since: b2.rev, changes: [entry("e1", "2026-11-20T08:00:00.000Z")] }, DEVICE_B, token)).json()) as SyncBody;
    expect(stale.changes).toEqual([{ id: "e1", updatedAt: "2026-11-22T09:00:00.000Z", entry: null }]);
  });

  it("speichert ohne Konto pro Gerät", async () => {
    await sync({ since: 0, changes: [entry("nur-a", "2026-11-23T10:00:00.000Z")] }, "device-only-a1");
    const other = (await (await sync({ since: 0, changes: [] }, "device-only-b1")).json()) as SyncBody;
    expect(other.owner).toBe("device:device-only-b1");
    expect(other.changes).toEqual([]);
    const same = (await (await sync({ since: 0, changes: [] }, "device-only-a1")).json()) as SyncBody;
    expect(same.changes.map((r) => r.id)).toEqual(["nur-a"]);
  });

  it("meldet abgelaufene Sitzungen, statt still unter der Geräte-ID zu speichern", async () => {
    const res = await sync({ since: 0, changes: [] }, DEVICE_A, "abgelaufen");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "auth_invalid_token" });
  });

  it("vereinheitlicht Zeitpunkte und lehnt Ungültiges ab", async () => {
    const res = (await (await sync({ since: 0, changes: [entry("z1", "2026-11-23T10:00:00Z")] }, "device-zeit-001")).json()) as SyncBody;
    expect(res.rev).toBe(1);
    const back = (await (await sync({ since: 0, changes: [] }, "device-zeit-002")).json()) as SyncBody;
    expect(back.changes).toEqual([]);
    const again = (await (await sync({ since: 0, changes: [] }, "device-zeit-001")).json()) as SyncBody;
    expect(again.changes[0]?.updatedAt).toBe("2026-11-23T10:00:00.000Z");
    expect((await sync({ since: 0, changes: [{ ...entry("x", "2026-11-23T10:00:00.000Z"), entry: { ...entry("x", "2026-11-23T10:00:00.000Z").entry, date: "gestern" } }] })).status).toBe(400);
    expect((await sync({ since: 0, changes: [entry("x", "irgendwann")] })).status).toBe(400);
    expect((await sync({ since: 0, changes: Array.from({ length: 5001 }, (_, i) => entry(`v${i}`, "2026-11-23T10:00:00.000Z")) })).status).toBe(400);
    // Größer als jede Revision, die Postgres speichern kann.
    expect((await sync({ since: 2 ** 31, changes: [] })).status).toBe(400);
    expect((await app.request("/api/diary/sync", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } })).status).toBe(400);
  });
});

// Dieselben Tests für SQLite und Postgres (pg-mem, eine nachgebaute Postgres-Datenbank im Speicher).
function pgMem(): Db {
  const { Pool } = newDb().adapters.createPg();
  return postgresFromPool(new Pool() as unknown as PgPoolLike, "Postgres (pg-mem)");
}
const BACKENDS: [string, () => Db][] = [
  ["SQLite", () => openSqlite(":memory:")],
  ["Postgres", pgMem],
];
const ready = async (open: () => Db) => {
  const db = open();
  await migrate(db);
  return db;
};

describe.each(BACKENDS)("DiaryStore mit %s", (_name, open) => {
  it("liefert in Seiten und schickt bei älteren Fassungen die eigene zurück", async () => {
    const store = new DiaryStore(await ready(open), 3);
    const records = Array.from({ length: 7 }, (_, i) => entry(`p${i}`, `2026-11-0${i + 1}T08:00:00.000Z`));
    await store.sync("user:1", 0, records as DiaryRecord[]);
    const seen: string[] = [];
    let since = 0;
    for (let round = 0; round < 5; round++) {
      const page = await store.sync("user:1", since, []);
      seen.push(...page.changes.map((r) => r.id));
      since = page.rev;
      if (!page.more) break;
    }
    expect(seen).toEqual(records.map((r) => r.id));
    expect(since).toBe(7);
    // Eine ältere Fassung von p0 wird nicht übernommen; der Server schickt seine zurück.
    const older = await store.sync("user:1", since, [{ ...records[0]!, updatedAt: "2026-10-01T08:00:00.000Z" } as DiaryRecord]);
    expect(older.changes).toEqual([stored(records[0]!)]);
    expect(older.rev).toBe(7);
    // Gleicher Zeitpunkt: Löschen gewinnt.
    const tie = await store.sync("user:1", older.rev, [{ id: "p1", updatedAt: records[1]!.updatedAt, entry: null }]);
    expect(tie.changes).toEqual([]);
    expect(tie.rev).toBe(8);
    expect(await store.count("user:1")).toBe(6);
    // Dieselbe Fassung noch einmal ändert nichts und kommt nicht zurück.
    const same = await store.sync("user:1", tie.rev, [records[2] as DiaryRecord]);
    expect(same).toEqual({ rev: 8, changes: [], more: false });
  });

  it("begrenzt die Zahl der Einträge pro Besitzer – ohne halbe Änderungen", async () => {
    const store = new DiaryStore(await ready(open), 100, 2);
    await store.sync("device:x", 0, [entry("a", "2026-11-23T10:00:00.000Z"), entry("b", "2026-11-23T10:00:00.000Z")] as DiaryRecord[]);
    await expect(
      store.sync("device:x", 0, [tombstone("a", "2026-11-24T10:00:00.000Z"), entry("c", "2026-11-23T10:00:00.000Z")] as DiaryRecord[]),
    ).rejects.toBeInstanceOf(DiaryFullError);
    // Nichts von der abgelehnten Anfrage ist gespeichert, auch nicht die Löschmarke davor.
    expect(await store.count("device:x")).toBe(2);
    expect((await store.sync("device:x", 2, [])).rev).toBe(2);
    // Ändern und Löschen vorhandener Einträge geht weiter.
    expect((await store.sync("device:x", 2, [tombstone("a", "2026-11-24T10:00:00.000Z")])).rev).toBe(3);
  });

  it("nimmt bei mehrfach geschickter ID die neueste Fassung", async () => {
    const store = new DiaryStore(await ready(open));
    const res = await store.sync("user:dup", 0, [
      entry("d", "2026-11-24T10:00:00.000Z", "zweite"),
      entry("d", "2026-11-24T09:00:00.000Z", "erste, älter"),
      entry("d", "2026-11-24T11:00:00.000Z", "dritte"),
    ] as DiaryRecord[]);
    expect(res.rev).toBe(2);
    const all = await store.sync("user:dup", 0, []);
    expect(all.changes.map((r) => r.entry?.title)).toEqual(["dritte"]);
  });

  it("speichert und liest viele Einträge auf einmal (in Paketen)", async () => {
    const store = new DiaryStore(await ready(open));
    const many = Array.from({ length: 437 }, (_, i) => entry(`m${String(i).padStart(3, "0")}`, `2026-0${1 + (i % 9)}-15T08:00:00.000Z`));
    expect((await store.sync("user:viele", 0, many as DiaryRecord[])).rev).toBe(437);
    const back = await store.sync("user:viele", 0, []);
    expect(back.changes).toHaveLength(437);
    expect(back.changes.map((r) => r.id)).toEqual(many.map((r) => r.id));
    // Ein zweites Mal dieselben plus ein neuer: Nur der neue bekommt eine Revision.
    expect((await store.sync("user:viele", 437, [...many, entry("neu", "2026-11-24T08:00:00.000Z")] as DiaryRecord[])).rev).toBe(438);
    const exported = await store.entries("user:viele");
    expect(exported).toHaveLength(438);
    expect(exported[0]).toMatchObject({ id: "m000", date: "2026-01-15", updatedAt: "2026-01-15T08:00:00.000Z" });
    expect(exported.at(-1)?.id).toBe("neu");
  });

  it("exportiert ohne Löschmarken und löscht die ganze Sicherung", async () => {
    const db = await ready(open);
    const store = new DiaryStore(db);
    await store.sync("user:weg", 0, [entry("b", "2026-11-24T08:00:00.000Z"), entry("a", "2026-11-23T08:00:00.000Z"), tombstone("c", "2026-11-24T08:00:00.000Z")] as DiaryRecord[]);
    await store.sync("user:bleibt", 0, [entry("x", "2026-11-24T08:00:00.000Z")] as DiaryRecord[]);
    expect((await store.entries("user:weg")).map((e) => e.id)).toEqual(["a", "b"]);
    await new SyncStore(db).remove("user:weg");
    expect(await store.entries("user:weg")).toEqual([]);
    expect(await db.all("SELECT * FROM sync_records WHERE owner = ?", ["user:weg"])).toEqual([]);
    expect(await db.all("SELECT * FROM sync_revisions WHERE owner = ?", ["user:weg"])).toEqual([]);
    expect(await store.count("user:bleibt")).toBe(1);
  });
});

describe("DiaryStore mit SQLite-Datei", () => {
  it("behält die Sicherung nach einem Neustart", async () => {
    const file = join(dir, "neustart.db");
    const first = openSqlite(file);
    await migrate(first);
    await new DiaryStore(first).sync("device:../../etc/passwd", 0, [entry("f1", "2026-11-23T10:00:00.000Z")] as DiaryRecord[]);
    await first.close();
    const second = openSqlite(file);
    await migrate(second);
    const again = await new DiaryStore(second).sync("device:../../etc/passwd", 0, []);
    expect(again.changes.map((r) => r.id)).toEqual(["f1"]);
    expect(again.rev).toBe(1);
    await second.close();
  });

  it("vergibt bei gleichzeitigen Abgleichen jede Revision genau einmal", async () => {
    const store = new DiaryStore(await ready(() => openSqlite(":memory:")));
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => store.sync("user:parallel", 0, [entry(`g${i}`, "2026-11-24T08:00:00.000Z")] as DiaryRecord[])));
    expect(new Set(results.map((r) => r.rev)).size).toBe(20);
    expect(Math.max(...results.map((r) => r.rev))).toBe(20);
    expect(await store.count("user:parallel")).toBe(20);
  });
});

// Bis 27.11.2026: eine Datei pro Besitzer unter data/diary/ – so, wie die alte Fassung sie schrieb.
function writeLegacyDiary(folder: string, owner: string, records: { id: string; updatedAt: string; rev: number; entry: object | null }[]) {
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${createHash("sha256").update(owner).digest("hex").slice(0, 40)}.json`);
  const byId = Object.fromEntries(
    records.map((r) => [r.id, { id: r.id, updatedAt: r.updatedAt, entry: r.entry ? { ...r.entry, id: r.id, updatedAt: r.updatedAt } : null, rev: r.rev }]),
  );
  writeFileSync(file, JSON.stringify({ owner, rev: Math.max(0, ...records.map((r) => r.rev)) + 1, records: byId }));
  return file;
}
const legacy = (id: string, rev: number, updatedAt = "2026-11-20T08:00:00.000Z") => ({ id, rev, updatedAt, entry: entry(id, updatedAt).entry });

describe.each(BACKENDS)("Umzug aus data/diary/ mit %s", (name, open) => {
  it("übernimmt jede Sicherung mit ihren Revisionen und löscht die Dateien", async () => {
    const db = await ready(open);
    const folder = join(dir, `umzug-${name}`);
    const konto = writeLegacyDiary(folder, "user:konto-1", [legacy("a", 1), legacy("b", 4), { id: "c", rev: 6, updatedAt: "2026-11-21T08:00:00.000Z", entry: null }]);
    writeFileSync(`${konto}.tmp`, "{halb geschrieben");
    writeLegacyDiary(folder, "device:geraet-01", [legacy("x", 2)]);
    const broken = join(folder, "0000000000000000000000000000000000000000.json");
    writeFileSync(broken, "{kaputt");

    expect(await importLegacyDiary(db, folder)).toEqual({ owners: 2, records: 4, unreadable: 1 });
    expect(readdirSync(folder)).toEqual(["0000000000000000000000000000000000000000.json"]);
    const store = new DiaryStore(db);
    // Ein Gerät, das schon bis Revision 4 abgeglichen hatte, bekommt genau das Neuere – wie vorher von der Datei.
    const next = await store.sync("user:konto-1", 4, []);
    expect(next.changes).toEqual([{ id: "c", updatedAt: "2026-11-21T08:00:00.000Z", entry: null }]);
    expect(next.rev).toBe(7);
    // Neue Einträge zählen danach weiter, statt Revisionen doppelt zu vergeben.
    expect((await store.sync("user:konto-1", 7, [entry("d", "2026-11-24T08:00:00.000Z")] as DiaryRecord[])).rev).toBe(8);
    expect((await store.entries("user:konto-1")).map((e) => e.id)).toEqual(["a", "b", "d"]);
    expect((await store.entries("device:geraet-01"))[0]).toMatchObject({ id: "x", title: "Linsen-Bolognese", updatedAt: "2026-11-20T08:00:00.000Z" });
    expect((await db.get<{ value: string }>("SELECT value FROM storage_meta WHERE key = ?", ["imported:diary"]))?.value).toContain('"owners":2');

    // Beim nächsten Start bleibt die unlesbare Datei liegen; ist sie weg, verschwindet auch der Ordner.
    expect(await importLegacyDiary(db, folder)).toEqual({ owners: 0, records: 0, unreadable: 1 });
    rmSync(broken);
    expect(await importLegacyDiary(db, folder)).toBeNull();
    expect(existsSync(folder)).toBe(false);
    expect(await importLegacyDiary(db, folder)).toBeNull();
  });

  it("führt zusammen, wenn die Datenbank schon etwas hat: Neueres gewinnt", async () => {
    const db = await ready(open);
    const store = new DiaryStore(db);
    await store.sync("user:schon-da", 0, [entry("a", "2026-11-22T08:00:00.000Z", "aus der Datenbank, neuer")] as DiaryRecord[]);
    const folder = join(dir, `zusammen-${name}`);
    writeLegacyDiary(folder, "user:schon-da", [legacy("a", 1, "2026-11-20T08:00:00.000Z"), legacy("b", 2)]);
    expect(await importLegacyDiary(db, folder)).toEqual({ owners: 1, records: 1, unreadable: 0 });
    const all = await store.sync("user:schon-da", 0, []);
    expect(all.changes.map((r) => [r.id, r.entry?.title])).toEqual([
      ["a", "aus der Datenbank, neuer"],
      ["b", "Linsen-Bolognese"],
    ]);
    // Übernommenes bekommt eine Revision über allem, was Geräte von der Datei oder der Datenbank kennen könnten.
    expect(all.rev).toBe(4);
  });
});
