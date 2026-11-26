import { AiError } from "./types.js";

// Einwilligung vor den KI-Funktionen: Die App fragt vor der ersten Nutzung (app/src/lib/aiConsent.ts) und nennt bei
// jeder KI-Anfrage im Header die Fassung des Einwilligungstexts, der zugestimmt wurde. Fehlt er – etwa bei einer
// älteren App, nach dem Widerruf im Profil oder bei einer Anfrage an der App vorbei –, gibt der Server nichts an die KI
// weiter und antwortet mit 403 `ai_consent_required`.

/** Fassung des Einwilligungstexts in der App; mindestens diese verlangt der Server. */
export const AI_CONSENT_VERSION = 1;

/** Header der App mit der Fassung, der zugestimmt wurde (z. B. „1“). */
export const AI_CONSENT_HEADER = "X-AI-Consent";

/** Ob der Header eine Zustimmung zur aktuellen (oder einer neueren) Fassung nennt. */
export function hasAiConsent(header: string | undefined): boolean {
  return header !== undefined && /^\d{1,6}$/.test(header.trim()) && Number(header) >= AI_CONSENT_VERSION;
}

/** Wirft AiError „consent_required“ (403), bevor Daten an die KI gehen. */
export function requireAiConsent(header: string | undefined): void {
  if (!hasAiConsent(header)) throw new AiError("consent_required");
}
