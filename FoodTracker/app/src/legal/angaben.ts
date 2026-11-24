// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Deine Angaben für Impressum und Datenschutzerklärung – nur hier eintragen, sonst nirgends.
//
// Die App zeigt die Texte unter 👤 Profil → „Impressum & Datenschutz“, die Web-Version zusätzlich oben auf jeder Seite
// („Impressum“). Solange hier noch ein Platzhalter [[…]] steht oder ein Feld leer ist,
//   - zeigt die App über den Texten den Hinweis „Entwurf“ mit den fehlenden Angaben und
//   - bricht `npm run web:pages` (und damit der GitHub-Pages-Workflow) mit einer Meldung ab – so geht keine
//     Web-Version ohne Offenlegung nach § 25 Mediengesetz online.
//
// Vorher lesen: docs/recht/README.md (was wohin gehört, deine Entscheidungen, die [[PRÜFEN]]-Stellen). Die Texte
// selbst stehen in texte.ts (Impressum Variante A, Datenschutzerklärung Teil A; Teil B nur mit Server).
// Das Repo ist öffentlich: Was du hier einträgst, steht danach im Internet – genau wie im Impressum.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Angaben {
  /** Vor- und Nachname – im Impressum „Medieninhaber“, in der Datenschutzerklärung „Verantwortlich“. */
  name: string;
  /**
   * Wohnort, z. B. „Graz“ – für das Impressum nach Variante A genügt die Gemeinde. Steht auch in der
   * Datenschutzerklärung unter „Verantwortlich“ (siehe docs/recht/README.md, „Was du ausfüllen musst“).
   */
  wohnort: string;
  /** E-Mail-Adresse, die du liest – auch für Anfragen nach der DSGVO. Tipp: eine eigene nur für FoodTracker. */
  email: string;
  /** Ab wann die Texte gelten, z. B. „1. Dezember 2026“. Bei jeder Änderung der Texte neu setzen. */
  stand: string;
  /** Adresse der Web-Version (ohne https://), für „Websitedaten löschen“. Schon eingetragen: GitHub Pages. */
  webAdresse: string;
}

export const ANGABEN: Angaben = {
  name: "[[ANGABE: Vor- und Nachname]]",
  wohnort: "[[ANGABE: Wohnort – die Gemeinde genügt]]",
  email: "[[ANGABE: E-Mail-Adresse]]",
  stand: "[[ANGABE: Datum („Stand“)]]",
  webAdresse: "bennitut.github.io",
};
