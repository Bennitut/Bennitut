import type { Ingredient, LockedMeal, MealPlan, MonthPlan, PantryItem, PlanRequest, Recipe, WeekPlan } from "../types.js";
import { planMeals } from "./zeroWastePlanner.js";

/**
 * Ein Monat (30 Tage) wird in Wochenblöcken geplant: Frisches lässt sich nicht einen Monat
 * im Voraus kaufen, deshalb hat jede Woche ihren eigenen Einkauf. Was nach einer Woche übrig
 * bleibt und noch hält, ist der Startvorrat der nächsten Woche – so entstehen auch über den
 * Monat hinweg keine Reste.
 */
export const MONTH_WEEKS = [7, 7, 8, 8];
export const MONTH_DAYS = MONTH_WEEKS.reduce((a, b) => a + b, 0);

export interface MonthPlanInput {
  /** Wie PlanRequest, `locked` aber mit Tagen ab Monatsbeginn. */
  request: Omit<PlanRequest, "days">;
  recipes: Recipe[];
  ingredients: Map<string, Ingredient>;
  startDate: string;
  /** Wochen, die unverändert bleiben (z. B. beim Neuplanen ab Woche 3). */
  keepWeeks?: WeekPlan[];
  /** Nur bis zu dieser Wochenzahl planen (für schrittweises Planen mit Fortschrittsanzeige). */
  untilWeek?: number;
}

export function planMonth({ request, recipes, ingredients, startDate, keepWeeks = [], untilWeek = MONTH_WEEKS.length }: MonthPlanInput): MonthPlan {
  const weeks: WeekPlan[] = keepWeeks.slice(0, MONTH_WEEKS.length);
  let startDay = weeks.reduce((sum, w) => sum + w.days, 0);
  let pantry = weeks.at(-1)?.endPantry ?? request.pantry;

  for (let index = weeks.length; index < Math.min(untilWeek, MONTH_WEEKS.length); index++) {
    const days = MONTH_WEEKS[index]!;
    const locked: LockedMeal[] = request.locked
      .filter((l) => l.day >= startDay && l.day < startDay + days)
      .map((l) => ({ ...l, day: l.day - startDay }));
    const plan = planMeals({
      request: {
        ...request,
        days,
        pantry,
        locked,
        // Abwechslung über die Wochen: was letzte Woche dran war, kommt seltener.
        recentRecipeIds: [...(request.recentRecipeIds ?? []), ...(weeks.at(-1)?.meals.map((m) => m.recipeId) ?? [])],
        seed: (request.seed ?? 42) + index,
      },
      recipes,
      ingredients,
    });
    const endPantry = remainingPantry(plan);
    weeks.push({
      ...plan,
      meals: plan.meals.map((m) => ({ ...m, day: m.day + startDay })),
      spoilageWarnings: plan.spoilageWarnings.map((w) => ({ ...w, day: w.day + startDay })),
      startDay,
      days,
      endPantry,
    });
    pantry = endPantry;
    startDay += days;
  }
  return { startDate, weeks };
}

/** Index der Woche, in der ein Tag (ab Monatsbeginn) liegt. */
export function weekOfDay(day: number): number {
  let start = 0;
  for (let i = 0; i < MONTH_WEEKS.length; i++) {
    start += MONTH_WEEKS[i]!;
    if (day < start) return i;
  }
  return MONTH_WEEKS.length - 1;
}

/** Ungenutzter Vorrat plus haltbare Reste der Einkäufe. */
function remainingPantry(plan: MealPlan): PantryItem[] {
  const amounts = new Map<string, number>();
  const add = (id: string, amount: number) => amounts.set(id, (amounts.get(id) ?? 0) + amount);
  for (const item of plan.unusedPantry) add(item.ingredientId, item.amount);
  for (const item of plan.shoppingList) if (item.durable && item.leftover > 0) add(item.ingredientId, item.leftover);
  return [...amounts].map(([ingredientId, amount]) => ({ ingredientId, amount: Math.round(amount * 10) / 10 }));
}
