import { describe, expect, it } from "vitest";
import { INGREDIENTS, RECIPES, ingredientById } from "../src/data/catalog.js";
import { PlanError, keepsAfterPlan, planMeals } from "../src/planner/zeroWastePlanner.js";
import type { PlanRequest, Recipe } from "../src/types.js";

const baseRequest: PlanRequest = {
  days: 7,
  people: 2,
  kcalPerPersonPerDay: 2000,
  mealTypes: ["breakfast", "lunch", "dinner"],
  pantry: [],
  diet: "alles",
  allergens: [],
  excludeIngredients: [],
  maxCookMinutes: 0,
  favoriteRecipeIds: [],
  locked: [],
  maxRepeats: 3,
};

const plan = (overrides: Partial<PlanRequest> = {}, extraRecipes: Recipe[] = []) =>
  planMeals({ request: { ...baseRequest, ...overrides }, recipes: [...RECIPES, ...extraRecipes], ingredients: ingredientById });

const recipeOf = (id: string, extra: Recipe[] = []) => [...RECIPES, ...extra].find((r) => r.id === id)!;
const ingredientsOf = (id: string, extra: Recipe[] = []) =>
  recipeOf(id, extra).ingredients.map((ri) => ingredientById.get(ri.ingredientId)!);

describe("planMeals", () => {
  it("füllt jede Mahlzeit jedes Tages", () => {
    const result = plan();
    expect(result.meals).toHaveLength(21);
    for (const meal of result.meals) expect(recipeOf(meal.recipeId).mealTypes).toContain(meal.mealType);
  });

  it("hält verderbliche Reste unter 5 %", () => {
    for (const people of [1, 2, 4]) expect(plan({ people }).wasteRatio).toBeLessThan(0.05);
  });

  it("kauft genug ein, um den Plan zu kochen", () => {
    for (const item of plan().shoppingList) {
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
      for (const ingredient of ingredientsOf(meal.recipeId)) {
        const bought = result.shoppingList.find((s) => s.ingredientId === ingredient.id)!.packs > 0;
        if (bought) expect(meal.day).toBeLessThan(ingredient.shelfLifeDays);
      }
    }
  });

  it("respektiert die Ernährungsform", () => {
    for (const meal of plan({ diet: "vegan" }).meals) {
      expect(ingredientsOf(meal.recipeId).every((i) => i.diet === "vegan")).toBe(true);
    }
    for (const meal of plan({ diet: "vegetarisch" }).meals) {
      expect(ingredientsOf(meal.recipeId).some((i) => i.diet === "fleisch" || i.diet === "fisch")).toBe(false);
    }
  });

  it("lässt Allergene, ungeliebte Zutaten und lange Rezepte weg", () => {
    const result = plan({ allergens: ["gluten", "laktose"], excludeIngredients: ["kartoffeln"], maxCookMinutes: 30 });
    for (const meal of result.meals) {
      const ingredients = ingredientsOf(meal.recipeId);
      expect(ingredients.some((i) => i.allergens.includes("gluten") || i.allergens.includes("laktose"))).toBe(false);
      expect(ingredients.some((i) => i.id === "kartoffeln")).toBe(false);
      expect(recipeOf(meal.recipeId).cookMinutes).toBeLessThanOrEqual(30);
    }
  });

  it("begrenzt Wiederholungen", () => {
    const counts = new Map<string, number>();
    for (const meal of plan().meals) counts.set(meal.recipeId, (counts.get(meal.recipeId) ?? 0) + 1);
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(3);
  });

  it("plant Lieblingsrezepte ein, ohne die Woche damit zu füllen", () => {
    for (const favorite of ["linsen_bolognese", "polenta_pilze", "thai_curry_garnelen", "rote_bete_salat"]) {
      const result = plan({ favoriteRecipeIds: [favorite] });
      const count = result.meals.filter((m) => m.recipeId === favorite).length;
      expect(count, favorite).toBeGreaterThanOrEqual(1);
      expect(count, favorite).toBeLessThanOrEqual(3);
      expect(result.wasteRatio).toBeLessThan(0.05);
    }
  });

  it("plant gut bewertete Rezepte öfter und schlecht bewertete seltener ein", () => {
    const ids = RECIPES.filter((r) => r.mealTypes.includes("dinner")).map((r) => r.id);
    const loved = ids.slice(0, 15);
    const disliked = ids.slice(15, 30);
    const ratings = Object.fromEntries([...loved.map((id) => [id, 5]), ...disliked.map((id) => [id, 1])]);
    const count = (meals: { recipeId: string }[], set: string[]) => meals.filter((m) => set.includes(m.recipeId)).length;
    const neutral = plan().meals;
    const rated = plan({ recipeRatings: ratings }).meals;
    expect(count(rated, loved)).toBeGreaterThan(count(neutral, loved));
    expect(count(rated, disliked)).toBeLessThanOrEqual(count(neutral, disliked));
  });

  it("behält fixierte Gerichte und plant den Rest drumherum", () => {
    const locked = [
      { day: 0, mealType: "dinner" as const, recipeId: "spaghetti_bolognese" },
      { day: 3, mealType: "breakfast" as const, recipeId: "pancakes" },
    ];
    const result = plan({ locked, diet: "vegetarisch" });
    for (const lock of locked) {
      const meal = result.meals.find((m) => m.day === lock.day && m.mealType === lock.mealType)!;
      expect(meal.recipeId).toBe(lock.recipeId);
      expect(meal.locked).toBe(true);
    }
    expect(result.meals.filter((m) => m.locked)).toHaveLength(2);
  });

  it("verwendet eigene Rezepte", () => {
    const own: Recipe = {
      id: "eigen_test",
      language: "de",
      name: "Omas Kartoffelsalat",
      steps: [],
      otherIngredients: [],
      mealTypes: ["lunch"],
      ingredients: [{ ingredientId: "kartoffeln", amount: 300 }, { ingredientId: "gurke", amount: 0.5 }],
      cookMinutes: 30,
      tags: [],
      source: { kind: "eigen" },
    };
    const result = plan({ favoriteRecipeIds: [own.id] }, [own]);
    expect(result.meals.some((m) => m.recipeId === own.id)).toBe(true);
  });

  it("verbraucht verderbliche Vorräte zuerst", () => {
    const result = plan({ pantry: [{ ingredientId: "spinat", amount: 150 }] });
    expect(result.unusedPantry).toEqual([]);
    expect(result.shoppingList.find((s) => s.ingredientId === "spinat")?.fromPantry).toBeGreaterThan(0);
  });

  it("ist bei gleichem Seed reproduzierbar", () => {
    expect(plan({ seed: 7 })).toEqual(plan({ seed: 7 }));
  });

  it("meldet, wenn für eine Mahlzeit kein Rezept passt", () => {
    expect(() => plan({ diet: "vegan", maxCookMinutes: 1, mealTypes: ["breakfast"] })).toThrow(PlanError);
  });

  it("meldet unbekannte fixierte Rezepte", () => {
    expect(() => plan({ locked: [{ day: 0, mealType: "lunch", recipeId: "gibts_nicht" }] })).toThrow(/unknown_locked_recipe/);
  });
});

describe("Katalog", () => {
  it("hat eindeutige IDs und vollständige Namen in allen Sprachen", () => {
    expect(new Set(INGREDIENTS.map((i) => i.id)).size).toBe(INGREDIENTS.length);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const i of INGREDIENTS) for (const lang of ["de", "en", "fr", "it", "es"] as const) expect(i.name[lang]).toBeTruthy();
    for (const r of RECIPES) {
      expect(r.steps.length).toBeGreaterThan(0);
      expect(r.translations?.en?.steps).toHaveLength(r.steps.length);
      for (const lang of ["en", "fr", "it", "es"]) expect(r.translations?.[lang]?.name).toBeTruthy();
    }
  });

  it("verwendet in Rezepten nur bekannte Zutaten mit plausiblen Mengen", () => {
    for (const r of RECIPES) {
      for (const ri of r.ingredients) {
        const ingredient = ingredientById.get(ri.ingredientId);
        expect(ingredient, `${r.id}/${ri.ingredientId}`).toBeDefined();
        expect(ri.amount).toBeGreaterThan(0);
        expect(ri.amount).toBeLessThanOrEqual(ingredient!.unit === "stk" ? 6 : 500);
      }
    }
  });

  it("hat plausible Nährwerte (Makros passen zu den Kalorien)", () => {
    for (const i of INGREDIENTS) {
      const { kcal, protein, carbs, fat } = i.nutrients;
      const estimate = protein * 4 + carbs * 4 + fat * 9;
      // Ballaststoffe und Rundung erlauben Abweichungen.
      expect(Math.abs(estimate - kcal), i.id).toBeLessThanOrEqual(Math.max(25, kcal * 0.25));
    }
  });

  it("zählt Reste geöffneter Dosen als verderblich, Reis und Karotten als Vorrat", () => {
    expect(keepsAfterPlan(ingredientById.get("kokosmilch")!, 7)).toBe(false);
    expect(keepsAfterPlan(ingredientById.get("milch")!, 7)).toBe(false);
    expect(keepsAfterPlan(ingredientById.get("reis")!, 7)).toBe(true);
    expect(keepsAfterPlan(ingredientById.get("karotten")!, 7)).toBe(true);
    expect(keepsAfterPlan(ingredientById.get("karotten")!, 15)).toBe(false);
  });
});
