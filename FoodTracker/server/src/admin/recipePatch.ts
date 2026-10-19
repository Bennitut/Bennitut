import type { Recipe } from "../types.js";

// Ohne Node-Abhängigkeiten, damit auch die App diese Datei nutzen kann.

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
