// Tests für den Tagesbericht: node --test FoodTracker/reports/
// Prüfen, was make-report.cjs aus BACKLOG.md liest, und dass die echte BACKLOG.md dieses Format einhält –
// sonst fehlen erledigte Punkte im Bericht, ohne dass es jemand merkt. Braucht weder git noch Chromium.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const { backlog, backlogProblems, html } = require("./make-report.cjs");

const SAMPLE = `# FoodTracker – Backlog

## ✅ Vorrang: GitHub Pages vorbereiten (Benjamin richtet Pages ein, 23.11.2026) – erledigt 24.11.2026

24.11.2026: Workflow und \`404.html\` vorbereitet;
Link in \`clips.md\` eingetragen.

Vor Punkt 5 erledigen.

- Workflow anlegen.

## Aufgaben

- [x] **4. PWA:** Manifest und Symbole.
  - 23.11.2026: Manifest, Symbol.
- [ ] **5. Offline-Modus als Standard:** „bald verfügbar“.
  - 23.11.2026, Teil 1: Erfassen und Import.
- [x] **6. Tests für die App-Logik** in \`app/src/lib\`.
  - 24.11.2026: 79 Tests.

## Ideen und Erkenntnisse

- ✅ **Neuplanen testbar machen:** erledigt 24.11.2026 – \`prepareReplan()\` mit 7 Tests. (24.11.2026)
- ✅ **Doppeltes Emoji:** Die Karte zeigte zwei Symbole. (23.11.2026) Erledigt 24.11.2026: eigener Schlüssel für
  die Karte.
- ✅ **Web-Version hosten:** entschieden 23.11.2026, erledigt 23.11.2026: GitHub Pages. (23.11.2026)
- **Abgehakte Einkäufe landen nicht im Vorrat:** Nur Bestellungen buchen in den Vorrat.
  Vorschlag: beim Abhaken buchen. (24.11.2026)
- **expo-doctor:** 21 von 21 Checks. (23.11.2026) Am 24.11. fehlten vier Patchstände. (24.11.2026)
`;

describe("Tagesbericht: was aus BACKLOG.md gelesen wird", () => {
  const bl = backlog("2026-11-24", SAMPLE);

  it("nimmt nummerierte Aufgaben mit einer Notiz vom Tag", () => {
    assert.equal(bl.german, "24.11.2026");
    assert.deepEqual(bl.tasks.map((t) => [t.n, t.done]), [[4, true], [5, false], [6, true]]);
    assert.deepEqual(bl.today.map((t) => t.n), [6]);
    assert.deepEqual(backlog("2026-11-23", SAMPLE).today.map((t) => t.n), [4, 5]);
  });

  it("zeigt erledigte Vorrang-Abschnitte mit dem Absatz vom selben Tag", () => {
    assert.deepEqual(bl.done[0], {
      kind: "Vorrang",
      title: "GitHub Pages vorbereiten",
      text: "Workflow und 404.html vorbereitet; Link in clips.md eingetragen.",
    });
  });

  it("zeigt erledigte Ideen mit dem Text nach „erledigt <Datum>“, auch über mehrere Zeilen", () => {
    assert.deepEqual(
      bl.done.slice(1).map((x) => [x.kind, x.title, x.text]),
      [
        ["Ideen und Erkenntnisse", "Neuplanen testbar machen", "prepareReplan() mit 7 Tests."],
        ["Ideen und Erkenntnisse", "Doppeltes Emoji", "eigener Schlüssel für die Karte."],
      ],
    );
    assert.deepEqual(backlog("2026-11-23", SAMPLE).done.map((x) => [x.title, x.text]), [["Web-Version hosten", "GitHub Pages."]]);
  });

  it("listet neu notierte Ideen nach ihrem ersten Datum, nicht nur ergänzte", () => {
    assert.deepEqual(bl.added, ["Abgehakte Einkäufe landen nicht im Vorrat"]);
    assert.deepEqual(backlog("2026-11-23", SAMPLE).added, ["expo-doctor"]);
    assert.deepEqual(backlog("2026-11-25", SAMPLE), { german: "25.11.2026", tasks: bl.tasks, today: [], done: [], added: [] });
  });

  it("bringt alles in den Bericht und zählt es bei „Aufgaben erledigt“ mit", () => {
    const page = html("2026-11-24", [], bl, null);
    for (const text of ["GitHub Pages vorbereiten", "Neuplanen testbar machen", "eigener Schlüssel für die Karte.", "Abgehakte Einkäufe landen nicht im Vorrat"]) {
      assert.ok(page.includes(text), text);
    }
    assert.match(page, /<div class="v">4<\/div><div class="l">Aufgaben erledigt<\/div><div class="h">1 Backlog-Punkt \+ 3 weitere<\/div>/);
    assert.match(html("2026-11-25", [], backlog("2026-11-25", SAMPLE), null), /Keine Backlog-Notizen mit diesem Datum/);
  });

  it("findet Stellen, die der Bericht nicht lesen kann", () => {
    assert.deepEqual(backlogProblems(SAMPLE), []);
    const broken = SAMPLE.replace("erledigt 24.11.2026 – `prepareReplan()`", "– `prepareReplan()`")
      .replace("Nur Bestellungen buchen in den Vorrat.\n  Vorschlag: beim Abhaken buchen. (24.11.2026)", "Nur Bestellungen buchen.")
      .replace("  - 24.11.2026: 79 Tests.\n", "")
      .replace(") – erledigt 24.11.2026", ") – fertig")
      .replace("- ✅ **Doppeltes Emoji:**", "✅ **Doppeltes Emoji:**");
    assert.deepEqual(backlogProblems(broken), [
      "Aufgabe 6 ist abgehakt, hat aber keine Notiz „  - TT.MM.JJJJ: …“",
      "„## ✅ Vorrang: GitHub Pages vorbereiten (Benjamin richtet Pages ein, 23.11.2026) – fertig“: Überschrift endet nicht auf „– erledigt TT.MM.JJJJ“",
      "✅ ohne „erledigt TT.MM.JJJJ“: Neuplanen testbar machen",
      "„Ideen und Erkenntnisse“: Zeile ohne „- “ wird nicht gelesen: Doppeltes Emoji",
      "ohne Datum „(TT.MM.JJJJ)“: Abgehakte Einkäufe landen nicht im Vorrat",
    ]);
  });
});

describe("Tagesbericht: Teilschritte großer Vorrang-Abschnitte", () => {
  const STEPS = `# FoodTracker – Backlog

## Vorrang 1: Server im Internet mit Konten (9, Benjamins Wunsch vom 24.11.2026, 23:22 Uhr)

Pro Lauf ein Teilschritt.

- [x] Server: Registrierung und Anmeldung mit E-Mail und Passwort (zusätzlich zu Apple): scrypt, Rate-Limit. – erledigt
  25.11.2026: \`POST /api/auth/register\` und \`/login\`, 21 Tests.
- [x] Beim ersten Anmelden die lokalen Daten übernehmen. – erledigt 26.11.2026: ohne Duplikate.
- [ ] App: Anmeldebildschirm in fünf Sprachen.
- [x] Etwas ohne Datum.
`;

  it("zeigt erledigte Teilschritte am Tag ihres Datums, mit kurzem Titel", () => {
    assert.deepEqual(backlog("2026-11-25", STEPS).done, [
      {
        kind: "Vorrang 1, Teilschritt",
        title: "Server: Registrierung und Anmeldung mit E-Mail und Passwort",
        text: "POST /api/auth/register und /login, 21 Tests.",
      },
    ]);
    assert.deepEqual(backlog("2026-11-26", STEPS).done.map((x) => x.title), ["Beim ersten Anmelden die lokalen Daten übernehmen"]);
    assert.deepEqual(backlog("2026-11-24", STEPS).done, []);
    assert.deepEqual(backlogProblems(STEPS), []);
  });
});

describe("BACKLOG.md hat das Format, das der Tagesbericht liest", () => {
  it("abgehakte Aufgaben mit Notiz, erledigte Abschnitte und Ideen mit Datum", () => {
    const text = fs.readFileSync(path.join(__dirname, "..", "BACKLOG.md"), "utf8");
    assert.deepEqual(backlogProblems(text), []);
  });
});
