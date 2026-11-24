import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bulletText, describePlaceholder, isMissing, missingIn, orPlaceholder, parseInline, placeholdersIn } from "../src/lib/legal";
import { ANGABEN, type Angaben } from "../src/legal/angaben";
import { datenschutz, impressum, legalDocuments, missingLegalInfo } from "../src/legal/texte";

/** Ausgedachte, vollständige Angaben – nur für die Tests. */
const COMPLETE: Angaben = {
  name: "Erika Muster",
  wohnort: "Graz",
  email: "foodtracker@example.org",
  stand: "1. Dezember 2026",
  webAdresse: "bennitut.github.io",
};

const allText = (sections: { title: string; blocks: string[] }[]) => sections.flatMap((s) => [s.title, ...s.blocks]).join("\n");

describe("Platzhalter in Impressum und Datenschutzerklärung", () => {
  it("erkennt leere Felder und [[…]] als fehlend", () => {
    assert.equal(isMissing(""), true);
    assert.equal(isMissing("   "), true);
    assert.equal(isMissing(undefined), true);
    assert.equal(isMissing("[[ANGABE: Vor- und Nachname]]"), true);
    assert.equal(isMissing("Erika [[ANGABE: Nachname]]"), true);
    assert.equal(isMissing("Erika Muster"), false);
  });

  it("ersetzt fehlende Angaben durch einen Platzhalter und behält vorhandene", () => {
    assert.equal(orPlaceholder("  Graz ", "Wohnort"), "Graz");
    assert.equal(orPlaceholder("", "Wohnort"), "[[ANGABE: Wohnort]]");
    assert.equal(orPlaceholder("[[ANGABE: Ort, z. B. Graz]]", "Wohnort"), "[[ANGABE: Ort, z. B. Graz]]");
  });

  it("liest Art und Bezeichnung der Platzhalter", () => {
    assert.deepEqual(placeholdersIn("Name: [[ANGABE: Vor- und Nachname]], [[PRÜFEN: Frist]] und [[frei]]"), [
      { type: "ANGABE", label: "Vor- und Nachname" },
      { type: "PRÜFEN", label: "Frist" },
      { type: "", label: "frei" },
    ]);
    assert.equal(describePlaceholder({ type: "ANGABE", label: "E-Mail-Adresse" }), "E-Mail-Adresse");
    assert.equal(describePlaceholder({ type: "ENTSCHEIDUNG", label: "Mindestalter" }), "Entscheidung: Mindestalter");
    assert.equal(describePlaceholder({ type: "PRÜFEN", label: "Frist" }), "Prüfen: Frist");
  });

  it("zählt jeden fehlenden Punkt nur einmal", () => {
    const sections = [
      { title: "Impressum", level: 1 as const, blocks: ["Stand: [[ANGABE: Datum]]", "[[ANGABE: Datum]] und [[ANGABE: Name]]"] },
      { title: "Datenschutz", level: 1 as const, blocks: ["Stand: [[ANGABE: Datum]]"] },
    ];
    assert.deepEqual(
      missingIn(sections).map((p) => p.label),
      ["Datum", "Name"],
    );
  });
});

describe("Absätze zerlegen", () => {
  it("trennt Text, fett, Links und Platzhalter", () => {
    assert.deepEqual(parseInline("**Löschen:** bis [[ANGABE: Frist]], mehr in der [Erklärung](https://example.org/a)."), [
      { kind: "text", text: "Löschen:", bold: true },
      { kind: "text", text: " bis ", bold: false },
      { kind: "placeholder", type: "ANGABE", label: "Frist" },
      { kind: "text", text: ", mehr in der ", bold: false },
      { kind: "link", text: "Erklärung", url: "https://example.org/a", bold: false },
      { kind: "text", text: ".", bold: false },
    ]);
  });

  it("erkennt mailto-Links und lässt einzelne Klammern als Text stehen", () => {
    assert.deepEqual(parseInline("E-Mail: [a@b.at](mailto:a@b.at)"), [
      { kind: "text", text: "E-Mail: ", bold: false },
      { kind: "link", text: "a@b.at", url: "mailto:a@b.at", bold: false },
    ]);
    assert.deepEqual(parseInline("Liste [1] (siehe oben)"), [{ kind: "text", text: "Liste [1] (siehe oben)", bold: false }]);
    // Nur https://, http:// und mailto: werden zu Links – kein javascript: o. Ä.
    assert.deepEqual(parseInline("[x](javascript:alert(1))"), [{ kind: "text", text: "[x](javascript:alert(1))", bold: false }]);
  });

  it("erkennt Aufzählungspunkte", () => {
    assert.equal(bulletText("- Punkt"), "Punkt");
    assert.equal(bulletText("Absatz – mit Gedankenstrich"), null);
  });
});

describe("Texte der App", () => {
  it("sind ohne Angaben ein Entwurf und nennen genau die fehlenden Angaben", () => {
    const missing = missingLegalInfo({ withServer: false }, ANGABEN);
    if (Object.values(ANGABEN).every((v) => !isMissing(v))) {
      // Benjamin hat alles eingetragen: dann ist die Fassung ohne Server fertig.
      assert.deepEqual(missing, []);
      return;
    }
    assert.ok(missing.length > 0);
    assert.ok(missing.every((p) => p.type === "ANGABE"), "ohne Server nur fehlende Angaben, keine offenen Entscheidungen");
  });

  it("sind mit allen Angaben ohne Server fertig (Impressum Variante A, Datenschutz Teil A)", () => {
    assert.deepEqual(missingLegalInfo({ withServer: false }, COMPLETE), []);
    const docs = legalDocuments({ withServer: false }, COMPLETE);
    const text = allText([...docs.impressum, ...docs.datenschutz]);
    for (const expected of ["Offenlegung gemäß § 25 Mediengesetz", "Medieninhaber: Erika Muster", "Wohnort: Graz", "Teil A", "GitHub Pages", "Deine Rechte"]) {
      assert.ok(text.includes(expected), `fehlt: ${expected}`);
    }
    assert.ok(text.includes("[foodtracker@example.org](mailto:foodtracker@example.org)"), "E-Mail als Link");
    assert.ok(!text.includes("Teil B"), "Teil B erst mit Server");
    assert.ok(!text.includes("Mindestalter"), "Mindestalter erst mit Server");
    assert.ok(!/undefined|\{\w+\}/.test(text), "keine leeren Felder oder vergessenen Platzhalter in geschweiften Klammern");
  });

  it("zeigen ein leeres Feld als fehlende Angabe statt als leere Zeile", () => {
    const missing = missingLegalInfo({ withServer: false }, { ...COMPLETE, name: " ", email: "" }).map((p) => p.label);
    assert.deepEqual(missing, ["Vor- und Nachname", "E-Mail-Adresse"]);
  });

  it("bleiben mit Server ein Entwurf, bis Teil B fertig ist", () => {
    const missing = missingLegalInfo({ withServer: true }, COMPLETE);
    assert.ok(missing.some((p) => p.type === "ANGABE" && p.label.startsWith("Hoster")));
    assert.ok(missing.some((p) => p.type === "ENTSCHEIDUNG" && p.label.startsWith("Mindestalter")));
    const text = allText(datenschutz({ withServer: true }, COMPLETE));
    assert.ok(text.includes("Teil B – Funktionen mit Server"));
    assert.ok(text.includes("B6. Sicherung der Ernährungshistorie"));
  });

  it("nummerieren die Abschnitte lückenlos", () => {
    for (const withServer of [false, true]) {
      const numbers = datenschutz({ withServer }, COMPLETE)
        .map((s) => s.title.match(/^(\d+)\. /)?.[1])
        .filter((n): n is string => !!n)
        .map(Number);
      assert.deepEqual(
        numbers,
        numbers.map((_, i) => i + 1),
        `Abschnitte ${withServer ? "mit" : "ohne"} Server: ${numbers.join(", ")}`,
      );
    }
  });

  it("haben eindeutige Überschriften (sie dienen in der App als Schlüssel)", () => {
    for (const withServer of [false, true]) {
      const titles = [...impressum(COMPLETE), ...datenschutz({ withServer }, COMPLETE)].map((s) => s.title);
      assert.equal(new Set(titles).size, titles.length);
    }
  });
});
