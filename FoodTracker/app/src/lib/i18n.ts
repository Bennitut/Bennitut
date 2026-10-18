import { useMemo } from "react";
import { contentLocale, formatNumber, formatPrice, regionalize, translate, type TKey } from "../i18n";
import { ApiError } from "./api";
import { useStore } from "./store";
import type { Ingredient, MealType, Recipe, RecipeText } from "./types";

type Unit = Ingredient["unit"];

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

export function useI18n() {
  const { settings, ingredients } = useStore();
  const { language, region } = settings;

  return useMemo(() => {
    const t = (key: TKey, params?: Record<string, string | number>) => regionalize(translate(language, key, params), language, region);
    const locale = contentLocale(language, region);
    const ingredientName = (id: string) => {
      const ingredient = ingredients.get(id);
      if (!ingredient) return id;
      const names = ingredient.name as Record<string, string | undefined>;
      return regionalize(names[locale] ?? names[language] ?? names.en ?? ingredient.name.de, language, region);
    };
    const unit = (u: Unit) => t(`units.${u}`);
    const amount = (value: number, u: Unit) => `${formatNumber(value, language)} ${unit(u)}`;
    return {
      t,
      language,
      region,
      ingredientName,
      unit,
      amount,
      mealType: (m: MealType) => t(`mealTypes.${m}`),
      price: (eur: number) => formatPrice(eur, language, region),
      number: (value: number) => formatNumber(value, language),
      recipe: (recipe: Recipe) => {
        const text = localizeRecipe(recipe, language);
        return {
          name: regionalize(text.name, language, region),
          steps: text.steps.map((s) => regionalize(s, language, region)),
          otherIngredients: text.otherIngredients.map((s) => regionalize(s, language, region)),
        };
      },
      /** Fehlermeldung zu einem Fehler aus der API. */
      error: (e: unknown) => {
        const code = e instanceof ApiError ? e.code : "internal";
        const key = `errors.${code}` as TKey;
        const text = translate(language, key);
        return regionalize(text === key ? translate(language, "errors.internal") : text, language, region);
      },
    };
  }, [language, region, ingredients]);
}

export type I18n = ReturnType<typeof useI18n>;
