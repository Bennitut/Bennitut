import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

/** Öffnende `<Card …>`-Tags aus allen Bildschirmen und Komponenten, mit Datei (Klammern in Attributen zählen mit). */
function cardTags(): { file: string; tag: string }[] {
  const src = join(__dirname, "../src");
  const tags: { file: string; tag: string }[] = [];
  for (const file of readdirSync(src, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".tsx"))) {
    const source = readFileSync(join(src, file), "utf8");
    for (const match of source.matchAll(/<Card\b/g)) {
      let depth = 0;
      for (let i = match.index; i < source.length; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") depth--;
        else if (source[i] === ">" && depth === 0) {
          tags.push({ file, tag: source.slice(match.index, i + 1) });
          break;
        }
      }
    }
  }
  return tags;
}

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

  it("zeigt in Karten mit eigenem Symbol kein zweites Emoji vor dem Titel", () => {
    // <Card title={t("…")} icon="👥"> zeigt das Symbol schon in der Blase; beginnt der Text auch mit einem Emoji,
    // stehen zwei nebeneinander (früher „👥 👥 Nutzerverzeichnis“). Texte mit Emoji für Knöpfe bekommen einen eigenen
    // Schlüssel, z. B. account.directory (Knopf) und account.directoryTitle (Karte, Kopfzeile).
    const texts = new Map(UI_LANGUAGES.map((language) => [language, flatten(DICTIONARIES[language] as unknown as Tree)]));
    const withIcon = cardTags().filter(({ tag }) => /\sicon=/.test(tag));
    assert.ok(withIcon.length > 20, `nur ${withIcon.length} Karten mit Symbol gefunden`);
    for (const { file, tag } of withIcon) {
      const title = tag.match(/\stitle=\{([^}]*)\}/)?.[1] ?? "";
      for (const [, key] of title.matchAll(/\bt\("([\w.]+)"/g)) {
        for (const [language, dictionary] of texts) {
          const text = dictionary.get(key!);
          assert.ok(text !== undefined, `${file}: ${key} fehlt (${language})`);
          assert.doesNotMatch(text, /^\p{Extended_Pictographic}/u, `${file}: ${key} (${language}) = „${text}“`);
        }
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
