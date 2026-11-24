// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Deine Angaben für Impressum und Datenschutzerklärung – nur hier eintragen, sonst nirgends.
//
// Die App zeigt die Texte unter 👤 Profil → „Impressum & Datenschutz“, die Web-Version zusätzlich oben auf jeder Seite
// („Impressum“). Solange hier noch ein Platzhalter [[…]] steht oder ein Feld leer ist,
//   - zeigt die App über den Texten den Hinweis „Entwurf“ mit den fehlenden Angaben und
//   - bricht `npm run web:pages` (und damit der GitHub-Pages-Workflow) mit einer Meldung ab – so geht keine
//     Web-Version ohne Impressum online.
//
// Vorher lesen: docs/recht/README.md (was wohin gehört, deine Entscheidungen, die [[PRÜFEN]]-Stellen). Die Texte
// selbst stehen in texte.ts: Impressum Variante B (Angaben nach § 5 E-Commerce-Gesetz und Offenlegung nach § 25
// Mediengesetz, deine Entscheidung vom 24.11.2026) und Datenschutzerklärung Teil A; Teil B nur mit Server.
// Das Repo ist öffentlich: Was du hier einträgst, steht danach im Internet – genau wie im Impressum.
// Gewerbe, UID-Nummer oder Firmenbuch gibt es hier (noch) nicht; kommen sie dazu, siehe docs/recht/impressum.md.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Angaben {
  /** Vor- und Nachname – im Impressum „Medieninhaber und Diensteanbieter“, in der Datenschutzerklärung „Verantwortlich“. */
  name: string;
  /** Straße bzw. Gasse oder Platz, ohne Hausnummer, z. B. „Musterstraße“. */
  strasse: string;
  /** Hausnummer mit Stiege und Tür, wie in der Post-Anschrift, z. B. „12/3/4“ (Haus 12, Stiege 3, Tür 4) oder „12/4“. */
  hausnummer: string;
  /** Postleitzahl, z. B. „8010“. */
  plz: string;
  /** Ort, z. B. „Graz“. Das Land (Österreich) steht schon im Text. */
  ort: string;
  /** E-Mail-Adresse, die du liest – auch für Anfragen nach der DSGVO. Tipp: eine eigene nur für FoodTracker. */
  email: string;
  /**
   * Zweiter Kontaktweg neben der E-Mail (§ 5 ECG: „rasch und unmittelbar“; die WKO verlangt mindestens zwei), meist
   * eine Telefonnummer, z. B. „+43 660 1234567“ – eine reine Nummer erscheint als „Telefon: …“. Anderes mit Art davor,
   * z. B. „Kontaktformular: https://…“ (ein Formular bräuchte allerdings einen Server).
   */
  zweiterKontakt: string;
  /** Ab wann die Texte gelten, z. B. „1. Dezember 2026“. Bei jeder Änderung der Texte neu setzen. */
  stand: string;
  /** Adresse der Web-Version (ohne https://), für „Websitedaten löschen“. Schon eingetragen: GitHub Pages. */
  webAdresse: string;
}

export const ANGABEN: Angaben = {
  name: "Benjamin Thurn und Taxis",
  strasse: "[[ANGABE: Straße]]",
  hausnummer: "[[ANGABE: Hausnummer mit Stiege und Tür]]",
  plz: "[[ANGABE: Postleitzahl]]",
  ort: "[[ANGABE: Ort]]",
  email: "[[ANGABE: E-Mail-Adresse]]",
  zweiterKontakt: "[[ANGABE: Zweiter Kontaktweg, z. B. Telefonnummer]]",
  stand: "[[ANGABE: Datum („Stand“)]]",
  webAdresse: "bennitut.github.io",
};
