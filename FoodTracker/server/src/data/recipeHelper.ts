import type { MealType, Recipe } from "../types.js";

type Names = [de: string, en: string, fr: string, it: string, es: string];

/**
 * Rezept mit Mengen pro Portion. Schritte gibt es auf Deutsch und Englisch;
 * andere Sprachen übersetzt Claude bei Bedarf.
 */
export function recipe(
  id: string,
  [de, en, fr, it, es]: Names,
  mealTypes: MealType[],
  cookMinutes: number,
  ingredients: Record<string, number>,
  steps: { de: string[]; en: string[] },
  other: { de: string[]; en: string[] } = { de: [], en: [] },
): Recipe {
  return {
    id,
    language: "de",
    name: de,
    steps: steps.de,
    otherIngredients: other.de,
    translations: { en: { name: en, steps: steps.en, otherIngredients: other.en }, fr: { name: fr }, it: { name: it }, es: { name: es } },
    mealTypes,
    ingredients: Object.entries(ingredients).map(([ingredientId, amount]) => ({ ingredientId, amount })),
    cookMinutes,
    tags: [],
    source: { kind: "katalog" },
  };
}
