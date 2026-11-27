import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  INGREDIENTS,
  MONTH_DAYS,
  MONTH_WEEKS,
  PlanError,
  RECIPES,
  applyOverrides,
  matchesPreferences,
  planMonth,
  weekOfDay,
  type PlanRequest,
} from "../src/lib/catalog";
import { addDays } from "../src/lib/dates";
import { addToPantry, aggregatePantry, consumeMeal, totalOf, type StockItem } from "../src/lib/pantry";
import { planOptions } from "../src/lib/profile";
import { prepareReplan } from "../src/lib/replan";
import type { MonthPlan, PlannedMeal, Recipe, Settings } from "../src/lib/types";
import { settings } from "./fixtures";

const ingredients = new Map(INGREDIENTS.map((i) => [i.id, i]));
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));
const START = "2026-11-24";
/** Rundung im Vorrat (eine Nachkommastelle je Buchung) und in der Einkaufsliste. */
const TOLERANCE = 0.3;

/** Anfrage, wie `createPlan` in plan.tsx sie ohne Server baut (auf dem Handy mit halber Suchtiefe). */
function requestFor(s: Settings, pantry: StockItem[] = []): Omit<PlanRequest, "days"> {
  return {
    ...planOptions(s),
    people: s.people,
    kcalPerPersonPerDay: s.kcalPerPersonPerDay,
    mealTypes: s.mealTypes,
    pantry: aggregatePantry(pantry),
    favoriteRecipeIds: [],
    recipeRatings: {},
    locked: [],
    effort: 0.5,
  };
}

/** Plant wie der Plan-Tab: Woche für Woche, damit die Fortschrittsanzeige weiterzählen kann. */
function planLikeApp(s: Settings, options: { recipes?: Recipe[]; pantry?: StockItem[]; weeks?: number } = {}): MonthPlan {
  const { recipes = RECIPES, pantry = [], weeks = MONTH_WEEKS.length } = options;
  const request = requestFor(s, pantry);
  let month: MonthPlan = { startDate: START, weeks: [] };
  for (let week = 0; week < weeks; week++) {
    month = planMonth({ request, recipes, ingredients, startDate: START, keepWeeks: month.weeks, untilWeek: week + 1 });
  }
  return month;
}

/** Was ein Gericht verbraucht: Rezeptmengen × Portionen plus Resteverwertung. */
function mealNeeds(meal: PlannedMeal, recipe: Recipe): Map<string, number> {
  const needs = new Map<string, number>();
  const add = (id: string, amount: number) => needs.set(id, (needs.get(id) ?? 0) + amount);
  for (const ri of recipe.ingredients) add(ri.ingredientId, ri.amount * meal.portions);
  for (const extra of meal.extras) add(extra.ingredientId, extra.amount);
  return needs;
}

const buy = (week: MonthPlan["weeks"][number]) =>
  week.shoppingList.filter((i) => i.packs > 0).map((i) => ({ ingredientId: i.ingredientId, amount: i.packs * i.packSize }));

describe("Planer in der App (ohne Server)", () => {
  // Fragebogen: vegetarisch, keine Laktose, keine Pilze, höchstens 30 Minuten Kochzeit, zwei Personen.
  const answers = settings({
    diet: "vegetarisch",
    allergens: ["laktose"],
    excludeIngredients: ["champignons"],
    maxCookMinutes: 30,
    people: 2,
  });
  let month: MonthPlan;

  before(() => {
    month = planLikeApp(answers);
  });

  it("plant 30 Tage in vier Wochen, jede Mahlzeit genau einmal", () => {
    assert.deepEqual(
      month.weeks.map((w) => [w.startDay, w.days]),
      [
        [0, 7],
        [7, 7],
        [14, 8],
        [22, 8],
      ],
    );
    const meals = month.weeks.flatMap((w) => w.meals);
    assert.equal(meals.length, MONTH_DAYS * answers.mealTypes.length);
    for (let day = 0; day < MONTH_DAYS; day++) {
      for (const mealType of answers.mealTypes) {
        assert.equal(meals.filter((m) => m.day === day && m.mealType === mealType).length, 1, `Tag ${day}, ${mealType}`);
      }
    }
  });

  it("hält sich an die Antworten aus dem Fragebogen", () => {
    const options = planOptions(answers);
    for (const meal of month.weeks.flatMap((w) => w.meals)) {
      const recipe = recipeById.get(meal.recipeId)!;
      assert.ok(matchesPreferences(recipe, options, ingredients), meal.recipeId);
      assert.ok(recipe.cookMinutes <= 30, meal.recipeId);
      for (const ri of recipe.ingredients) {
        const ingredient = ingredients.get(ri.ingredientId)!;
        assert.ok(ingredient.diet === "vegan" || ingredient.diet === "vegetarisch", `${meal.recipeId}: ${ingredient.id}`);
        assert.ok(!ingredient.allergens.includes("laktose"), `${meal.recipeId}: ${ingredient.id}`);
        assert.notEqual(ingredient.id, "champignons", meal.recipeId);
      }
    }
  });

  it("plant Woche für Woche (mit Fortschrittsanzeige) denselben Monat wie in einem Rutsch", () => {
    assert.deepEqual(month, planMonth({ request: requestFor(answers), recipes: RECIPES, ingredients, startDate: START }));
  });

  it("Tauschen drei Tage nach Planbeginn: Das Rezept kommt an den gewählten Tag, fixierte Gerichte bleiben", () => {
    // Wie im Plan-Tab: Mittagessen an Tag 2 ist fixiert, heute ist Tag 3, getauscht wird das Abendessen an Tag 5.
    const at = (plan: MonthPlan, day: number, mealType: string) => plan.weeks.flatMap((w) => w.meals).find((m) => m.day === day && m.mealType === mealType)!;
    const withLock: MonthPlan = {
      ...month,
      weeks: month.weeks.map((w) => ({ ...w, meals: w.meals.map((m) => (m.day === 2 && m.mealType === "lunch" ? { ...m, locked: true } : m)) })),
    };
    const options = planOptions(answers);
    const alternative = RECIPES.find((r) => r.mealTypes.includes("dinner") && r.id !== at(month, 5, "dinner").recipeId && matchesPreferences(r, options, ingredients))!;
    const swapped = { day: 5, mealType: "dinner" as const, recipeId: alternative.id };
    const replan = prepareReplan({ plan: withLock, fromWeek: weekOfDay(swapped.day), swapped, mealTypes: answers.mealTypes, today: addDays(START, 3) });
    const next = planMonth({ request: { ...requestFor(answers), locked: replan.locked }, recipes: RECIPES, ingredients, startDate: replan.startDate, keepWeeks: replan.keepWeeks });
    assert.equal(next.startDate, START);
    assert.equal(at(next, 5, "dinner").recipeId, alternative.id);
    assert.equal(at(next, 2, "lunch").recipeId, at(month, 2, "lunch").recipeId);
    assert.ok(at(next, 5, "dinner").locked && at(next, 2, "lunch").locked);
  });

  it("Einkaufen und Kochen: Mit den Einkaufslisten ist jedes Gericht des Monats kochbar", () => {
    let stock: StockItem[] = [];
    for (const week of month.weeks) {
      stock = addToPantry(stock, buy(week), addDays(START, week.startDay));
      for (const meal of [...week.meals].sort((a, b) => a.day - b.day)) {
        const recipe = recipeById.get(meal.recipeId)!;
        for (const [id, need] of mealNeeds(meal, recipe)) {
          const have = totalOf(stock, id);
          assert.ok(have >= need - TOLERANCE, `Tag ${meal.day} (${meal.recipeId}): braucht ${need} ${id}, im Vorrat ${have}`);
        }
        stock = consumeMeal(stock, meal, recipe);
      }
    }
  });

  it("Einkaufen und Kochen: Nach der ersten Woche bleiben im Vorrat genau die Reste der Einkaufsliste", () => {
    const week = month.weeks[0]!;
    let stock = addToPantry([], buy(week), START);
    for (const meal of week.meals) stock = consumeMeal(stock, meal, recipeById.get(meal.recipeId)!);
    for (const item of week.shoppingList) {
      const left = totalOf(stock, item.ingredientId);
      assert.ok(Math.abs(left - item.leftover) <= TOLERANCE, `${item.ingredientId}: im Vorrat ${left}, laut Einkaufsliste ${item.leftover}`);
    }
    const listed = new Set(week.shoppingList.map((i) => i.ingredientId));
    assert.deepEqual(
      stock.filter((s) => !listed.has(s.ingredientId)),
      [],
    );
  });

  it("rechnet Vorräte aus dem Vorrat-Tab mit ein", () => {
    // Zwei Einkäufe Kartoffeln an verschiedenen Tagen: Der Planer sieht 2 kg.
    let pantry = addToPantry([], [{ ingredientId: "kartoffeln", amount: 1200 }], "2026-11-20");
    pantry = addToPantry(pantry, [{ ingredientId: "kartoffeln", amount: 800 }], "2026-11-22");
    const week = planLikeApp(answers, { pantry, weeks: 1 }).weeks[0]!;
    const used = week.shoppingList.find((i) => i.ingredientId === "kartoffeln")?.fromPantry ?? 0;
    const unused = week.unusedPantry.find((i) => i.ingredientId === "kartoffeln")?.amount ?? 0;
    assert.ok(used > 0, "Vorräte werden zuerst verbraucht");
    assert.ok(Math.abs(used + unused - 2000) <= TOLERANCE, `${used} g verplant + ${unused} g übrig`);
  });

  it("plant keine Katalogrezepte ein, die ein Admin ausgeblendet hat", () => {
    const counts = new Map<string, number>();
    for (const meal of month.weeks[0]!.meals) counts.set(meal.recipeId, (counts.get(meal.recipeId) ?? 0) + 1);
    const [top] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
    const catalog = applyOverrides(RECIPES, {
      [top]: { patch: { hidden: true }, updatedBy: "Admin", updatedAt: "2026-11-24T00:00:00.000Z" },
    });
    assert.equal(catalog.length, RECIPES.length - 1);
    const week = planLikeApp(answers, { recipes: catalog, weeks: 1 }).weeks[0]!;
    assert.ok(!week.meals.some((m) => m.recipeId === top), top);
  });

  it("meldet einen übersetzbaren Fehler, wenn kein Rezept passt", () => {
    // Kein Rezept ist in 4 Minuten fertig; plan.tsx zeigt dann den Text errors.plan_<code>.
    assert.throws(
      () => planLikeApp(settings({ maxCookMinutes: 4 }), { weeks: 1 }),
      (e) => e instanceof PlanError && e.code === "no_recipe_for_meal",
    );
  });
});

describe("Wochen im Monatsplan", () => {
  it("ordnet jeden Tag seiner Woche zu, auch nach Monatsende", () => {
    assert.deepEqual(MONTH_WEEKS, [7, 7, 8, 8]);
    assert.equal(MONTH_DAYS, 30);
    assert.deepEqual([0, 6, 7, 13, 14, 21, 22, 29].map(weekOfDay), [0, 0, 1, 1, 2, 2, 3, 3]);
    assert.equal(weekOfDay(45), 3);
  });
});
