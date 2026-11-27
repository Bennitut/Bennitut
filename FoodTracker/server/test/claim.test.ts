import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";
import { Ai } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { DiaryFullError, DiaryStore } from "../src/diary/store.js";
import { openSqlite, postgresFromPool, type Db, type PgPoolLike } from "../src/storage/db.js";
import { migrate } from "../src/storage/migrations.js";

// Vorrang 1, 9.1: Beim Anmelden übernimmt das Konto, was das Gerät ohne Konto auf dem Server hat – ohne Doppeltes.
// Dazu die Lücke, durch die sich ein Gerät mit „user:<Konto-ID>“ als fremdes Konto ausgeben konnte.

const FAST = { N: 1024, r: 8, p: 1 };
const noAi = new Ai({ hasAnthropicKey: false, ollama: { url: "http://ollama.test", model: "gemma4:e4b", numCtx: 1024, timeoutMs: 1000 } }, async () => {
  throw new TypeError("offline");
});

const DEVICE = "geraet0claim0aaaa";
const OTHER = "geraet0claim0bbbb";
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const entry = { date: "2026-11-24", time: "12:30", title: "Linsen-Dal", nutrients: { kcal: 520, protein: 24, carbs: 70, fat: 12 }, source: "plan" };
const ownRecipe = {
  id: "eigen_1",
  language: "de",
  name: "Omas Kartoffelsalat",
  steps: ["Kartoffeln kochen"],
  otherIngredients: [],
  mealTypes: ["lunch"],
  ingredients: [{ ingredientId: "kartoffeln", amount: 300 }],
  cookMinutes: 30,
  tags: [],
  source: { kind: "eigen" },
};

function setup() {
  const app = createApp({
    auth: { appleAudiences: [], googleAudiences: [], adminEmails: [], allowDevLogin: false },
    ai: noAi,
    passwordCost: FAST,
  });
  const call = async (method: string, path: string, body?: unknown, { token, device = DEVICE }: { token?: string; device?: string } = {}) => {
    const res = await app.request(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "Content-Type": "application/json", "X-Device-Id": device, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: res.status, body: res.status === 204 ? null : ((await res.json()) as any) };
  };
  const register = async (email: string, device = DEVICE) => {
    const { body } = await call("POST", "/api/auth/register", { email, password: "Kaspressknödel mit Salat" }, { device });
    return body as { token: string; user: { id: string } };
  };
  return { call, register };
}

describe("Geräte-ID", () => {
  it("lässt sich nicht als Konto ausgeben („user:<Konto-ID>“)", async () => {
    const { call, register } = setup();
    const victim = await register("opfer@example.com", OTHER);
    const photo = (await call("POST", "/api/recipes/shakshuka/photos", { uri: PHOTO }, { token: victim.token, device: OTHER })).body as { id: string };
    const shared = (await call("POST", "/api/community/recipes", { authorName: "Opfer", recipe: ownRecipe }, { token: victim.token, device: OTHER })).body as { id: string };

    const fake = `user:${victim.user.id}`;
    expect((await call("DELETE", `/api/photos/${photo.id}`, undefined, { device: fake })).status).toBe(400);
    expect((await call("DELETE", `/api/community/recipes/${shared.id}`, undefined, { device: fake })).status).toBe(400);
    expect((await call("POST", "/api/recipes/shakshuka/rating", { stars: 1 }, { device: fake })).status).toBe(400);
    expect((await call("GET", "/api/recipes/shakshuka/photos", undefined, { token: victim.token, device: OTHER })).body).toHaveLength(1);
  });

  it("nimmt nur Buchstaben, Ziffern, „-“ und „_“ (8 bis 100 Zeichen)", async () => {
    const { call } = setup();
    for (const device of ["kurz", "mit leerzeichen 123", "punkt.und:doppelpunkt", "schräg/strich/x", "a".repeat(101)]) {
      expect((await call("GET", "/api/recipes/ratings", undefined, { device })).status).toBe(400);
    }
    for (const device of ["lmz7k2abc123lmz7k2def456", "device-aaaaaaaa", "e2e_geraet_0000"]) {
      expect((await call("GET", "/api/recipes/ratings", undefined, { device })).status).toBe(200);
    }
  });
});

describe("Gerätedaten beim Anmelden ins Konto übernehmen (/api/auth/claim-device)", () => {
  it("übernimmt Tagebuch, geteilte Rezepte, Favoriten, Fotos, Sterne und Meldungen des Geräts", async () => {
    const { call, register } = setup();
    // Jemand anderes teilt ein Rezept und lädt ein Foto hoch, das das Gerät ohne Konto bewertet.
    const other = await register("andere@example.com", OTHER);
    const theirs = (await call("POST", "/api/community/recipes", { authorName: "Andere", recipe: ownRecipe }, { token: other.token, device: OTHER })).body;
    const theirPhoto = (await call("POST", "/api/recipes/linsen_dal/photos", { uri: PHOTO }, { token: other.token, device: OTHER })).body;

    // Das Gerät ohne Konto: Tagebuch, Rezept teilen, Favorit, Sterne, Foto, Foto bewerten, Meldung.
    await call("POST", "/api/diary/sync", { since: 0, changes: [{ id: "e1", updatedAt: "2026-11-24T03:30:00.000Z", entry }] });
    const mine = (await call("POST", "/api/community/recipes", { authorName: "Ohne Konto", recipe: ownRecipe })).body;
    await call("POST", `/api/community/recipes/${theirs.id}/like`, {});
    await call("POST", "/api/recipes/shakshuka/rating", { stars: 4 });
    const myPhoto = (await call("POST", "/api/recipes/shakshuka/photos", { uri: PHOTO })).body;
    await call("POST", `/api/photos/${theirPhoto.id}/rating`, { stars: 5 });
    await call("POST", "/api/recipes/linsen_dal/flags", { reason: "text", note: "Tippfehler" });

    const { token } = await register("neu@example.com");
    // Vor der Übernahme gehört nichts davon dem Konto.
    expect((await call("GET", "/api/recipes/ratings", undefined, { token })).body.shakshuka.mine).toBeNull();

    const claim = await call("POST", "/api/auth/claim-device", {}, { token });
    expect(claim.status).toBe(200);
    expect(claim.body).toEqual({ recipes: 1, likes: 1, photos: 1, ratings: 2, flags: 1, diary: 1 });

    const ratings = (await call("GET", "/api/recipes/ratings", undefined, { token })).body;
    expect(ratings.shakshuka).toEqual({ avg: 4, count: 1, mine: 4 });
    const photos = (await call("GET", "/api/recipes/shakshuka/photos", undefined, { token })).body as { id: string; mine: boolean }[];
    expect(photos.find((p) => p.id === myPhoto.id)?.mine).toBe(true);
    const gallery = (await call("GET", "/api/recipes/linsen_dal/photos", undefined, { token })).body as { id: string; myRating: number | null }[];
    expect(gallery.find((p) => p.id === theirPhoto.id)?.myRating).toBe(5);
    const community = (await call("GET", "/api/community/recipes?sort=new", undefined, { token })).body as { id: string; mine: boolean; likedByMe: boolean }[];
    expect(community.find((r) => r.id === mine.id)?.mine).toBe(true);
    expect(community.find((r) => r.id === theirs.id)?.likedByMe).toBe(true);

    // Ein anderes Gerät mit demselben Konto bekommt das Tagebuch; das Gerät ohne Konto hat nichts mehr.
    const synced = (await call("POST", "/api/diary/sync", { since: 0, changes: [] }, { token, device: "zweites0geraet" })).body;
    expect(synced.changes).toEqual([expect.objectContaining({ id: "e1" })]);
    expect((await call("POST", "/api/diary/sync", { since: 0, changes: [] })).body.changes).toEqual([]);
    expect((await call("GET", "/api/recipes/ratings")).body.shakshuka.mine).toBeNull();
    expect((await call("DELETE", `/api/photos/${myPhoto.id}`)).status).toBe(404);

    // Der Export des Kontos enthält jetzt alles, ein zweiter Aufruf findet nichts mehr.
    const exported = (await call("GET", "/api/auth/export", undefined, { token })).body;
    expect(exported.diary).toHaveLength(1);
    expect(exported.community.shared).toHaveLength(1);
    expect(exported.flags).toEqual([expect.objectContaining({ recipeId: "linsen_dal", note: "Tippfehler" })]);
    expect((await call("POST", "/api/auth/claim-device", {}, { token })).body).toEqual({ recipes: 0, likes: 0, photos: 0, ratings: 0, flags: 0, diary: 0 });
  });

  it("zählt nichts doppelt, was das Konto schon hat – die Fassung des Kontos gilt", async () => {
    const { call, register } = setup();
    const account = await register("doppelt@example.com", OTHER);
    const token = account.token;
    // Das Konto (auf einem anderen Gerät): Sterne, Favorit, Meldung, eigenes Foto.
    const theirs = (await call("POST", "/api/community/recipes", { authorName: "Wer anderes", recipe: ownRecipe }, { device: "fremdes0geraet" })).body;
    await call("POST", "/api/recipes/shakshuka/rating", { stars: 2 }, { token, device: OTHER });
    await call("POST", `/api/community/recipes/${theirs.id}/like`, {}, { token, device: OTHER });
    await call("POST", "/api/recipes/linsen_dal/flags", { reason: "amounts", note: "vom Konto" }, { token, device: OTHER });
    const accountPhoto = (await call("POST", "/api/recipes/shakshuka/photos", { uri: PHOTO }, { token, device: OTHER })).body;
    // Dasselbe Gerät ohne Konto bewertet, favorisiert und meldet dasselbe noch einmal und bewertet das Foto des Kontos.
    await call("POST", "/api/recipes/shakshuka/rating", { stars: 5 });
    await call("POST", `/api/community/recipes/${theirs.id}/like`, {});
    await call("POST", "/api/recipes/linsen_dal/flags", { reason: "text", note: "vom Gerät" });
    await call("POST", `/api/photos/${accountPhoto.id}/rating`, { stars: 5 });

    const claim = await call("POST", "/api/auth/claim-device", {}, { token });
    expect(claim.body).toMatchObject({ likes: 0, ratings: 0, flags: 0 });
    expect((await call("GET", "/api/recipes/ratings", undefined, { token })).body.shakshuka).toEqual({ avg: 2, count: 1, mine: 2 });
    const community = (await call("GET", "/api/community/recipes", undefined, { token })).body as { id: string; likes: number }[];
    expect(community.find((r) => r.id === theirs.id)?.likes).toBe(1);
    const photo = ((await call("GET", "/api/recipes/shakshuka/photos", undefined, { token })).body as { id: string; count: number; mine: boolean }[])[0];
    expect(photo).toMatchObject({ id: accountPhoto.id, count: 0, mine: true });

    // Als Admin: eine Meldung zu diesem Rezept, die des Kontos.
    const exported = (await call("GET", "/api/auth/export", undefined, { token })).body;
    expect(exported.flags).toEqual([expect.objectContaining({ recipeId: "linsen_dal", note: "vom Konto" })]);
  });

  it("macht ein bewertetes Foto des Geräts zum eigenen Foto ohne eigene Sterne", async () => {
    const { call, register } = setup();
    const photo = (await call("POST", "/api/recipes/shakshuka/photos", { uri: PHOTO })).body;
    const { token } = await register("fotograf@example.com", OTHER);
    // Das Konto hat das Foto des Geräts bewertet, bevor es merkte, dass es das eigene ist.
    await call("POST", `/api/photos/${photo.id}/rating`, { stars: 5 }, { token, device: OTHER });
    expect((await call("POST", "/api/auth/claim-device", {}, { token })).body).toMatchObject({ photos: 1 });
    const view = ((await call("GET", "/api/recipes/shakshuka/photos", undefined, { token })).body as { count: number; mine: boolean }[])[0];
    expect(view).toMatchObject({ count: 0, mine: true });
  });

  it("gleicht das Tagebuch ab wie die Sicherung: Neueres gewinnt, Gelöschtes bleibt gelöscht", async () => {
    const { call, register } = setup();
    const { token } = await register("tagebuch@example.com", OTHER);
    const at = (h: number) => `2026-11-24T${String(h).padStart(2, "0")}:00:00.000Z`;
    await call("POST", "/api/diary/sync", { since: 0, changes: [{ id: "neuer-im-konto", updatedAt: at(10), entry: { ...entry, title: "Konto" } }, { id: "spaeter-geloescht", updatedAt: at(8), entry }] }, { token, device: OTHER });
    const before = (await call("POST", "/api/diary/sync", { since: 0, changes: [] }, { token, device: OTHER })).body;

    await call("POST", "/api/diary/sync", {
      since: 0,
      changes: [
        { id: "neuer-im-konto", updatedAt: at(9), entry: { ...entry, title: "Gerät, älter" } },
        { id: "spaeter-geloescht", updatedAt: at(11), entry: null },
        { id: "nur-am-geraet", updatedAt: at(12), entry: { ...entry, title: "Nur am Gerät" } },
      ],
    });
    expect((await call("POST", "/api/auth/claim-device", {}, { token })).body.diary).toBe(1);

    const after = (await call("POST", "/api/diary/sync", { since: before.rev, changes: [] }, { token, device: OTHER })).body;
    const byId = Object.fromEntries((after.changes as { id: string; entry: { title: string } | null }[]).map((r) => [r.id, r.entry]));
    expect(byId).toEqual({ "spaeter-geloescht": null, "nur-am-geraet": expect.objectContaining({ title: "Nur am Gerät" }) });
    const all = (await call("POST", "/api/diary/sync", { since: 0, changes: [] }, { token, device: OTHER })).body.changes as { id: string; entry: { title: string } | null }[];
    expect(all.find((r) => r.id === "neuer-im-konto")?.entry?.title).toBe("Konto");
  });

  it("verlangt eine Anmeldung und eine gültige Geräte-ID", async () => {
    const { call, register } = setup();
    expect((await call("POST", "/api/auth/claim-device", {})).status).toBe(401);
    const { token, user } = await register("ohne@example.com");
    expect((await call("POST", "/api/auth/claim-device", {}, { token, device: `user:${user.id}` })).status).toBe(400);
  });
});

function pgMem(): Db {
  const { Pool } = newDb().adapters.createPg();
  return postgresFromPool(new Pool() as unknown as PgPoolLike, "Postgres (pg-mem)");
}

describe.each([
  ["SQLite", () => openSqlite(":memory:")],
  ["Postgres", pgMem],
] as [string, () => Db][])("DiaryStore.transfer mit %s", (_name, open) => {
  const record = (id: string, updatedAt = "2026-11-24T08:00:00.000Z") => ({
    id,
    updatedAt,
    entry: { id, date: "2026-11-24", time: "08:00", title: id, nutrients: { kcal: 100, protein: 1, carbs: 1, fat: 1 }, source: "manuell" as const, updatedAt },
  });
  const store = async (pageSize?: number, maxRecords?: number) => {
    const db = open();
    await migrate(db);
    return new DiaryStore(db, pageSize, maxRecords);
  };

  it("ändert nichts, wenn das Konto dafür zu voll ist", async () => {
    const diary = await store(100, 3);
    await diary.sync("user:voll", 0, [record("a"), record("b")]);
    await diary.sync("device:geraet01", 0, [record("c"), record("d")]);
    await expect(diary.transfer("device:geraet01", "user:voll")).rejects.toBeInstanceOf(DiaryFullError);
    expect(await diary.count("user:voll")).toBe(2);
    expect(await diary.count("device:geraet01")).toBe(2);
    // Was das Konto schon hat, zählt nicht gegen die Grenze.
    await diary.sync("device:geraet02", 0, [record("a", "2026-11-25T08:00:00.000Z"), record("e")]);
    expect(await diary.transfer("device:geraet02", "user:voll")).toBe(2);
    expect(await diary.count("user:voll")).toBe(3);
    expect(await diary.count("device:geraet02")).toBe(0);
  });

  it("macht nichts mit sich selbst und nichts ohne Sicherung des Geräts", async () => {
    const diary = await store();
    await diary.sync("user:x", 0, [record("a")]);
    expect(await diary.transfer("user:x", "user:x")).toBe(0);
    expect(await diary.transfer("device:leer0000", "user:x")).toBe(0);
    expect(await diary.count("user:x")).toBe(1);
  });

  it("gibt Übernommenem neue Revisionen und lässt die des Geräts nie rückwärts zählen", async () => {
    const diary = await store();
    await diary.sync("user:k", 0, [record("k1"), record("k2")]);
    await diary.sync("device:geraet03", 0, [record("g1"), record("g2"), record("g3")]);
    expect(await diary.transfer("device:geraet03", "user:k")).toBe(3);
    // Ein anderes Gerät des Kontos, das bis Revision 2 kannte, bekommt genau das Übernommene.
    const other = await diary.sync("user:k", 2, []);
    expect(other.changes.map((r) => r.id)).toEqual(["g1", "g2", "g3"]);
    expect(other.rev).toBe(5);
    // Schreibt das Gerät danach wieder ohne Konto, geht seine Revision weiter statt von vorn.
    expect((await diary.sync("device:geraet03", 3, [record("g4")])).rev).toBe(4);
    expect((await diary.sync("device:geraet03", 0, [])).changes.map((r) => r.id)).toEqual(["g4"]);
  });
});
