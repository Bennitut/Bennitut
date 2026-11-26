// Einwilligung vor den KI-Funktionen (Art. 6 Abs. 1 lit. a und – für Gesundheitsangaben – Art. 9 Abs. 2 lit. a DSGVO):
// Mahlzeit und Kassenbon erkennen, Rezepte importieren, übersetzen und mit KI verbessern sowie Wünsche im Plan schicken
// Daten über den Server an eine KI. Die App fragt vor der ersten Nutzung einmal (components/AiConsent.tsx), im Profil
// lässt sich die Erlaubnis widerrufen. Ein Mindestalter gibt es nicht (Benjamins Entscheidung vom 24.11.2026), der Dialog
// weist aber auf die Zustimmung eines Elternteils hin. Jede KI-Anfrage nennt dem Server die Fassung, der zugestimmt
// wurde; ohne lehnt er ab (server/src/ai/consent.ts). Ohne native Module, damit es in test/ läuft.

/**
 * Fassung des Einwilligungstexts. Erhöhen, wenn sich wesentlich ändert, was an wen geht (ein neuer KI-Anbieter, eine
 * Funktion, die andere Daten schickt) – dann fragt die App beim nächsten Mal neu. Muss zu `AI_CONSENT_VERSION` im
 * Server passen (ein Test prüft das).
 */
export const AI_CONSENT_VERSION = 1;

/** Header, mit dem die App bei KI-Anfragen die Fassung nennt, der zugestimmt wurde. */
export const AI_CONSENT_HEADER = "X-AI-Consent";

export interface AiConsent {
  /** Fassung des Texts, dem zugestimmt wurde. */
  version: number;
  /** Zeitpunkt der Zustimmung (ISO). */
  at: string;
}

/** Die KI-Funktionen der App; der Dialog sagt jeweils, was dafür an die KI geht. */
export type AiFeature = "meal" | "receipt" | "import" | "translate" | "improve" | "wishes";

export const AI_FEATURES: readonly AiFeature[] = ["meal", "receipt", "import", "translate", "improve", "wishes"];

/** Satz im Dialog: was diese Funktion an die KI schickt. */
export const AI_FEATURE_TEXT = {
  meal: "aiConsent.sendsMeal",
  receipt: "aiConsent.sendsReceipt",
  import: "aiConsent.sendsImport",
  translate: "aiConsent.sendsTranslate",
  improve: "aiConsent.sendsImprove",
  wishes: "aiConsent.sendsWishes",
} as const satisfies Record<AiFeature, `aiConsent.${string}`>;

/** Ob KI-Anfragen erlaubt sind – nur mit Zustimmung zur aktuellen Fassung. */
export function hasAiConsent(consent: AiConsent | null | undefined): consent is AiConsent {
  return !!consent && consent.version >= AI_CONSENT_VERSION;
}

/** Zustimmung zur aktuellen Fassung, jetzt. */
export function grantAiConsent(now = new Date()): AiConsent {
  return { version: AI_CONSENT_VERSION, at: now.toISOString() };
}

/**
 * Gespeicherten Wert prüfen: Ältere Versionen der App kennen ihn nicht, Unlesbares gilt als „nicht erlaubt“ – dann
 * fragt die App lieber noch einmal, statt ohne Zustimmung zu senden.
 */
export function readAiConsent(raw: unknown): AiConsent | null {
  if (!raw || typeof raw !== "object") return null;
  const { version, at } = raw as Record<string, unknown>;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return null;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  return { version, at };
}

/** Header für eine KI-Anfrage; leer ohne gültige Zustimmung. */
export function aiConsentHeaders(consent: AiConsent | null | undefined): Record<string, string> {
  return hasAiConsent(consent) ? { [AI_CONSENT_HEADER]: String(consent.version) } : {};
}
