import type { PlanRequest } from "./catalog";
import type { Body, Goal, Settings } from "./types";

const ACTIVITY_FACTOR = { wenig: 1.4, mittel: 1.6, viel: 1.8 } as const;
const GOAL_ADJUST: Record<Goal, number> = { abnehmen: -400, halten: 0, zunehmen: 300, muskelaufbau: 250 };

/** Tagesbedarf nach Mifflin-St Jeor, angepasst an Aktivität und Ziel, auf 50 kcal gerundet. */
export function dailyKcal(body: Body, goal: Goal): number {
  const base = 10 * body.weightKg + 6.25 * body.heightCm - 5 * body.age;
  const sexOffset = body.sex === "m" ? 5 : body.sex === "w" ? -161 : -78;
  const kcal = (base + sexOffset) * ACTIVITY_FACTOR[body.activity] + GOAL_ADJUST[goal];
  return Math.max(1200, Math.round(kcal / 50) * 50);
}

/** Planer-Optionen aus den gespeicherten Essgewohnheiten. */
export function planOptions(settings: Settings): Pick<
  PlanRequest,
  "diet" | "allergens" | "excludeIngredients" | "maxCookMinutes" | "rules" | "preferredTags" | "priceFocus" | "proteinFocus" | "maxRepeats"
> {
  return {
    diet: settings.diet,
    allergens: settings.allergens,
    excludeIngredients: settings.excludeIngredients,
    maxCookMinutes: settings.maxCookMinutes,
    rules: settings.rules,
    preferredTags: settings.cuisines,
    priceFocus: settings.budget === "guenstig" ? 3 : settings.budget === "egal" ? 0.2 : 1,
    proteinFocus: settings.goal === "muskelaufbau",
    maxRepeats: settings.variety === "hoch" ? 1 : 2,
  };
}
