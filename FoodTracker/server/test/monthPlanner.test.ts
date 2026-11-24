import { describe, expect, it } from "vitest";
import { RECIPES, ingredientById } from "../src/data/catalog.js";
import { RECIPE_VIDEOS, VIDEO_LANGUAGES } from "../src/data/recipeVideos.js";
import { MONTH_DAYS, planMonth, weekOfDay } from "../src/planner/monthPlanner.js";
import { matchesPreferences, recipeDiet } from "../src/planner/zeroWastePlanner.js";
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
    // Zwei Monatspläne mit dem ganzen Katalog brauchen bei parallelen Tests länger als 5 s.
  }, 30_000);

  it("schließt bei koscher Fleisch mit Milchprodukten aus", () => {
    const geschnetzeltes = RECIPES.find((r) => r.id === "zuercher_geschnetzeltes")!;
    expect(matchesPreferences(geschnetzeltes, { ...request, rules: ["koscher"] }, ingredientById)).toBe(false);
    expect(matchesPreferences(geschnetzeltes, { ...request, rules: ["halal"] }, ingredientById)).toBe(true);
  });
});

describe("Katalog-Medien", () => {
  it("hat zu jedem Rezept eine Küche und gültige Links zu Foto und Video", () => {
    for (const r of RECIPES) {
      expect(r.tags.length, r.id).toBeGreaterThan(0);
      const image = r.media?.image;
      if (image) {
        expect(image.uri, r.id).toMatch(/^https:\/\/(upload\.wikimedia\.org|live\.staticflickr\.com)\//);
        // Frei lizenziert: Urheber und Lizenz müssen angezeigt werden.
        expect(image.credit, r.id).toMatch(/CC0|Public Domain|CC BY/);
        // CC BY verlangt die Nennung des Urhebers.
        if (/CC BY/.test(image.credit ?? "")) expect(image.credit, r.id).not.toMatch(/^unbekannt/);
      }
      for (const video of r.media?.videos ?? []) expect(video.url, r.id).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/);
    }
    // 24.11.2026: Fotos mit Fleisch oder Fisch bei vegetarischen Rezepten entfernt (siehe recipeImages.ts), jetzt 177.
    expect(RECIPES.filter((r) => r.media?.image).length).toBeGreaterThanOrEqual(175);
    expect(RECIPES.filter((r) => r.media?.videos?.length).length).toBeGreaterThanOrEqual(180);
  });

  it("verlinkt bei vegetarischen und veganen Rezepten keine Videos mit Fleisch oder Fisch im Titel (fünf Sprachen)", () => {
    // Auch zusammengesetzte Wörter („Zitronenhähnchen“, „Hackfleich“), aber nicht „ohne Hack“, „Palatschinken“,
    // „Chili sin carne“, „sans viande“, „meat-free“ oder „lamb's lettuce“ (Feldsalat).
    const meatOrFish = new RegExp(
      [
        // Deutsch
        "hähnchen|hühnchen|\\bhuhn\\b|hühner|hendl|garnele|krabben|hackfleis?ch|(?<!ohne )\\bhack\\b|\\bspeck\\b|(?<!palat)schinken|wurst|würstchen|lachs|thunfisch|\\bfisch|rindfleisch|rinder|schweine?fleisch|\\bkalb|\\blamm|\\bpute|meeresfrüchte|sardellen",
        // Englisch
        "chicken|shrimp|prawn|\\bbeef\\b|\\bpork\\b|bacon|\\bham\\b|sausage|\\bfish\\b|salmon|\\btuna\\b|anchov|seafood|\\bcrab\\b|\\bduck\\b|\\blamb\\b(?!'s lettuce)|(?<!(no|without|vegan|fake|plant-based) )\\bmeat\\b(?![- ]?(free|less|substitute|alternative))",
        // Französisch
        "poulet|\\bporc\\b|b(œ|oe)uf|\\bveau\\b|agneau|jambon|lardons?|saucisse|poisson|saumon|\\bthon\\b|crevette|fruits de mer|canard|(?<!sans )viande",
        // Italienisch (pollo und carne auch Spanisch)
        "pollo|manzo|maiale|vitello|agnello|prosciutto|pancetta|guanciale|salsiccia|\\bpesce|salmone|tonno|gamber|acciugh|frutti di mare|(?<!(senza|sin|sans) )\\bcarne\\b",
        // Spanisch
        "cerdo|ternera|jam(ó|o)n|tocino|chorizo|pescado|salm(ó|o)n|at(ú|u)n|camarones|gambas|langostino|mariscos|anchoa",
      ].join("|"),
      "i",
    );
    let checked = 0;
    for (const r of RECIPES) {
      const diet = recipeDiet(r, ingredientById);
      if (diet !== "vegetarisch" && diet !== "vegan") continue;
      for (const video of r.media?.videos ?? []) {
        expect(video.title ?? "", `${r.id} (${video.language})`).not.toMatch(meatOrFish);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    // Gegenprobe: Die früher verlinkten Titel und typische Titel in den anderen Sprachen wären aufgefallen …
    for (const title of [
      "Zitronenhähnchen auf Erbsen-Risotto",
      "Gefüllte Zucchini - mit Hackfleich Paprika und Feta",
      "Chicken Biryani",
      "Lentil soup with bacon",
      "Classic meat lasagna",
      "Poulet basquaise",
      "Quiche lorraine aux lardons",
      "Spaghetti alla carbonara con guanciale",
      "Ragù di carne",
      "Tacos de pescado",
      "Lentejas con chorizo",
    ]) {
      expect(title).toMatch(meatOrFish);
    }
    // … diese hier nicht.
    for (const title of ["Veganes Chili sin Carne", "Palatschinken mit Marmelade", "Lentil bolognese (meat-free)", "Lamb's lettuce salad", "Bolognaise sans viande", "Ragù senza carne"]) {
      expect(title).not.toMatch(meatOrFish);
    }
  });

  it("ordnet jedes Video genau einer der fünf Sprachen zu, höchstens eines je Sprache und Rezept", () => {
    const recipeIds = new Set(RECIPES.map((r) => r.id));
    const youtubeIds = new Set<string>();
    for (const language of VIDEO_LANGUAGES) {
      for (const [recipeId, video] of Object.entries(RECIPE_VIDEOS[language])) {
        // Nur Rezepte aus dem Katalog (sonst ein Tippfehler in der Rezept-ID).
        expect(recipeIds.has(recipeId), `${language}/${recipeId}`).toBe(true);
        expect(video.youtubeId, `${language}/${recipeId}`).toMatch(/^[\w-]{11}$/);
        expect(video.title.trim(), `${language}/${recipeId}`).not.toBe("");
        expect(video.channel.trim(), `${language}/${recipeId}`).not.toBe("");
        // Ein Video gehört zu einem Rezept und einer Sprache.
        expect(youtubeIds.has(video.youtubeId), `${language}/${recipeId} doppelt`).toBe(false);
        youtubeIds.add(video.youtubeId);
      }
    }
    for (const r of RECIPES) {
      const languages = (r.media?.videos ?? []).map((v) => v.language);
      for (const language of languages) expect(VIDEO_LANGUAGES as readonly (string | undefined)[], r.id).toContain(language);
      expect(new Set(languages).size, r.id).toBe(languages.length);
    }
    // Stand 24.11.2026: 193 deutsche Videos; die übrigen Sprachen kommen nach und nach dazu (siehe BACKLOG.md).
    expect(Object.keys(RECIPE_VIDEOS.de).length).toBeGreaterThanOrEqual(190);
  });
});
