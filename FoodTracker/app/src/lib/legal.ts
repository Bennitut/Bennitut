// Bausteine für Impressum und Datenschutzerklärung (Texte in src/legal/texte.ts, Angaben in src/legal/angaben.ts):
// Platzhalter erkennen und Absätze in Text, **fett**, [Links](https://…) und [[Platzhalter]] zerlegen.
// Ohne React Native, damit die Tests und `npm run web:pages` (Abbruch, solange Angaben fehlen) es nutzen können.

/** Ein Abschnitt: Überschrift (Ebene 1–3) und Absätze. Absätze, die mit „- “ beginnen, sind Aufzählungspunkte. */
export interface LegalSection {
  title: string;
  level: 1 | 2 | 3;
  blocks: string[];
}

/** Eine fehlende Angabe, z. B. { type: "ANGABE", label: "E-Mail-Adresse" } aus „[[ANGABE: E-Mail-Adresse]]“. */
export interface Placeholder {
  type: string;
  label: string;
}

export type InlineSegment =
  | { kind: "text"; text: string; bold: boolean }
  | { kind: "link"; text: string; url: string; bold: boolean }
  | ({ kind: "placeholder" } & Placeholder);

const PLACEHOLDER = /\[\[([^\]]*)\]\]/g;
/** Platzhalter, Fett-Markierung oder Link mit https://, http:// oder mailto:. */
const TOKEN = /\[\[([^\]]*)\]\]|\*\*|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g;

/** Leer oder noch ein Platzhalter wie „[[ANGABE: …]]“. */
export function isMissing(value: string | null | undefined): boolean {
  return !value || !value.trim() || value.includes("[[") || value.includes("]]");
}

/** Der Wert – oder, wenn er fehlt, ein Platzhalter für die Angabe (ein vorhandener Platzhalter bleibt). */
export function orPlaceholder(value: string | null | undefined, label: string): string {
  if (!isMissing(value)) return value!.trim();
  return value && value.includes("[[") ? value.trim() : `[[ANGABE: ${label}]]`;
}

/** Eine reine Telefonnummer, z. B. „+43 660 1234567“, „0660/1234567“ oder „+43 (0)316 123456-7“. */
const PHONE = /^\+?\d[\d ()/.-]{4,}\d$/;

/**
 * Der zweite Kontaktweg fürs Impressum: eine reine Telefonnummer als „Telefon: …“, alles andere so, wie es eingetragen
 * ist (z. B. „Kontaktformular: https://…“); fehlt er, ein Platzhalter.
 */
export function contactLine(value: string | null | undefined, label: string): string {
  const v = orPlaceholder(value, label);
  if (isMissing(v)) return v;
  return PHONE.test(v) ? `Telefon: ${v}` : v;
}

function toPlaceholder(content: string): Placeholder {
  const match = content.match(/^\s*([A-ZÄÖÜ]+)\s*:\s*([\s\S]*)$/);
  const label = (match ? match[2] : content).replace(/\s+/g, " ").trim();
  return { type: match ? match[1] : "", label };
}

/** Alle Platzhalter in einem Text, in der Reihenfolge, in der sie vorkommen. */
export function placeholdersIn(text: string): Placeholder[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => toPlaceholder(m[1]));
}

/** Alle Platzhalter in Abschnitten (Überschriften und Absätze), ohne doppelte. */
export function missingIn(sections: LegalSection[]): Placeholder[] {
  const seen = new Set<string>();
  const result: Placeholder[] = [];
  for (const section of sections) {
    for (const text of [section.title, ...section.blocks]) {
      for (const p of placeholdersIn(text)) {
        const key = `${p.type}|${p.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(p);
      }
    }
  }
  return result;
}

/** Zum Anzeigen: Angaben nur mit ihrem Namen, Entscheidungen und Prüfpunkte mit Art davor. */
export function describePlaceholder(p: Placeholder): string {
  if (!p.type || p.type === "ANGABE") return p.label;
  return `${p.type.charAt(0)}${p.type.slice(1).toLowerCase()}: ${p.label}`;
}

/** Zerlegt einen Absatz in Text, **fett**, [Linktext](https://…) und [[Platzhalter]]. */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let bold = false;
  let last = 0;
  const pushText = (value: string) => {
    if (!value) return;
    const previous = segments[segments.length - 1];
    if (previous?.kind === "text" && previous.bold === bold) previous.text += value;
    else segments.push({ kind: "text", text: value, bold });
  };
  for (const match of text.matchAll(TOKEN)) {
    pushText(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[1] !== undefined) segments.push({ kind: "placeholder", ...toPlaceholder(match[1]) });
    else if (match[0] === "**") bold = !bold;
    else segments.push({ kind: "link", text: match[2], url: match[3], bold });
  }
  pushText(text.slice(last));
  return segments;
}

/** Ob ein Absatz ein Aufzählungspunkt ist („- …“), und sein Text ohne den Strich. */
export function bulletText(block: string): string | null {
  return block.startsWith("- ") ? block.slice(2) : null;
}
