import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DiaryStore } from "../../server/src/diary/store";
import { openSqlite } from "../../server/src/storage/db";
import { migrate } from "../../server/src/storage/migrations";
import {
  DIARY_KEY,
  addEntry,
  emptyDiary,
  loadDiary,
  mergeRecords,
  normalizeEntry,
  removeEntry,
  saveDiary,
  syncDiary,
  readSyncMark,
  SyncResetError,
  type DiaryState,
  type DiarySyncRequest,
  type DiarySyncResponse,
  type KeyValueStorage,
} from "../src/lib/diary";
import type { DiaryEntry } from "../src/lib/types";

/** Speicher wie AsyncStorage bzw. localStorage – mit Liste der Schreibvorgänge, „voll“ und „unlesbar“. */
class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  writes: string[] = [];
  full = false;
  broken = false;
  async getItem(key: string) {
    if (this.broken) throw new Error("SecurityError");
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    if (this.full) throw new Error("QuotaExceededError");
    this.writes.push(key);
    this.data.set(key, value);
  }
}

const meal = (id: string, date: string, title = "Linsen-Bolognese", kcal = 600): DiaryEntry => ({
  id,
  date,
  time: "12:30",
  title,
  nutrients: { kcal, protein: 30, carbs: 70, fat: 15 },
  source: "plan",
});
const at = (iso: string) => new Date(iso);
const ids = (state: DiaryState) => state.entries.map((e) => e.id);

describe("Tagebuch: nichts löscht Einträge automatisch", () => {
  it("übernimmt das Tagebuch vom alten Speicherort und behält es nach neuem Plan oder Fragebogen", async () => {
    const storage = new MemoryStorage();
    // Bis jetzt lag das Tagebuch im übrigen Zustand der App, ohne `updatedAt`.
    const legacy = [meal("a", "2025-12-30"), meal("b", "2026-11-20"), meal("c", "2026-11-21")];
    const first = await loadDiary(storage, legacy, at("2026-11-24T10:00:00Z"));
    assert.deepEqual(ids(first.state), ["a", "b", "c"]);
    assert.equal(first.migrated, true, "muss gleich gespeichert werden");
    assert.deepEqual([...first.state.pending].sort(), ["a", "b", "c"], "gehen bei der ersten Sicherung auf den Server");
    assert.ok(first.state.entries.every((e) => e.updatedAt), "jeder Eintrag bekommt einen Zeitpunkt");
    await saveDiary(storage, first.state, first.written);
    assert.ok(storage.data.has(`${DIARY_KEY}/2025`) && storage.data.has(`${DIARY_KEY}/2026`), "ein Teil pro Jahr");

    // Neuer Plan, neuer Fragebogen oder ein frischer Zustand schreiben nur den übrigen Zustand – ohne Tagebuch.
    storage.data.set("foodtracker/state/v2", JSON.stringify({ plan: null, settings: { onboarded: false } }));
    const again = await loadDiary(storage, undefined, at("2026-11-25T10:00:00Z"));
    assert.deepEqual(ids(again.state), ["a", "b", "c"]);
    assert.equal(again.migrated, false);

    // Steht das alte Tagebuch noch im übrigen Zustand (noch nicht neu geschrieben), kommt nichts doppelt.
    const twice = await loadDiary(storage, legacy, at("2026-11-25T10:00:00Z"));
    assert.deepEqual(ids(twice.state), ["a", "b", "c"]);
    assert.equal(twice.migrated, false);
  });

  it("verliert nichts, wenn alter und neuer Speicherort verschiedene Einträge haben", async () => {
    const storage = new MemoryStorage();
    let saved = addEntry(emptyDiary(), meal("b", "2026-11-20"), at("2026-11-20T12:30:00Z"));
    saved = addEntry(saved, { ...meal("c", "2026-11-21"), title: "Neuer Titel" }, at("2026-11-22T08:00:00Z"));
    saved = addEntry(saved, meal("d", "2026-11-21"), at("2026-11-21T12:00:00Z"));
    saved = removeEntry(saved, "d", at("2026-11-23T08:00:00Z"));
    await saveDiary(storage, saved, new Map());
    const legacy = [meal("a", "2026-11-19"), meal("b", "2026-11-20"), meal("c", "2026-11-21"), meal("d", "2026-11-21")];
    const loaded = await loadDiary(storage, legacy, at("2026-11-24T10:00:00Z"));
    assert.deepEqual(ids(loaded.state), ["a", "b", "c"], "a kommt dazu, d bleibt gelöscht");
    assert.equal(loaded.state.entries.find((e) => e.id === "c")?.title, "Neuer Titel", "neuere Fassung bleibt");
  });

  it("legt unlesbare Teile beiseite und lädt den Rest", async () => {
    const storage = new MemoryStorage();
    await saveDiary(storage, addEntry(addEntry(emptyDiary(), meal("alt", "2025-03-01")), meal("neu", "2026-11-24")), new Map());
    storage.data.set(`${DIARY_KEY}/2025`, "[[kaputt");
    const loaded = await loadDiary(storage, undefined, at("2026-11-24T10:00:00Z"));
    assert.deepEqual(ids(loaded.state), ["neu"]);
    assert.deepEqual(loaded.corrupt, [`${DIARY_KEY}/2025`]);
    const kept = [...storage.data.keys()].find((k) => k.startsWith(`${DIARY_KEY}/2025/kaputt-`));
    assert.ok(kept && storage.data.get(kept) === "[[kaputt", "Inhalt beiseitegelegt");
  });

  it("wirft, wenn der Speicher nicht lesbar ist – dann speichert die App nichts", async () => {
    const storage = new MemoryStorage();
    storage.broken = true;
    await assert.rejects(loadDiary(storage, [meal("a", "2026-11-24")]));
  });

  it("löscht nur auf Wunsch, und Gelöschtes kommt vom Server oder aus einer Datei nicht zurück", () => {
    let state = addEntry(emptyDiary(), meal("x", "2026-11-24"), at("2026-11-24T08:00:00Z"));
    state = removeEntry(state, "x", at("2026-11-24T09:00:00Z"));
    const stale = { id: "x", updatedAt: "2026-11-24T08:00:00.000Z", entry: meal("x", "2026-11-24") };
    assert.deepEqual(ids(mergeRecords(state, [stale], { fromServer: true }).state), []);
    assert.deepEqual(ids(mergeRecords(state, [stale], { fromServer: false }).state), []);
    // Was dem Server oder der Datei fehlt, bleibt: eine leere Antwort ändert nichts.
    const kept = addEntry(emptyDiary(), meal("k", "2026-11-24"));
    assert.equal(mergeRecords(kept, [], { fromServer: true }).state, kept);
    assert.equal(mergeRecords(kept, [{ id: "anders", updatedAt: "2026-11-25T00:00:00.000Z", entry: null }], { fromServer: true }).state.entries.length, 1);
  });

  it("speichert nur Geändertes und leert Jahre, deren Einträge gelöscht wurden", async () => {
    const storage = new MemoryStorage();
    const written = new Map<string, string>();
    let state = addEntry(addEntry(emptyDiary(), meal("alt", "2025-06-01")), meal("neu", "2026-11-24"));
    await saveDiary(storage, state, written);
    assert.deepEqual(storage.writes, [`${DIARY_KEY}/2025`, `${DIARY_KEY}/2026`, DIARY_KEY], "Jahre zuerst, Übersicht zuletzt");
    storage.writes = [];
    state = addEntry(state, meal("neu2", "2026-11-24"));
    await saveDiary(storage, state, written);
    assert.deepEqual(storage.writes, [`${DIARY_KEY}/2026`, DIARY_KEY], "2025 bleibt unangetastet");
    storage.writes = [];
    state = removeEntry(state, "alt");
    await saveDiary(storage, state, written);
    assert.deepEqual(storage.writes, [`${DIARY_KEY}/2025`, DIARY_KEY]);
    const loaded = await loadDiary(storage, undefined, at("2026-11-25T10:00:00Z"));
    assert.deepEqual(ids(loaded.state), ["neu", "neu2"]);
    assert.deepEqual(loaded.state.deleted.map((d) => d.id), ["alt"]);
  });

  it("meldet einen vollen Speicher und holt das Speichern danach nach", async () => {
    const storage = new MemoryStorage();
    const written = new Map<string, string>();
    const state = addEntry(emptyDiary(), meal("a", "2026-11-24"));
    storage.full = true;
    await assert.rejects(saveDiary(storage, state, written));
    storage.full = false;
    await saveDiary(storage, state, written);
    assert.deepEqual(ids((await loadDiary(storage, undefined, at("2026-11-24T10:00:00Z"))).state), ["a"]);
  });

  it("prüft Einträge aus Speicher, Server und Dateien", () => {
    const legacy = normalizeEntry({ ...meal("a", "2026-11-24"), time: "18:05" });
    assert.equal(legacy?.updatedAt, new Date("2026-11-24T18:05:00").toISOString(), "Zeitpunkt aus Tag und Uhrzeit");
    assert.equal(normalizeEntry({ ...meal("a", "2026-11-24"), updatedAt: "2026-11-24T10:00:00Z" })?.updatedAt, "2026-11-24T10:00:00.000Z");
    assert.equal(normalizeEntry({ ...meal("a", "gestern") }), null);
    assert.equal(normalizeEntry({ ...meal("a", "2026-11-24"), nutrients: { kcal: -5 } }), null);
    assert.equal(normalizeEntry({ ...meal("a", "2026-11-24"), source: "hack" })?.source, "manuell");
  });
});

/** Derselbe Speicher wie im Server (Datenbank SQLite im Speicher), ohne HTTP. */
async function serverStore(pageSize?: number) {
  const db = openSqlite(":memory:");
  await migrate(db);
  return new DiaryStore(db, pageSize);
}

describe("Tagebuch: Sicherung auf dem Server", () => {
  // Seiten zu 3 Datensätzen, damit das Blättern mitgeprüft wird.
  const server = serverStore(3);
  const calls: DiarySyncRequest[] = [];
  const call =
    (owner: string) =>
    async (request: DiarySyncRequest): Promise<DiarySyncResponse> => {
      calls.push(request);
      return { owner, ...(await (await server).sync(owner, request.since, request.changes, request.database)) };
    };
  const run = async (state: DiaryState, owner: string) => (await syncDiary(state, owner, call(owner)))(state);

  it("bringt die Historie mit Konto auf ein neues Gerät; Gelöschtes kommt nicht zurück", async () => {
    let phone = addEntry(addEntry(emptyDiary(), meal("p1", "2026-11-23")), meal("p2", "2026-11-24"));
    phone = await run(phone, "user:1");
    assert.deepEqual(phone.pending, []);
    assert.equal(phone.sync?.owner, "user:1");
    // Neues Gerät oder Browserdaten gelöscht: anmelden, dann kommt alles zurück.
    let browser = await run(emptyDiary(), "user:1");
    assert.deepEqual(ids(browser), ["p1", "p2"]);
    assert.deepEqual(browser.pending, [], "Geholtes muss nicht wieder hoch");
    // Am Handy gelöscht: im Browser nach dem nächsten Abgleich weg – und es kommt nicht zurück.
    phone = await run(removeEntry(phone, "p1"), "user:1");
    browser = await run(browser, "user:1");
    assert.deepEqual(ids(browser), ["p2"]);
    phone = await run(phone, "user:1");
    assert.deepEqual(ids(phone), ["p2"]);
  });

  it("lädt beim Anmelden die Einträge vom Gerät ins Konto", async () => {
    let state = await run(addEntry(emptyDiary(), meal("anon", "2026-11-24")), "device:abc12345");
    assert.equal(await (await server).count("user:2"), 0);
    state = await run(state, "user:2");
    assert.equal(await (await server).count("user:2"), 1);
    assert.equal(state.sync?.owner, "user:2");
  });

  it("schickt beim nächsten Mal, was während des Abgleichs dazukam", async () => {
    let state = addEntry(emptyDiary(), meal("a", "2026-11-24"));
    const apply = await syncDiary(state, "user:3", call("user:3"));
    state = addEntry(state, meal("b", "2026-11-24"));
    state = apply(state);
    assert.deepEqual(state.pending, ["b"]);
    state = await run(state, "user:3");
    assert.deepEqual(state.pending, []);
    assert.equal(await (await server).count("user:3"), 2);
  });

  it("holt große Historien seitenweise und lädt in Paketen hoch", async () => {
    const records = Array.from({ length: 4100 }, (_, i) => ({ id: `m${i}`, updatedAt: "2026-01-01T00:00:00.000Z", entry: meal(`m${i}`, "2026-01-01") }));
    let big = mergeRecords(emptyDiary(), records, { fromServer: false }).state;
    calls.length = 0;
    big = await run(big, "user:4");
    assert.deepEqual(calls.map((c) => c.changes.length), [2000, 2000, 100]);
    assert.equal(await (await server).count("user:4"), 4100);
    assert.deepEqual(big.pending, []);
    // Ein neues Gerät bekommt alles, auch wenn der Server nur 3 Datensätze pro Antwort schickt.
    const small = await serverStore(3);
    await small.sync("user:5", 0, Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, updatedAt: "2026-02-01T00:00:00.000Z", entry: meal(`s${i}`, "2026-02-01") })));
    const fresh = (await syncDiary(emptyDiary(), "user:5", async (r) => ({ owner: "user:5", ...(await small.sync("user:5", r.since, r.changes)) })))(emptyDiary());
    assert.equal(fresh.entries.length, 8);
  });

  it("lässt ohne Verbindung alles offen", async () => {
    const state = addEntry(emptyDiary(), meal("offline", "2026-11-24"));
    await assert.rejects(
      syncDiary(state, "user:6", async () => {
        throw new Error("network");
      }),
    );
    assert.deepEqual(state.pending, ["offline"]);
  });
});

describe("Tagebuch: neuer Server, neue Datenbank (Abgleich-Marken mit Kennung)", () => {
  /** Ein Server mit eigener, leerer Datenbank – wie über HTTP mit JSON hin und zurück. */
  const newServer = async () => {
    const store = await serverStore();
    const calls: DiarySyncRequest[] = [];
    const call =
      (owner: string) =>
      async (request: DiarySyncRequest): Promise<DiarySyncResponse> => {
        calls.push(JSON.parse(JSON.stringify(request)) as DiarySyncRequest);
        return JSON.parse(JSON.stringify({ owner, ...(await store.sync(owner, request.since, request.changes, request.database)) })) as DiarySyncResponse;
      };
    const run = async (state: DiaryState, owner: string) => (await syncDiary(state, owner, call(owner)))(state);
    return { store, calls, run };
  };

  it("gleicht nach dem Umzug auf eine leere Datenbank von vorn ab – dort fehlt danach nichts", async () => {
    const laptop = await newServer();
    let phone = addEntry(addEntry(emptyDiary(), meal("u1", "2026-11-20")), meal("u2", "2026-11-21"));
    phone = await run2(laptop, phone);
    const laptopDb = phone.sync?.db;
    assert.match(laptopDb ?? "", /^[0-9a-f-]{36}$/, "die Marke kennt die Datenbank");
    // Schon abgeglichen; danach kommt ein neuer Eintrag dazu und einer wird gelöscht.
    phone = removeEntry(addEntry(phone, meal("u3", "2026-11-22")), "u1");
    assert.deepEqual([...phone.pending].sort(), ["u1", "u3"]);

    // Der Server zieht um (z. B. Render mit Neon): neue, leere Datenbank, andere Kennung.
    const cloud = await newServer();
    phone = await run2(cloud, phone);
    assert.equal(cloud.calls[0]?.database, laptopDb, "die App nennt die Datenbank ihrer Marke");
    assert.deepEqual(cloud.calls[0]?.changes.map((c) => c.id).sort(), ["u1", "u3"], "zuerst nur das Neue …");
    assert.equal(cloud.calls[1]?.since, 0, "… der Server sagt reset, dann von vorn");
    assert.deepEqual(cloud.calls[1]?.changes.map((c) => c.id).sort(), ["u1", "u2", "u3"], "alles hoch, auch die Löschmarke");
    assert.equal(await cloud.store.count("user:1"), 2);
    assert.notEqual(phone.sync?.db, laptopDb);
    assert.deepEqual(phone.pending, []);
    // Ein neues Gerät bekommt vom neuen Server alles; der gelöschte Eintrag kommt nicht zurück.
    const browser = await run2(cloud, emptyDiary());
    assert.deepEqual(ids(browser), ["u2", "u3"]);
    // Danach wieder nur Neues.
    cloud.calls.length = 0;
    phone = await run2(cloud, addEntry(phone, meal("u4", "2026-11-23")));
    assert.deepEqual(cloud.calls.map((c) => c.changes.map((r) => r.id)), [["u4"]]);
    assert.equal(cloud.calls[0]?.database, phone.sync?.db);
  });

  it("gleicht eine Marke ohne Kennung (ältere App-Fassung) einmal von vorn ab, danach nur Neues", async () => {
    const server = await newServer();
    let state = addEntry(addEntry(emptyDiary(), meal("a1", "2026-11-20")), meal("a2", "2026-11-21"));
    state = await run2(server, state);
    // Wie von einer älteren Fassung gespeichert: Besitzer und Revision, aber keine Kennung.
    const { db: _db, ...old } = state.sync!;
    state = readSyncMarkInto(state, old);
    server.calls.length = 0;
    state = await run2(server, addEntry(state, meal("a3", "2026-11-22")));
    assert.deepEqual(server.calls.map((c) => [c.database ?? null, c.since, c.changes.length]), [[null, 0, 3]]);
    assert.equal(await server.store.count("user:1"), 3);
    server.calls.length = 0;
    state = await run2(server, addEntry(state, meal("a4", "2026-11-23")));
    assert.deepEqual(server.calls.map((c) => c.changes.map((r) => r.id)), [["a4"]]);
  });

  it("gleicht mit einem älteren Server ohne Kennung weiter nur Neues ab und gibt nach zweimal reset auf", async () => {
    const store = await serverStore();
    const requests: DiarySyncRequest[] = [];
    // Älterer Server: kennt keine Kennung und antwortet ohne.
    const old = async (request: DiarySyncRequest): Promise<DiarySyncResponse> => {
      requests.push(request);
      const { database: _db, ...result } = await store.sync("user:1", request.since, request.changes);
      return { owner: "user:1", ...result };
    };
    const runOld = async (s: DiaryState) => (await syncDiary(s, "user:1", old))(s);
    let state = await runOld(addEntry(emptyDiary(), meal("o1", "2026-11-20")));
    assert.equal(state.sync?.db, null);
    state = await runOld(addEntry(state, meal("o2", "2026-11-21")));
    assert.deepEqual(requests.map((r) => [r.database ?? null, r.changes.map((c) => c.id)]), [[null, ["o1"]], [null, ["o2"]]]);
    // Sagt der Server immer wieder reset, gibt die App auf (später noch einmal) und ändert nichts.
    const before = state;
    await assert.rejects(syncDiary(state, "user:1", async () => ({ owner: "user:1", rev: 0, changes: [], more: false, database: `db-${Math.random()}`, reset: true })), SyncResetError);
    assert.equal(state, before);
  });
});

/** Abgleich mit einem Server aus `newServer` für das Konto „user:1“. */
const run2 = (server: { run: (state: DiaryState, owner: string) => Promise<DiaryState> }, state: DiaryState) => server.run(state, "user:1");
/** Zustand mit einer Marke, wie sie aus dem Speicher käme (lib/diary.ts, readSyncMark). */
const readSyncMarkInto = (state: DiaryState, raw: unknown): DiaryState => ({ ...state, sync: readSyncMark(raw) });
