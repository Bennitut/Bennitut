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
  strasse: "Wehrbrücklstraße",
  hausnummer: "37/3/8",
  plz: "1220",
  ort: "Wien",
  email: "tut.benjamin@gmail.com",
  zweiterKontakt: "+43 660 5551543",
  stand: "24. November 2026",
  webAdresse: "bennitut.github.io",
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Betrieb des Servers – nur für Teil B der Datenschutzerklärung (erscheint nur, wenn die App einen Server kennt).
//
// Keine persönlichen Angaben, nur wie dein Server für andere läuft (docs/SERVER-HOSTING.md). Danach richten sich
// „Kurz gesagt“, B1 (Server) und B3 (KI-Funktionen) in texte.ts. Leer heißt „noch nicht entschieden“: Dann steht dort
// ein Platzhalter, und Teil B bleibt ein „Entwurf“ (mit fester Server-Adresse bricht `npm run web:pages` ab).
// Ändert sich etwas (anderer Weg, andere KI), hier umstellen und `stand` oben neu setzen.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Betrieb {
  /**
   * Wo der Server läuft: "a" = auf deinem Laptop, aus dem Internet erreichbar über Cloudflare Tunnel (Weg a);
   * "b" = bei Render, Datenbank und Fotos bei Neon, beides in Frankfurt (Weg b). Ein anderer Hoster oder
   * Objektspeicher braucht eigene Texte in texte.ts.
   */
  weg: "" | "a" | "b";
  /**
   * Welche KI die KI-Funktionen nutzen: "claude" = Claude-API von Anthropic; "ollama" = Ollama auf demselben Rechner
   * wie der Server (bei Weg a also dein Laptop); "ollama-laptop" = „KI vom Laptop“, nur bei Weg b: Render schickt die
   * KI-Anfragen über Cloudflare Tunnel an Ollama auf deinem Laptop; "keine" = keine KI-Funktionen.
   */
  ki: "" | "claude" | "ollama" | "ollama-laptop" | "keine";
}

export const BETRIEB: Betrieb = {
  weg: "",
  ki: "",
};
