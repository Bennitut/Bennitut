import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DICTIONARIES,
  UI_LANGUAGES,
  contentLocale,
  formatNumber,
  formatPrice,
  isUILanguage,
  regionFromCode,
  regionalize,
  translate,
  type TKey,
} from "../src/i18n";

type Tree = { [key: string]: string | Tree };

/** Alle Texte einer Sprache als „bereich.schluessel“ → Text. */
function flatten(tree: Tree, prefix = "", out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else flatten(value, path, out);
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("Übersetzungen", () => {
  it("setzt Platzhalter ein und lässt unbekannte stehen", () => {
    assert.equal(translate("de", "plan.week", { n: 2 }), "Woche 2");
    assert.equal(translate("en", "plan.week", { n: 2 }), "Week 2");
    assert.equal(translate("de", "shopping.packs", { packs: 2, size: 500 }), "2 × 500 {unit}");
  });

  it("gibt bei unbekannten Schlüsseln den Schlüssel zurück", () => {
    assert.equal(translate("de", "gibt.es.nicht" as TKey), "gibt.es.nicht");
    assert.equal(translate("de", "plan" as TKey), "plan");
  });

  it("hat in jeder Sprache alle Texte mit denselben Platzhaltern wie auf Deutsch", () => {
    const german = flatten(DICTIONARIES.de as unknown as Tree);
    assert.ok(german.size > 100);
    for (const language of UI_LANGUAGES) {
      const texts = flatten(DICTIONARIES[language] as unknown as Tree);
      assert.deepEqual([...texts.keys()].sort(), [...german.keys()].sort(), language);
      for (const [key, text] of texts) {
        assert.ok(text.trim().length > 0, `${language}: ${key} ist leer`);
        assert.deepEqual(placeholders(text), placeholders(german.get(key)!), `${language}: ${key}`);
      }
    }
  });
});

describe("Sprache und Region", () => {
  it("schreibt in der Schweiz „ss“ statt „ß“, nur auf Deutsch", () => {
    assert.equal(regionalize("Große Portion, süß", "de", "CH"), "Grosse Portion, süss");
    assert.equal(regionalize("Große Portion", "de", "AT"), "Große Portion");
    assert.equal(regionalize("Große Portion", "en", "CH"), "Große Portion");
  });

  it("nimmt für Inhalte auf Deutsch österreichische bzw. Schweizer Begriffe", () => {
    assert.equal(contentLocale("de", "AT"), "de-AT");
    assert.equal(contentLocale("de", "CH"), "de-CH");
    assert.equal(contentLocale("de", "DE"), "de");
    assert.equal(contentLocale("en", "AT"), "en");
  });

  it("erkennt Sprache und Region des Geräts", () => {
    assert.ok(isUILanguage("de") && isUILanguage("es"));
    assert.ok(!isUILanguage("pt") && !isUILanguage(null) && !isUILanguage(undefined));
    assert.equal(regionFromCode("AT"), "AT");
    assert.equal(regionFromCode("CH"), "CH");
    assert.equal(regionFromCode("JP"), "INT");
    assert.equal(regionFromCode(null), "INT");
  });

  it("rechnet Richtpreise in die Landeswährung um", () => {
    const plain = (text: string) => text.replace(/\s/g, " ");
    assert.equal(plain(formatPrice(10, "de", "DE")), "10,00 €");
    assert.match(plain(formatPrice(10, "de", "AT")), /11,00/); // Preisniveau Österreich +10 %
    assert.match(plain(formatPrice(10, "de", "CH")), /CHF/);
    assert.match(plain(formatPrice(10, "de", "CH")), /16[.,]00/); // Schweiz in Franken, +60 %
    assert.match(plain(formatPrice(10, "en", "INT")), /€\s?10\.00/);
  });

  it("zeigt Zahlen mit höchstens einer Nachkommastelle im Format der Sprache", () => {
    assert.equal(formatNumber(1234.56, "de"), "1.234,6");
    assert.equal(formatNumber(1234.56, "en"), "1,234.6");
    assert.equal(formatNumber(2, "de"), "2");
  });
});
