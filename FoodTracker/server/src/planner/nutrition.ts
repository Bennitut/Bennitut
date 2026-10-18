import type { Ingredient, Nutrients, Recipe } from "../types.js";

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function addNutrients(a: Nutrients, b: Nutrients, factor = 1): Nutrients {
  return {
    kcal: a.kcal + b.kcal * factor,
    protein: a.protein + b.protein * factor,
    carbs: a.carbs + b.carbs * factor,
    fat: a.fat + b.fat * factor,
  };
}

/** Nährwerte für `amount` einer Zutat (g/ml beziehen sich auf 100, Stück auf 1). */
export function nutrientsFor(ingredient: Ingredient, amount: number): Nutrients {
  const base = ingredient.unit === "stk" ? 1 : 100;
  return addNutrients(ZERO, ingredient.nutrients, amount / base);
}

export function recipeNutrients(recipe: Recipe, ingredients: Map<string, Ingredient>): Nutrients {
  return recipe.ingredients.reduce((sum, ri) => {
    const ingredient = ingredients.get(ri.ingredientId);
    if (!ingredient) throw new Error(`Unbekannte Zutat ${ri.ingredientId} in Rezept ${recipe.id}`);
    return addNutrients(sum, nutrientsFor(ingredient, ri.amount));
  }, ZERO);
}

export function roundNutrients(n: Nutrients): Nutrients {
  return {
    kcal: Math.round(n.kcal),
    protein: Math.round(n.protein * 10) / 10,
    carbs: Math.round(n.carbs * 10) / 10,
    fat: Math.round(n.fat * 10) / 10,
  };
}
