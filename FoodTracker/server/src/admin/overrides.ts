import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Recipe } from "../types.js";

/** Von Admins geänderte Felder eines Katalogrezepts. */
export type RecipePatch = Partial<Pick<Recipe, "name" | "steps" | "otherIngredients" | "translations" | "mealTypes" | "cookMinutes" | "ingredients" | "media">> & {
  /** Ausgeblendete Rezepte erscheinen nicht mehr im Katalog und werden nicht eingeplant. */
  hidden?: boolean;
};

export interface RecipeOverride {
  patch: RecipePatch;
  updatedBy: string;
  updatedAt: string;
}

/** Änderungen von Admins an Katalogrezepten, in einer JSON-Datei gespeichert. */
export class OverrideStore {
  private overrides: Record<string, RecipeOverride> = {};

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.overrides = JSON.parse(readFileSync(file, "utf8")) as Record<string, RecipeOverride>;
    } catch {
      // Noch keine Datei: leer starten.
    }
  }

  all(): Record<string, RecipeOverride> {
    return this.overrides;
  }

  set(recipeId: string, patch: RecipePatch, userName: string): RecipeOverride {
    const entry = { patch: { ...this.overrides[recipeId]?.patch, ...patch }, updatedBy: userName, updatedAt: new Date().toISOString() };
    this.overrides[recipeId] = entry;
    this.save();
    return entry;
  }

  remove(recipeId: string): boolean {
    if (!this.overrides[recipeId]) return false;
    delete this.overrides[recipeId];
    this.save();
    return true;
  }

  /** Katalog mit allen Änderungen; ausgeblendete Rezepte fallen weg. */
  apply(recipes: Recipe[]): Recipe[] {
    return applyOverrides(recipes, this.overrides);
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.overrides));
    renameSync(tmp, this.file);
  }
}

/** Auch in der App genutzt, damit offline geplante Pläne dieselben Rezepte verwenden. */
export function applyOverrides(recipes: Recipe[], overrides: Record<string, RecipeOverride>): Recipe[] {
  return recipes.flatMap((recipe) => {
    const entry = overrides[recipe.id];
    if (!entry) return [recipe];
    const { hidden, ...patch } = entry.patch;
    if (hidden) return [];
    return [{ ...recipe, ...patch, translations: { ...recipe.translations, ...patch.translations } }];
  });
}
