import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Ai } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { DiaryFullError, DiaryStore, type DiaryRecord } from "../src/diary/store.js";

const noAi = new Ai({ hasAnthropicKey: false, ollama: { url: "http://ollama.test", model: "gemma4:e4b", numCtx: 1024, timeoutMs: 1000 } }, async () => {
  throw new TypeError("offline");
});
const dir = mkdtempSync(join(tmpdir(), "foodtracker-diary-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const app = createApp({
  communityFile: null,
  diaryDir: join(dir, "api"),
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
    expect((await app.request("/api/diary/sync", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } })).status).toBe(400);
  });
});

describe("DiaryStore", () => {
  it("liefert in Seiten und schickt bei älteren Fassungen die eigene zurück", () => {
    const store = new DiaryStore(null, 3);
    const records = Array.from({ length: 7 }, (_, i) => entry(`p${i}`, `2026-11-0${i + 1}T08:00:00.000Z`) as DiaryRecord);
    store.sync("user:1", 0, records);
    const seen: string[] = [];
    let since = 0;
    for (let round = 0; round < 5; round++) {
      const page = store.sync("user:1", since, []);
      seen.push(...page.changes.map((r) => r.id));
      since = page.rev;
      if (!page.more) break;
    }
    expect(seen).toEqual(records.map((r) => r.id));
    // Eine ältere Fassung von p0 wird nicht übernommen; der Server schickt seine zurück.
    const older = store.sync("user:1", since, [{ ...records[0]!, updatedAt: "2026-10-01T08:00:00.000Z" }]);
    expect(older.changes).toEqual([records[0]]);
    // Gleicher Zeitpunkt: Löschen gewinnt.
    const tie = store.sync("user:1", older.rev, [{ id: "p1", updatedAt: records[1]!.updatedAt, entry: null }]);
    expect(tie.changes).toEqual([]);
    expect(store.count("user:1")).toBe(6);
  });

  it("speichert pro Besitzer eine Datei mit Prüfsumme als Namen und liest sie wieder", () => {
    const folder = join(dir, "store");
    new DiaryStore(folder).sync("device:../../etc/passwd", 0, [entry("f1", "2026-11-23T10:00:00.000Z") as DiaryRecord]);
    const files = readdirSync(folder);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{40}\.json$/);
    const again = new DiaryStore(folder).sync("device:../../etc/passwd", 0, []);
    expect(again.changes.map((r) => r.id)).toEqual(["f1"]);
    // Eine unlesbare Datei wird nicht überschrieben.
    writeFileSync(join(folder, files[0]!), "{kaputt");
    expect(() => new DiaryStore(folder).sync("device:../../etc/passwd", 0, [entry("f2", "2026-11-23T11:00:00.000Z") as DiaryRecord])).toThrow();
    expect(readFileSync(join(folder, files[0]!), "utf8")).toBe("{kaputt");
  });

  it("begrenzt die Zahl der Einträge pro Besitzer", () => {
    const store = new DiaryStore(null, 100, 2);
    store.sync("device:x", 0, [entry("a", "2026-11-23T10:00:00.000Z") as DiaryRecord, entry("b", "2026-11-23T10:00:00.000Z") as DiaryRecord]);
    expect(() => store.sync("device:x", 0, [entry("c", "2026-11-23T10:00:00.000Z") as DiaryRecord])).toThrow(DiaryFullError);
    // Ändern und Löschen vorhandener Einträge geht weiter.
    expect(store.sync("device:x", 0, [tombstone("a", "2026-11-24T10:00:00.000Z")]).rev).toBe(3);
  });
});
