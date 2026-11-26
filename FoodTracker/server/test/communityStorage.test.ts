import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newDb } from "pg-mem";
import { afterAll, describe, expect, it } from "vitest";
import { OverrideStore } from "../src/admin/overrides.js";
import { Ai } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { FeedbackStore } from "../src/community/feedback.js";
import { CommunityStore } from "../src/community/store.js";
import { RECIPES } from "../src/data/catalog.js";
import { openSqlite, postgresFromPool, type Db, type PgPoolLike } from "../src/storage/db.js";
import { DirectoryImageStore, MemoryImageStore, decodeDataUri, imageKeyOf, isImageKey, newImageKey, toDataUri } from "../src/storage/images.js";
import { importLegacyCommunity, importLegacyFeedback, importLegacyOverrides } from "../src/storage/legacy.js";
import { migrate } from "../src/storage/migrations.js";
import type { Recipe } from "../src/types.js";

// Vorrang 1, 9.2 Teil 3: Community-Rezepte, Favoriten, Fotos, Sterne, Meldungen und Admin-Änderungen in der Datenbank,
// Fotos als Dateien im Bildspeicher statt als data-URI – auf SQLite und Postgres (pg-mem), dazu der Umzug aus den
// JSON-Dateien älterer Fassungen und die Auslieferung der Bilder über GET /api/images/<Schlüssel>.

const tmp = mkdtempSync(join(tmpdir(), "foodtracker-community-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Kleinste „Bilder“: die ersten Bytes, an denen der Server das Format erkennt, plus eine Kennung. */
const JPEG = (n = 1) => `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, n]).toString("base64")}`;
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString("base64")}`;
const WEBP = `data:image/webp;base64,${Buffer.from([...Buffer.from("RIFF"), 4, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]).toString("base64")}`;
const NOT_AN_IMAGE = `data:image/jpeg;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`;

const recipe = (name: string, image?: Recipe["media"]): Recipe =>
  ({
    id: "eigen_1",
    language: "de",
    name,
    steps: ["Kochen"],
    otherIngredients: [],
    mealTypes: ["lunch"],
    ingredients: [{ ingredientId: "kartoffeln", amount: 300 }],
    cookMinutes: 30,
    tags: [],
    source: { kind: "eigen" },
    ...(image ? { media: image } : {}),
  }) as unknown as Recipe;

function pgMem(): Db {
  const { Pool } = newDb().adapters.createPg();
  return postgresFromPool(new Pool() as unknown as PgPoolLike, "Postgres (pg-mem)");
}

const BACKENDS: [string, () => Db][] = [
  ["SQLite", () => openSqlite(":memory:")],
  ["Postgres", pgMem],
];

describe("Bildspeicher", () => {
  it("erkennt JPEG, PNG und WebP an den Bytes – nicht an der Angabe", () => {
    expect(decodeDataUri(JPEG())?.type).toBe("image/jpeg");
    expect(decodeDataUri(PNG)?.type).toBe("image/png");
    expect(decodeDataUri(WEBP)?.type).toBe("image/webp");
    // Falsch angegeben, aber ein JPEG: zählt als JPEG.
    expect(decodeDataUri(JPEG().replace("image/jpeg", "image/png"))?.type).toBe("image/jpeg");
    expect(decodeDataUri(NOT_AN_IMAGE)).toBeNull();
    expect(decodeDataUri("https://example.com/foto.jpg")).toBeNull();
    expect(decodeDataUri("data:text/html;base64,PGgxPg==")).toBeNull();
    expect(decodeDataUri(`data:image/jpeg;base64,${"/9j/".repeat(2_000_000)}`)).toBeNull();
    expect(toDataUri(decodeDataUri(JPEG(7))!)).toBe(JPEG(7));
  });

  it("nimmt nur Schlüssel aus UUID und Endung – keine Pfade", () => {
    const key = newImageKey("image/png");
    expect(isImageKey(key)).toBe(true);
    expect(key.endsWith(".png")).toBe(true);
    for (const bad of ["../geheim.jpg", "x.jpg", `${key}/..`, `${key.slice(0, -4)}.svg`, `..%2F${key}`]) expect(isImageKey(bad)).toBe(false);
    expect(imageKeyOf(`/api/images/${key}`)).toBe(key);
    expect(imageKeyOf(`/api/images/../${key}`)).toBeNull();
    expect(imageKeyOf(`https://example.com/api/images/${key}`)).toBeNull();
  });

  it("speichert im Ordner, liest und löscht – ohne halbe Dateien", async () => {
    const dir = join(tmp, "fotos");
    const store = new DirectoryImageStore(dir);
    const key = newImageKey("image/jpeg");
    await store.put(key, decodeDataUri(JPEG(3))!);
    expect(readdirSync(dir)).toEqual([key]);
    expect(toDataUri((await store.get(key))!)).toBe(JPEG(3));
    expect(await store.get(newImageKey("image/jpeg"))).toBeUndefined();
    expect(await store.get("../../etc/passwd")).toBeUndefined();
    await expect(store.put("../ausbruch.jpg", decodeDataUri(JPEG())!)).rejects.toThrow("Ungültiger Schlüssel");
    await store.delete(key);
    await store.delete(key);
    expect(readdirSync(dir)).toEqual([]);
    expect(store.description).toBe(`Ordner ${dir}`);
  });
});

describe.each(BACKENDS)("Community, Fotos, Sterne und Meldungen mit %s", (name, open) => {
  const setup = async () => {
    const db = open();
    await migrate(db);
    const images = new MemoryImageStore();
    return { db, images, community: new CommunityStore(db, images), feedback: new FeedbackStore(db, images), overrides: new OverrideStore(db) };
  };

  describe("Community-Rezepte", () => {
    it("legt ein eigenes Foto als Datei ab und liefert Listen ohne data-URI", async () => {
      const { community, images } = await setup();
      const shared = await community.publish("geraet-anna", "Anna", recipe("Kartoffelsalat", { image: { uri: JPEG(1) }, videos: [] }));
      expect(shared).toMatchObject({ authorName: "Anna", likes: 0, likedByMe: false, mine: true });
      expect(shared.recipe.source).toEqual({ kind: "community", communityId: shared.id, author: "Anna" });
      const key = imageKeyOf(shared.recipe.media!.image!.uri)!;
      expect(images.keys()).toEqual([key]);
      expect(toDataUri((await images.get(key))!)).toBe(JPEG(1));
      expect(shared.recipe.media!.videos).toEqual([]);
      const list = await community.list("geraet-ben");
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: shared.id, mine: false, recipe: { name: "Kartoffelsalat", media: { image: { uri: `/api/images/${key}` } } } });
      expect(JSON.stringify(list)).not.toContain("base64");
      expect(JSON.stringify(list)).not.toContain("geraet-anna");
    });

    it("lässt Fotos im Netz verlinkt, kopiert Fotos aus dem Bildspeicher und lässt Unbrauchbares weg", async () => {
      const { community, images } = await setup();
      const web = { uri: "https://upload.wikimedia.org/foto.jpg", credit: "Foto: Jemand, CC BY 2.0", source: "https://commons.wikimedia.org/x" };
      expect((await community.publish("a1234567", "A", recipe("Aus dem Katalog", { image: web }))).recipe.media?.image).toEqual(web);
      expect((await community.publish("a1234567", "A", recipe("Vom Gerät", { image: { uri: "file:///var/mobile/foto.jpg" } }))).recipe.media).toEqual({});
      expect((await community.publish("a1234567", "A", recipe("Kein Bild", { image: { uri: NOT_AN_IMAGE } }))).recipe.media).toEqual({});
      const original = await community.publish("a1234567", "A", recipe("Original", { image: { uri: PNG } }));
      const copy = await community.publish("b1234567", "B", recipe("Kopie", { image: { uri: original.recipe.media!.image!.uri } }));
      expect(copy.recipe.media!.image!.uri).not.toBe(original.recipe.media!.image!.uri);
      expect(images.keys()).toHaveLength(2);
      // Das Original zurückziehen: Die Kopie behält ihr Foto.
      expect(await community.remove("a1234567", original.id)).toBe(true);
      expect(images.keys()).toEqual([imageKeyOf(copy.recipe.media!.image!.uri)]);
      const gone = `/api/images/${newImageKey("image/jpeg")}`;
      expect((await community.publish("b1234567", "B", recipe("Verwaist", { image: { uri: gone } }))).recipe.media).toEqual({});
    });

    it("sortiert nach Favoriten oder Datum, sucht nach Name und Autor:in und zählt Favoriten einmal", async () => {
      const { community } = await setup();
      const first = await community.publish("autorin1", "Lena", recipe("Linsensuppe"));
      await new Promise((r) => setTimeout(r, 5));
      const second = await community.publish("autorin2", "Tom", recipe("Topfenknödel"));
      expect((await community.list("x1234567", { sort: "new" })).map((r) => r.id)).toEqual([second.id, first.id]);
      expect((await community.toggleLike("fan00001", first.id))?.likes).toBe(1);
      expect((await community.toggleLike("fan00002", first.id))).toMatchObject({ likes: 2, likedByMe: true });
      expect((await community.list("fan00001")).map((r) => [r.id, r.likes, r.likedByMe])).toEqual([
        [first.id, 2, true],
        [second.id, 0, false],
      ]);
      expect((await community.toggleLike("fan00001", first.id))).toMatchObject({ likes: 1, likedByMe: false });
      expect(await community.toggleLike("fan00001", "gibt-es-nicht")).toBeUndefined();
      expect((await community.list("x1234567", { query: "KNÖDEL" })).map((r) => r.id)).toEqual([second.id]);
      expect((await community.list("x1234567", { query: "lena" })).map((r) => r.id)).toEqual([first.id]);
      expect(await community.countsByAuthor()).toEqual(new Map([["autorin1", 1], ["autorin2", 1]]));
    });

    it("lässt nur die Autorin zurückziehen, Admins alles – mit Foto und Favoriten", async () => {
      const { db, community, images } = await setup();
      const shared = await community.publish("autorin1", "Lena", recipe("Mit Foto", { image: { uri: JPEG(2) } }));
      await community.toggleLike("fan00001", shared.id);
      expect(await community.remove("fremd0001", shared.id)).toBe(false);
      expect(await community.removeAsAdmin(shared.id)).toBe(true);
      expect(await community.removeAsAdmin(shared.id)).toBe(false);
      expect(images.keys()).toEqual([]);
      expect(await db.all("SELECT * FROM community_likes")).toEqual([]);
    });

    it("übernimmt beim Anmelden Rezepte und Favoriten des Geräts, ohne Doppeltes", async () => {
      const { community } = await setup();
      const other = await community.publish("andere01", "Andere", recipe("Fremdes Rezept"));
      const twice = await community.publish("andere01", "Andere", recipe("Doppelt favorisiert"));
      const mine = await community.publish("geraet01", "Ohne Konto", recipe("Vom Gerät"));
      await community.toggleLike("geraet01", other.id);
      await community.toggleLike("geraet01", twice.id);
      await community.toggleLike("user:konto", twice.id);
      expect(await community.transferActor("geraet01", "user:konto")).toEqual({ recipes: 1, likes: 1 });
      const list = await community.list("user:konto");
      expect(list.find((r) => r.id === mine.id)?.mine).toBe(true);
      expect(list.find((r) => r.id === other.id)?.likedByMe).toBe(true);
      expect(list.find((r) => r.id === twice.id)?.likes).toBe(1);
      expect((await community.list("geraet01")).some((r) => r.mine || r.likedByMe)).toBe(false);
      expect(await community.transferActor("geraet01", "user:konto")).toEqual({ recipes: 0, likes: 0 });
    });

    it("exportiert eigene Rezepte mit Foto als data-URI und löscht beim Löschen des Kontos alles", async () => {
      const { db, community, images } = await setup();
      const own = await community.publish("user:weg", "Weg", recipe("Eigenes", { image: { uri: JPEG(5) } }));
      const foreign = await community.publish("andere01", "Andere", recipe("Fremdes"));
      await community.toggleLike("user:weg", foreign.id);
      await community.toggleLike("andere01", own.id);
      const exported = await community.exportFor("user:weg");
      expect(exported.liked).toEqual([foreign.id]);
      expect(exported.shared).toHaveLength(1);
      expect(exported.shared[0]).toMatchObject({ id: own.id, likes: 1, recipe: { media: { image: { uri: JPEG(5) } } } });
      await community.removeActor("user:weg");
      expect(images.keys()).toEqual([]);
      expect((await community.list("andere01")).map((r) => [r.id, r.likes])).toEqual([[foreign.id, 0]]);
      expect(Number((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM community_likes"))!.n)).toBe(0);
    });
  });

  describe("Fotos, Sterne und Meldungen", () => {
    it("legt Fotos als Dateien ab, sortiert nach Sternen und zeigt das beste als Rezeptbild", async () => {
      const { feedback, images } = await setup();
      const a = await feedback.addPhoto("lena0001", "shakshuka", "Lena", JPEG(1));
      await new Promise((r) => setTimeout(r, 5));
      const b = await feedback.addPhoto("tom00001", "shakshuka", "Tom", PNG);
      if (typeof a === "string" || typeof b === "string") throw new Error("Foto nicht angenommen");
      expect(a).toMatchObject({ recipeId: "shakshuka", authorName: "Lena", mine: true, count: 0, avg: 0, myRating: null });
      expect(images.keys()).toEqual([imageKeyOf(a.uri), imageKeyOf(b.uri)].sort());
      // Eigene Fotos zählen nicht.
      expect((await feedback.ratePhoto("lena0001", a.id, 5))?.count).toBe(0);
      expect(await feedback.ratePhoto("lena0001", "gibt-es-nicht", 5)).toBeUndefined();
      expect(await feedback.ratePhoto("lena0001", b.id, 5)).toMatchObject({ count: 1, avg: 5, myRating: 5 });
      expect(await feedback.ratePhoto("lena0001", b.id, 4)).toMatchObject({ count: 1, avg: 4, myRating: 4 });
      await feedback.ratePhoto("fan00001", a.id, 2);
      expect((await feedback.photos("shakshuka", "tom00001")).map((p) => [p.id, p.mine])).toEqual([
        [b.id, true],
        [a.id, false],
      ]);
      // Rezeptbild nur ab einem Schnitt von 4 Sternen.
      expect(Object.keys(await feedback.topPhotos("x1234567"))).toEqual(["shakshuka"]);
      expect((await feedback.topPhotos("x1234567")).shakshuka!.id).toBe(b.id);
      await feedback.ratePhoto("fan00001", b.id, 1);
      expect(await feedback.topPhotos("x1234567")).toEqual({});
      expect((await feedback.recentPhotos("x1234567")).map((p) => p.id)).toEqual([b.id, a.id]);
      expect(await feedback.photoCountsByAuthor()).toEqual(new Map([["lena0001", 1], ["tom00001", 1]]));
    });

    it("nimmt nur Bilder an, höchstens fünf pro Gerät und Rezept – ohne übrige Dateien", async () => {
      const { feedback, images } = await setup();
      expect(await feedback.addPhoto("lena0001", "shakshuka", "", NOT_AN_IMAGE)).toBe("invalid");
      for (let i = 0; i < 5; i++) expect(typeof (await feedback.addPhoto("lena0001", "shakshuka", "", JPEG(i)))).toBe("object");
      expect(await feedback.addPhoto("lena0001", "shakshuka", "", JPEG(9))).toBe("limit");
      expect(typeof (await feedback.addPhoto("lena0001", "linsen_dal", "", WEBP))).toBe("object");
      expect(images.keys()).toHaveLength(6);
    });

    it("löscht Fotos nur für die Urheberin bzw. Admins – samt Datei und Sternen", async () => {
      const { db, feedback, images } = await setup();
      const photo = await feedback.addPhoto("lena0001", "shakshuka", "Lena", JPEG());
      if (typeof photo === "string") throw new Error("Foto nicht angenommen");
      await feedback.ratePhoto("fan00001", photo.id, 5);
      expect(await feedback.removePhoto("fan00001", photo.id)).toBe(false);
      expect(await feedback.removePhoto("lena0001", photo.id)).toBe(true);
      expect(await feedback.removePhoto("lena0001", photo.id)).toBe(false);
      expect(images.keys()).toEqual([]);
      expect(await db.all("SELECT * FROM photo_ratings")).toEqual([]);
      const other = await feedback.addPhoto("tom00001", "shakshuka", "Tom", PNG);
      if (typeof other === "string") throw new Error("Foto nicht angenommen");
      expect(await feedback.removePhotoAsAdmin(other.id)).toBe(true);
      expect(images.keys()).toEqual([]);
    });

    it("bewertet Rezepte und sammelt Meldungen", async () => {
      const { feedback } = await setup();
      expect(await feedback.rateRecipe("lena0001", "kaiserschmarrn", 5)).toEqual({ avg: 5, count: 1, mine: 5 });
      expect(await feedback.rateRecipe("tom00001", "kaiserschmarrn", 2)).toEqual({ avg: 3.5, count: 2, mine: 2 });
      expect(await feedback.rateRecipe("tom00001", "kaiserschmarrn", 4)).toEqual({ avg: 4.5, count: 2, mine: 4 });
      await feedback.rateRecipe("tom00001", "shakshuka", 3);
      expect(await feedback.recipeRatings("lena0001")).toEqual({ kaiserschmarrn: { avg: 4.5, count: 2, mine: 5 }, shakshuka: { avg: 3, count: 1, mine: null } });

      await feedback.flag("lena0001", "linsen_dal", "image", "Foto zeigt ein Restaurant");
      await new Promise((r) => setTimeout(r, 5));
      await feedback.flag("tom00001", "linsen_dal", "text", "");
      await new Promise((r) => setTimeout(r, 5));
      await feedback.flag("tom00001", "linsen_dal", "text", "Schritt 3 fehlt");
      await feedback.flag("tom00001", "shakshuka", "amounts", "");
      const summary = await feedback.flagSummary();
      expect(summary.map((s) => s.recipeId)).toEqual(["linsen_dal", "shakshuka"]);
      expect(summary[0]).toMatchObject({ count: 3, reasons: { image: 1, text: 2 }, notes: ["Schritt 3 fehlt", "Foto zeigt ein Restaurant"] });
      expect(await feedback.resolveFlags("linsen_dal")).toBe(3);
      expect((await feedback.flagSummary()).map((s) => s.recipeId)).toEqual(["shakshuka"]);
    });

    it("übernimmt beim Anmelden Fotos, Sterne und Meldungen des Geräts, ohne Doppeltes", async () => {
      const { feedback } = await setup();
      const theirs = await feedback.addPhoto("andere01", "linsen_dal", "Andere", JPEG(1));
      const accounts = await feedback.addPhoto("user:konto", "shakshuka", "Konto", JPEG(2));
      const devices = await feedback.addPhoto("geraet01", "shakshuka", "Gerät", JPEG(3));
      if (typeof theirs === "string" || typeof accounts === "string" || typeof devices === "string") throw new Error("Foto nicht angenommen");
      await feedback.ratePhoto("geraet01", theirs.id, 5); // wird übernommen
      await feedback.ratePhoto("geraet01", accounts.id, 4); // eigenes Foto des Kontos: fällt weg
      await feedback.ratePhoto("user:konto", devices.id, 5); // Foto des Geräts, jetzt ein eigenes: fällt weg
      await feedback.rateRecipe("geraet01", "kaiserschmarrn", 4); // wird übernommen
      await feedback.rateRecipe("geraet01", "shakshuka", 5); // das Konto hat schon bewertet: dessen Sterne gelten
      await feedback.rateRecipe("user:konto", "shakshuka", 2);
      await feedback.flag("geraet01", "linsen_dal", "text", "vom Gerät");
      await feedback.flag("geraet01", "linsen_dal", "text", "noch einmal");
      await feedback.flag("geraet01", "shakshuka", "image", "schon vom Konto gemeldet");
      await feedback.flag("user:konto", "shakshuka", "amounts", "vom Konto");

      expect(await feedback.transferActor("geraet01", "user:konto")).toEqual({ photos: 1, ratings: 2, flags: 1 });
      const gallery = await feedback.photos("shakshuka", "user:konto");
      expect(gallery.map((p) => [p.id, p.mine, p.count])).toEqual(expect.arrayContaining([[accounts.id, true, 0], [devices.id, true, 0]]));
      expect((await feedback.photos("linsen_dal", "user:konto"))[0]).toMatchObject({ id: theirs.id, myRating: 5 });
      expect(await feedback.recipeRatings("user:konto")).toEqual({
        kaiserschmarrn: { avg: 4, count: 1, mine: 4 },
        shakshuka: { avg: 2, count: 1, mine: 2 },
      });
      const exported = await feedback.exportFor("user:konto");
      expect(exported.flags.map((f) => f.note).sort()).toEqual(["vom Gerät", "vom Konto"]);
      expect(await feedback.exportFor("geraet01")).toEqual({ photos: [], photoRatings: {}, recipeRatings: {}, flags: [] });
    });

    it("exportiert Fotos als data-URI und löscht beim Löschen des Kontos alles samt Dateien", async () => {
      const { feedback, images } = await setup();
      const own = await feedback.addPhoto("user:weg", "shakshuka", "Weg", JPEG(8));
      const foreign = await feedback.addPhoto("andere01", "shakshuka", "Andere", PNG);
      if (typeof own === "string" || typeof foreign === "string") throw new Error("Foto nicht angenommen");
      await feedback.ratePhoto("andere01", own.id, 5);
      await feedback.ratePhoto("user:weg", foreign.id, 3);
      await feedback.rateRecipe("user:weg", "shakshuka", 4);
      await feedback.flag("user:weg", "shakshuka", "other", "Notiz");
      const exported = await feedback.exportFor("user:weg");
      expect(exported.photos).toEqual([{ id: own.id, recipeId: "shakshuka", uri: JPEG(8), authorName: "Weg", createdAt: own.createdAt }]);
      expect(exported.photoRatings).toEqual({ [foreign.id]: 3 });
      expect(exported.recipeRatings).toEqual({ shakshuka: 4 });
      expect(exported.flags).toEqual([expect.objectContaining({ recipeId: "shakshuka", reason: "other", note: "Notiz" })]);
      await feedback.removeActor("user:weg");
      expect(images.keys()).toEqual([imageKeyOf(foreign.uri)]);
      expect((await feedback.photos("shakshuka", "andere01")).map((p) => [p.id, p.count])).toEqual([[foreign.id, 0]]);
      expect(await feedback.recipeRatings("andere01")).toEqual({});
      expect(await feedback.flagSummary()).toEqual([]);
    });
  });

  describe("Admin-Änderungen an Katalogrezepten", () => {
    it("ergänzt Änderungen, blendet aus, anonymisiert und nimmt zurück", async () => {
      const { overrides } = await setup();
      await overrides.set("shakshuka", { name: "Shakshuka (neu)" }, "Chefin");
      const second = await overrides.set("shakshuka", { cookMinutes: 20 }, "Chef");
      expect(second).toMatchObject({ patch: { name: "Shakshuka (neu)", cookMinutes: 20 }, updatedBy: "Chef" });
      await overrides.set("linsen_dal", { hidden: true }, "Chefin");
      expect(Object.keys(await overrides.all())).toEqual(["linsen_dal", "shakshuka"]);
      const catalog = await overrides.apply(RECIPES);
      expect(catalog.find((r) => r.id === "shakshuka")).toMatchObject({ name: "Shakshuka (neu)", cookMinutes: 20 });
      expect(catalog.some((r) => r.id === "linsen_dal")).toBe(false);
      await overrides.anonymize("Chefin");
      expect((await overrides.all()).linsen_dal!.updatedBy).toBe("Gelöschtes Konto");
      expect((await overrides.all()).shakshuka!.updatedBy).toBe("Chef");
      expect(await overrides.remove("linsen_dal")).toBe(true);
      expect(await overrides.remove("linsen_dal")).toBe(false);
      expect((await overrides.apply(RECIPES)).some((r) => r.id === "linsen_dal")).toBe(true);
    });
  });

  describe("Umzug aus den JSON-Dateien älterer Fassungen", () => {
    const file = (base: string, content: unknown) => {
      const path = join(tmp, `${base}-${name}.json`);
      writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
      return path;
    };

    it("übernimmt data/community.json mit denselben IDs, Favoriten und Fotos als Dateien", async () => {
      const { db, community, images } = await setup();
      const legacy = file("community", [
        { id: "c-1", recipe: { ...recipe("Mit Foto", { image: { uri: JPEG(4) } }), id: "community_c-1", source: { kind: "community", communityId: "c-1", author: "Lena" } }, authorId: "lena0001", authorName: "Lena", createdAt: "2026-11-20T10:00:00.000Z", likedBy: ["fan00001", "user:konto", "fan00001"] },
        { id: "c-2", recipe: recipe("Ohne Foto"), authorId: "user:tom", authorName: "Tom", createdAt: "2026-11-21T10:00:00.000Z", likedBy: [] },
        { kaputt: true },
      ]);
      expect(await importLegacyCommunity(db, images, legacy)).toEqual({ recipes: 2, likes: 2, images: 1, skipped: 1 });
      expect(existsSync(legacy)).toBe(false);
      const list = await community.list("fan00001");
      expect(list.map((r) => [r.id, r.likes, r.likedByMe])).toEqual([
        ["c-1", 2, true],
        ["c-2", 0, false],
      ]);
      const uri = list[0]!.recipe.media!.image!.uri;
      expect(toDataUri((await images.get(imageKeyOf(uri)!))!)).toBe(JPEG(4));
      expect((await community.list("user:tom")).find((r) => r.id === "c-2")?.mine).toBe(true);
      expect((await db.get<{ value: string }>("SELECT value FROM storage_meta WHERE key = ?", ["imported:community.json"]))?.value).toContain('"recipes":2');
      expect(await importLegacyCommunity(db, images, legacy)).toBeNull();
      // Was die Datenbank schon hat, bleibt.
      const again = file("community-wieder", [{ id: "c-2", recipe: recipe("Andere Fassung"), authorId: "x1234567", authorName: "X", createdAt: "2026-11-22T10:00:00.000Z", likedBy: [] }]);
      expect(await importLegacyCommunity(db, images, again)).toMatchObject({ recipes: 0, skipped: 1 });
      expect((await community.list("x1234567")).find((r) => r.id === "c-2")?.recipe.name).toBe("Ohne Foto");
    });

    it("übernimmt data/feedback.json: Fotos als Dateien, Sterne und Meldungen", async () => {
      const { db, feedback, images } = await setup();
      const legacy = file("feedback", {
        photos: [
          { id: "p-1", recipeId: "shakshuka", authorId: "lena0001", authorName: "Lena", uri: JPEG(6), createdAt: "2026-11-20T10:00:00.000Z", ratings: { fan00001: 5, lena0001: 5, fan00002: 9 } },
          { id: "p-2", recipeId: "shakshuka", authorId: "tom00001", authorName: "Tom", uri: NOT_AN_IMAGE, createdAt: "2026-11-20T11:00:00.000Z", ratings: {} },
        ],
        recipeRatings: { kaiserschmarrn: { lena0001: 4, tom00001: 2 }, leer: {} },
        flags: [
          { id: "f-1", recipeId: "linsen_dal", authorId: "lena0001", reason: "image", note: "Restaurant", createdAt: "2026-11-21T10:00:00.000Z" },
          { id: "f-2", recipeId: "linsen_dal", authorId: "tom00001", reason: "unbekannt", note: "", createdAt: "2026-11-21T11:00:00.000Z" },
        ],
      });
      expect(await importLegacyFeedback(db, images, legacy)).toEqual({ photos: 1, ratings: 3, flags: 1, skipped: 2 });
      expect(existsSync(legacy)).toBe(false);
      const photos = await feedback.photos("shakshuka", "fan00001");
      expect(photos).toEqual([expect.objectContaining({ id: "p-1", authorName: "Lena", count: 1, avg: 5, myRating: 5 })]);
      expect(toDataUri((await images.get(imageKeyOf(photos[0]!.uri)!))!)).toBe(JPEG(6));
      expect(images.keys()).toHaveLength(1);
      expect(await feedback.recipeRatings("lena0001")).toEqual({ kaiserschmarrn: { avg: 3, count: 2, mine: 4 } });
      expect(await feedback.flagSummary()).toEqual([expect.objectContaining({ recipeId: "linsen_dal", count: 1, notes: ["Restaurant"] })]);
      expect(await importLegacyFeedback(db, images, legacy)).toBeNull();
    });

    it("übernimmt data/recipe-overrides.json – Änderungen der Datenbank gewinnen", async () => {
      const { db, overrides } = await setup();
      await overrides.set("shakshuka", { name: "Neuer in der Datenbank" }, "Chefin");
      const legacy = file("overrides", {
        shakshuka: { patch: { name: "Alt aus der Datei" }, updatedBy: "Chef", updatedAt: "2026-11-20T10:00:00.000Z" },
        linsen_dal: { patch: { hidden: true }, updatedBy: "Chef", updatedAt: "2026-11-20T10:00:00.000Z" },
        kaputt: { patch: "kein Objekt" },
      });
      expect(await importLegacyOverrides(db, legacy)).toEqual({ recipes: 1, skipped: 2 });
      expect(existsSync(legacy)).toBe(false);
      const all = await overrides.all();
      expect(all.shakshuka!.patch).toEqual({ name: "Neuer in der Datenbank" });
      expect(all.linsen_dal).toEqual({ patch: { hidden: true }, updatedBy: "Chef", updatedAt: "2026-11-20T10:00:00.000Z" });
    });

    it("lässt unlesbare Dateien liegen", async () => {
      const { db, images } = await setup();
      const broken = file("kaputt", "{ kein JSON");
      await expect(importLegacyCommunity(db, images, broken)).rejects.toThrow();
      await expect(importLegacyFeedback(db, images, broken)).rejects.toThrow();
      await expect(importLegacyOverrides(db, broken)).rejects.toThrow();
      const notAList = file("keine-liste", { recipes: [] });
      await expect(importLegacyCommunity(db, images, notAList)).rejects.toThrow("keine Liste");
      expect(existsSync(broken) && existsSync(notAList)).toBe(true);
    });
  });
});

describe("Fotos über die Schnittstelle", () => {
  const noAi = new Ai({ hasAnthropicKey: false, ollama: { url: "http://ollama.test", model: "gemma4:e4b", numCtx: 1024, timeoutMs: 1000 } }, async () => {
    throw new TypeError("offline");
  });
  const setup = () => {
    const images = new MemoryImageStore();
    const app = createApp({ images, ai: noAi, auth: { appleAudiences: [], googleAudiences: [], adminEmails: [], allowDevLogin: true }, passwordCost: { N: 1024, r: 8, p: 1 } });
    const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
      app.request(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json", "X-Device-Id": "geraet0bild01", ...headers } });
    return { images, call };
  };

  it("liefert Fotos als Bild mit langem Zwischenspeicher aus und löscht sie mit dem Foto", async () => {
    const { images, call } = setup();
    const res = await call("POST", "/api/recipes/shakshuka/photos", { authorName: "Lena", uri: JPEG(1) });
    expect(res.status).toBe(201);
    const photo = (await res.json()) as { id: string; uri: string };
    expect(photo.uri).toMatch(/^\/api\/images\/[0-9a-f-]{36}\.jpg$/);
    const image = await call("GET", photo.uri);
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/jpeg");
    expect(image.headers.get("Cache-Control")).toContain("immutable");
    expect(image.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await image.arrayBuffer()).toString("base64")).toBe(JPEG(1).split(",")[1]);
    expect((await call("DELETE", `/api/photos/${photo.id}`)).status).toBe(204);
    expect((await call("GET", photo.uri)).status).toBe(404);
    expect(images.keys()).toEqual([]);
  });

  it("lehnt Unbekanntes, Pfade und Nicht-Bilder ab", async () => {
    const { call } = setup();
    expect((await call("GET", `/api/images/${newImageKey("image/jpeg")}`)).status).toBe(404);
    expect((await call("GET", "/api/images/..%2F..%2Fpackage.json")).status).toBe(404);
    expect((await call("GET", "/api/images/foodtracker.db")).status).toBe(404);
    const res = await call("POST", "/api/recipes/shakshuka/photos", { uri: NOT_AN_IMAGE });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_image");
  });

  it("teilt Rezepte mit Foto als Pfad statt data-URI und löscht beim Löschen des Kontos die Bilder", async () => {
    const { images, call } = setup();
    const { token } = (await (await call("POST", "/api/auth/dev", { name: "Weg", email: "weg@example.com" })).json()) as { token: string };
    const auth = { Authorization: `Bearer ${token}` };
    const res = await call("POST", "/api/community/recipes", { authorName: "Weg", recipe: recipe("Mit Foto", { image: { uri: JPEG(2) } }) }, auth);
    expect(res.status).toBe(201);
    const shared = (await res.json()) as { recipe: Recipe };
    const uri = shared.recipe.media!.image!.uri;
    expect(uri).toMatch(/^\/api\/images\//);
    expect((await call("GET", uri)).status).toBe(200);
    const list = await (await call("GET", "/api/community/recipes")).text();
    expect(list).toContain(uri);
    expect(list).not.toContain("base64");
    await call("POST", "/api/recipes/shakshuka/photos", { uri: PNG }, auth);
    expect(images.keys()).toHaveLength(2);
    const exported = (await (await call("GET", "/api/auth/export", undefined, auth)).json()) as { photos: { uri: string }[]; community: { shared: { recipe: Recipe }[] } };
    expect(exported.photos[0]!.uri).toBe(PNG);
    expect(exported.community.shared[0]!.recipe.media!.image!.uri).toBe(JPEG(2));
    expect((await call("DELETE", "/api/auth/me", {}, auth)).status).toBe(204);
    expect(images.keys()).toEqual([]);
    expect((await call("GET", uri)).status).toBe(404);
  });
});
