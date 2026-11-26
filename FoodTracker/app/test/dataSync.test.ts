import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openSqlite } from "../../server/src/storage/db";
import { migrate } from "../../server/src/storage/migrations";
import { SyncStore } from "../../server/src/storage/sync";
import { USER_DATA, UserDataSyncBody, syncUserData } from "../../server/src/sync/userData";
import {
  DATA_KINDS,
  SYNC_IDS,
  applyRemote,
  emptyDataSync,
  readDataSync,
  readSettings,
  recordsOf,
  syncData,
  trackChanges,
  type DataSyncRequest,
  type DataSyncResponse,
  type SyncedData,
  type SyncedState,
} from "../src/lib/dataSync";
import type { StockItem } from "../src/lib/pantry";
import type { MonthPlan, ShoppingItem } from "../src/lib/types";
import { meal, recipe, settings } from "./fixtures";

// Abgleich von Einstellungen, Plan mit Einkaufsliste und Vorrat mit dem Konto (Vorrang 1, 9.2 Teil 4).

const shopping = (ingredientId: string): ShoppingItem => ({
  ingredientId,
  unit: "g",
  needed: 400,
  fromPantry: 0,
  packs: 1,
  packSize: 500,
  price: 1.5,
  leftover: 100,
  durable: true,
});
const monthPlan = (startDate: string, recipeId = "shakshuka"): MonthPlan => ({
  startDate,
  weeks: [
    {
      startDay: 0,
      days: 7,
      meals: [meal({ recipeId, day: 0, mealType: "lunch" }), meal({ recipeId: "linsen_dal", day: 1, mealType: "dinner" })],
      shoppingList: [shopping("reis"), shopping("milch")],
      totalPrice: 3,
      wasteRatio: 0,
      unusedPantry: [],
      dailyKcalPerPerson: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
      spoilageWarnings: [],
      endPantry: [],
    },
  ],
});
const post = (ingredientId: string, amount: number, addedAt = "2026-11-27"): StockItem => ({ ingredientId, amount, addedAt });

/** Ein Gerät: Zustand wie in store.tsx, Änderungen wie über `update` (mit Zeitpunkt). */
class Device {
  state: SyncedState;
  constructor(data: Partial<SyncedData> = {}, legacy = false) {
    const base: SyncedData = {
      settings: settings({ onboarded: false }),
      plan: null,
      planRecipes: [],
      eatenMeals: [],
      shoppingChecked: [],
      shoppingBooked: [],
      pantry: [],
      ...data,
    };
    // Daten von vor dem Abgleich tragen den Zeitpunkt 0; ein neues Gerät hat noch nichts.
    this.state = { ...base, dataSync: legacy ? readDataSync(undefined, base) : emptyDataSync() };
  }
  change(patch: Partial<SyncedData> | ((s: SyncedState) => Partial<SyncedData>), now = Date.now()) {
    const next = { ...this.state, ...(typeof patch === "function" ? patch(this.state) : patch) };
    this.state = { ...next, dataSync: trackChanges(this.state.dataSync, this.state, next, now) };
  }
  pending() {
    return DATA_KINDS.flatMap((kind) => this.state.dataSync[kind].pending).sort();
  }
}

/** Derselbe Abgleich wie im Server (POST /api/sync, Datenbank SQLite im Speicher) – mit derselben Prüfung der Anfrage. */
async function server() {
  const db = openSqlite(":memory:");
  await migrate(db);
  const store = new SyncStore(db);
  const requests: DataSyncRequest[] = [];
  const call =
    (owner: string) =>
    async (request: DataSyncRequest): Promise<DataSyncResponse> => {
      requests.push(request);
      // Wie über HTTP: JSON hin und zurück, und der Server prüft die Anfrage (400 bei allem, was er nicht annimmt).
      const body = UserDataSyncBody.parse(JSON.parse(JSON.stringify(request)));
      return JSON.parse(JSON.stringify(await syncUserData(store, owner, body))) as DataSyncResponse;
    };
  const run = async (device: Device, owner = "user:1") => {
    device.state = (await syncData(device.state, owner, call(owner)))(device.state);
  };
  return { store, requests, call, run };
}

const data = (d: Device) => {
  const { settings: s, plan, planRecipes, eatenMeals, shoppingChecked, shoppingBooked, pantry } = d.state;
  return { settings: s, plan, planRecipes, eatenMeals: [...eatenMeals].sort(), shoppingChecked: [...shoppingChecked].sort(), shoppingBooked: [...shoppingBooked].sort(), pantry: [...pantry].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId) || a.addedAt.localeCompare(b.addedAt)) };
};

describe("Abgleich: Einträge aus dem Zustand", () => {
  it("leitet Einstellungen, Plan mit Häkchen und Vorratsposten ab – in der Form, die der Server annimmt", () => {
    const own = recipe({ id: "ki_bowl", ingredients: [{ ingredientId: "reis", amount: 80 }], media: { image: { uri: "data:image/jpeg;base64,AAAA" } } });
    const d: SyncedData = {
      settings: settings(),
      plan: monthPlan("2026-11-27"),
      planRecipes: [own],
      eatenMeals: ["0:lunch"],
      shoppingChecked: ["0:reis"],
      shoppingBooked: ["0:reis"],
      pantry: [post("reis", 250), post("reis", 250.04), post("milch", 1000, "2026-11-20"), post("eier", 0)],
    };
    assert.deepEqual([...recordsOf("settings", d).keys()], ["settings"]);
    const plan = recordsOf("plan", d);
    assert.deepEqual([...plan.keys()].sort(), ["b:2026-11-27:0:reis", "c:2026-11-27:0:reis", "e:2026-11-27:0:lunch", "plan"]);
    // Fotos vom Gerät bleiben auf dem Gerät.
    assert.equal((plan.get("plan") as { recipes: { media?: { image?: unknown } }[] }).recipes[0]?.media?.image, undefined);
    assert.deepEqual(Object.fromEntries(recordsOf("pantry", d)), { "reis@2026-11-27": { amount: 500 }, "milch@2026-11-20": { amount: 1000 } });
    // Vor dem Fragebogen gibt es keine Einstellungen zum Abgleichen – sonst ersetzten die Voreinstellungen eines neuen
    // Geräts die des Kontos.
    assert.equal(recordsOf("settings", { ...d, settings: settings({ onboarded: false }) }).size, 0);
    assert.equal(recordsOf("plan", { ...d, plan: null }).size, 0);
  });

  it("nimmt genau die IDs an, die auch der Server annimmt", () => {
    const samples: Record<(typeof DATA_KINDS)[number], string[]> = {
      settings: ["settings", "settings2", "profil"],
      plan: ["plan", "e:2026-11-27:29:dinner", "e:2026-11-27:0:brunch", "c:2026-11-27:3:kichererbsen_dose", "b:2026-11-27:0:reis", "c:2026-11-27:12:reis", "x:2026-11-27:0:reis", "c:27.11.2026:0:reis"],
      pantry: ["reis@2026-11-27", "Reis@2026-11-27", "reis", "reis@27.11.2026"],
    };
    for (const kind of DATA_KINDS) {
      for (const id of samples[kind]) assert.equal(SYNC_IDS[kind].test(id), USER_DATA[kind].validId(id), `${kind}: ${id}`);
    }
  });
});

describe("Abgleich: Änderungen merken", () => {
  it("merkt Geändertes und Gelöschtes mit Zeitpunkt, Unverändertes nicht", () => {
    const d = new Device({ settings: settings(), plan: monthPlan("2026-11-27"), pantry: [post("reis", 500)] }, true);
    const before = d.state.dataSync;
    d.change((s) => ({ shoppingChecked: [...s.shoppingChecked] }), 1000);
    assert.equal(d.state.dataSync, before, "nichts geändert – derselbe Stand");
    d.change({ shoppingChecked: ["0:reis"] }, 1000);
    d.change({ pantry: [post("reis", 300)] }, 1001);
    assert.deepEqual(d.pending(), ["c:2026-11-27:0:reis", "reis@2026-11-27"]);
    assert.equal(d.state.dataSync.plan.at["c:2026-11-27:0:reis"], 1000);
    d.change({ shoppingChecked: [] }, 900); // Uhr geht nach: trotzdem später als die gemerkte Fassung
    assert.equal(d.state.dataSync.plan.at["c:2026-11-27:0:reis"], 1001);
    assert.equal(d.state.dataSync.plan.at.plan, 0, "Plan selbst unverändert");
    // Neuer Plan mit anderem Startdatum: Häkchen des alten Plans werden zu Löschmarken.
    d.change({ shoppingChecked: ["0:milch"] }, 2000);
    d.change({ plan: monthPlan("2026-12-01"), shoppingChecked: [] }, 3000);
    assert.equal(d.state.dataSync.plan.at.plan, 3000);
    assert.ok(d.pending().includes("c:2026-11-27:0:milch"));
  });
});

describe("Abgleich mit dem Konto auf dem Server", () => {
  it("bringt Einstellungen, Plan, Häkchen und Vorrat auf ein neues Gerät und Änderungen in beide Richtungen", async () => {
    const { run } = await server();
    // Handy mit Daten von vor dem Abgleich, dann angemeldet.
    const phone = new Device(
      { settings: settings({ people: 2, diet: "vegetarisch" }), plan: monthPlan("2026-11-27"), eatenMeals: ["0:lunch"], shoppingChecked: ["0:reis"], pantry: [post("reis", 500)] },
      true,
    );
    await run(phone);
    assert.deepEqual(phone.pending(), []);
    assert.ok(DATA_KINDS.every((kind) => phone.state.dataSync[kind].mark?.owner === "user:1"));

    // Browser (neu oder Browserdaten gelöscht): nach dem Anmelden ist alles da – nichts muss wieder hoch.
    const browser = new Device();
    await run(browser);
    assert.deepEqual(data(browser), data(phone));
    assert.deepEqual(browser.pending(), []);

    // Im Browser: Milch abgehakt, 200 g Reis gekocht. Das Handy bekommt beides.
    browser.change({ shoppingChecked: ["0:reis", "0:milch"], pantry: [post("reis", 300)] });
    await run(browser);
    await run(phone);
    assert.deepEqual(data(phone).shoppingChecked, ["0:milch", "0:reis"]);
    assert.deepEqual(phone.state.pantry, [post("reis", 300)]);

    // Am Handy Reis wieder abgehakt und den Vorrat leer gekocht – im Browser verschwindet beides.
    phone.change({ shoppingChecked: ["0:milch"], pantry: [] });
    await run(phone);
    await run(browser);
    assert.deepEqual(browser.state.shoppingChecked, ["0:milch"]);
    assert.deepEqual(browser.state.pantry, []);

    // Am Handy ein neuer Monat: Im Browser gilt der neue Plan, die alten Häkchen sind weg (auch aus dem Abgleich-Stand).
    phone.change({ plan: monthPlan("2026-12-01", "kaiserschmarrn"), eatenMeals: [], shoppingChecked: [], shoppingBooked: [] });
    phone.change({ shoppingChecked: ["0:reis"] });
    await run(phone);
    await run(browser);
    assert.equal(browser.state.plan?.startDate, "2026-12-01");
    assert.deepEqual(browser.state.shoppingChecked, ["0:reis"]);
    assert.deepEqual(browser.state.eatenMeals, []);
    assert.deepEqual(Object.keys(browser.state.dataSync.plan.at).sort(), ["c:2026-12-01:0:reis", "plan"]);
    assert.deepEqual(data(browser), data(phone));
  });

  it("übernimmt beim ersten Abgleich den Stand des ersten Geräts, Vorrat von beiden kommt zusammen", async () => {
    const { run } = await server();
    const laptop = new Device({ settings: settings({ people: 2 }), plan: monthPlan("2026-11-24"), pantry: [post("reis", 500, "2026-11-20")] }, true);
    const phone = new Device({ settings: settings({ people: 4 }), plan: monthPlan("2026-11-27"), shoppingChecked: ["0:milch"], pantry: [post("milch", 1000)] }, true);
    await run(laptop);
    await run(phone);
    await run(laptop);
    for (const d of [laptop, phone]) {
      assert.equal(d.state.settings.people, 2, "Einstellungen des ersten Geräts");
      assert.equal(d.state.plan?.startDate, "2026-11-24", "Plan des ersten Geräts");
      assert.deepEqual(d.state.shoppingChecked, [], "Häkchen des anderen Plans gelten nicht");
      assert.deepEqual(data(d).pantry, [post("milch", 1000), post("reis", 500, "2026-11-20")]);
      assert.deepEqual(d.pending(), []);
    }
  });

  it("nimmt bei Änderungen auf beiden Geräten die neuere – auch nach einer Zeit ohne Verbindung", async () => {
    const { run } = await server();
    const a = new Device({ settings: settings() }, true);
    const b = new Device();
    await run(a);
    await run(b);
    b.change({ settings: { ...b.state.settings, people: 3 } }, Date.parse("2026-11-27T10:00:00Z"));
    a.change({ settings: { ...a.state.settings, people: 5 } }, Date.parse("2026-11-27T11:00:00Z"));
    await run(b);
    await run(a);
    await run(b);
    assert.equal(a.state.settings.people, 5);
    assert.equal(b.state.settings.people, 5);
    assert.deepEqual([...a.pending(), ...b.pending()], []);
  });

  it("verwirft Häkchen des alten Plans, wenn ein neuerer Plan kommt, ohne die des neuen zu löschen", async () => {
    const { run } = await server();
    const a = new Device({ settings: settings(), plan: monthPlan("2026-11-01") }, true);
    const b = new Device();
    await run(a);
    await run(b);
    // A plant den neuen Monat und hakt Reis ab; B (ohne Verbindung) hakt danach noch im alten Plan Reis ab.
    a.change({ plan: monthPlan("2026-11-27") }, Date.parse("2026-11-27T08:00:00Z"));
    a.change({ shoppingChecked: ["0:reis"] }, Date.parse("2026-11-27T08:01:00Z"));
    b.change({ shoppingChecked: ["0:reis"] }, Date.parse("2026-11-27T09:00:00Z"));
    await run(a);
    await run(b);
    assert.equal(b.state.plan?.startDate, "2026-11-27");
    assert.deepEqual(b.state.shoppingChecked, ["0:reis"], "Häkchen des neuen Plans von A");
    assert.deepEqual(b.pending(), []);
    await run(a);
    assert.deepEqual(a.state.shoppingChecked, ["0:reis"], "B hat es nicht gelöscht");
  });

  it("behält, was während des Abgleichs dazukam, und schickt es beim nächsten Mal", async () => {
    const { call, run, store } = await server();
    const d = new Device({ settings: settings() }, true);
    const apply = await syncData(d.state, "user:1", call("user:1"));
    d.change({ pantry: [post("reis", 500)] });
    d.state = apply(d.state);
    assert.deepEqual(d.pending(), ["reis@2026-11-27"]);
    await run(d);
    assert.deepEqual(d.pending(), []);
    assert.equal(await store.count(USER_DATA.pantry, "user:1"), 1);
  });

  it("schickt nichts, was der Server ablehnen würde, und lässt ohne Verbindung alles offen", async () => {
    const { run, requests } = await server();
    const d = new Device({ settings: settings() }, true);
    await run(d);
    // Viel zu lange Wünsche (über 20 000 Zeichen): bleiben auf dem Gerät, statt jeden Abgleich scheitern zu lassen.
    d.change({ settings: { ...d.state.settings, preferences: "mehr Gemüse ".repeat(2000) } });
    await run(d);
    assert.deepEqual(d.pending(), []);
    assert.deepEqual(requests.at(-1)?.kinds.settings?.changes, []);
    // Ohne Verbindung bleibt alles, wie es war.
    d.change({ pantry: [post("reis", 500)] });
    const before = d.state;
    await assert.rejects(syncData(d.state, "user:1", async () => Promise.reject(new Error("network"))));
    assert.equal(d.state, before);
    assert.deepEqual(d.pending(), ["reis@2026-11-27"]);
  });

  it("lädt bei einem anderen Konto alles hoch und holt alles von dort", async () => {
    const { run, store } = await server();
    const d = new Device({ settings: settings(), plan: monthPlan("2026-11-27"), pantry: [post("reis", 500)] }, true);
    await run(d, "user:1");
    await run(d, "user:2");
    assert.equal(await store.count(USER_DATA.pantry, "user:2"), 1);
    assert.equal(await store.count(USER_DATA.plan, "user:2"), 1);
    assert.ok(DATA_KINDS.every((kind) => d.state.dataSync[kind].mark?.owner === "user:2"));
  });
});

describe("Abgleich: was vom Server kommt", () => {
  const base = () => new Device({ settings: settings({ people: 2 }), plan: monthPlan("2026-11-27"), shoppingChecked: ["0:reis"], pantry: [post("reis", 500)] }, true).state;
  const at = (n: number) => new Date(n).toISOString();

  it("übergeht Unbrauchbares und ältere Fassungen", () => {
    let s = base();
    s = { ...s, dataSync: trackChanges(s.dataSync, s, { ...s, pantry: [post("reis", 400)] }, 5000) };
    const kept = applyRemote(s, "pantry", [{ id: "reis@2026-11-27", updatedAt: at(4000), data: { amount: 1 } }]);
    assert.equal(kept, s, "eigene Fassung ist neuer");
    assert.equal(applyRemote(s, "pantry", [{ id: "reis@2026-11-27", updatedAt: at(6000), data: { amount: -3 } }]), s);
    assert.equal(applyRemote(s, "plan", [{ id: "plan", updatedAt: at(6000), data: { plan: { startDate: "2026-12-01", weeks: [{}] }, recipes: [] } }]), s);
    assert.equal(applyRemote(s, "plan", [{ id: "c:2026-12-01:0:milch", updatedAt: at(6000), data: {} }]), s, "Häkchen eines anderen Plans");
    assert.equal(applyRemote(s, "settings", [{ id: "settings", updatedAt: at(6000), data: null }]), s, "Einstellungen werden nie gelöscht");
    const newer = applyRemote(s, "pantry", [{ id: "reis@2026-11-27", updatedAt: at(6000), data: { amount: 250 } }]);
    assert.deepEqual(newer.pantry, [post("reis", 250)]);
    assert.deepEqual(newer.dataSync.pantry.pending, [], "die neuere Fassung vom Server ersetzt die eigene");
  });

  it("prüft Einstellungen Feld für Feld", () => {
    const current = settings({ people: 2, language: "de", region: "AT" });
    const read = readSettings({ people: "viele", language: "kl", region: "AT", diet: "vegan", allergens: ["nuesse", 3], body: { sex: "w" }, neu: true }, current);
    assert.equal(read.people, 2);
    assert.equal(read.language, "de");
    assert.equal(read.diet, "vegan");
    assert.deepEqual(read.allergens, []);
    assert.equal(read.body, null);
    assert.equal("neu" in read, false);
    assert.deepEqual(readSettings([1, 2], current), current);
  });

  it("liest einen gespeicherten Abgleich-Stand und ergänzt fehlende Zeitpunkte", () => {
    const d: SyncedData = { settings: settings(), plan: null, planRecipes: [], eatenMeals: [], shoppingChecked: [], shoppingBooked: [], pantry: [post("reis", 500)] };
    const saved = { pantry: { at: { "milch@2026-11-01": 7, kaputt: "x" }, pending: ["milch@2026-11-01", "unbekannt", 3], mark: { owner: "user:1", rev: 4, at: "2026-11-27T08:00:00.000Z" } } };
    const sync = readDataSync(saved, d);
    assert.deepEqual(sync.pantry.at, { "milch@2026-11-01": 7, "reis@2026-11-27": 0 });
    assert.deepEqual(sync.pantry.pending, ["milch@2026-11-01"]);
    assert.equal(sync.pantry.mark?.rev, 4);
    assert.deepEqual(sync.settings.at, { settings: 0 });
    assert.equal(sync.plan.mark, null);
    assert.deepEqual(readDataSync("kaputt", d).pantry.at, { "reis@2026-11-27": 0 });
  });
});
