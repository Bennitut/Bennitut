import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Recipe } from "../types.js";

export interface CommunityRecipe {
  id: string;
  recipe: Recipe;
  authorId: string;
  authorName: string;
  createdAt: string;
  /** Geräte-IDs, die das Rezept als Favorit markiert haben. */
  likedBy: string[];
}

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

/**
 * Einfacher Speicher für geteilte Rezepte in einer JSON-Datei.
 * Für den Betrieb mit vielen Nutzer:innen gehört das in eine Datenbank.
 */
export class CommunityStore {
  private recipes: CommunityRecipe[] = [];

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.recipes = JSON.parse(readFileSync(file, "utf8")) as CommunityRecipe[];
    } catch {
      this.recipes = [];
    }
  }

  list(deviceId: string, { sort = "popular", query = "" }: { sort?: "popular" | "new"; query?: string } = {}): CommunityRecipeView[] {
    const q = query.trim().toLowerCase();
    const matches = this.recipes.filter(
      (r) => !q || r.recipe.name.toLowerCase().includes(q) || r.authorName.toLowerCase().includes(q),
    );
    matches.sort((a, b) =>
      sort === "new" ? b.createdAt.localeCompare(a.createdAt) : b.likedBy.length - a.likedBy.length || b.createdAt.localeCompare(a.createdAt),
    );
    return matches.slice(0, 100).map((r) => this.view(r, deviceId));
  }

  publish(deviceId: string, authorName: string, recipe: Recipe): CommunityRecipeView {
    const id = randomUUID();
    const entry: CommunityRecipe = {
      id,
      recipe: { ...recipe, id: `community_${id}`, source: { kind: "community", communityId: id, author: authorName } },
      authorId: deviceId,
      authorName,
      createdAt: new Date().toISOString(),
      likedBy: [],
    };
    this.recipes.push(entry);
    this.save();
    return this.view(entry, deviceId);
  }

  toggleLike(deviceId: string, id: string): CommunityRecipeView | undefined {
    const entry = this.recipes.find((r) => r.id === id);
    if (!entry) return undefined;
    entry.likedBy = entry.likedBy.includes(deviceId)
      ? entry.likedBy.filter((d) => d !== deviceId)
      : [...entry.likedBy, deviceId];
    this.save();
    return this.view(entry, deviceId);
  }

  /** Nur die Person, die das Rezept geteilt hat, darf es zurückziehen. */
  remove(deviceId: string, id: string): boolean {
    const before = this.recipes.length;
    this.recipes = this.recipes.filter((r) => !(r.id === id && r.authorId === deviceId));
    if (this.recipes.length === before) return false;
    this.save();
    return true;
  }

  /** Für Admins: beliebiges geteiltes Rezept entfernen. */
  removeAsAdmin(id: string): boolean {
    const before = this.recipes.length;
    this.recipes = this.recipes.filter((r) => r.id !== id);
    if (this.recipes.length === before) return false;
    this.save();
    return true;
  }

  count(authorId: string): number {
    return this.recipes.filter((r) => r.authorId === authorId).length;
  }

  private view(r: CommunityRecipe, deviceId: string): CommunityRecipeView {
    return {
      id: r.id,
      recipe: r.recipe,
      authorName: r.authorName,
      createdAt: r.createdAt,
      likes: r.likedBy.length,
      likedByMe: r.likedBy.includes(deviceId),
      mine: r.authorId === deviceId,
    };
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.recipes));
    renameSync(tmp, this.file);
  }
}
