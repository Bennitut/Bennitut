import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";
import { Ai } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { openSqlite, postgresFromPool, type Db, type PgPoolLike } from "../src/storage/db.js";
import { migrate } from "../src/storage/migrations.js";
import { SyncFullError, SyncStore, type SyncRecord } from "../src/storage/sync.js";
import { USER_DATA, UserDataSyncBody, exportUserData, syncUserData, type UserDataSyncResponse } from "../src/sync/userData.js";

// Abgleich von Einstellungen, Plan mit Häkchen und Vorrat zwischen den Geräten eines Kontos (Vorrang 1, 9.2 Teil 4).

const noAi = new Ai({ hasAnthropicKey: false, ollama: { url: "http://ollama.test", model: "gemma4:e4b", numCtx: 1024, timeoutMs: 1000 } }, async () => {
  throw new TypeError("offline");
});
const db = openSqlite(":memory:");
const app = createApp({ db, auth: { appleAudiences: [], googleAudiences: [], adminEmails: [], allowDevLogin: true }, ai: noAi });
const store = new SyncStore(db);

const headers = (token?: string) => ({ "Content-Type": "application/json", "X-Device-Id": "device-aaaaaaaa", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
const devLogin = async (name: string) =>
  (await (await app.request("/api/auth/dev", { method: "POST", body: JSON.stringify({ name }), headers: headers() })).json()) as { token: string; user: { id: string } };
const call = (body: unknown, token?: string) => app.request("/api/sync", { method: "POST", body: JSON.stringify(body), headers: headers(token) });
const sync = async (body: unknown, token: string) => {
  const res = await call(body, token);
  expect(res.status).toBe(200);
  return (await res.json()) as UserDataSyncResponse;
};

/** Zeitpunkte am 27.11.2026 um 8:<n> Uhr (UTC). */
const T = (n: number) => new Date(Date.UTC(2026, 10, 27, 8, n)).toISOString();
const EPOCH = new Date(0).toISOString();
const planData = (startDate: string, recipeName = "Shakshuka") => ({
  plan: { startDate, weeks: [{ startDay: 0, days: 7, meals: [{ day: 0, mealType: "lunch", recipeId: "shakshuka", recipeName }], shoppingList: [] }] },
  recipes: [],
});
const ids = (records: SyncRecord[] | undefined) => (records ?? []).map((r) => r.id).sort();
const nothingSince = (rev: { settings?: number; plan?: number; pantry?: number } = {}) => ({
  kinds: { settings: { since: rev.settings ?? 0 }, plan: { since: rev.plan ?? 0 }, pantry: { since: rev.pantry ?? 0 } },
});

describe("Abgleich von Einstellungen, Plan und Vorrat (/api/sync)", () => {
  it("bringt alles auf ein zweites Gerät, Häkchen und Vorrat wandern in beide Richtungen", async () => {
    const { token, user } = await devLogin("Benjamin");
    const a = await sync(
      {
        kinds: {
          settings: { since: 0, changes: [{ id: "settings", updatedAt: T(1), data: { onboarded: true, diet: "vegan", allergens: ["nuesse"] } }] },
          plan: {
            since: 0,
            changes: [
              { id: "plan", updatedAt: T(1), data: planData("2026-11-27") },
              { id: "c:2026-11-27:0:reis", updatedAt: T(2), data: {} },
              { id: "e:2026-11-27:0:lunch", updatedAt: T(2), data: {} },
            ],
          },
          pantry: { since: 0, changes: [{ id: "reis@2026-11-27", updatedAt: T(2), data: { amount: 500 } }] },
        },
      },
      token,
    );
    expect(a.owner).toBe(`user:${user.id}`);
    expect(a.kinds.settings).toEqual({ rev: 1, changes: [], more: false });
    expect(a.kinds.plan?.rev).toBe(3);

    // Zweites Gerät (oder Browserdaten gelöscht): bekommt alles.
    const b = await sync(nothingSince(), token);
    expect(b.kinds.settings?.changes).toEqual([{ id: "settings", updatedAt: T(1), data: { onboarded: true, diet: "vegan", allergens: ["nuesse"] } }]);
    expect(ids(b.kinds.plan?.changes)).toEqual(["c:2026-11-27:0:reis", "e:2026-11-27:0:lunch", "plan"]);
    expect(b.kinds.pantry?.changes).toEqual([{ id: "reis@2026-11-27", updatedAt: T(2), data: { amount: 500 } }]);

    // Gerät B hakt den Reis wieder ab und kocht 200 g; Gerät A bekommt genau das.
    await sync(
      {
        kinds: {
          plan: { since: b.kinds.plan!.rev, changes: [{ id: "c:2026-11-27:0:reis", updatedAt: T(5), data: null }] },
          pantry: { since: b.kinds.pantry!.rev, changes: [{ id: "reis@2026-11-27", updatedAt: T(5), data: { amount: 300 } }] },
        },
      },
      token,
    );
    const a2 = await sync(nothingSince({ settings: a.kinds.settings!.rev, plan: a.kinds.plan!.rev, pantry: a.kinds.pantry!.rev }), token);
    expect(a2.kinds.settings?.changes).toEqual([]);
    expect(a2.kinds.plan?.changes).toEqual([{ id: "c:2026-11-27:0:reis", updatedAt: T(5), data: null }]);
    expect(a2.kinds.pantry?.changes).toEqual([{ id: "reis@2026-11-27", updatedAt: T(5), data: { amount: 300 } }]);

    // Eine ältere Fassung von Gerät A gewinnt nicht; A bekommt die neuere zurück.
    const stale = await sync({ kinds: { pantry: { since: a2.kinds.pantry!.rev, changes: [{ id: "reis@2026-11-27", updatedAt: T(3), data: { amount: 450 } }] } } }, token);
    expect(stale.kinds.pantry?.changes).toEqual([{ id: "reis@2026-11-27", updatedAt: T(5), data: { amount: 300 } }]);
  });

  it("räumt Häkchen eines abgelösten Plans weg, auch wenn ein Gerät sie später noch schickt", async () => {
    const { token } = await devLogin("Neuer Monat");
    await sync(
      {
        kinds: {
          plan: {
            since: 0,
            changes: [
              { id: "plan", updatedAt: T(1), data: planData("2026-11-01") },
              { id: "c:2026-11-01:3:milch", updatedAt: T(2), data: {} },
              { id: "b:2026-11-01:3:milch", updatedAt: T(2), data: {} },
            ],
          },
        },
      },
      token,
    );
    // Neuer Plan ab dem 27.11. mit einem Häkchen – die des alten Plans verschwinden.
    const next = await sync(
      { kinds: { plan: { since: 3, changes: [{ id: "c:2026-11-27:0:reis", updatedAt: T(11), data: {} }, { id: "plan", updatedAt: T(10), data: planData("2026-11-27") }] } } },
      token,
    );
    expect(next.kinds.plan?.changes).toEqual([]);
    expect(ids((await sync(nothingSince(), token)).kinds.plan?.changes)).toEqual(["c:2026-11-27:0:reis", "plan"]);
    // Ein Gerät, das noch den alten Plan hat, hakt dort etwas ab: Der Server behält es nicht und schickt den neuen Plan.
    const lagging = await sync({ kinds: { plan: { since: 3, changes: [{ id: "c:2026-11-01:3:eier", updatedAt: T(20), data: {} }] } } }, token);
    expect(ids(lagging.kinds.plan?.changes)).toEqual(["c:2026-11-27:0:reis", "plan"]);
    expect(ids((await sync(nothingSince(), token)).kinds.plan?.changes)).toEqual(["c:2026-11-27:0:reis", "plan"]);
  });

  it("nimmt bei gleichem Zeitpunkt die Fassung des Servers – so übernimmt jedes weitere Gerät den Stand des ersten", async () => {
    const { token } = await devLogin("Zwei Geräte");
    // Was die Geräte vor dem Abgleich hatten, trägt den Zeitpunkt 0.
    const first = await sync({ kinds: { settings: { since: 0, changes: [{ id: "settings", updatedAt: EPOCH, data: { onboarded: true, people: 2 } }] } } }, token);
    expect(first.kinds.settings?.changes).toEqual([]);
    const second = await sync({ kinds: { settings: { since: 0, changes: [{ id: "settings", updatedAt: EPOCH, data: { onboarded: true, people: 4 } }] } } }, token);
    expect(second.kinds.settings?.changes).toEqual([{ id: "settings", updatedAt: EPOCH, data: { onboarded: true, people: 2 } }]);
    // Derselbe Inhalt kommt nicht noch einmal zurück.
    const same = await sync({ kinds: { settings: { since: second.kinds.settings!.rev, changes: [{ id: "settings", updatedAt: EPOCH, data: { onboarded: true, people: 2 } }] } } }, token);
    expect(same.kinds.settings?.changes).toEqual([]);
  });

  it("nur mit Konto: ohne Anmeldung und mit abgelaufener Sitzung 401", async () => {
    const without = await call(nothingSince());
    expect(without.status).toBe(401);
    expect(await without.json()).toEqual({ error: "auth_unauthorized" });
    const expired = await call(nothingSince(), "abgelaufen");
    expect(expired.status).toBe(401);
    expect(await expired.json()).toEqual({ error: "auth_invalid_token" });
  });

  it("lehnt Ungültiges ab", async () => {
    const { token } = await devLogin("Prüfung");
    const bad = async (kinds: unknown) => (await call({ kinds }, token)).status;
    const one = (id: string, data: unknown, updatedAt = T(1)) => ({ since: 0, changes: [{ id, updatedAt, data }] });
    expect(await bad({ recipes: { since: 0 } })).toBe(400); // unbekannte Art
    expect(await bad({ settings: one("profil", { onboarded: true }) })).toBe(400);
    expect(await bad({ settings: one("settings", [1, 2]) })).toBe(400);
    expect(await bad({ settings: one("settings", { notes: "x".repeat(20_001) }) })).toBe(400);
    expect(await bad({ settings: one("settings", { onboarded: true }, "irgendwann") })).toBe(400);
    expect(await bad({ settings: { since: 0, changes: [{ id: "settings", updatedAt: T(1) }] } })).toBe(400); // Inhalt fehlt
    expect(await bad({ plan: one("plan", { plan: { weeks: [] }, recipes: [] }) })).toBe(400);
    expect(await bad({ plan: one("e:2026-11-27:0:brunch", {}) })).toBe(400);
    expect(await bad({ plan: one("c:27.11.2026:0:reis", {}) })).toBe(400);
    expect(await bad({ pantry: one("reis", { amount: 1 }) })).toBe(400);
    expect(await bad({ pantry: one("Reis@2026-11-27", { amount: 1 }) })).toBe(400);
    expect(await bad({ pantry: one("reis@2026-11-27", { amount: -1 }) })).toBe(400);
    expect(await bad({ pantry: { since: 2 ** 31 } })).toBe(400);
    // Löschmarken brauchen keinen Inhalt; Felder, die eine neuere App mitschickt, bleiben erhalten.
    expect(await bad({ pantry: one("reis@2026-11-27", null), settings: one("settings", { onboarded: true, neuesFeld: 1 }) })).toBe(200);
  });

  it("gehört zu „Meine Daten exportieren“ und verschwindet mit dem Konto", async () => {
    const { token, user } = await devLogin("Export");
    await sync(
      {
        kinds: {
          settings: { since: 0, changes: [{ id: "settings", updatedAt: T(1), data: { onboarded: true, people: 3 } }] },
          plan: {
            since: 0,
            changes: [
              { id: "plan", updatedAt: T(1), data: planData("2026-11-27") },
              { id: "e:2026-11-27:0:lunch", updatedAt: T(2), data: {} },
              { id: "c:2026-11-27:1:reis", updatedAt: T(2), data: {} },
              { id: "b:2026-11-27:1:reis", updatedAt: T(2), data: {} },
              { id: "c:2026-11-27:1:milch", updatedAt: T(3), data: null },
            ],
          },
          pantry: { since: 0, changes: [{ id: "reis@2026-11-27", updatedAt: T(2), data: { amount: 1000 } }, { id: "milch@2026-11-20", updatedAt: T(3), data: null }] },
        },
      },
      token,
    );
    const exported = (await (await app.request("/api/auth/export", { headers: headers(token) })).json()) as Record<string, unknown>;
    expect(exported.settings).toEqual({ onboarded: true, people: 3 });
    expect(exported.plan).toMatchObject({ plan: { startDate: "2026-11-27" }, recipes: [], eaten: ["0:lunch"], checked: ["1:reis"], booked: ["1:reis"] });
    expect(exported.pantry).toEqual([{ ingredientId: "reis", addedAt: "2026-11-27", amount: 1000 }]);

    expect((await app.request("/api/auth/me", { method: "DELETE", body: "{}", headers: headers(token) })).status).toBe(204);
    for (const kind of [USER_DATA.settings, USER_DATA.plan, USER_DATA.pantry]) expect(await store.count(kind, `user:${user.id}`)).toBe(0);
  });

  it("hat eine Grenze pro Konto", async () => {
    const { token } = await devLogin("Großer Vorrat");
    const posts = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `reis@${new Date(Date.UTC(2000, 0, 1 + from + i)).toISOString().slice(0, 10)}`, updatedAt: T(1), data: { amount: 1 } }));
    expect((await call({ kinds: { pantry: { since: 0, changes: posts(0, 5000) } } }, token)).status).toBe(200);
    const full = await call({ kinds: { pantry: { since: 0, changes: posts(5000, 1) } } }, token);
    expect(full.status).toBe(413);
    expect(await full.json()).toEqual({ error: "sync_full" });
  });
});

// Dieselben Regeln auf SQLite und Postgres (pg-mem, eine nachgebaute Postgres-Datenbank im Speicher).
function pgMem(): Db {
  const { Pool } = newDb().adapters.createPg();
  return postgresFromPool(new Pool() as unknown as PgPoolLike, "Postgres (pg-mem)");
}
const BACKENDS: [string, () => Db][] = [
  ["SQLite", () => openSqlite(":memory:")],
  ["Postgres", pgMem],
];

describe.each(BACKENDS)("Abgleich der Kontodaten mit %s", (_name, open) => {
  const ready = async () => {
    const database = open();
    await migrate(database);
    return new SyncStore(database);
  };
  const request = (kinds: unknown) => UserDataSyncBody.parse({ kinds });

  it("entfernt Häkchen anderer Pläne und lässt die des aktuellen", async () => {
    const synced = await ready();
    await syncUserData(
      synced,
      "user:1",
      request({
        plan: {
          since: 0,
          changes: [
            { id: "plan", updatedAt: T(1), data: planData("2026-11-01") },
            { id: "e:2026-11-01:0:lunch", updatedAt: T(1), data: {} },
            { id: "c:2026-11-01:0:reis", updatedAt: T(1), data: null },
          ],
        },
      }),
    );
    expect(ids(await synced.records(USER_DATA.plan, "user:1"))).toEqual(["e:2026-11-01:0:lunch", "plan"]);
    await syncUserData(synced, "user:1", request({ plan: { since: 3, changes: [{ id: "plan", updatedAt: T(9), data: planData("2026-11-27") }, { id: "e:2026-11-27:1:dinner", updatedAt: T(9), data: {} }] } }));
    expect(ids(await synced.records(USER_DATA.plan, "user:1"))).toEqual(["e:2026-11-27:1:dinner", "plan"]);
    // Auch die Löschmarke des alten Plans ist weg (zählt nicht mehr gegen die Grenze).
    const all = await syncUserData(synced, "user:1", request({ plan: { since: 0 } }));
    expect(ids(all.kinds.plan?.changes)).toEqual(["e:2026-11-27:1:dinner", "plan"]);
    // Ohne Plan bleiben keine Häkchen.
    await syncUserData(synced, "user:1", request({ plan: { since: 5, changes: [{ id: "plan", updatedAt: T(30), data: null }] } }));
    expect(ids((await syncUserData(synced, "user:1", request({ plan: { since: 0 } }))).kinds.plan?.changes)).toEqual(["plan"]);
    // Andere Konten bleiben unberührt.
    await syncUserData(
      synced,
      "user:2",
      request({ plan: { since: 0, changes: [{ id: "plan", updatedAt: T(1), data: planData("2026-11-01") }, { id: "e:2026-11-01:0:lunch", updatedAt: T(1), data: {} }] } }),
    );
    await syncUserData(synced, "user:1", request({ plan: { since: 0, changes: [{ id: "plan", updatedAt: T(40), data: planData("2026-12-01") }] } }));
    expect(ids(await synced.records(USER_DATA.plan, "user:2"))).toEqual(["e:2026-11-01:0:lunch", "plan"]);
    // Häkchen ohne Plan räumt der Server gleich weg.
    await syncUserData(synced, "user:3", request({ plan: { since: 0, changes: [{ id: "e:2026-11-01:0:lunch", updatedAt: T(1), data: {} }] } }));
    expect(await synced.count(USER_DATA.plan, "user:3")).toBe(0);
  });

  it("schickt bei gleichem Zeitpunkt und anderem Inhalt die eigene Fassung zurück, Löschen gewinnt weiter", async () => {
    const synced = await ready();
    await syncUserData(synced, "user:1", request({ pantry: { since: 0, changes: [{ id: "reis@2026-11-27", updatedAt: EPOCH, data: { amount: 500 } }] } }));
    const tie = await syncUserData(synced, "user:1", request({ pantry: { since: 1, changes: [{ id: "reis@2026-11-27", updatedAt: EPOCH, data: { amount: 900 } }] } }));
    expect(tie.kinds.pantry?.changes).toEqual([{ id: "reis@2026-11-27", updatedAt: EPOCH, data: { amount: 500 } }]);
    const gone = await syncUserData(synced, "user:1", request({ pantry: { since: 1, changes: [{ id: "reis@2026-11-27", updatedAt: EPOCH, data: null }] } }));
    expect(gone.kinds.pantry?.changes).toEqual([]);
    expect(await synced.count(USER_DATA.pantry, "user:1")).toBe(0);
    expect(await exportUserData(synced, "user:1")).toEqual({ settings: null, plan: null, pantry: [] });
  });

  it("ändert bei vollem Konto nichts", async () => {
    const synced = await ready();
    const kind = { ...USER_DATA.settings, maxRecords: 1 };
    await synced.sync(kind, "user:1", 0, [{ id: "settings", updatedAt: T(1), data: { onboarded: true } }]);
    await expect(synced.sync(kind, "user:1", 1, [{ id: "settings-2", updatedAt: T(2), data: {} }])).rejects.toBeInstanceOf(SyncFullError);
    expect((await synced.records(kind, "user:1")).map((r) => r.id)).toEqual(["settings"]);
  });
});
