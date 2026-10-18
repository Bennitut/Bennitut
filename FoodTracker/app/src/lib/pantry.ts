import type { Nutrients, PantryItem, PlannedMeal, Recipe } from "./types";

export function addToPantry(pantry: PantryItem[], items: PantryItem[]): PantryItem[] {
  const amounts = new Map(pantry.map((p) => [p.ingredientId, p.amount]));
  for (const item of items) amounts.set(item.ingredientId, (amounts.get(item.ingredientId) ?? 0) + item.amount);
  return toList(amounts);
}

/** Zieht die Zutaten eines gekochten Gerichts (inkl. Resteverwertung) vom Vorrat ab. */
export function consumeMeal(pantry: PantryItem[], meal: PlannedMeal, recipe: Recipe): PantryItem[] {
  const amounts = new Map(pantry.map((p) => [p.ingredientId, p.amount]));
  const used = [
    ...recipe.ingredients.map((ri) => ({ ingredientId: ri.ingredientId, amount: ri.amount * meal.portions })),
    ...meal.extras.map((e) => ({ ingredientId: e.ingredientId, amount: e.amount })),
  ];
  for (const u of used) {
    if (amounts.has(u.ingredientId)) amounts.set(u.ingredientId, amounts.get(u.ingredientId)! - u.amount);
  }
  return toList(amounts);
}

function toList(amounts: Map<string, number>): PantryItem[] {
  return [...amounts]
    .filter(([, amount]) => amount > 0.01)
    .map(([ingredientId, amount]) => ({ ingredientId, amount: Math.round(amount * 10) / 10 }));
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce(
    (s, n) => ({ kcal: s.kcal + n.kcal, protein: s.protein + n.protein, carbs: s.carbs + n.carbs, fat: s.fat + n.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const nowTime = () => new Date().toTimeString().slice(0, 5);
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
