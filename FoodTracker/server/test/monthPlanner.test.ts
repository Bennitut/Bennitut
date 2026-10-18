import { describe, expect, it } from "vitest";
import { RECIPES, ingredientById } from "../src/data/catalog.js";
import { MONTH_DAYS, planMonth, weekOfDay } from "../src/planner/monthPlanner.js";
import { matchesPreferences } from "../src/planner/zeroWastePlanner.js";
import type { PlanRequest } from "../src/types.js";

const request: Omit<PlanRequest, "days"> = {
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
  maxRepeats: 2,
};

const month = (overrides: Partial<typeof request> = {}) =>
  planMonth({ request: { ...request, ...overrides }, recipes: RECIPES, ingredients: ingredientById, startDate: "2026-11-01" });

describe("planMonth", () => {
  const plan = month();

  it("plant 30 Tage in vier Wochen mit eigener Einkaufsliste", () => {
    expect(plan.weeks).toHaveLength(4);
    const days = plan.weeks.flatMap((w) => w.meals.map((m) => m.day));
    expect(new Set(days).size).toBe(MONTH_DAYS);
    expect(Math.min(...days)).toBe(0);
    expect(Math.max(...days)).toBe(MONTH_DAYS - 1);
    for (const week of plan.weeks) expect(week.shoppingList.length).toBeGreaterThan(0);
  });

  it("hält Reste über den ganzen Monat gering", () => {
    const avg = plan.weeks.reduce((s, w) => s + w.wasteRatio, 0) / plan.weeks.length;
    expect(avg).toBeLessThan(0.05);
  });

  it("übernimmt Reste einer Woche in den Vorrat der nächsten", () => {
    const usedCarryOver = plan.weeks.slice(1).some((w) => w.shoppingList.some((s) => s.fromPantry > 0));
    expect(usedCarryOver).toBe(true);
  });

  it("sorgt für Abwechslung zwischen den Wochen", () => {
    const distinct = new Set(plan.weeks.flatMap((w) => w.meals.map((m) => m.recipeId)));
    expect(distinct.size).toBeGreaterThan(35);
  });

  it("behält fixierte Gerichte an ihrem Tag im Monat", () => {
    const result = month({ locked: [{ day: 20, mealType: "dinner", recipeId: "kaesespaetzle" }] });
    const meal = result.weeks[weekOfDay(20)]!.meals.find((m) => m.day === 20 && m.mealType === "dinner")!;
    expect(meal.recipeId).toBe("kaesespaetzle");
    expect(meal.locked).toBe(true);
  });

  it("plant ab einer Woche neu und lässt frühere Wochen unverändert", () => {
    const again = planMonth({ request, recipes: RECIPES, ingredients: ingredientById, startDate: "2026-11-01", keepWeeks: plan.weeks.slice(0, 2) });
    expect(again.weeks[0]).toEqual(plan.weeks[0]);
    expect(again.weeks[1]).toEqual(plan.weeks[1]);
    expect(again.weeks).toHaveLength(4);
  });

  it("bevorzugt gewählte Küchen", () => {
    const count = (p: ReturnType<typeof month>) =>
      p.weeks.flatMap((w) => w.meals).filter((m) => RECIPES.find((r) => r.id === m.recipeId)!.tags.includes("asiatisch")).length;
    expect(count(month({ preferredTags: ["asiatisch"] }))).toBeGreaterThan(count(plan));
  });

  it("hält halal- und koscher-Regeln ein", () => {
    for (const rules of [["halal"], ["koscher"]] as const) {
      const result = month({ rules: [...rules] });
      for (const meal of result.weeks.flatMap((w) => w.meals)) {
        const recipe = RECIPES.find((r) => r.id === meal.recipeId)!;
        const used = recipe.ingredients.map((ri) => ingredientById.get(ri.ingredientId)!);
        expect(used.some((i) => i.pork), meal.recipeId).toBe(false);
        expect(matchesPreferences(recipe, { ...request, rules: [...rules] }, ingredientById)).toBe(true);
      }
    }
  });

  it("schließt bei koscher Fleisch mit Milchprodukten aus", () => {
    const geschnetzeltes = RECIPES.find((r) => r.id === "zuercher_geschnetzeltes")!;
    expect(matchesPreferences(geschnetzeltes, { ...request, rules: ["koscher"] }, ingredientById)).toBe(false);
    expect(matchesPreferences(geschnetzeltes, { ...request, rules: ["halal"] }, ingredientById)).toBe(true);
  });
});

describe("Katalog-Medien", () => {
  it("hat zu jedem Rezept ein Foto, ein Video und eine Küche", () => {
    for (const r of RECIPES) {
      expect(r.media?.image?.uri, r.id).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/hqdefault\.jpg$/);
      expect(r.media?.videos?.[0]?.url, r.id).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/);
      expect(r.tags.length, r.id).toBeGreaterThan(0);
    }
  });
});
