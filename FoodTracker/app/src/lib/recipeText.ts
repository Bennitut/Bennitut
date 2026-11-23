// Texte eines Rezepts je Sprache: reine Logik ohne Store und native Module, damit sie in Node testbar ist
// (test/recipeText.test.ts).
import type { Recipe, RecipeText } from "./types";

/**
 * Rezept mit den auf dem Gerät gespeicherten Texten: Übersetzungen von Claude (`translated`) und mit KI verbesserte
 * Texte (`improved`, je Sprache). Ein verbesserter Text ersetzt das Original, wenn er in der Sprache des Rezepts ist,
 * sonst die Übersetzung seiner Sprache.
 */
export function withStoredTexts(
  recipe: Recipe,
  translated?: Record<string, RecipeText>,
  improved?: Record<string, RecipeText>,
): Recipe {
  let r = translated ? { ...recipe, translations: { ...recipe.translations, ...translated } } : recipe;
  for (const [language, text] of Object.entries(improved ?? {})) {
    r =
      language === r.language
        ? { ...r, name: text.name, steps: text.steps ?? r.steps, otherIngredients: text.otherIngredients ?? r.otherIngredients }
        : { ...r, translations: { ...r.translations, [language]: text } };
  }
  return r;
}

/** Text eines Rezepts in der gewünschten Sprache, mit Fallback auf Englisch bzw. das Original. */
export function localizeRecipe(recipe: Recipe, language: string): Required<RecipeText> {
  const own = recipe.language === language ? undefined : recipe.translations?.[language];
  const english = recipe.language === "en" || language === recipe.language ? undefined : recipe.translations?.en;
  return {
    name: own?.name ?? english?.name ?? recipe.name,
    steps: own?.steps ?? english?.steps ?? recipe.steps,
    otherIngredients: own?.otherIngredients ?? english?.otherIngredients ?? recipe.otherIngredients,
  };
}

/** Ob Claude die Zubereitung noch in die Sprache übersetzen sollte. */
export function needsTranslation(recipe: Recipe, language: string): boolean {
  return recipe.language !== language && !recipe.translations?.[language]?.steps;
}
