// Protokoll ohne Passwörter, Tokens, Schlüssel und E-Mail-Adressen (Vorrang 1, 9.3 „Sicherheit“): Was der Server ins
// Fenster bzw. ins Protokoll des Hosters schreibt, lesen womöglich andere mit (Render speichert Logs, Bildschirmfotos
// fürs Fehlermelden …). Fehlermeldungen von Bibliotheken enthalten manchmal genau das – Datenbank, Mail-Dienst, KI.

const RULES: readonly (readonly [RegExp, string])[] = [
  // Zugangsdaten in Adressen: postgresql://nutzer:passwort@host → postgresql://<Zugangsdaten>@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]*:[^\s/@]*@/gi, "$1<Zugangsdaten>@"],
  [/\bBearer\s+[^\s"',;]+/gi, "Bearer <Token>"],
  [/\bsk-ant-[A-Za-z0-9_-]+/g, "<Schlüssel>"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, "<E-Mail>"],
  // Felder mit Geheimnissen in JSON, Formularen oder Meldungen: "password":"…", passwort=…, token: … – ein schon
  // geschwärztes „Bearer <Token>“ bleibt, „Basic …“ verschwindet ganz.
  [
    /(["']?\b(?:password|passwort|new_?password|current_?password|pass|token|secret|api[_-]?key|authorization)\b["']?\s*[:=]\s*)(?!Bearer <Token>)(?:Basic\s+)?(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi,
    "$1<…>",
  ],
  // Lange Zeichenketten aus Buchstaben und Ziffern: Sitzungstokens (43 Zeichen), Schlüssel, Prüfwerte, UUIDs.
  [/\b[A-Za-z0-9_-]{32,}\b/g, "<…>"],
];

/** Text fürs Protokoll ohne Zugangsdaten, Tokens, Schlüssel, Passwörter und E-Mail-Adressen. */
export function redact(text: string): string {
  return RULES.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

/** Ein Fehler als Text fürs Protokoll: Art, Code, Meldung, Stack und Ursache – geschwärzt (redact). */
export function describeError(err: unknown, depth = 0): string {
  if (!(err instanceof Error)) return redact(String(err));
  const code = (err as { code?: unknown }).code;
  const head = `${err.name}${typeof code === "string" || typeof code === "number" ? ` (${code})` : ""}: ${err.message}`;
  // Die erste Zeile des Stacks wiederholt Art und Meldung.
  const stack = err.stack?.split("\n").slice(1).join("\n");
  const cause = err.cause !== undefined && depth < 3 ? `\n  Ursache: ${describeError(err.cause, depth + 1)}` : "";
  return redact(`${head}${stack ? `\n${stack}` : ""}`) + cause;
}

/** Unerwarteten Fehler protokollieren – ohne Geheimnisse und Adressen (siehe redact). */
export function logError(context: string, err: unknown, log: (message: string) => void = console.error): void {
  log(`${context}: ${describeError(err)}`);
}
