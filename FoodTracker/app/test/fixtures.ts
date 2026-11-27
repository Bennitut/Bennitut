/**
 * Testdaten und Hilfen für die Tests der App-Logik. Die Tests laufen in Node (`npm test`) und
 * importieren nur reine Logik aus `src/lib`, `src/i18n` und dem Server-Code – keine nativen Module.
 */
import { after, before } from "node:test";
import type { Ingredient, PlannedMeal, Recipe, Settings } from "../src/lib/types";

export function ingredient(patch: Partial<Ingredient> & Pick<Ingredient, "id">): Ingredient {
  return {
    name: { de: patch.id },
    category: "gemuese",
    unit: "g",
    nutrients: { kcal: 100, protein: 2, carbs: 20, fat: 1 },
    packSize: 500,
    packPrice: 1,
    shelfLifeDays: 7,
    diet: "vegan",
    allergens: [],
    ...patch,
  };
}

export function recipe(patch: Partial<Recipe> & Pick<Recipe, "id" | "ingredients">): Recipe {
  return {
    language: "de",
    name: patch.id,
    steps: [],
    otherIngredients: [],
    mealTypes: ["lunch"],
    cookMinutes: 20,
    tags: [],
    source: { kind: "eigen" },
    ...patch,
  };
}

export function meal(patch: Partial<PlannedMeal> & Pick<PlannedMeal, "recipeId">): PlannedMeal {
  return {
    day: 0,
    mealType: "lunch",
    recipeName: patch.recipeId,
    portions: 1,
    nutrientsPerPortion: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    locked: false,
    extras: [],
    ...patch,
  };
}

/** Einstellungen wie nach dem Fragebogen mit den Standardantworten (vgl. `defaultSettings` in store.tsx). */
export function settings(patch: Partial<Settings> = {}): Settings {
  return {
    language: "de",
    region: "AT",
    displayName: "",
    kcalPerPersonPerDay: 2000,
    people: 1,
    days: 7,
    mealTypes: ["breakfast", "lunch", "dinner"],
    diet: "alles",
    allergens: [],
    excludeIngredients: [],
    maxCookMinutes: 0,
    preferences: "",
    onboarded: true,
    rules: [],
    goal: "halten",
    body: null,
    cuisines: [],
    budget: "normal",
    variety: "normal",
    ...patch,
  };
}

/**
 * Stellt für die Tests der umgebenden `describe`-Gruppe die Zeitzone um (Node übernimmt `process.env.TZ` zur
 * Laufzeit). Klappt das auf einem System nicht, laufen die Tests in dessen Zeitzone; `timeZoneActive` sagt, ob die
 * Umstellung gegriffen hat.
 */
export function useTimeZone(zone: string): void {
  const previous = process.env.TZ;
  before(() => {
    process.env.TZ = zone;
  });
  after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

/** Ob die Uhr gerade wirklich in dieser Zeitzone läuft. */
export function timeZoneActive(zone: string): boolean {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone === zone;
}
