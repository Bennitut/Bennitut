import { MONTH_DAYS } from "./catalog";
import { daysBetween } from "./dates";
import type { LockedMeal, MealType, MonthPlan, WeekPlan } from "./types";

/** Womit der Plan-Tab den Monat (neu) plant. */
export interface Replan {
  startDate: string;
  /** Wochen vor `fromWeek`; sie bleiben, wie sie sind. */
  keepWeeks: WeekPlan[];
  /** Fixierte Gerichte, Tage ab `startDate`. */
  locked: LockedMeal[];
}

/**
 * Bereitet das Planen ab Woche `fromWeek` vor (ohne Plan: neuer Monat ab heute).
 *
 * - „Neu planen“ (Woche 0, nichts getauscht) beginnt heute. Fixierte Gerichte bleiben an ihrem Kalendertag,
 *   schon vergangene fallen weg.
 * - Tauschen und Neuplanen ab einer späteren Woche behalten das Startdatum: Das getauschte Gericht kommt genau an
 *   den gewählten Tag und wird fixiert, Gegessenes und Abgehaktes bleiben gültig.
 * - Fixierte Gerichte von Mahlzeiten, die nicht mehr geplant werden (Fragebogen geändert), fallen weg.
 */
export function prepareReplan({
  plan,
  fromWeek,
  swapped,
  mealTypes,
  today,
}: {
  plan: MonthPlan | null;
  fromWeek: number;
  /** Beim Tauschen: das gewählte Rezept an seinem Platz (Tag ab Beginn des bisherigen Plans). */
  swapped?: LockedMeal;
  mealTypes: MealType[];
  /** Heutiges Datum (YYYY-MM-DD). */
  today: string;
}): Replan {
  if (!plan) return { startDate: today, keepWeeks: [], locked: swapped ? [swapped] : [] };
  const startDate = fromWeek > 0 || swapped || plan.startDate === today ? plan.startDate : today;
  const shift = daysBetween(plan.startDate, startDate);
  const locked: LockedMeal[] = plan.weeks
    .flatMap((w) => w.meals)
    .filter((m) => m.locked && mealTypes.includes(m.mealType))
    .filter((m) => !(swapped && m.day === swapped.day && m.mealType === swapped.mealType))
    .map(({ day, mealType, recipeId }) => ({ day: day - shift, mealType, recipeId }))
    .filter((m) => m.day >= 0 && m.day < MONTH_DAYS);
  if (swapped) locked.push(swapped);
  return { startDate, keepWeeks: fromWeek > 0 ? plan.weeks.slice(0, fromWeek) : [], locked };
}
