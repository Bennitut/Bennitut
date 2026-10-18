import type { Ingredient, Nutrients, Recipe } from "./types";

/** Nährwerte einer Portion; Zutaten in g/ml beziehen sich auf 100, Stück auf 1. */
export function recipeNutrients(recipe: Recipe, ingredients: Map<string, Ingredient>): Nutrients {
  return recipe.ingredients.reduce(
    (sum, ri) => {
      const ingredient = ingredients.get(ri.ingredientId);
      if (!ingredient) return sum;
      const factor = ri.amount / (ingredient.unit === "stk" ? 1 : 100);
      return {
        kcal: sum.kcal + ingredient.nutrients.kcal * factor,
        protein: sum.protein + ingredient.nutrients.protein * factor,
        carbs: sum.carbs + ingredient.nutrients.carbs * factor,
        fat: sum.fat + ingredient.nutrients.fat * factor,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
