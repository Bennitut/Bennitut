import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { bulletText, contactLine, describePlaceholder, isMissing, missingIn, orPlaceholder, parseInline, placeholdersIn } from "../src/lib/legal";
import { ANGABEN, type Angaben, type Betrieb } from "../src/legal/angaben";
import { datenschutz, impressum, legalDocuments, missingLegalInfo } from "../src/legal/texte";

/** Ausgedachte, vollständige Angaben – nur für die Tests. */
const COMPLETE: Angaben = {
  name: "Erika Muster",
  strasse: "Musterstraße",
  hausnummer: "12/3/4",
  plz: "8010",
  ort: "Graz",
  email: "foodtracker@example.org",
  zweiterKontakt: "+43 660 1234567",
  stand: "1. Dezember 2026",
  webAdresse: "bennitut.github.io",
};

/** Alle Felder leer – so sieht man, welche Angaben das Impressum verlangt. */
const EMPTY: Angaben = {
  name: "",
  strasse: "",
  hausnummer: "",
  plz: "",
  ort: "",
  email: "",
  zweiterKontakt: "",
  stand: "",
  webAdresse: "bennitut.github.io",
};

/** Noch nicht entschieden, wie der Server läuft (so steht es in angaben.ts, bis Benjamin wählt). */
const OFFEN: Betrieb = { weg: "", ki: "" };

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

  it("zeigt eine reine Telefonnummer als „Telefon: …“ und anderes so, wie es eingetragen ist", () => {
    assert.equal(contactLine("+43 660 1234567", "Kontakt"), "Telefon: +43 660 1234567");
    assert.equal(contactLine(" 0660/1234567 ", "Kontakt"), "Telefon: 0660/1234567");
    assert.equal(contactLine("+43 (0)316 123456-7", "Kontakt"), "Telefon: +43 (0)316 123456-7");
    assert.equal(contactLine("Telefon: +43 660 1234567", "Kontakt"), "Telefon: +43 660 1234567");
    assert.equal(contactLine("Kontaktformular: https://example.org/kontakt", "Kontakt"), "Kontaktformular: https://example.org/kontakt");
    assert.equal(contactLine("", "Zweiter Kontaktweg"), "[[ANGABE: Zweiter Kontaktweg]]");
    assert.equal(contactLine("[[ANGABE: Telefonnummer]]", "Kontakt"), "[[ANGABE: Telefonnummer]]");
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

  it("sind mit allen Angaben ohne Server fertig (Impressum Variante B, Datenschutz Teil A)", () => {
    assert.deepEqual(missingLegalInfo({ withServer: false }, COMPLETE), []);
    const docs = legalDocuments({ withServer: false }, COMPLETE);
    const text = allText([...docs.impressum, ...docs.datenschutz]);
    for (const expected of [
      "Angaben gemäß § 5 E-Commerce-Gesetz und Offenlegung gemäß § 25 Mediengesetz",
      "Medieninhaber und Diensteanbieter:\nErika Muster\nMusterstraße 12/3/4\n8010 Graz\nÖsterreich",
      "Telefon: +43 660 1234567",
      "Gegenstand: ",
      "Teil A",
      "GitHub Pages",
      "Deine Rechte",
    ]) {
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

  it("verlangen im Impressum die vollen Angaben nach § 5 ECG: Name, Anschrift, E-Mail und einen zweiten Kontaktweg", () => {
    assert.deepEqual(
      missingIn(impressum(EMPTY)).map((p) => p.label),
      ["Vor- und Nachname", "Straße", "Hausnummer mit Stiege und Tür", "Postleitzahl", "Ort", "E-Mail-Adresse", "Zweiter Kontaktweg, z. B. Telefonnummer", "Datum („Stand“)"],
    );
  });

  it("nennen unter „Verantwortlich“ dieselbe volle Anschrift wie das Impressum", () => {
    const verantwortlich = datenschutz({ withServer: false }, COMPLETE).find((s) => s.title === "1. Verantwortlich");
    assert.ok(verantwortlich);
    assert.equal(
      verantwortlich.blocks[0],
      "Erika Muster\nMusterstraße 12/3/4\n8010 Graz\nÖsterreich\nE-Mail: [foodtracker@example.org](mailto:foodtracker@example.org)",
    );
  });

  it("bleiben mit Server ein Entwurf, bis Teil B fertig ist", () => {
    const missing = missingLegalInfo({ withServer: true }, COMPLETE, OFFEN);
    assert.ok(missing.some((p) => p.type === "ENTSCHEIDUNG" && p.label.startsWith("Weg des Servers")));
    assert.ok(missingLegalInfo({ withServer: true }, COMPLETE, { weg: "b", ki: "claude" }).length > 0, "auch mit Weg und KI");
    const text = allText(datenschutz({ withServer: true }, COMPLETE, OFFEN));
    assert.ok(text.includes("Teil B – Funktionen mit Server"));
    assert.ok(text.includes("B6. Sicherung der Ernährungshistorie"));
  });

  it("nennen mit Server kein Mindestalter, aber die Zustimmung eines Elternteils und die Einwilligung vor der KI", () => {
    const sections = datenschutz({ withServer: true }, COMPLETE);
    const age = sections.find((s) => /^\d+\. Mindestalter$/.test(s.title));
    assert.ok(age, "Abschnitt Mindestalter");
    const ageText = age.blocks.join("\n");
    assert.ok(!ageText.includes("[["), "keine Platzhalter mehr");
    for (const expected of ["kein Mindestalter", "unter 14", "Zustimmung eines Elternteils", "bis 18", "§ 4 Abs. 4 DSG"]) {
      assert.ok(ageText.includes(expected), `fehlt: ${expected}`);
    }
    const missing = missingLegalInfo({ withServer: true }, COMPLETE);
    assert.ok(!missing.some((p) => p.label.startsWith("Mindestalter") || p.label.startsWith("Einwilligung")), JSON.stringify(missing));
    const ai = sections.find((s) => s.title === "B3. KI-Funktionen");
    assert.ok(ai?.blocks.some((b) => b.includes("vor der ersten Nutzung") && b.includes("„KI-Funktionen“") && b.includes("widerrufen")));
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

describe("Betrieb des Servers (Teil B: Kurz gesagt, B1 und B3)", () => {
  const sections = (betrieb: Betrieb) => datenschutz({ withServer: true }, COMPLETE, betrieb);
  const section = (betrieb: Betrieb, title: string) => {
    const found = sections(betrieb).find((s) => s.title === title);
    assert.ok(found, `Abschnitt ${title}`);
    return found.blocks.join("\n");
  };
  const missingLabels = (betrieb: Betrieb) => missingLegalInfo({ withServer: true }, COMPLETE, betrieb).map((p) => `${p.type}: ${p.label}`);
  const VARIANTEN: Betrieb[] = [
    OFFEN,
    { weg: "a", ki: "ollama" },
    { weg: "a", ki: "claude" },
    { weg: "a", ki: "keine" },
    { weg: "b", ki: "claude" },
    { weg: "b", ki: "ollama-laptop" },
    { weg: "b", ki: "keine" },
  ];

  it("fragt nach Weg und KI, solange nichts entschieden ist – mit Platzhaltern statt Angaben zu Diensten", () => {
    const missing = missingLabels(OFFEN);
    assert.ok(missing.some((m) => m.startsWith("ENTSCHEIDUNG: Weg des Servers")), missing.join("\n"));
    assert.ok(missing.some((m) => m.startsWith("ENTSCHEIDUNG: KI des Servers")), missing.join("\n"));
    // Außerhalb der Platzhalter (die nennen die Möglichkeiten) noch kein Dienst.
    const text = allText(sections(OFFEN)).replace(/\[\[[^\]]*\]\]/g, "");
    for (const service of ["Render", "Neon", "Anthropic Ireland", "Cloudflare Tunnel"]) assert.ok(!text.includes(service), `nennt schon ${service}`);
  });

  it("Weg a: Laptop mit Cloudflare Tunnel, ohne Hoster, Render oder Neon", () => {
    const b1 = section({ weg: "a", ki: "ollama" }, "B1. Server");
    for (const expected of ["auf meinem eigenen Rechner", "Ein Hoster ist nicht beteiligt", "Cloudflare, Inc.", "endet bei Cloudflare", "samt Inhalt und deine IP-Adresse", "Fassung 6.4 vom 3. April 2026", "EU-U.S. Data Privacy Framework", "speichert sie nicht"]) {
      assert.ok(b1.includes(expected), `fehlt: ${expected}`);
    }
    assert.ok(!/Render|Neon/.test(b1));
    const missing = missingLabels({ weg: "a", ki: "ollama" });
    assert.ok(missing.some((m) => m.startsWith("PRÜFEN: Der Vertrag mit Cloudflare gilt nur mit einem Cloudflare-Konto")), "Vertrag mit Cloudflare prüfen");
    assert.ok(!missing.some((m) => /Weg des Servers|KI des Servers|Hoster|Objektspeicher|welche Daten|Frist$/.test(m)), missing.join("\n"));
    const b3 = section({ weg: "a", ki: "ollama" }, "B3. KI-Funktionen");
    assert.ok(b3.includes("auf demselben Rechner läuft wie der Server") && b3.includes("an keinen KI-Anbieter"));
    assert.ok(!b3.includes("Anthropic"));
  });

  it("Weg b: Render und Neon in Frankfurt, mit den Angaben aus deren Verträgen und Prüfpunkten für Neon und das Protokoll", () => {
    const b1 = section({ weg: "b", ki: "claude" }, "B1. Server");
    for (const expected of ["Render Services, Inc.", "Region Frankfurt am Main", "Neon, LLC, ein Unternehmen der Databricks, Inc.", "Art. 28 DSGVO", "hauptsächlich in den USA", "seit 6. Jänner 2025 zertifiziert", "Standardvertragsklauseln"]) {
      assert.ok(b1.includes(expected), `fehlt: ${expected}`);
    }
    assert.ok(!b1.includes("Cloudflare Tunnel"), "ohne KI vom Laptop kein Tunnel");
    const missing = missingLabels({ weg: "b", ki: "claude" });
    assert.ok(missing.some((m) => m.startsWith("PRÜFEN: Vertrag zur Auftragsverarbeitung, Unterauftragsverarbeiter und Grundlage der Übermittlung in die USA bei Neon")));
    assert.ok(missing.some((m) => m.startsWith("PRÜFEN: Wie lange Render das Protokoll aufbewahrt")));
    assert.ok(!missing.some((m) => m.includes("Cloudflare")), missing.join("\n"));
  });

  it("Claude: Anthropic Ireland als Vertragspartner, Auftragsverarbeitungsvertrag und Standardvertragsklauseln – ohne Platzhalter", () => {
    const b3 = section({ weg: "b", ki: "claude" }, "B3. KI-Funktionen");
    for (const expected of ["an Claude, ein KI-Modell von Anthropic", "Anthropic Ireland, Limited", "Dublin 4, D04 TR29, Irland", "Stand 17. Juni 2025", "Stand 24. Februar 2025", "nicht zum Training", "Standardvertragsklauseln", "nach spätestens 30 Tagen gelöscht"]) {
      assert.ok(b3.includes(expected), `fehlt: ${expected}`);
    }
    assert.ok(!b3.includes("[["), "B3 mit Claude ohne Platzhalter");
    assert.ok(section({ weg: "a", ki: "claude" }, "B3. KI-Funktionen").includes("Anthropic Ireland, Limited"), "Claude auch bei Weg a");
  });

  it("KI vom Laptop: Render erreicht den Laptop über Cloudflare – ohne deine IP-Adresse, nur bei Weg b", () => {
    const relay: Betrieb = { weg: "b", ki: "ollama-laptop" };
    const b1 = section(relay, "B1. Server");
    assert.ok(b1.includes("Für die KI-Funktionen (B3) erreicht der Server meinen Rechner über Cloudflare Tunnel"));
    assert.ok(!b1.includes("deine IP-Adresse als"), "die Anfragen an den Laptop stellt der Server, nicht dein Gerät");
    assert.ok(section(relay, "B3. KI-Funktionen").includes("über den Server und Cloudflare Tunnel (B1) an ein KI-Modell (Ollama) auf meinem eigenen Rechner"));
    assert.ok(section(relay, "Kurz gesagt").includes("über Cloudflare erreicht"));
    assert.ok(missingLabels(relay).some((m) => m.startsWith("PRÜFEN: Der Vertrag mit Cloudflare")));
    // Bei Weg a ist der Laptop der Server selbst – „KI vom Laptop“ passt dort nicht.
    assert.ok(missingLabels({ weg: "a", ki: "ollama-laptop" }).some((m) => m.startsWith("ENTSCHEIDUNG: „KI vom Laptop“ gibt es nur bei Weg b")));
  });

  it("ohne KI: B3 sagt, dass nichts an eine KI geht", () => {
    for (const weg of ["a", "b"] as const) {
      const b3 = section({ weg, ki: "keine" }, "B3. KI-Funktionen");
      assert.ok(b3.includes("keine KI-Funktionen") && b3.includes("nichts an eine KI"));
      assert.ok(!b3.includes("Rechtsgrundlage"), "ohne KI keine Einwilligung");
      assert.ok(section({ weg, ki: "keine" }, "Kurz gesagt").includes("Dieser Server hat keine KI-Funktionen"));
    }
  });

  it("„Kurz gesagt“ mit Server nennt Sicherung, Abgleich, Einwilligung und Betrieb statt „bleibt auf deinem Gerät“", () => {
    for (const betrieb of VARIANTEN) {
      const summary = section(betrieb, "Kurz gesagt");
      assert.ok(!summary.includes("Ich bekomme diese Daten nicht"), JSON.stringify(betrieb));
      assert.ok(!summary.includes("„Kurz gesagt“ nicht mehr ganz"), "alter Prüfpunkt ist erledigt");
      for (const expected of ["(B6)", "(B2, B7)", "(B1)", "(B3)", "keine Cookies", "GitHub, Wikimedia und Flickr"]) {
        assert.ok(summary.includes(expected), `${JSON.stringify(betrieb)}: fehlt ${expected}`);
      }
    }
    assert.ok(section({ weg: "a", ki: "ollama" }, "Kurz gesagt").includes("auf meinem eigenen Rechner"));
    assert.ok(section({ weg: "b", ki: "claude" }, "Kurz gesagt").includes("bei Render") && section({ weg: "b", ki: "claude" }, "Kurz gesagt").includes("an Claude von Anthropic"));
    // Ohne Server bleibt „Kurz gesagt“ wie in Teil A.
    const withoutServer = datenschutz({ withServer: false }, COMPLETE, { weg: "b", ki: "claude" }).find((s) => s.title === "Kurz gesagt");
    assert.ok(withoutServer?.blocks.some((b) => b.includes("Ich bekomme diese Daten nicht")));
    assert.ok(!withoutServer?.blocks.some((b) => b.includes("Render")));
  });

  it("verlinken die Verträge der Dienste (zum Nachlesen der Garantien, Art. 13 Abs. 1 lit. f DSGVO)", () => {
    const links = (betrieb: Betrieb) =>
      sections(betrieb)
        .flatMap((s) => s.blocks)
        .flatMap((b) => parseInline(b))
        .flatMap((seg) => (seg.kind === "link" ? [seg.url] : []));
    assert.ok(links({ weg: "a", ki: "ollama" }).includes("https://www.cloudflare.com/cloudflare-customer-dpa/"));
    assert.ok(links({ weg: "b", ki: "claude" }).includes("https://render.com/dpa"));
    assert.ok(links({ weg: "b", ki: "claude" }).includes("https://www.anthropic.com/legal/data-processing-addendum"));
  });

  it("haben in jeder Variante eindeutige Überschriften und keine leeren Platzhalter", () => {
    for (const betrieb of VARIANTEN) {
      const all = [...impressum(COMPLETE), ...sections(betrieb)];
      const titles = all.map((s) => s.title);
      assert.equal(new Set(titles).size, titles.length);
      assert.ok(!/undefined|\{\w+\}|\[\[\s*\]\]/.test(allText(all)), JSON.stringify(betrieb));
    }
  });

  it("stimmen mit dem Entwurf in docs/recht/datenschutz.md überein (B1 und B3 je Weg und KI)", () => {
    const flat = (text: string) => text.replace(/\s+/g, " ").trim();
    const md = flat(readFileSync(join(__dirname, "../../docs/recht/datenschutz.md"), "utf8"));
    // Nur, was je nach Weg und KI anders ist: alles, was die noch offene Fassung nicht auch hat.
    const blocksOf = (betrieb: Betrieb, title: string) => sections(betrieb).find((s) => s.title === title)?.blocks ?? [];
    const specific = (betrieb: Betrieb, title: string) => blocksOf(betrieb, title).filter((b) => !blocksOf(OFFEN, title).includes(b));
    const blocks = [
      ...specific({ weg: "a", ki: "ollama" }, "B1. Server"),
      ...specific({ weg: "b", ki: "claude" }, "B1. Server"),
      ...specific({ weg: "b", ki: "claude" }, "B3. KI-Funktionen"),
      ...specific({ weg: "a", ki: "ollama" }, "B3. KI-Funktionen"),
      ...specific({ weg: "b", ki: "ollama-laptop" }, "B3. KI-Funktionen"),
      ...specific({ weg: "a", ki: "keine" }, "B3. KI-Funktionen"),
    ];
    assert.ok(blocks.length >= 12, `nur ${blocks.length} Absätze verglichen`);
    for (const block of blocks) {
      // Einleitungen stehen im Entwurf in Anführungszeichen, sonst wörtlich.
      assert.ok(md.includes(flat(block)), `nicht im Entwurf: ${block.slice(0, 120)} …`);
    }
  });
});
