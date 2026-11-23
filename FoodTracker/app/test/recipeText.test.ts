import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RECIPES } from "../src/lib/catalog";
import { localizeRecipe, needsTranslation, withStoredTexts } from "../src/lib/recipeText";
import type { Recipe, RecipeText } from "../src/lib/types";
import { recipe } from "./fixtures";

/** Wie ein Katalogrezept: Deutsch, Englisch vollständig, andere Sprachen nur mit Namen. */
const soup: Recipe = recipe({
  id: "kuerbissuppe",
  ingredients: [],
  language: "de",
  name: "Kürbissuppe",
  steps: ["Kürbis würfeln.", "Weich kochen und pürieren."],
  otherIngredients: ["Salz"],
  translations: {
    en: { name: "Pumpkin soup", steps: ["Dice the pumpkin.", "Simmer and blend."], otherIngredients: ["Salt"] },
    fr: { name: "Soupe de potiron" },
  },
});

const original = (r: Recipe): Required<RecipeText> => ({ name: r.name, steps: r.steps, otherIngredients: r.otherIngredients });

describe("Rezepttexte je Sprache", () => {
  it("zeigt in der Sprache des Rezepts das Original, sonst die Übersetzung", () => {
    assert.deepEqual(localizeRecipe(soup, "de"), original(soup));
    assert.deepEqual(localizeRecipe(soup, "en"), soup.translations!.en);
  });

  it("nimmt, was der Übersetzung fehlt, aus dem Englischen", () => {
    assert.deepEqual(localizeRecipe(soup, "fr"), { ...soup.translations!.en, name: "Soupe de potiron" });
    assert.deepEqual(localizeRecipe(soup, "it"), soup.translations!.en);
  });

  it("fällt ohne englische Übersetzung auf das Original zurück", () => {
    const ratatouille = recipe({ id: "ratatouille", ingredients: [], language: "fr", name: "Ratatouille", steps: ["Couper les légumes."] });
    assert.deepEqual(localizeRecipe(ratatouille, "de"), original(ratatouille));
    // Englische Rezepte (z. B. importiert) zeigen ihren eigenen Text, nicht den einer anderen Übersetzung.
    const porridge = recipe({ id: "porridge", ingredients: [], language: "en", name: "Porridge", steps: ["Cook the oats."], translations: { de: { name: "Haferbrei" } } });
    assert.deepEqual(localizeRecipe(porridge, "de"), { ...original(porridge), name: "Haferbrei" });
    assert.deepEqual(localizeRecipe(porridge, "fr"), original(porridge));
  });

  it("bietet „Übersetzen“ nur an, wenn die Zubereitung in der Sprache fehlt", () => {
    assert.equal(needsTranslation(soup, "de"), false);
    assert.equal(needsTranslation(soup, "en"), false);
    assert.equal(needsTranslation(soup, "fr"), true); // nur der Name ist übersetzt
    assert.equal(needsTranslation(soup, "it"), true);
    const porridge = recipe({ id: "porridge", ingredients: [], language: "en", translations: { de: { name: "Haferbrei" } } });
    assert.equal(needsTranslation(porridge, "de"), true);
    assert.equal(needsTranslation(porridge, "en"), false);
  });
});

describe("Gespeicherte Übersetzungen und mit KI verbesserte Texte", () => {
  const french: Record<string, RecipeText> = {
    fr: { name: "Velouté de potiron", steps: ["Couper le potiron.", "Cuire et mixer."], otherIngredients: ["Sel"] },
  };

  it("übernimmt die Übersetzung von Claude; danach gibt es kein „Übersetzen“ mehr", () => {
    const before = structuredClone(soup);
    const translated = withStoredTexts(soup, french);
    assert.deepEqual(localizeRecipe(translated, "fr"), french.fr);
    assert.equal(needsTranslation(translated, "fr"), false);
    assert.deepEqual(localizeRecipe(translated, "en"), soup.translations!.en); // andere Sprachen bleiben
    assert.deepEqual(soup, before); // das Rezept selbst bleibt unverändert
    assert.equal(withStoredTexts(soup), soup);
  });

  it("ersetzt mit einem verbesserten Text das Original bzw. die Übersetzung seiner Sprache", () => {
    const german = { name: "Kürbiscremesuppe", steps: ["Kürbis würfeln.", "Mit Brühe weich kochen.", "Pürieren."] };
    const improved = withStoredTexts(soup, undefined, { de: german });
    assert.deepEqual(localizeRecipe(improved, "de"), { ...german, otherIngredients: ["Salz"] }); // fehlende Teile bleiben
    assert.deepEqual(localizeRecipe(improved, "en"), soup.translations!.en);

    const english = { name: "Creamy pumpkin soup", steps: ["Dice.", "Simmer.", "Blend."], otherIngredients: ["Salt", "Pepper"] };
    assert.deepEqual(localizeRecipe(withStoredTexts(soup, undefined, { en: english }), "en"), english);
    assert.deepEqual(localizeRecipe(withStoredTexts(soup, undefined, { en: english }), "it"), english); // auch als Fallback
  });

  it("lässt den verbesserten Text vor der Übersetzung gelten; ohne ihn („Wiederherstellen“) gilt wieder die Übersetzung", () => {
    const better = { name: "Velouté de potiron rôti", steps: ["Rôtir le potiron.", "Mixer."], otherIngredients: ["Sel", "Muscade"] };
    assert.deepEqual(localizeRecipe(withStoredTexts(soup, french, { fr: better }), "fr"), better);
    assert.deepEqual(localizeRecipe(withStoredTexts(soup, french, {}), "fr"), french.fr);
  });
});

describe("Katalog in den fünf Sprachen der App", () => {
  it("Deutsch und Englisch vollständig, sonst eigener Name mit englischer Zubereitung und „Übersetzen“", () => {
    assert.ok(RECIPES.length > 200);
    for (const r of RECIPES) {
      const en = r.translations?.en;
      assert.ok(en?.steps && en.otherIngredients, `${r.id}: Englisch unvollständig`);
      assert.deepEqual(localizeRecipe(r, "de"), original(r), r.id);
      assert.deepEqual(localizeRecipe(r, "en"), en, r.id);
      assert.ok(!needsTranslation(r, "de") && !needsTranslation(r, "en"), r.id);
      for (const language of ["fr", "it", "es"]) {
        const name = r.translations?.[language]?.name;
        assert.ok(name, `${r.id}: kein Name auf ${language}`);
        assert.deepEqual(localizeRecipe(r, language), { ...en, name }, `${r.id} (${language})`);
        assert.ok(needsTranslation(r, language), `${r.id} (${language})`);
      }
    }
  });
});
