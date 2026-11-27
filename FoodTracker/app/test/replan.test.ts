import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays } from "../src/lib/dates";
import { prepareReplan } from "../src/lib/replan";
import type { MealType, MonthPlan, PlannedMeal, WeekPlan } from "../src/lib/types";
import { meal } from "./fixtures";

const MEALS: MealType[] = ["breakfast", "lunch", "dinner"];
const START = "2026-11-21";

/** Monatsplan mit den vier Wochen (7, 7, 8, 8 Tage); `prepareReplan` braucht nur Startdatum, Wochen und Gerichte. */
function monthPlan(meals: PlannedMeal[], startDate = START): MonthPlan {
  const weeks = [
    [0, 7],
    [7, 7],
    [14, 8],
    [22, 8],
  ].map(([startDay, days]) => ({ startDay, days, meals: meals.filter((m) => m.day >= startDay! && m.day < startDay! + days!) }) as WeekPlan);
  return { startDate, weeks };
}

const locked = (day: number, mealType: MealType, recipeId: string) => meal({ day, mealType, recipeId, locked: true });

describe("Neu planen und Tauschen (Plan-Tab)", () => {
  const plan = monthPlan([
    meal({ day: 0, mealType: "lunch", recipeId: "linsen-dal" }),
    locked(1, "dinner", "kuerbissuppe"),
    locked(3, "lunch", "ofengemuese"),
    locked(5, "dinner", "pasta-pesto"),
    locked(10, "breakfast", "porridge"),
    locked(29, "dinner", "chili"),
  ]);

  it("ohne Plan: neuer Monat ab heute", () => {
    assert.deepEqual(prepareReplan({ plan: null, fromWeek: 0, mealTypes: MEALS, today: "2026-11-24" }), {
      startDate: "2026-11-24",
      keepWeeks: [],
      locked: [],
    });
  });

  it("„Neu planen“ am Starttag: gleiches Startdatum, alle fixierten Gerichte bleiben", () => {
    const replan = prepareReplan({ plan, fromWeek: 0, mealTypes: MEALS, today: START });
    assert.equal(replan.startDate, START);
    assert.deepEqual(replan.keepWeeks, []);
    assert.deepEqual(replan.locked, [
      { day: 1, mealType: "dinner", recipeId: "kuerbissuppe" },
      { day: 3, mealType: "lunch", recipeId: "ofengemuese" },
      { day: 5, mealType: "dinner", recipeId: "pasta-pesto" },
      { day: 10, mealType: "breakfast", recipeId: "porridge" },
      { day: 29, mealType: "dinner", recipeId: "chili" },
    ]);
  });

  it("„Neu planen“ drei Tage später: beginnt heute, fixierte Gerichte bleiben an ihrem Kalendertag", () => {
    const today = addDays(START, 3);
    const replan = prepareReplan({ plan, fromWeek: 0, mealTypes: MEALS, today });
    assert.equal(replan.startDate, today);
    assert.deepEqual(replan.keepWeeks, []);
    // Tag 1 ist vorbei; Tag 3 des alten Plans ist heute (Tag 0), Tag 29 wird Tag 26.
    assert.deepEqual(replan.locked, [
      { day: 0, mealType: "lunch", recipeId: "ofengemuese" },
      { day: 2, mealType: "dinner", recipeId: "pasta-pesto" },
      { day: 7, mealType: "breakfast", recipeId: "porridge" },
      { day: 26, mealType: "dinner", recipeId: "chili" },
    ]);
    for (const lock of replan.locked) {
      const before = plan.weeks.flatMap((w) => w.meals).find((m) => m.recipeId === lock.recipeId)!;
      assert.equal(addDays(replan.startDate, lock.day), addDays(START, before.day), lock.recipeId);
    }
  });

  it("„Neu planen“ nach Ende des Monats: keine fixierten Gerichte mehr", () => {
    const replan = prepareReplan({ plan, fromWeek: 0, mealTypes: MEALS, today: addDays(START, 30) });
    assert.deepEqual(replan.locked, []);
  });

  it("Tauschen in der ersten Woche an einem späteren Tag: Startdatum bleibt, das Rezept kommt an den gewählten Tag", () => {
    // Früher begann der Plan dann heute: Das getauschte Gericht landete drei Tage zu spät, die übrigen
    // fixierten Gerichte gingen verloren, Gegessenes und Abgehaktes wurden zurückgesetzt.
    const swapped = { day: 4, mealType: "lunch" as const, recipeId: "shakshuka" };
    const replan = prepareReplan({ plan, fromWeek: 0, swapped, mealTypes: MEALS, today: addDays(START, 3) });
    assert.equal(replan.startDate, START);
    assert.deepEqual(replan.keepWeeks, []);
    assert.deepEqual(replan.locked, [
      { day: 1, mealType: "dinner", recipeId: "kuerbissuppe" },
      { day: 3, mealType: "lunch", recipeId: "ofengemuese" },
      { day: 5, mealType: "dinner", recipeId: "pasta-pesto" },
      { day: 10, mealType: "breakfast", recipeId: "porridge" },
      { day: 29, mealType: "dinner", recipeId: "chili" },
      swapped,
    ]);
  });

  it("Tauschen ab Woche 3: frühere Wochen bleiben, das neue Rezept ersetzt ein fixiertes am selben Platz", () => {
    const swapped = { day: 29, mealType: "dinner" as const, recipeId: "gemuesecurry" };
    const replan = prepareReplan({ plan, fromWeek: 3, swapped, mealTypes: MEALS, today: addDays(START, 20) });
    assert.equal(replan.startDate, START);
    assert.deepEqual(replan.keepWeeks, plan.weeks.slice(0, 3));
    assert.equal(replan.locked.filter((l) => l.day === 29 && l.mealType === "dinner").length, 1);
    assert.deepEqual(replan.locked.at(-1), swapped);
  });

  it("Fixierte Gerichte von Mahlzeiten, die nicht mehr geplant werden, fallen weg", () => {
    const replan = prepareReplan({ plan, fromWeek: 0, mealTypes: ["lunch", "dinner"], today: START });
    assert.ok(!replan.locked.some((l) => l.mealType === "breakfast"));
    assert.equal(replan.locked.length, 4);
  });
});
