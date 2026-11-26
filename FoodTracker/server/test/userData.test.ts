import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";
import { Ai } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { openSqlite, postgresFromPool, type Db, type PgPoolLike } from "../src/storage/db.js";
import { migrate } from "../src/storage/migrations.js";
import { MemoryImageStore, imageKeyOf, type StoredImage } from "../src/storage/images.js";
import { SyncFullError, SyncStore, type SyncRecord } from "../src/storage/sync.js";
import { MAX_IMAGE_URI, USER_DATA, UserDataSyncBody, exportUserData, syncUserData, type UserDataSyncResponse } from "../src/sync/userData.js";

// Abgleich von Einstellungen, Plan mit Häkchen und Vorrat (Vorrang 1, 9.2 Teil 4), eigenen Rezepten mit Fotos,
// Favoriten und Rezepttexten (Teil 5) zwischen den Geräten eines Kontos.

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
    expect(await bad({ orders: { since: 0 } })).toBe(400); // unbekannte Art
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

// --------------------------------------------------------------------------------------------------------------
// Eigene Rezepte mit Fotos, Favoriten und Rezepttexte (9.2 Teil 5)
// --------------------------------------------------------------------------------------------------------------

/** Kleines „JPEG“ (die ersten Bytes zählen – so erkennt der Server das Format) als data-URI; `n` macht es eindeutig. */
const jpegBytes = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n, 1, 2, 3, 4, 5]);
const jpeg = (n: number) => `data:image/jpeg;base64,${jpegBytes(n).toString("base64")}`;
const ownRecipe = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  language: "de",
  name: "Bärlauch-Spätzle",
  steps: ["Spätzle kochen", "Mit Bärlauch schwenken"],
  otherIngredients: ["1 Prise Salz"],
  mealTypes: ["dinner"],
  ingredients: [{ ingredientId: "kartoffeln", amount: 300 }],
  cookMinutes: 25,
  tags: [],
  source: { kind: "eigen" },
  ...patch,
});
type StoredRecipe = { recipe: { name: string; media?: { image?: { uri: string; credit?: string }; videos?: unknown[] } }; sharedAs?: string };
const recipeData = (r: SyncRecord | undefined) => r?.data as StoredRecipe | undefined;
const photoOf = (r: SyncRecord | undefined) => recipeData(r)?.recipe.media?.image?.uri;

describe("Abgleich eigener Rezepte, Favoriten und Rezepttexte (/api/sync)", () => {
  const images = new MemoryImageStore();
  const photoDb = openSqlite(":memory:");
  const photoApp = createApp({ db: photoDb, images, auth: { appleAudiences: [], googleAudiences: [], adminEmails: [], allowDevLogin: true }, ai: noAi });
  const photoStore = new SyncStore(photoDb);
  const login = async (name: string) =>
    (await (await photoApp.request("/api/auth/dev", { method: "POST", body: JSON.stringify({ name }), headers: headers() })).json()) as { token: string; user: { id: string } };
  const send = (body: unknown, token: string) => photoApp.request("/api/sync", { method: "POST", body: JSON.stringify(body), headers: headers(token) });
  const syncAs = async (body: unknown, token: string) => {
    const res = await send(body, token);
    expect(res.status).toBe(200);
    return (await res.json()) as UserDataSyncResponse;
  };
  const recipes = (since: number, changes: unknown[] = []) => ({ kinds: { recipes: { since, changes } } });
  const keyOf = (uri: string | undefined) => (uri ? imageKeyOf(uri) : null);

  it("legt das Foto eines eigenen Rezepts in den Bildspeicher und schickt die gespeicherte Fassung zurück", async () => {
    const { token, user } = await login("Fotos");
    const videos = [{ platform: "youtube", url: "https://www.youtube.com/watch?v=abc" }];
    const first = await syncAs(recipes(0, [{ id: "eigen_spaetzle", updatedAt: T(1), data: { recipe: ownRecipe("eigen_spaetzle", { media: { image: { uri: jpeg(1) }, videos } }), sharedAs: "c-1" } }]), token);
    // Die App bekommt die gespeicherte Fassung: Pfad im Bildspeicher statt data-URI, sonst alles wie geschickt.
    expect(first.kinds.recipes?.changes).toHaveLength(1);
    const stored = first.kinds.recipes!.changes[0]!;
    const uri = photoOf(stored)!;
    expect(uri).toMatch(/^\/api\/images\/[0-9a-f-]{36}\.jpg$/);
    expect(stored).toMatchObject({ id: "eigen_spaetzle", updatedAt: T(1), data: { sharedAs: "c-1", recipe: { name: "Bärlauch-Spätzle", media: { videos } } } });
    // In der Datenbank steht der Pfad, nicht das Foto.
    const rows = await photoStore.records(USER_DATA.recipes, `user:${user.id}`);
    expect(rows.map(photoOf)).toEqual([uri]);
    expect(JSON.stringify(rows)).not.toContain("base64");
    const image = await photoApp.request(uri);
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/jpeg");
    // Nur Browser bzw. App speichern zwischen, kein Zwischenspeicher unterwegs.
    expect(image.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(Buffer.from(await image.arrayBuffer())).toEqual(jpegBytes(1));

    // Ein zweites Gerät bekommt den Pfad.
    const other = await syncAs(recipes(0), token);
    expect(other.kinds.recipes?.changes).toEqual([stored]);

    // Neuer Name, dasselbe Foto (derselbe Pfad): keine neue Datei, nichts zurück.
    const before = images.keys();
    const renamed = await syncAs(recipes(other.kinds.recipes!.rev, [{ id: "eigen_spaetzle", updatedAt: T(2), data: { recipe: ownRecipe("eigen_spaetzle", { name: "Spätzle neu", media: { image: { uri } } }) } }]), token);
    expect(renamed.kinds.recipes?.changes).toEqual([]);
    expect(images.keys()).toEqual(before);

    // Neues Foto: eigene Datei, die alte ist weg. Gelöscht: auch die neue.
    const replaced = await syncAs(recipes(renamed.kinds.recipes!.rev, [{ id: "eigen_spaetzle", updatedAt: T(3), data: { recipe: ownRecipe("eigen_spaetzle", { media: { image: { uri: jpeg(2) } } }) } }]), token);
    const next = photoOf(replaced.kinds.recipes?.changes[0]);
    expect(keyOf(next)).not.toBeNull();
    expect(images.keys()).toContain(keyOf(next));
    expect(images.keys()).not.toContain(keyOf(uri));
    await syncAs(recipes(replaced.kinds.recipes!.rev, [{ id: "eigen_spaetzle", updatedAt: T(4), data: null }]), token);
    expect(images.keys()).not.toContain(keyOf(next));
    expect(images.keys()).toEqual(before.filter((k) => k !== keyOf(uri)));
  });

  it("gibt Kopien eine eigene Datei, lässt Fotos im Netz verlinkt und Unlesbares weg", async () => {
    const { token } = await login("Kopien");
    // Foto eines geteilten Rezepts im Bildspeicher (gehört dem Community-Rezept).
    const community = "11111111-2222-4333-8444-555555555555.jpg";
    const original: StoredImage = { type: "image/jpeg", bytes: new Uint8Array(jpegBytes(7)) };
    await images.put(community, original);
    const web = "https://upload.wikimedia.org/foto.jpg";
    const gif = `data:image/gif;base64,${Buffer.from("GIF89a....").toString("base64")}`;
    const result = await syncAs(
      recipes(0, [
        { id: "eigen_kopie", updatedAt: T(1), data: { recipe: ownRecipe("eigen_kopie", { media: { image: { uri: `/api/images/${community}`, credit: "Alte Fassung" } } }) } },
        { id: "eigen_katalog", updatedAt: T(1), data: { recipe: ownRecipe("eigen_katalog", { media: { image: { uri: web, credit: "Wikimedia" } } }) } },
        { id: "eigen_gif", updatedAt: T(1), data: { recipe: ownRecipe("eigen_gif", { media: { image: { uri: gif } } }) } },
        { id: "eigen_datei", updatedAt: T(1), data: { recipe: ownRecipe("eigen_datei", { media: { image: { uri: "file:///var/mobile/foto.jpg" }, videos: [] } }) } },
        { id: "eigen_weg", updatedAt: T(1), data: { recipe: ownRecipe("eigen_weg", { media: { image: { uri: "/api/images/99999999-2222-4333-8444-555555555555.jpg" } } }) } },
      ]),
      token,
    );
    const byId = new Map(result.kinds.recipes!.changes.map((r) => [r.id, r]));
    // Die Kopie hat eine eigene Datei mit demselben Bild (bleibt, auch wenn das Community-Rezept verschwindet).
    const copy = byId.get("eigen_kopie");
    expect(keyOf(photoOf(copy))).not.toBe(community);
    expect(recipeData(copy)?.recipe.media?.image?.credit).toBe("Alte Fassung");
    expect((await images.get(keyOf(photoOf(copy))!))?.bytes).toEqual(original.bytes);
    await images.delete(community);
    expect((await photoApp.request(photoOf(copy)!)).status).toBe(200);
    // Foto im Netz bleibt verlinkt (nichts zurück); GIF, Datei auf dem Gerät und verschwundenes Foto fallen weg.
    expect(byId.has("eigen_katalog")).toBe(false);
    for (const id of ["eigen_gif", "eigen_datei", "eigen_weg"]) expect(recipeData(byId.get(id))?.recipe.media?.image, id).toBeUndefined();
    expect(recipeData(byId.get("eigen_datei"))?.recipe.media?.videos).toEqual([]);
    expect(recipeData(byId.get("eigen_gif"))?.recipe.media).toBeUndefined();
    const all = await syncAs(recipes(0), token);
    expect(photoOf(all.kinds.recipes!.changes.find((r) => r.id === "eigen_katalog"))).toBe(web);
  });

  it("legt bei gleichem Zeitpunkt (erster Abgleich eines weiteren Geräts) keine neue Datei an und schickt die eigene Fassung", async () => {
    const { token } = await login("Zweites Gerät");
    const first = await syncAs(recipes(0, [{ id: "eigen_alt", updatedAt: EPOCH, data: { recipe: ownRecipe("eigen_alt", { media: { image: { uri: jpeg(3) } } }) } }]), token);
    const uri = photoOf(first.kinds.recipes?.changes[0]);
    const before = images.keys();
    // Das Gerät hat dasselbe Rezept von vor dem Abgleich (Zeitpunkt 0) noch einmal mit seiner data-URI.
    const again = await syncAs(recipes(0, [{ id: "eigen_alt", updatedAt: EPOCH, data: { recipe: ownRecipe("eigen_alt", { media: { image: { uri: jpeg(3) } } }) } }]), token);
    expect(images.keys()).toEqual(before);
    expect(again.kinds.recipes?.changes.map(photoOf)).toEqual([uri]);
  });

  it("gleicht Favoriten (mit gespeicherten Community-Rezepten) und übersetzte bzw. verbesserte Texte ab", async () => {
    const { token } = await login("Favoriten");
    const saved = ownRecipe("community_3f9c2a10-1111-4222-8333-444455556666", { source: { kind: "community", communityId: "3f9c2a10-1111-4222-8333-444455556666", author: "Lena" } });
    await syncAs(
      {
        kinds: {
          favorites: {
            since: 0,
            changes: [
              { id: "linsen_dal", updatedAt: T(1), data: {} },
              { id: saved.id, updatedAt: T(1), data: { recipe: saved } },
            ],
          },
          texts: {
            since: 0,
            changes: [
              { id: "t:en:linsen_dal", updatedAt: T(1), data: { name: "Lentil dal", steps: ["Cook the lentils"] } },
              { id: "o:de:eigen_spaetzle", updatedAt: T(1), data: { name: "Spätzle wie bei Oma", steps: ["Teig rühren"], otherIngredients: [] } },
            ],
          },
        },
      },
      token,
    );
    const other = await syncAs({ kinds: { favorites: { since: 0 }, texts: { since: 0 } } }, token);
    expect(ids(other.kinds.favorites?.changes)).toEqual([saved.id, "linsen_dal"].sort());
    expect(other.kinds.favorites?.changes.find((r) => r.id === saved.id)?.data).toEqual({ recipe: saved });
    expect(ids(other.kinds.texts?.changes)).toEqual(["o:de:eigen_spaetzle", "t:en:linsen_dal"]);
    // Kein Favorit mehr, verbesserter Text zurückgesetzt: Löschmarken für die anderen Geräte.
    const removed = await syncAs(
      {
        kinds: {
          favorites: { since: other.kinds.favorites!.rev, changes: [{ id: "linsen_dal", updatedAt: T(2), data: null }] },
          texts: { since: other.kinds.texts!.rev, changes: [{ id: "o:de:eigen_spaetzle", updatedAt: T(2), data: null }] },
        },
      },
      token,
    );
    expect(removed.kinds.favorites?.changes).toEqual([]);
    const later = await syncAs({ kinds: { favorites: { since: other.kinds.favorites!.rev }, texts: { since: other.kinds.texts!.rev } } }, token);
    expect(later.kinds.favorites?.changes).toEqual([{ id: "linsen_dal", updatedAt: T(2), data: null }]);
    expect(later.kinds.texts?.changes).toEqual([{ id: "o:de:eigen_spaetzle", updatedAt: T(2), data: null }]);
  });

  it("lehnt Ungültiges bei Rezepten, Favoriten und Texten ab", async () => {
    const { token } = await login("Prüfung Rezepte");
    const status = async (kinds: unknown) => (await send({ kinds }, token)).status;
    const one = (id: string, data: unknown) => ({ since: 0, changes: [{ id, updatedAt: T(1), data }] });
    expect(await status({ recipes: one("eigen_a", { recipe: ownRecipe("eigen_b") }) })).toBe(400); // andere ID
    expect(await status({ recipes: one("eigen:a", { recipe: ownRecipe("eigen:a") }) })).toBe(400);
    expect(await status({ recipes: one("eigen_a", { recipe: { id: "eigen_a", name: "ohne Zutaten" } }) })).toBe(400);
    expect(await status({ recipes: one("eigen_a", ownRecipe("eigen_a")) })).toBe(400); // ohne Hülle { recipe }
    expect(await status({ recipes: one("eigen_a", { recipe: ownRecipe("eigen_a", { steps: ["x".repeat(100_001)] }) }) })).toBe(400);
    expect(await status({ recipes: one("eigen_a", { recipe: ownRecipe("eigen_a", { media: { image: { uri: `data:image/jpeg;base64,${"A".repeat(MAX_IMAGE_URI)}` } } }) }) })).toBe(400);
    expect(await status({ favorites: one("linsen_dal", { recipe: ownRecipe("anderes") }) })).toBe(400);
    expect(await status({ favorites: one("linsen dal", {}) })).toBe(400);
    expect(await status({ texts: one("x:en:linsen_dal", { name: "Dal" }) })).toBe(400);
    expect(await status({ texts: one("t:english:linsen_dal", { name: "Dal" }) })).toBe(400);
    expect(await status({ texts: one("t:en:linsen_dal", { steps: ["ohne Namen"] }) })).toBe(400);
    expect(await status({ texts: one("t:en:linsen_dal", { name: "Dal", steps: [1, 2] }) })).toBe(400);
    // Ein großes Foto (unter der Grenze) und Felder einer neueren App gehen durch.
    expect(await status({ recipes: one("eigen_a", { recipe: ownRecipe("eigen_a", { neu: true, media: { image: { uri: jpeg(9) } } }), neu: 1 }), texts: one("t:de-AT:linsen_dal", { name: "Linsen" }) })).toBe(200);
  });

  it("gehört zu „Meine Daten exportieren“ (Fotos als data-URI) und verschwindet mit dem Konto samt Fotos", async () => {
    const { token, user } = await login("Export Rezepte");
    const synced = await syncAs(
      {
        kinds: {
          recipes: { since: 0, changes: [{ id: "eigen_export", updatedAt: T(1), data: { recipe: ownRecipe("eigen_export", { media: { image: { uri: jpeg(5), credit: "ich" } } }), sharedAs: "c-9" } }] },
          favorites: { since: 0, changes: [{ id: "linsen_dal", updatedAt: T(1), data: {} }] },
          texts: { since: 0, changes: [{ id: "t:en:eigen_export", updatedAt: T(1), data: { name: "Wild garlic spaetzle" } }, { id: "o:de:linsen_dal", updatedAt: T(1), data: { name: "Linsen-Dal" } }] },
        },
      },
      token,
    );
    const key = keyOf(photoOf(synced.kinds.recipes?.changes[0]))!;
    expect(images.keys()).toContain(key);
    const exported = (await (await photoApp.request("/api/auth/export", { headers: headers(token) })).json()) as Record<string, unknown>;
    expect(exported.recipes).toEqual([{ ...ownRecipe("eigen_export", { media: { image: { uri: jpeg(5), credit: "ich" } } }), sharedAs: "c-9" }]);
    expect(exported.favorites).toEqual([{ recipeId: "linsen_dal" }]);
    expect(exported.texts).toEqual({ translated: { eigen_export: { en: { name: "Wild garlic spaetzle" } } }, improved: { linsen_dal: { de: { name: "Linsen-Dal" } } } });

    expect((await photoApp.request("/api/auth/me", { method: "DELETE", body: "{}", headers: headers(token) })).status).toBe(204);
    expect(images.keys()).not.toContain(key);
    for (const kind of [USER_DATA.recipes, USER_DATA.favorites, USER_DATA.texts]) expect(await photoStore.count(kind, `user:${user.id}`)).toBe(0);
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
  const images = new MemoryImageStore();
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
      images,
    );
    expect(ids(await synced.records(USER_DATA.plan, "user:1"))).toEqual(["e:2026-11-01:0:lunch", "plan"]);
    await syncUserData(synced, "user:1", request({ plan: { since: 3, changes: [{ id: "plan", updatedAt: T(9), data: planData("2026-11-27") }, { id: "e:2026-11-27:1:dinner", updatedAt: T(9), data: {} }] } }), images);
    expect(ids(await synced.records(USER_DATA.plan, "user:1"))).toEqual(["e:2026-11-27:1:dinner", "plan"]);
    // Auch die Löschmarke des alten Plans ist weg (zählt nicht mehr gegen die Grenze).
    const all = await syncUserData(synced, "user:1", request({ plan: { since: 0 } }), images);
    expect(ids(all.kinds.plan?.changes)).toEqual(["e:2026-11-27:1:dinner", "plan"]);
    // Ohne Plan bleiben keine Häkchen.
    await syncUserData(synced, "user:1", request({ plan: { since: 5, changes: [{ id: "plan", updatedAt: T(30), data: null }] } }), images);
    expect(ids((await syncUserData(synced, "user:1", request({ plan: { since: 0 } }), images)).kinds.plan?.changes)).toEqual(["plan"]);
    // Andere Konten bleiben unberührt.
    await syncUserData(
      synced,
      "user:2",
      request({ plan: { since: 0, changes: [{ id: "plan", updatedAt: T(1), data: planData("2026-11-01") }, { id: "e:2026-11-01:0:lunch", updatedAt: T(1), data: {} }] } }),
      images,
    );
    await syncUserData(synced, "user:1", request({ plan: { since: 0, changes: [{ id: "plan", updatedAt: T(40), data: planData("2026-12-01") }] } }), images);
    expect(ids(await synced.records(USER_DATA.plan, "user:2"))).toEqual(["e:2026-11-01:0:lunch", "plan"]);
    // Häkchen ohne Plan räumt der Server gleich weg.
    await syncUserData(synced, "user:3", request({ plan: { since: 0, changes: [{ id: "e:2026-11-01:0:lunch", updatedAt: T(1), data: {} }] } }), images);
    expect(await synced.count(USER_DATA.plan, "user:3")).toBe(0);
  });

  it("schickt bei gleichem Zeitpunkt und anderem Inhalt die eigene Fassung zurück, Löschen gewinnt weiter", async () => {
    const synced = await ready();
    await syncUserData(synced, "user:1", request({ pantry: { since: 0, changes: [{ id: "reis@2026-11-27", updatedAt: EPOCH, data: { amount: 500 } }] } }), images);
    const tie = await syncUserData(synced, "user:1", request({ pantry: { since: 1, changes: [{ id: "reis@2026-11-27", updatedAt: EPOCH, data: { amount: 900 } }] } }), images);
    expect(tie.kinds.pantry?.changes).toEqual([{ id: "reis@2026-11-27", updatedAt: EPOCH, data: { amount: 500 } }]);
    const gone = await syncUserData(synced, "user:1", request({ pantry: { since: 1, changes: [{ id: "reis@2026-11-27", updatedAt: EPOCH, data: null }] } }), images);
    expect(gone.kinds.pantry?.changes).toEqual([]);
    expect(await synced.count(USER_DATA.pantry, "user:1")).toBe(0);
    expect(await exportUserData(synced, "user:1", images)).toEqual({ settings: null, plan: null, pantry: [], recipes: [], favorites: [], texts: { translated: {}, improved: {} } });
  });

  it("speichert Fotos eigener Rezepte als Dateien und räumt neue wieder weg, wenn das Speichern scheitert", async () => {
    const synced = await ready();
    const photos = new MemoryImageStore();
    const saved = await syncUserData(synced, "user:1", request({ recipes: { since: 0, changes: [{ id: "eigen_1", updatedAt: T(1), data: { recipe: ownRecipe("eigen_1", { media: { image: { uri: jpeg(1) } } }) } }] } }), photos);
    expect(photos.keys()).toHaveLength(1);
    expect(photoOf(saved.kinds.recipes?.changes[0])).toBe(`/api/images/${photos.keys()[0]}`);
    // Konto voll (Löschmarken zählen mit): Nichts wird gespeichert, auch keine neue Datei.
    const tombstones = Array.from({ length: USER_DATA.recipes.maxRecords - 1 }, (_, i) => ({ id: `eigen_weg_${i}`, updatedAt: T(2), data: null }));
    await synced.sync(USER_DATA.recipes, "user:1", 1, tombstones);
    await expect(
      syncUserData(synced, "user:1", request({ recipes: { since: 0, changes: [{ id: "eigen_2", updatedAt: T(3), data: { recipe: ownRecipe("eigen_2", { media: { image: { uri: jpeg(2) } } }) } }] } }), photos),
    ).rejects.toBeInstanceOf(SyncFullError);
    expect(photos.keys()).toHaveLength(1);
  });

  it("ändert bei vollem Konto nichts", async () => {
    const synced = await ready();
    const kind = { ...USER_DATA.settings, maxRecords: 1 };
    await synced.sync(kind, "user:1", 0, [{ id: "settings", updatedAt: T(1), data: { onboarded: true } }]);
    await expect(synced.sync(kind, "user:1", 1, [{ id: "settings-2", updatedAt: T(2), data: {} }])).rejects.toBeInstanceOf(SyncFullError);
    expect((await synced.records(kind, "user:1")).map((r) => r.id)).toEqual(["settings"]);
  });
});
