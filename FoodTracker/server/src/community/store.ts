import { randomUUID } from "node:crypto";
import { nowIso } from "../storage/clock.js";
import { batches, placeholders, type Db, type Queryable } from "../storage/db.js";
import { decodeDataUri, imageKeyOf, imageUri, newImageKey, toDataUri, type ImageStore } from "../storage/images.js";
import type { Recipe } from "../types.js";

/** Antwort an Clients: ohne fremde Geräte-IDs. */
export interface CommunityRecipeView {
  id: string;
  recipe: Recipe;
  authorName: string;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
  mine: boolean;
}

interface Row {
  id: string;
  author: string;
  author_name: string;
  name: string;
  created_at: string;
  image_key: string | null;
}

const COLUMNS = "id, author, author_name, name, created_at, image_key";
/** Höchstens so viele Rezepte pro Liste. */
const LIST_LIMIT = 100;

export const INSERT_COMMUNITY_RECIPE =
  "INSERT INTO community_recipes (id, author, author_name, name, created_at, recipe, image_key) VALUES (?, ?, ?, ?, ?, ?, ?)";

type RecipeImage = NonNullable<NonNullable<Recipe["media"]>["image"]>;

/**
 * Das Foto eines Rezepts zum Teilen in den Bildspeicher legen: Ein eigenes Foto (data-URI) und ein Foto aus dem
 * Bildspeicher (Kopie eines Community-Rezepts) bekommen eine eigene Datei – so bleibt es, auch wenn das Original
 * gelöscht wird. Fotos im Netz (Katalog, Vorschaubild eines Imports) bleiben verlinkt; alles andere fällt weg (z. B. eine
 * Datei auf dem Gerät, die andere nicht öffnen können). Liefert das Rezept mit dem neuen Pfad und den Schlüssel.
 */
export async function storeRecipeImage(images: ImageStore, recipe: Recipe): Promise<{ recipe: Recipe; imageKey: string | null }> {
  const image = recipe.media?.image;
  if (!image) return { recipe, imageKey: null };
  const withImage = (next: RecipeImage | undefined): Recipe => {
    const { image: _old, ...media } = recipe.media!;
    return { ...recipe, media: next ? { ...media, image: next } : media };
  };
  if (/^https:\/\//i.test(image.uri)) return { recipe, imageKey: null };
  const existingKey = imageKeyOf(image.uri);
  const stored = existingKey ? await images.get(existingKey) : decodeDataUri(image.uri);
  if (!stored) return { recipe: withImage(undefined), imageKey: null };
  const key = newImageKey(stored.type);
  await images.put(key, stored);
  // Der Pfad zum Foto im Bildspeicher des eigenen Kontos (nur für den Abgleich, siehe types.ts) geht nicht an andere.
  const { server: _own, ...shared } = image;
  return { recipe: withImage({ ...shared, uri: imageUri(key) }), imageKey: key };
}

/** Bilder erst nach der Transaktion löschen: Scheitert sie, bleibt alles, wie es war. */
async function deleteImages(images: ImageStore, keys: readonly (string | null)[]) {
  for (const key of keys) if (key) await images.delete(key).catch(() => undefined);
}

/**
 * Geteilte Rezepte und ihre Favoriten in der Datenbank (Tabellen community_recipes und community_likes, Migration 3),
 * eigene Fotos der Rezepte im Bildspeicher. Bis 27.11.2026 lag alles in `data/community.json` (Umzug in
 * storage/legacy.ts). `actor` ist „user:<Konto-ID>“ oder die Geräte-ID ohne Konto.
 */
export class CommunityStore {
  constructor(
    private readonly db: Db,
    private readonly images: ImageStore,
  ) {}

  async list(actor: string, { sort = "popular", query = "" }: { sort?: "popular" | "new"; query?: string } = {}): Promise<CommunityRecipeView[]> {
    const q = query.trim().toLowerCase();
    const rows = await this.db.all<Row>(`SELECT ${COLUMNS} FROM community_recipes`);
    const likes = await this.likeCounts();
    const mine = new Set((await this.db.all<{ recipe_id: string }>("SELECT recipe_id FROM community_likes WHERE actor = ?", [actor])).map((r) => r.recipe_id));
    const matches = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.author_name.toLowerCase().includes(q));
    const count = (r: Row) => likes.get(r.id) ?? 0;
    matches.sort((a, b) =>
      sort === "new" ? b.created_at.localeCompare(a.created_at) : count(b) - count(a) || b.created_at.localeCompare(a.created_at),
    );
    const page = matches.slice(0, LIST_LIMIT);
    // Das Rezept selbst nur für die gezeigten lesen.
    const recipes = new Map<string, Recipe>();
    for (const batch of batches(page.map((r) => r.id))) {
      const found = await this.db.all<{ id: string; recipe: string }>(`SELECT id, recipe FROM community_recipes WHERE id IN (${placeholders(batch)})`, batch);
      for (const r of found) recipes.set(r.id, JSON.parse(r.recipe) as Recipe);
    }
    return page.filter((r) => recipes.has(r.id)).map((r) => this.view(r, recipes.get(r.id)!, count(r), mine.has(r.id), actor));
  }

  async publish(actor: string, authorName: string, recipe: Recipe): Promise<CommunityRecipeView> {
    const id = randomUUID();
    const stored = await storeRecipeImage(this.images, recipe);
    const shared: Recipe = { ...stored.recipe, id: `community_${id}`, source: { kind: "community", communityId: id, author: authorName } };
    const row: Row = { id, author: actor, author_name: authorName, name: shared.name, created_at: nowIso(), image_key: stored.imageKey };
    try {
      await this.db.run(INSERT_COMMUNITY_RECIPE, [row.id, row.author, row.author_name, row.name, row.created_at, JSON.stringify(shared), row.image_key]);
    } catch (e) {
      await deleteImages(this.images, [stored.imageKey]);
      throw e;
    }
    return this.view(row, shared, 0, false, actor);
  }

  async toggleLike(actor: string, id: string): Promise<CommunityRecipeView | undefined> {
    return this.db.transaction(async (tx) => {
      const row = await tx.get<Row & { recipe: string }>(`SELECT ${COLUMNS}, recipe FROM community_recipes WHERE id = ?`, [id]);
      if (!row) return undefined;
      const removed = await tx.run("DELETE FROM community_likes WHERE recipe_id = ? AND actor = ?", [id, actor]);
      if (removed === 0) await tx.run("INSERT INTO community_likes (recipe_id, actor, created_at) VALUES (?, ?, ?)", [id, actor, nowIso()]);
      const likes = Number((await tx.get<{ n: number | string }>("SELECT COUNT(*) AS n FROM community_likes WHERE recipe_id = ?", [id]))?.n ?? 0);
      return this.view(row, JSON.parse(row.recipe) as Recipe, likes, removed === 0, actor);
    });
  }

  /** Nur die Person, die das Rezept geteilt hat, darf es zurückziehen. */
  remove(actor: string, id: string): Promise<boolean> {
    return this.removeWhere("id = ? AND author = ?", [id, actor]);
  }

  /** Für Admins: beliebiges geteiltes Rezept entfernen. */
  removeAsAdmin(id: string): Promise<boolean> {
    return this.removeWhere("id = ?", [id]);
  }

  /** Geteilte Rezepte je Konto bzw. Gerät – für Nutzerverzeichnis und Admin-Bereich. */
  async countsByAuthor(): Promise<Map<string, number>> {
    const rows = await this.db.all<{ author: string; n: number | string }>("SELECT author, COUNT(*) AS n FROM community_recipes GROUP BY author");
    return new Map(rows.map((r) => [r.author, Number(r.n)]));
  }

  /** Für „Meine Daten exportieren“: selbst geteilte Rezepte (das eigene Foto wieder als data-URI) und Favoriten. */
  async exportFor(actor: string) {
    const rows = await this.db.all<Row & { recipe: string }>(`SELECT ${COLUMNS}, recipe FROM community_recipes WHERE author = ? ORDER BY created_at, id`, [actor]);
    const likes = await this.likeCounts();
    const shared = [];
    for (const r of rows) {
      let recipe = JSON.parse(r.recipe) as Recipe;
      const image = r.image_key ? await this.images.get(r.image_key) : undefined;
      if (image && recipe.media?.image) recipe = { ...recipe, media: { ...recipe.media, image: { ...recipe.media.image, uri: toDataUri(image) } } };
      shared.push({ id: r.id, recipe, authorName: r.author_name, createdAt: r.created_at, likes: likes.get(r.id) ?? 0 });
    }
    const liked = await this.db.all<{ recipe_id: string }>("SELECT recipe_id FROM community_likes WHERE actor = ? ORDER BY created_at, recipe_id", [actor]);
    return { shared, liked: liked.map((r) => r.recipe_id) };
  }

  /**
   * Beim Anmelden: Was ein Gerät ohne Konto geteilt und als Favorit markiert hat, gehört danach dem Konto – ein
   * Favorit, den das Konto schon hat, zählt nicht doppelt. Liefert, wie viele Rezepte und Favoriten übernommen wurden.
   */
  async transferActor(from: string, to: string): Promise<{ recipes: number; likes: number }> {
    if (from === to) return { recipes: 0, likes: 0 };
    return this.db.transaction(async (tx) => {
      const recipes = await tx.run("UPDATE community_recipes SET author = ? WHERE author = ?", [to, from]);
      const already = new Set((await tx.all<{ recipe_id: string }>("SELECT recipe_id FROM community_likes WHERE actor = ?", [to])).map((r) => r.recipe_id));
      let likes = 0;
      for (const { recipe_id } of await tx.all<{ recipe_id: string }>("SELECT recipe_id FROM community_likes WHERE actor = ?", [from])) {
        if (already.has(recipe_id)) {
          await tx.run("DELETE FROM community_likes WHERE recipe_id = ? AND actor = ?", [recipe_id, from]);
        } else {
          await tx.run("UPDATE community_likes SET actor = ? WHERE recipe_id = ? AND actor = ?", [to, recipe_id, from]);
          likes++;
        }
      }
      return { recipes, likes };
    });
  }

  /** Beim Löschen eines Kontos: geteilte Rezepte (mit Fotos) entfernen und Favoriten zurücknehmen. */
  async removeActor(actor: string): Promise<void> {
    const keys = await this.db.transaction(async (tx) => {
      const rows = await tx.all<{ id: string; image_key: string | null }>("SELECT id, image_key FROM community_recipes WHERE author = ?", [actor]);
      await deleteLikes(tx, rows.map((r) => r.id));
      await tx.run("DELETE FROM community_recipes WHERE author = ?", [actor]);
      await tx.run("DELETE FROM community_likes WHERE actor = ?", [actor]);
      return rows.map((r) => r.image_key);
    });
    await deleteImages(this.images, keys);
  }

  private async removeWhere(where: string, params: string[]): Promise<boolean> {
    const removed = await this.db.transaction(async (tx) => {
      const row = await tx.get<{ id: string; image_key: string | null }>(`SELECT id, image_key FROM community_recipes WHERE ${where}`, params);
      if (!row) return undefined;
      await deleteLikes(tx, [row.id]);
      await tx.run("DELETE FROM community_recipes WHERE id = ?", [row.id]);
      return row;
    });
    if (!removed) return false;
    await deleteImages(this.images, [removed.image_key]);
    return true;
  }

  private async likeCounts(): Promise<Map<string, number>> {
    const rows = await this.db.all<{ recipe_id: string; n: number | string }>("SELECT recipe_id, COUNT(*) AS n FROM community_likes GROUP BY recipe_id");
    return new Map(rows.map((r) => [r.recipe_id, Number(r.n)]));
  }

  private view(r: Row, recipe: Recipe, likes: number, likedByMe: boolean, actor: string): CommunityRecipeView {
    return { id: r.id, recipe, authorName: r.author_name, createdAt: r.created_at, likes, likedByMe, mine: r.author === actor };
  }
}

/** Favoriten zu diesen Rezepten löschen (vor dem Rezept selbst – die Datenbank verlangt es so). */
async function deleteLikes(tx: Queryable, recipeIds: readonly string[]) {
  for (const batch of batches(recipeIds)) await tx.run(`DELETE FROM community_likes WHERE recipe_id IN (${placeholders(batch)})`, batch);
}
