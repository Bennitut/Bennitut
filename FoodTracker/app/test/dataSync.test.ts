import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openSqlite } from "../../server/src/storage/db";
import { MemoryImageStore, imageKeyOf } from "../../server/src/storage/images";
import { migrate } from "../../server/src/storage/migrations";
import { SyncStore } from "../../server/src/storage/sync";
import { USER_DATA, UserDataSyncBody, syncUserData } from "../../server/src/sync/userData";
import {
  DATA_KINDS,
  SYNC_IDS,
  UPLOAD_CHARS,
  applyRemote,
  emptyDataSync,
  parseTextId,
  readDataSync,
  readPhoto,
  readRecipe,
  readSettings,
  recordsOf,
  syncData,
  trackChanges,
  uploadRecords,
  type DataSyncRequest,
  type DataSyncResponse,
  type SyncedData,
  type SyncedState,
} from "../src/lib/dataSync";
import { SyncResetError } from "../src/lib/diary";
import type { StockItem } from "../src/lib/pantry";
import type { MonthPlan, MyPhoto, Recipe, ShoppingItem } from "../src/lib/types";
import { meal, recipe, settings } from "./fixtures";

// Abgleich von Einstellungen, Plan mit Einkaufsliste und Vorrat (Vorrang 1, 9.2 Teil 4), eigenen Rezepten mit Fotos,
// Favoriten und Rezepttexten (Teil 5) und eigenen Fotos der Galerie (Teil 6) mit dem Konto.

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
      myRecipes: [],
      shared: {},
      favoriteIds: [],
      savedRecipes: [],
      translations: {},
      textOverrides: {},
      myPhotos: [],
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

/**
 * Derselbe Abgleich wie im Server (POST /api/sync, Datenbank SQLite im Speicher) – mit derselben Prüfung der Anfrage.
 * `gallery`: öffentliche Fotos der Galerie (ID → Rezept und Pfad), wie sie der Server in recipe_photos findet.
 */
async function server() {
  const db = openSqlite(":memory:");
  await migrate(db);
  const store = new SyncStore(db);
  const images = new MemoryImageStore();
  const gallery = new Map<string, { recipeId: string; uri: string }>();
  const lookup = async (ids: readonly string[]) => new Map(ids.flatMap((id) => (gallery.has(id) ? [[id, gallery.get(id)!] as const] : [])));
  const requests: DataSyncRequest[] = [];
  const call =
    (owner: string) =>
    async (request: DataSyncRequest): Promise<DataSyncResponse> => {
      requests.push(request);
      // Wie über HTTP: JSON hin und zurück, und der Server prüft die Anfrage (400 bei allem, was er nicht annimmt).
      const body = UserDataSyncBody.parse(JSON.parse(JSON.stringify(request)));
      return JSON.parse(JSON.stringify(await syncUserData(store, owner, body, images, lookup))) as DataSyncResponse;
    };
  const run = async (device: Device, owner = "user:1") => {
    device.state = (await syncData(device.state, owner, call(owner)))(device.state);
  };
  return { store, images, gallery, requests, call, run };
}

const data = (d: Device) => {
  const { settings: s, plan, planRecipes, eatenMeals, shoppingChecked, shoppingBooked, pantry } = d.state;
  return { settings: s, plan, planRecipes, eatenMeals: [...eatenMeals].sort(), shoppingChecked: [...shoppingChecked].sort(), shoppingBooked: [...shoppingBooked].sort(), pantry: [...pantry].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId) || a.addedAt.localeCompare(b.addedAt)) };
};
const byId = (a: Recipe, b: Recipe) => a.id.localeCompare(b.id);
/** Rezepte, Favoriten und Texte zum Vergleichen – Fotos ohne den Pfad, den sich nur das Gerät merkt. */
const recipesOf = (d: Device) => ({
  myRecipes: [...d.state.myRecipes].sort(byId),
  shared: d.state.shared,
  favoriteIds: [...d.state.favoriteIds].sort(),
  savedRecipes: [...d.state.savedRecipes].sort(byId),
  translations: d.state.translations,
  textOverrides: d.state.textOverrides,
});

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
      myRecipes: [],
      shared: {},
      favoriteIds: [],
      savedRecipes: [],
      translations: {},
      textOverrides: {},
      myPhotos: [],
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
      recipes: ["eigen_lr8x2k9abc12", "import_mf3k2", "community_3f9c2a10-1111-4222-8333-444455556666", "linsen dal", "eigen:1", "x".repeat(101), ""],
      favorites: ["linsen_dal", "community_3f9c2a10-1111-4222-8333-444455556666", "eigen_ä", "a/b"],
      texts: ["t:en:linsen_dal", "o:de:eigen_lr8x2k9abc12", "t:de-AT:linsen_dal", "x:en:linsen_dal", "t:english:linsen_dal", "t:en:", "t:EN:linsen_dal", "o:de:eigen:1"],
      photos: ["mi8x2k3fa1b2c3", "lr8x2k9abc12", "p_1", "p:1", "foto 1", "x".repeat(101), ""],
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
    const d = new Device({ settings: settings(), pantry: [post("reis", 500)] }).state;
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

// --------------------------------------------------------------------------------------------------------------
// Eigene Rezepte mit Fotos, Favoriten und Rezepttexte (9.2 Teil 5)
// --------------------------------------------------------------------------------------------------------------

/** Kleines „JPEG“ als data-URI (der Server erkennt das Format an den ersten Bytes); `n` macht es eindeutig. */
const jpeg = (n: number, padding = 0) => `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, n, ...new Array<number>(padding).fill(7)]).toString("base64")}`;
const own = (id: string, patch: Partial<Recipe> = {}) => recipe({ id, name: `Rezept ${id}`, ingredients: [{ ingredientId: "reis", amount: 80 }], steps: ["Kochen"], ...patch });
const withPhoto = (id: string, uri: string, patch: Partial<Recipe> = {}) => own(id, { media: { image: { uri } }, ...patch });
const COMMUNITY = "community_3f9c2a10-1111-4222-8333-444455556666";
const photoUri = (r: Recipe | undefined) => r?.media?.image?.uri;
const findOwn = (d: Device, id: string) => d.state.myRecipes.find((r) => r.id === id);

describe("Abgleich eigener Rezepte, Favoriten und Texte: Einträge", () => {
  it("leitet Rezepte (mit Foto bzw. Pfad), Favoriten und Texte ab", () => {
    const saved = own(COMMUNITY, { source: { kind: "community", communityId: "3f9c2a10-1111-4222-8333-444455556666", author: "Lena" }, media: { image: { uri: jpeg(9) } } });
    const d = new Device({
      myRecipes: [
        withPhoto("eigen_foto", jpeg(1)),
        withPhoto("eigen_bekannt", jpeg(2)),
        withPhoto("eigen_datei", "file:///var/mobile/foto.jpg"),
        withPhoto("eigen_katalog", "https://upload.wikimedia.org/foto.jpg"),
        own("eigen_ohne"),
      ],
      shared: { eigen_foto: "c-1", geloescht: "c-2" },
      favoriteIds: ["linsen_dal", COMMUNITY],
      savedRecipes: [saved],
      translations: { linsen_dal: { en: { name: "Lentil dal", steps: ["Cook"] } } },
      textOverrides: { eigen_foto: { de: { name: "Besser" } } },
    }).state;
    // Ein Foto, dessen Pfad die App schon kennt.
    d.myRecipes[1] = { ...d.myRecipes[1]!, media: { image: { uri: jpeg(2), server: "/api/images/aaaaaaaa-1111-4222-8333-444455556666.jpg" } } };
    const recipes = recordsOf("recipes", d) as Map<string, { recipe: Recipe; sharedAs?: string }>;
    assert.deepEqual([...recipes.keys()].sort(), ["eigen_bekannt", "eigen_datei", "eigen_foto", "eigen_katalog", "eigen_ohne"]);
    assert.equal(photoUri(recipes.get("eigen_foto")?.recipe), jpeg(1), "data-URI geht hoch, der Server legt sie in den Bildspeicher");
    assert.equal(recipes.get("eigen_foto")?.sharedAs, "c-1");
    assert.equal(recipes.get("eigen_foto")?.recipe, d.myRecipes[0], "unverändert dasselbe Objekt");
    assert.deepEqual(recipes.get("eigen_bekannt")?.recipe.media?.image, { uri: "/api/images/aaaaaaaa-1111-4222-8333-444455556666.jpg" }, "bekannter Pfad statt Foto");
    assert.equal(recipes.get("eigen_datei")?.recipe.media, undefined, "Datei auf dem Gerät bleibt hier");
    assert.equal(photoUri(recipes.get("eigen_katalog")?.recipe), "https://upload.wikimedia.org/foto.jpg");
    // Erster Abgleich mit einem Konto: das Foto selbst, ohne den Pfad (der Server kennt ihn vielleicht nicht).
    assert.deepEqual((recordsOf("recipes", d, true).get("eigen_bekannt") as { recipe: Recipe }).recipe.media?.image, { uri: jpeg(2) });

    const favorites = recordsOf("favorites", d) as Map<string, { recipe?: Recipe }>;
    assert.deepEqual(favorites.get("linsen_dal"), {});
    assert.equal(favorites.get(COMMUNITY)?.recipe?.name, saved.name);
    assert.equal(favorites.get(COMMUNITY)?.recipe?.media?.image, undefined, "Fotos vom Gerät bleiben auf dem Gerät");

    assert.deepEqual(Object.fromEntries(recordsOf("texts", d)), { "t:en:linsen_dal": { name: "Lentil dal", steps: ["Cook"] }, "o:de:eigen_foto": { name: "Besser" } });
    assert.deepEqual(parseTextId("o:de:eigen_foto"), { field: "textOverrides", language: "de", recipeId: "eigen_foto" });
    assert.equal(parseTextId("t:de"), null);
  });

  it("merkt nur das geänderte Rezept – auch bei großen Fotos ohne alles zu vergleichen", () => {
    const d = new Device({ myRecipes: [withPhoto("eigen_a", jpeg(1, 50_000)), withPhoto("eigen_b", jpeg(2, 50_000))] });
    d.change((s) => ({ myRecipes: [...s.myRecipes] }), 1000);
    assert.deepEqual(d.pending(), [], "dieselben Rezepte in einer neuen Liste");
    d.change((s) => ({ myRecipes: s.myRecipes.map((r) => (r.id === "eigen_b" ? { ...r, name: "Neu" } : r)) }), 1001);
    assert.deepEqual(d.pending(), ["eigen_b"]);
    d.change((s) => ({ myRecipes: s.myRecipes.filter((r) => r.id !== "eigen_a"), favoriteIds: ["linsen_dal"] }), 1002);
    assert.deepEqual(d.pending(), ["eigen_a", "eigen_b", "linsen_dal"]);
    d.change({ translations: { linsen_dal: { en: { name: "Dal" } } } }, 1003);
    d.change({ textOverrides: { eigen_b: { de: { name: "Besser" } } } }, 1004);
    d.change({ textOverrides: { eigen_b: {} } }, 1005);
    assert.deepEqual(d.pending(), ["eigen_a", "eigen_b", "linsen_dal", "o:de:eigen_b", "t:en:linsen_dal"]);
    assert.equal(d.state.dataSync.texts.at["o:de:eigen_b"], 1005, "zurückgesetzter Text wird zur Löschmarke");
  });

  it("schickt nichts, was der Server ablehnen würde", () => {
    const d = new Device({
      myRecipes: [own("eigen_gut"), own("eigen_gross", { steps: ["x".repeat(100_001)] }), withPhoto("eigen_riesig", jpeg(1, 1_600_000)), own("eigen:ungueltig")],
      translations: { linsen_dal: { en: { name: "x".repeat(501) }, it: { name: "Dal", steps: ["y".repeat(5001)] }, fr: { name: "Dal" } } },
    }).state;
    const recipes = uploadRecords("recipes", d);
    assert.deepEqual(recipes.skipped.sort(), ["eigen:ungueltig", "eigen_gross"]);
    // Ein zu großes Foto bleibt auf dem Gerät, das Rezept geht ohne.
    assert.equal(recipes.records.find((r) => r.id === "eigen_riesig")?.data && (recipes.records.find((r) => r.id === "eigen_riesig")!.data as { recipe: Recipe }).recipe.media, undefined);
    assert.deepEqual(uploadRecords("texts", d).skipped.sort(), ["t:en:linsen_dal", "t:it:linsen_dal"]);
  });

  it("prüft Rezepte von anderen Geräten", () => {
    const good = own("eigen_a", { media: { image: { uri: "/api/images/x.jpg", server: "/api/images/fremd.jpg" } } });
    assert.deepEqual(readRecipe(good)?.media?.image, { uri: "/api/images/x.jpg" }, "den Pfad eines anderen Geräts merkt sich die App nicht");
    const { steps: _steps, tags: _tags, ...withoutLists } = own("eigen_b");
    assert.deepEqual(readRecipe(withoutLists)?.steps, []);
    assert.equal(readRecipe({ ...own("eigen_c"), ingredients: [{ ingredientId: "reis" }] }), null);
    assert.equal(readRecipe({ ...own("eigen_c"), source: "eigen" }), null);
    assert.equal(readRecipe({ ...own("eigen_c"), media: { image: { uri: 3 } } }), null);
    assert.equal(readRecipe({ ...own("eigen_c"), steps: [1] }), null);
    assert.equal(readRecipe([own("eigen_c")]), null);
  });
});

describe("Abgleich eigener Rezepte, Favoriten und Texte mit dem Konto", () => {
  it("bringt Rezepte mit Foto, Favoriten und Texte auf ein neues Gerät – das Foto bleibt auf dem Handy offline sichtbar", async () => {
    const { run, images, requests } = await server();
    const saved = own(COMMUNITY, { source: { kind: "community", communityId: "3f9c2a10-1111-4222-8333-444455556666", author: "Lena" } });
    // Handy mit Daten von vor dem Abgleich (Zeitpunkt 0), dann angemeldet.
    const phone = new Device(
      {
        settings: settings(),
        myRecipes: [withPhoto("eigen_spaetzle", jpeg(1)), own("eigen_suppe")],
        shared: { eigen_spaetzle: "c-1" },
        favoriteIds: ["linsen_dal", COMMUNITY],
        savedRecipes: [saved],
        translations: { linsen_dal: { en: { name: "Lentil dal" } } },
        textOverrides: { eigen_suppe: { de: { name: "Suppe wie bei Oma", steps: ["Lange köcheln"] } } },
      },
      true,
    );
    await run(phone);
    assert.deepEqual(phone.pending(), []);
    // Auf dem Handy bleibt das Foto (data-URI), daneben merkt es sich den Pfad im Bildspeicher.
    const mine = findOwn(phone, "eigen_spaetzle")?.media?.image;
    assert.equal(mine?.uri, jpeg(1));
    assert.match(mine?.server ?? "", /^\/api\/images\/[0-9a-f-]{36}\.jpg$/);
    assert.deepEqual(images.keys(), [imageKeyOf(mine!.server!)]);

    // Neuer Browser: bekommt alles, das Foto als Pfad.
    const browser = new Device();
    await run(browser);
    assert.equal(photoUri(findOwn(browser, "eigen_spaetzle")), mine?.server);
    const plain = (d: Device) => ({ ...recipesOf(d), myRecipes: recipesOf(d).myRecipes.map((r) => ({ ...r, media: undefined })) });
    assert.deepEqual(plain(browser), plain(phone));
    assert.deepEqual(browser.state.shared, { eigen_spaetzle: "c-1" });
    assert.deepEqual(browser.pending(), []);

    // Im Browser nur den Namen geändert: Das Handy bekommt ihn und behält sein Foto (derselbe Pfad).
    browser.change((s) => ({ myRecipes: s.myRecipes.map((r) => (r.id === "eigen_spaetzle" ? { ...r, name: "Spätzle neu" } : r)) }));
    await run(browser);
    await run(phone);
    assert.equal(findOwn(phone, "eigen_spaetzle")?.name, "Spätzle neu");
    assert.deepEqual(findOwn(phone, "eigen_spaetzle")?.media?.image, mine);
    assert.deepEqual(images.keys(), [imageKeyOf(mine!.server!)], "keine neue Datei");

    // Am Handy den Namen noch einmal geändert: geht mit dem Pfad hoch, nicht mit dem Foto.
    phone.change((s) => ({ myRecipes: s.myRecipes.map((r) => (r.id === "eigen_spaetzle" ? { ...r, name: "Spätzle" } : r)) }));
    await run(phone);
    const sent = requests.at(-1)?.kinds.recipes?.changes ?? [];
    assert.deepEqual(sent.map((r) => [r.id, photoUri((r.data as { recipe: Recipe }).recipe)]), [["eigen_spaetzle", mine?.server]]);
    await run(browser);
    assert.equal(findOwn(browser, "eigen_spaetzle")?.name, "Spätzle");
    assert.deepEqual(images.keys(), [imageKeyOf(mine!.server!)]);

    // Im Browser ein neues Foto: Das Handy zeigt danach das neue (vom Server), die alte Datei ist weg.
    browser.change((s) => ({ myRecipes: s.myRecipes.map((r) => (r.id === "eigen_spaetzle" ? { ...r, media: { image: { uri: jpeg(2) } } } : r)) }));
    await run(browser);
    const fresh = findOwn(browser, "eigen_spaetzle")?.media?.image;
    assert.equal(fresh?.uri, jpeg(2));
    assert.ok(fresh?.server && fresh.server !== mine?.server);
    await run(phone);
    assert.equal(photoUri(findOwn(phone, "eigen_spaetzle")), fresh?.server);
    assert.deepEqual(images.keys(), [imageKeyOf(fresh!.server!)]);

    // Am Handy: Favorit entfernt, verbesserten Text zurückgesetzt, Rezept gelöscht – im Browser verschwindet alles,
    // auch das Foto auf dem Server.
    phone.change((s) => ({
      favoriteIds: s.favoriteIds.filter((id) => id !== COMMUNITY),
      savedRecipes: [],
      textOverrides: { eigen_suppe: {} },
      myRecipes: s.myRecipes.filter((r) => r.id !== "eigen_spaetzle"),
      shared: {},
    }));
    await run(phone);
    await run(browser);
    assert.deepEqual(recipesOf(browser), recipesOf(phone));
    assert.deepEqual(browser.state.favoriteIds, ["linsen_dal"]);
    assert.deepEqual(browser.state.textOverrides, { eigen_suppe: {} });
    assert.deepEqual(images.keys(), []);
  });

  it("gibt der Kopie eines geteilten Rezepts ein eigenes Foto im Konto", async () => {
    const { run, images } = await server();
    const community = "11111111-2222-4333-8444-555555555555.jpg";
    await images.put(community, { type: "image/jpeg", bytes: new Uint8Array(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1])) });
    const d = new Device({ settings: settings(), myRecipes: [withPhoto("eigen_kopie", `/api/images/${community}`)] }, true);
    await run(d);
    const uri = photoUri(findOwn(d, "eigen_kopie"));
    assert.ok(uri?.startsWith("/api/images/") && uri !== `/api/images/${community}`, "eigener Pfad statt dem des Community-Rezepts");
    await images.delete(community);
    assert.ok(await images.get(imageKeyOf(uri!)!), "bleibt, auch wenn das Original verschwindet");
    assert.deepEqual(d.pending(), []);
  });

  it("behält beim erneuten ersten Abgleich die Fotos des Geräts und lädt sie nicht doppelt", async () => {
    const { run, images } = await server();
    const d = new Device({ settings: settings(), myRecipes: [withPhoto("eigen_a", jpeg(1))] }, true);
    await run(d, "user:1");
    const known = findOwn(d, "eigen_a")?.media?.image;
    // Abgemeldet und wieder angemeldet: Das Gerät schickt noch einmal alles (mit dem Foto selbst) …
    d.state = { ...d.state, dataSync: { ...d.state.dataSync, recipes: { ...d.state.dataSync.recipes, mark: null } } };
    await run(d, "user:1");
    // … der Server kennt diese Fassung schon: keine neue Datei, das Gerät behält Foto und Pfad.
    assert.deepEqual(images.keys(), [imageKeyOf(known!.server!)]);
    assert.deepEqual(findOwn(d, "eigen_a")?.media?.image, known);
    // Ein anderes Konto bekommt eine eigene Datei.
    await run(d, "user:2");
    assert.equal(images.keys().length, 2);
    assert.notEqual(findOwn(d, "eigen_a")?.media?.image?.server, known?.server);
    assert.equal(photoUri(findOwn(d, "eigen_a")), jpeg(1));
  });

  it("teilt viele große Fotos auf mehrere Anfragen auf", async () => {
    const { run, requests, store } = await server();
    const many = Array.from({ length: 12 }, (_, i) => withPhoto(`eigen_${i}`, jpeg(i, 600_000)));
    const d = new Device({ settings: settings(), myRecipes: many }, true);
    await run(d);
    const sizes = requests.map((r) => JSON.stringify(r.kinds.recipes?.changes ?? []).length);
    assert.ok(requests.length >= 3, `${requests.length} Anfragen`);
    assert.ok(sizes.every((n) => n <= UPLOAD_CHARS + 1_000_000), JSON.stringify(sizes));
    const { USER_DATA } = await import("../../server/src/sync/userData");
    assert.equal(await store.count(USER_DATA.recipes, "user:1"), 12);
    assert.deepEqual(d.pending(), []);
  });
});

describe("Abgleich eigener Rezepte: was vom Server kommt", () => {
  const at = (n: number) => new Date(n).toISOString();
  it("behält das Foto des Geräts nur für dieselbe Fassung oder denselben Pfad", () => {
    let s = new Device({ myRecipes: [withPhoto("eigen_a", jpeg(1))] }).state;
    s = { ...s, dataSync: trackChanges(s.dataSync, s, { ...s, myRecipes: [withPhoto("eigen_a", jpeg(1), { name: "x" })] }, 5000) };
    s = { ...s, myRecipes: [withPhoto("eigen_a", jpeg(1), { name: "x" })] };
    const path = "/api/images/aaaaaaaa-1111-4222-8333-444455556666.jpg";
    // Dieselbe Fassung, der Server hat das Foto in den Bildspeicher gelegt: Foto bleibt, Pfad gemerkt.
    const same = applyRemote(s, "recipes", [{ id: "eigen_a", updatedAt: at(5000), data: { recipe: withPhoto("eigen_a", path, { name: "x" }) } }]);
    assert.deepEqual(findOwnIn(same, "eigen_a")?.media?.image, { uri: jpeg(1), server: path });
    // Dieselbe Fassung, der Server konnte das Foto nicht lesen: Foto bleibt.
    const dropped = applyRemote(s, "recipes", [{ id: "eigen_a", updatedAt: at(5000), data: { recipe: own("eigen_a", { name: "x" }) } }]);
    assert.deepEqual(findOwnIn(dropped, "eigen_a")?.media?.image, { uri: jpeg(1) });
    // Neuere Fassung mit demselben Pfad: Foto bleibt; mit anderem Pfad oder ohne Foto: die des anderen Geräts.
    const newer = (uri?: string) => applyRemote(same, "recipes", [{ id: "eigen_a", updatedAt: at(6000), data: { recipe: uri ? withPhoto("eigen_a", uri, { name: "y" }) : own("eigen_a", { name: "y" }) } }]);
    assert.deepEqual(findOwnIn(newer(path), "eigen_a")?.media?.image, { uri: jpeg(1), server: path });
    assert.equal(findOwnIn(newer(path), "eigen_a")?.name, "y");
    assert.equal(photoUri(findOwnIn(newer("/api/images/bbbbbbbb-1111-4222-8333-444455556666.jpg"), "eigen_a")), "/api/images/bbbbbbbb-1111-4222-8333-444455556666.jpg");
    assert.equal(findOwnIn(newer(), "eigen_a")?.media, undefined);
    // Unbrauchbares und ältere Fassungen ändern nichts; eine Löschmarke entfernt Rezept und Community-ID.
    assert.equal(applyRemote(s, "recipes", [{ id: "eigen_a", updatedAt: at(4000), data: { recipe: own("eigen_a", { name: "alt" }) } }]), s);
    assert.equal(applyRemote(s, "recipes", [{ id: "eigen_a", updatedAt: at(7000), data: { recipe: own("eigen_b") } }]), s);
    const shared = { ...s, shared: { eigen_a: "c-1" } };
    const gone = applyRemote(shared, "recipes", [{ id: "eigen_a", updatedAt: at(7000), data: null }]);
    assert.deepEqual([gone.myRecipes, gone.shared], [[], {}]);
  });

  it("übernimmt Favoriten und Texte, prüft sie Feld für Feld", () => {
    const s = new Device({ favoriteIds: ["linsen_dal"], translations: { linsen_dal: { en: { name: "Dal" } } } }).state;
    const next = applyRemote(s, "favorites", [
      { id: COMMUNITY, updatedAt: at(1), data: { recipe: own(COMMUNITY) } },
      { id: "linsen_dal", updatedAt: at(1), data: null },
      { id: "kaputt", updatedAt: at(1), data: { recipe: own("anderes") } },
    ]);
    assert.deepEqual(next.favoriteIds, [COMMUNITY]);
    assert.deepEqual(next.savedRecipes.map((r) => r.id), [COMMUNITY]);
    const texts = applyRemote(s, "texts", [
      { id: "t:fr:linsen_dal", updatedAt: at(1), data: { name: "Dal aux lentilles", steps: ["Cuire"] } },
      { id: "t:en:linsen_dal", updatedAt: at(1), data: null },
      { id: "o:de:linsen_dal", updatedAt: at(1), data: { steps: ["ohne Namen"] } },
      { id: "o:it:linsen_dal", updatedAt: at(1), data: { name: "Dal", steps: [1] } },
    ]);
    assert.deepEqual(texts.translations, { linsen_dal: { fr: { name: "Dal aux lentilles", steps: ["Cuire"] } } });
    assert.deepEqual(texts.textOverrides, {});
  });
});

// --------------------------------------------------------------------------------------------------------------
// Eigene Fotos der Galerie (9.2 Teil 6)
// --------------------------------------------------------------------------------------------------------------

const TAKEN = "2026-11-27T08:00:00.000Z";
const shot = (id: string, uri: string, patch: Partial<MyPhoto> = {}): MyPhoto => ({ id, recipeId: "shakshuka", uri, public: false, remoteId: null, createdAt: TAKEN, ...patch });
const SERVER_PATH = "/api/images/aaaaaaaa-1111-4222-8333-444455556666.jpg";
const GALLERY_PATH = "/api/images/bbbbbbbb-1111-4222-8333-444455556666.jpg";
const GALLERY_PATH_2 = "/api/images/cccccccc-1111-4222-8333-444455556666.jpg";
const photoOf = (d: Device, id: string) => d.state.myPhotos.find((p) => p.id === id);

describe("Abgleich eigener Fotos der Galerie: Einträge", () => {
  it("leitet private Fotos mit Foto bzw. Pfad ab, öffentliche nur mit der ID in der Galerie", () => {
    const d = new Device({
      myPhotos: [
        shot("p_neu", jpeg(1)),
        shot("p_bekannt", jpeg(2), { server: SERVER_PATH }),
        shot("p_anderes_geraet", SERVER_PATH),
        shot("p_datei", "file:///var/mobile/foto.jpg"),
        shot("p_oeffentlich", jpeg(3), { public: true, remoteId: "g-1", server: GALLERY_PATH }),
      ],
    }).state;
    const base = { recipeId: "shakshuka", createdAt: TAKEN, public: false };
    assert.deepEqual(Object.fromEntries(recordsOf("photos", d)), {
      p_neu: { ...base, uri: jpeg(1) },
      p_bekannt: { ...base, uri: SERVER_PATH },
      p_anderes_geraet: { ...base, uri: SERVER_PATH },
      p_datei: base,
      p_oeffentlich: { ...base, public: true, remoteId: "g-1" },
    });
    // Erster Abgleich mit einem Konto: das Foto selbst (der Server kennt den Pfad vielleicht nicht).
    assert.deepEqual(recordsOf("photos", d, true).get("p_bekannt"), { ...base, uri: jpeg(2) });
  });

  it("merkt nur das geänderte Foto und schickt nichts, was der Server ablehnen würde", () => {
    const d = new Device({ myPhotos: [shot("p_a", jpeg(1, 50_000)), shot("p_b", jpeg(2, 50_000))] });
    d.change((s) => ({ myPhotos: [...s.myPhotos] }), 1000);
    assert.deepEqual(d.pending(), [], "dieselben Fotos in einer neuen Liste");
    d.change((s) => ({ myPhotos: s.myPhotos.map((p) => (p.id === "p_b" ? { ...p, public: true, remoteId: "g-9" } : p)) }), 1001);
    assert.deepEqual(d.pending(), ["p_b"]);
    d.change((s) => ({ myPhotos: s.myPhotos.filter((p) => p.id !== "p_a") }), 1002);
    assert.deepEqual(d.pending(), ["p_a", "p_b"]);
    assert.equal(d.state.dataSync.photos.at.p_a, 1002, "gelöschtes Foto wird zur Löschmarke");

    const bad = new Device({
      myPhotos: [shot("p_gut", jpeg(1)), shot("p_ohne_id", jpeg(2), { public: true }), shot("p:ungueltig", jpeg(3)), shot("p_riesig", jpeg(4, 1_600_000)), shot("p_rezept", jpeg(5), { recipeId: "linsen dal" })],
    }).state;
    const upload = uploadRecords("photos", bad);
    assert.deepEqual(upload.skipped.sort(), ["p:ungueltig", "p_ohne_id", "p_rezept"]);
    // Ein zu großes Foto bleibt auf dem Gerät, der Eintrag geht ohne.
    assert.deepEqual(upload.records.find((r) => r.id === "p_riesig")?.data, { recipeId: "shakshuka", createdAt: TAKEN, public: false });
  });

  it("prüft Fotos von anderen Geräten und zeigt nur, was ein Foto hat", () => {
    const at = (n: number) => new Date(n).toISOString();
    assert.deepEqual(readPhoto("p1", { recipeId: "shakshuka", createdAt: TAKEN, public: false, uri: SERVER_PATH, neu: 1 }), {
      id: "p1",
      recipeId: "shakshuka",
      createdAt: TAKEN,
      public: false,
      remoteId: null,
      uri: SERVER_PATH,
    });
    assert.equal(readPhoto("p1", { recipeId: "shakshuka", createdAt: TAKEN, public: true }), null, "öffentlich ohne ID in der Galerie");
    assert.equal(readPhoto("p1", { recipeId: "linsen dal", createdAt: TAKEN, public: false }), null);
    assert.equal(readPhoto("p1", { recipeId: "shakshuka", createdAt: TAKEN, public: "ja" }), null);
    assert.equal(readPhoto("p1", { recipeId: "shakshuka", public: false }), null);
    assert.equal(readPhoto("p1", { recipeId: "shakshuka", createdAt: TAKEN, public: false, uri: 3 }), null);
    assert.equal(readPhoto("p1", [1]), null);
    // Ohne Foto vom Server (z. B. öffentlich, aber nicht mehr in der Galerie): ein neues kommt nicht an, ein bekanntes
    // behält sein Foto und übernimmt den Rest.
    const s = new Device({ myPhotos: [shot("p_da", SERVER_PATH)] }).state;
    const next = applyRemote(s, "photos", [
      { id: "p_neu", updatedAt: at(1), data: { recipeId: "shakshuka", createdAt: TAKEN, public: true, remoteId: "g-1" } },
      { id: "p_da", updatedAt: at(1), data: { recipeId: "shakshuka", createdAt: TAKEN, public: true, remoteId: "g-2" } },
    ]);
    assert.deepEqual(next.myPhotos, [shot("p_da", SERVER_PATH, { public: true, remoteId: "g-2" })]);
    assert.deepEqual(applyRemote(next, "photos", [{ id: "p_da", updatedAt: at(2), data: null }]).myPhotos, []);
  });
});

describe("Abgleich eigener Fotos der Galerie mit dem Konto", () => {
  it("bringt private und öffentliche Fotos auf ein neues Gerät – auf dem Handy bleiben sie offline sichtbar, löschen geht überall", async () => {
    const { run, images, gallery, requests } = await server();
    gallery.set("g-1", { recipeId: "shakshuka", uri: GALLERY_PATH });
    // Handy mit Fotos von vor dem Abgleich (Zeitpunkt 0), dann angemeldet.
    const phone = new Device({ settings: settings(), myPhotos: [shot("p_privat", jpeg(1)), shot("p_oeffentlich", jpeg(2), { public: true, remoteId: "g-1" })] }, true);
    await run(phone);
    assert.deepEqual(phone.pending(), []);
    // Das private Foto liegt als Datei im Bildspeicher, das Handy behält seine data-URI und merkt sich den Pfad.
    const mine = photoOf(phone, "p_privat");
    assert.equal(mine?.uri, jpeg(1));
    assert.match(mine?.server ?? "", /^\/api\/images\/[0-9a-f-]{36}\.jpg$/);
    assert.deepEqual(images.keys(), [imageKeyOf(mine!.server!)]);
    // Vom öffentlichen geht nur die ID in der Galerie hoch; der Pfad kommt vom Server.
    const sent = requests[0]?.kinds.photos?.changes.find((r) => r.id === "p_oeffentlich")?.data as { uri?: string } | undefined;
    assert.equal(sent?.uri, undefined);
    assert.deepEqual([photoOf(phone, "p_oeffentlich")?.uri, photoOf(phone, "p_oeffentlich")?.server], [jpeg(2), GALLERY_PATH]);

    // Neuer Browser: bekommt beide Fotos als Pfad.
    const browser = new Device();
    await run(browser);
    assert.deepEqual(photoOf(browser, "p_privat"), shot("p_privat", mine!.server!));
    assert.deepEqual(photoOf(browser, "p_oeffentlich"), shot("p_oeffentlich", GALLERY_PATH, { public: true, remoteId: "g-1" }));
    assert.deepEqual(browser.pending(), []);

    // Am Handy das private Foto öffentlich gemacht (die App lädt es dafür in die Galerie): Die eigene Datei ist weg, der
    // Browser zeigt es aus der Galerie, das Handy weiter seine data-URI.
    gallery.set("g-2", { recipeId: "shakshuka", uri: GALLERY_PATH_2 });
    phone.change((s) => ({ myPhotos: s.myPhotos.map((p) => (p.id === "p_privat" ? { ...p, public: true, remoteId: "g-2" } : p)) }));
    await run(phone);
    assert.deepEqual(images.keys(), []);
    assert.deepEqual([photoOf(phone, "p_privat")?.uri, photoOf(phone, "p_privat")?.server], [jpeg(1), GALLERY_PATH_2]);
    await run(browser);
    assert.deepEqual(photoOf(browser, "p_privat"), shot("p_privat", GALLERY_PATH_2, { public: true, remoteId: "g-2" }));

    // Im Browser ein öffentliches Foto gelöscht: Am Handy ist es danach auch weg.
    browser.change((s) => ({ myPhotos: s.myPhotos.filter((p) => p.id !== "p_oeffentlich") }));
    await run(browser);
    await run(phone);
    assert.deepEqual(phone.state.myPhotos.map((p) => p.id), ["p_privat"]);
    assert.deepEqual(phone.pending(), []);
  });

  it("behält beim erneuten ersten Abgleich die Fotos des Geräts und legt keine zweite Datei an", async () => {
    const { run, images } = await server();
    const d = new Device({ settings: settings(), myPhotos: [shot("p_a", jpeg(1))] }, true);
    await run(d, "user:1");
    const known = photoOf(d, "p_a");
    // Abgemeldet und wieder angemeldet: Das Gerät schickt noch einmal alles (mit dem Foto selbst) …
    d.state = { ...d.state, dataSync: { ...d.state.dataSync, photos: { ...d.state.dataSync.photos, mark: null } } };
    await run(d, "user:1");
    // … der Server kennt diese Fassung schon: keine neue Datei, das Gerät behält Foto und Pfad.
    assert.deepEqual(images.keys(), [imageKeyOf(known!.server!)]);
    assert.deepEqual(photoOf(d, "p_a"), known);
    // Ein anderes Konto bekommt eine eigene Datei.
    await run(d, "user:2");
    assert.equal(images.keys().length, 2);
    assert.equal(photoOf(d, "p_a")?.uri, jpeg(1));
  });
});

const findOwnIn = (s: SyncedState, id: string) => s.myRecipes.find((r) => r.id === id);

describe("Abgleich mit dem Konto: neuer Server, neue Datenbank (Abgleich-Marken mit Kennung)", () => {
  it("gleicht nach dem Umzug auf eine leere Datenbank alle Arten von vorn ab – eigene Fotos gehen als Bild mit", async () => {
    const laptop = await server();
    const phone = new Device({ settings: settings(), plan: monthPlan("2026-11-27"), pantry: [post("reis", 500)], myRecipes: [withPhoto("eigen_umzug", jpeg(7))] }, true);
    await laptop.run(phone);
    const laptopDb = phone.state.dataSync.settings.mark?.db;
    assert.match(laptopDb ?? "", /^[0-9a-f-]{36}$/);
    assert.ok(DATA_KINDS.every((kind) => phone.state.dataSync[kind].mark?.db === laptopDb), "jede Marke kennt die Datenbank");
    const laptopPath = findOwn(phone, "eigen_umzug")?.media?.image?.server;
    assert.ok(laptopPath);
    // Schon abgeglichen; danach nur noch am Vorrat etwas geändert.
    phone.change({ pantry: [post("reis", 300)] });

    // Der Server zieht um (z. B. Render mit Neon): neue, leere Datenbank und ein leerer Bildspeicher.
    const cloud = await server();
    await cloud.run(phone);
    assert.equal(cloud.requests[0]?.database, laptopDb, "die App nennt die Datenbank ihrer Marken");
    const again = cloud.requests[1]!;
    assert.ok(DATA_KINDS.every((kind) => again.kinds[kind]?.since === 0), "nach reset alle Arten von vorn");
    const sentRecipe = again.kinds.recipes?.changes.find((r) => r.id === "eigen_umzug");
    assert.equal(photoUri((sentRecipe?.data as { recipe: Recipe }).recipe), jpeg(7), "das Foto selbst – den Pfad kennt der neue Server nicht");
    const cloudDb = phone.state.dataSync.settings.mark?.db;
    assert.ok(cloudDb && cloudDb !== laptopDb);
    assert.equal(again.database, cloudDb);
    assert.deepEqual(phone.pending(), []);
    const cloudPath = findOwn(phone, "eigen_umzug")?.media?.image?.server;
    assert.ok(cloudPath && cloudPath !== laptopPath);
    assert.equal(photoUri(findOwn(phone, "eigen_umzug")), jpeg(7), "auf dem Handy bleibt das Foto");
    assert.deepEqual(cloud.images.keys(), [imageKeyOf(cloudPath)]);

    // Ein neues Gerät bekommt vom neuen Server alles, das Foto aus dessen Bildspeicher.
    const browser = new Device();
    await cloud.run(browser);
    assert.deepEqual(data(browser), data(phone));
    assert.equal(photoUri(findOwn(browser, "eigen_umzug")), cloudPath);

    // Danach wieder nur Neues, mit der Kennung der neuen Datenbank.
    cloud.requests.length = 0;
    phone.change({ pantry: [post("reis", 200)] });
    await cloud.run(phone);
    assert.equal(cloud.requests.length, 1);
    assert.equal(cloud.requests[0]?.database, cloudDb);
    assert.deepEqual(cloud.requests[0]?.kinds.pantry?.changes.map((r) => r.id), ["reis@2026-11-27"]);
  });

  it("gleicht Marken ohne Kennung (ältere App-Fassung) einmal von vorn ab, eine abweichende Art allein", async () => {
    const { run, requests } = await server();
    const d = new Device({ settings: settings(), pantry: [post("reis", 500)] }, true);
    await run(d);
    // Wie von einer älteren Fassung gespeichert: Marken ohne Kennung.
    const saved = JSON.parse(JSON.stringify(d.state.dataSync)) as Record<string, { mark: Record<string, unknown> }>;
    for (const kind of DATA_KINDS) delete saved[kind]!.mark.db;
    d.state = { ...d.state, dataSync: readDataSync(saved, d.state) };
    assert.ok(DATA_KINDS.every((kind) => d.state.dataSync[kind].mark !== null && d.state.dataSync[kind].mark!.db === undefined));
    requests.length = 0;
    await run(d);
    assert.equal(requests[0]?.database, undefined);
    assert.ok(DATA_KINDS.every((kind) => requests[0]?.kinds[kind]?.since === 0), "einmal von vorn");
    const db = d.state.dataSync.pantry.mark?.db;
    assert.ok(DATA_KINDS.every((kind) => d.state.dataSync[kind].mark?.db === db && typeof db === "string"));

    // Eine Art, die zuletzt mit einer anderen Datenbank abglich, fängt allein von vorn an.
    d.state = { ...d.state, dataSync: { ...d.state.dataSync, pantry: { ...d.state.dataSync.pantry, mark: { ...d.state.dataSync.pantry.mark!, db: "eine-andere" } } } };
    requests.length = 0;
    d.change({ settings: { ...d.state.settings, people: 3 } });
    await run(d);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.database, db);
    assert.equal(requests[0]?.kinds.pantry?.since, 0);
    assert.ok((requests[0]?.kinds.settings?.since ?? 0) > 0);
    assert.deepEqual(requests[0]?.kinds.settings?.changes.map((r) => r.id), ["settings"]);
    assert.equal(d.state.dataSync.pantry.mark?.db, db);
  });

  it("gleicht mit einem älteren Server ohne Kennung weiter nur Neues ab und gibt nach zweimal reset auf", async () => {
    const { call } = await server();
    const requests: DataSyncRequest[] = [];
    // Älterer Server: kennt keine Kennung und antwortet ohne.
    const old = async (request: DataSyncRequest): Promise<DataSyncResponse> => {
      requests.push(request);
      const { database: _db, ...response } = await call("user:1")(request);
      return response;
    };
    const d = new Device({ settings: settings(), pantry: [post("reis", 500)] }, true);
    d.state = (await syncData(d.state, "user:1", old))(d.state);
    assert.ok(DATA_KINDS.every((kind) => d.state.dataSync[kind].mark?.db === null));
    d.change({ pantry: [post("reis", 400)] });
    d.state = (await syncData(d.state, "user:1", old))(d.state);
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.database, undefined);
    assert.deepEqual(requests[1]?.kinds.pantry?.changes.map((r) => r.id), ["reis@2026-11-27"]);
    assert.ok((requests[1]?.kinds.settings?.since ?? 0) > 0, "kein ständiges Von-vorn");
    // Sagt der Server immer wieder reset, gibt die App auf (später noch einmal) und ändert nichts.
    const before = d.state;
    await assert.rejects(syncData(d.state, "user:1", async () => ({ owner: "user:1", database: `db-${Math.random()}`, reset: true, kinds: {} })), SyncResetError);
    assert.equal(d.state, before);
  });
});
