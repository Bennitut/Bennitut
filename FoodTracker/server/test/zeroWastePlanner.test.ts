import { describe, expect, it } from "vitest";
import { INGREDIENTS, RECIPES, ingredientById } from "../src/data/catalog.js";
import { planMeals } from "../src/planner/zeroWastePlanner.js";
import type { PlanRequest } from "../src/types.js";

const baseRequest: PlanRequest = {
  days: 7,
  people: 2,
  kcalPerPersonPerDay: 2000,
  mealTypes: ["breakfast", "lunch", "dinner"],
  pantry: [],
  excludeTags: [],
  maxRepeats: 3,
};

const plan = (overrides: Partial<PlanRequest> = {}) =>
  planMeals({ request: { ...baseRequest, ...overrides }, recipes: RECIPES, ingredients: ingredientById });

describe("planMeals", () => {
  it("füllt jede Mahlzeit jedes Tages", () => {
    const result = plan();
    expect(result.meals).toHaveLength(21);
    for (const meal of result.meals) {
      const recipe = RECIPES.find((r) => r.id === meal.recipeId)!;
      expect(recipe.mealTypes).toContain(meal.mealType);
    }
  });

  it("hält verderbliche Reste unter 5 %", () => {
    expect(plan().wasteRatio).toBeLessThan(0.05);
    expect(plan({ people: 1 }).wasteRatio).toBeLessThan(0.05);
  });

  it("kauft genug ein, um den Plan zu kochen", () => {
    const result = plan();
    for (const item of result.shoppingList) {
      expect(item.packs * item.packSize + item.fromPantry).toBeGreaterThanOrEqual(item.needed - 1e-6);
    }
  });

  it("trifft den Kalorienbedarf auch nach der Resteverwertung", () => {
    for (const people of [1, 2, 4]) {
      for (const kcal of plan({ people }).dailyKcalPerPerson) {
        expect(kcal).toBeGreaterThan(1700);
        expect(kcal).toBeLessThanOrEqual(2000 * 1.15 + 1);
      }
    }
  });

  it("plant nichts nach Ablauf der Haltbarkeit", () => {
    const result = plan();
    expect(result.spoilageWarnings).toEqual([]);
    for (const meal of result.meals) {
      const recipe = RECIPES.find((r) => r.id === meal.recipeId)!;
      for (const ri of recipe.ingredients) {
        const ingredient = INGREDIENTS.find((i) => i.id === ri.ingredientId)!;
        const fromPantryOnly = result.shoppingList.find((s) => s.ingredientId === ri.ingredientId)!.packs === 0;
        if (!fromPantryOnly) expect(meal.day).toBeLessThan(ingredient.shelfLifeDays);
      }
    }
  });

  it("respektiert ausgeschlossene Tags", () => {
    const result = plan({ excludeTags: ["fleisch", "fisch"] });
    for (const meal of result.meals) {
      const recipe = RECIPES.find((r) => r.id === meal.recipeId)!;
      expect(recipe.tags).not.toContain("fleisch");
      expect(recipe.tags).not.toContain("fisch");
    }
  });

  it("begrenzt Wiederholungen", () => {
    const counts = new Map<string, number>();
    for (const meal of plan().meals) counts.set(meal.recipeId, (counts.get(meal.recipeId) ?? 0) + 1);
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(3);
  });

  it("verbraucht verderbliche Vorräte zuerst", () => {
    const result = plan({ pantry: [{ ingredientId: "spinat", amount: 150 }] });
    expect(result.unusedPantry).toEqual([]);
    const spinat = result.shoppingList.find((s) => s.ingredientId === "spinat");
    expect(spinat?.fromPantry).toBeGreaterThan(0);
  });

  it("ist bei gleichem Seed reproduzierbar", () => {
    expect(plan({ seed: 7 })).toEqual(plan({ seed: 7 }));
  });

  it("meldet einen Fehler, wenn für eine Mahlzeit kein Rezept passt", () => {
    expect(() => plan({ excludeTags: ["vegetarisch"], mealTypes: ["breakfast"] })).toThrow(/breakfast/);
  });
});
