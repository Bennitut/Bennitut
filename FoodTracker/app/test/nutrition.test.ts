import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipeNutrients as plannerNutrients } from "../../server/src/planner/nutrition";
import { INGREDIENTS, RECIPES } from "../src/lib/catalog";
import { recipeNutrients } from "../src/lib/nutrition";
import { dailyKcal, planOptions } from "../src/lib/profile";
import type { Body } from "../src/lib/types";
import { ingredient, recipe, settings } from "./fixtures";

describe("Nährwerte eines Rezepts", () => {
  const ingredients = new Map(
    [
      ingredient({ id: "reis", unit: "g", nutrients: { kcal: 350, protein: 7, carbs: 77, fat: 1 } }),
      ingredient({ id: "milch", unit: "ml", nutrients: { kcal: 64, protein: 3.4, carbs: 4.8, fat: 3.5 } }),
      ingredient({ id: "eier", unit: "stk", nutrients: { kcal: 80, protein: 7, carbs: 0.5, fat: 5.5 } }),
    ].map((i) => [i.id, i]),
  );

  it("rechnet g und ml je 100, Stück je 1", () => {
    const r = recipe({
      id: "test",
      ingredients: [
        { ingredientId: "reis", amount: 80 },
        { ingredientId: "milch", amount: 250 },
        { ingredientId: "eier", amount: 2 },
      ],
    });
    const n = recipeNutrients(r, ingredients);
    assert.equal(n.kcal, 280 + 160 + 160);
    assert.ok(Math.abs(n.protein - (5.6 + 8.5 + 14)) < 1e-9);
    assert.ok(Math.abs(n.carbs - (61.6 + 12 + 1)) < 1e-9);
    assert.ok(Math.abs(n.fat - (0.8 + 8.75 + 11)) < 1e-9);
  });

  it("überspringt unbekannte Zutaten, statt abzustürzen", () => {
    const r = recipe({ id: "test", ingredients: [{ ingredientId: "eier", amount: 1 }, { ingredientId: "gibt_es_nicht", amount: 100 }] });
    assert.deepEqual(recipeNutrients(r, ingredients), { kcal: 80, protein: 7, carbs: 0.5, fat: 5.5 });
  });

  it("zeigt bei allen Katalogrezepten dieselben Werte wie der Planer", () => {
    const catalog = new Map(INGREDIENTS.map((i) => [i.id, i]));
    for (const r of RECIPES) {
      const app = recipeNutrients(r, catalog);
      const planner = plannerNutrients(r, catalog);
      for (const key of ["kcal", "protein", "carbs", "fat"] as const) {
        assert.ok(Math.abs(app[key] - planner[key]) < 1e-9, `${r.id}: ${key}`);
      }
    }
  });
});

describe("Kalorienbedarf aus dem Fragebogen", () => {
  const body = (patch: Partial<Body>): Body => ({ sex: "w", age: 30, heightCm: 170, weightKg: 65, activity: "mittel", ...patch });

  it("rechnet nach Mifflin-St Jeor mit Aktivität und Ziel", () => {
    // (10 × kg + 6,25 × cm − 5 × Alter + 5 bzw. −161) × Aktivität + Ziel, auf 50 kcal gerundet
    assert.equal(dailyKcal(body({ sex: "m", age: 30, heightCm: 180, weightKg: 80 }), "halten"), 2850);
    assert.equal(dailyKcal(body({ age: 30, heightCm: 165, weightKg: 60, activity: "wenig" }), "abnehmen"), 1450);
    assert.equal(dailyKcal(body({ sex: "m", age: 25, heightCm: 185, weightKg: 85, activity: "viel" }), "muskelaufbau"), 3650);
    assert.equal(dailyKcal(body({ age: 45, heightCm: 170, weightKg: 70 }), "zunehmen"), 2500);
  });

  it("liegt für „divers“ zwischen den Werten für Frauen und Männer", () => {
    const kcal = (sex: Body["sex"]) => dailyKcal(body({ sex, heightCm: 175, weightKg: 70 }), "halten");
    assert.deepEqual([kcal("w"), kcal("d"), kcal("m")], [2350, 2500, 2650]);
  });

  it("rundet auf 50 kcal und plant nie unter 1200 kcal", () => {
    for (const weightKg of [40, 55, 63.3, 77.7, 120]) {
      for (const goal of ["abnehmen", "halten", "zunehmen", "muskelaufbau"] as const) {
        const kcal = dailyKcal(body({ weightKg }), goal);
        assert.equal(kcal % 50, 0);
        assert.ok(kcal >= 1200);
      }
    }
    assert.equal(dailyKcal(body({ age: 80, heightCm: 150, weightKg: 40, activity: "wenig" }), "abnehmen"), 1200);
  });
});

describe("Planer-Optionen aus dem Fragebogen", () => {
  it("übernimmt Ernährungsform, Regeln, Allergien, Abneigungen, Kochzeit und Küchen", () => {
    const options = planOptions(
      settings({
        diet: "vegetarisch",
        rules: ["halal"],
        allergens: ["laktose", "nuesse"],
        excludeIngredients: ["champignons"],
        maxCookMinutes: 30,
        cuisines: ["italienisch", "asiatisch"],
      }),
    );
    assert.equal(options.diet, "vegetarisch");
    assert.deepEqual(options.rules, ["halal"]);
    assert.deepEqual(options.allergens, ["laktose", "nuesse"]);
    assert.deepEqual(options.excludeIngredients, ["champignons"]);
    assert.equal(options.maxCookMinutes, 30);
    assert.deepEqual(options.preferredTags, ["italienisch", "asiatisch"]);
  });

  it("übersetzt Budget, Ziel und Abwechslung in Gewichte für den Planer", () => {
    assert.equal(planOptions(settings({ budget: "guenstig" })).priceFocus, 3);
    assert.equal(planOptions(settings({ budget: "normal" })).priceFocus, 1);
    assert.equal(planOptions(settings({ budget: "egal" })).priceFocus, 0.2);
    assert.equal(planOptions(settings({ goal: "muskelaufbau" })).proteinFocus, true);
    assert.equal(planOptions(settings({ goal: "abnehmen" })).proteinFocus, false);
    assert.equal(planOptions(settings({ variety: "hoch" })).maxRepeats, 1);
    assert.equal(planOptions(settings({ variety: "normal" })).maxRepeats, 2);
  });
});
