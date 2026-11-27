import type { Db } from "../storage/db.js";
import type { Recipe } from "../types.js";
import { applyOverrides, type RecipeOverride, type RecipePatch } from "./recipePatch.js";

export { applyOverrides, type RecipeOverride, type RecipePatch };

interface Row {
  recipe_id: string;
  patch: string;
  updated_by: string;
  updated_at: string;
}

const UPSERT =
  "INSERT INTO recipe_overrides (recipe_id, patch, updated_by, updated_at) VALUES (?, ?, ?, ?) " +
  "ON CONFLICT (recipe_id) DO UPDATE SET patch = excluded.patch, updated_by = excluded.updated_by, updated_at = excluded.updated_at";
export const INSERT_OVERRIDE = "INSERT INTO recipe_overrides (recipe_id, patch, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING";

/**
 * Änderungen von Admins an Katalogrezepten in der Datenbank (Tabelle recipe_overrides, Migration 3). Bis 27.11.2026
 * lagen sie in `data/recipe-overrides.json` (Umzug in storage/legacy.ts).
 */
export class OverrideStore {
  constructor(private readonly db: Db) {}

  async all(): Promise<Record<string, RecipeOverride>> {
    const rows = await this.db.all<Row>("SELECT recipe_id, patch, updated_by, updated_at FROM recipe_overrides ORDER BY recipe_id");
    return Object.fromEntries(rows.map((r) => [r.recipe_id, { patch: JSON.parse(r.patch) as RecipePatch, updatedBy: r.updated_by, updatedAt: r.updated_at }]));
  }

  /** Ergänzt die schon geänderten Felder um `patch` (was dort steht, gewinnt). */
  async set(recipeId: string, patch: RecipePatch, userName: string): Promise<RecipeOverride> {
    return this.db.transaction(async (tx) => {
      const current = await tx.get<Row>("SELECT patch FROM recipe_overrides WHERE recipe_id = ?", [recipeId]);
      const entry: RecipeOverride = {
        patch: { ...(current ? (JSON.parse(current.patch) as RecipePatch) : {}), ...patch },
        updatedBy: userName,
        updatedAt: new Date().toISOString(),
      };
      await tx.run(UPSERT, [recipeId, JSON.stringify(entry.patch), entry.updatedBy, entry.updatedAt]);
      return entry;
    });
  }

  /** Beim Löschen eines Admin-Kontos: dessen Namen aus „zuletzt geändert von“ entfernen. */
  async anonymize(userName: string): Promise<void> {
    await this.db.run("UPDATE recipe_overrides SET updated_by = ? WHERE updated_by = ?", ["Gelöschtes Konto", userName]);
  }

  async remove(recipeId: string): Promise<boolean> {
    return (await this.db.run("DELETE FROM recipe_overrides WHERE recipe_id = ?", [recipeId])) > 0;
  }

  /** Katalog mit allen Änderungen; ausgeblendete Rezepte fallen weg. */
  async apply(recipes: Recipe[]): Promise<Recipe[]> {
    return applyOverrides(recipes, await this.all());
  }
}
