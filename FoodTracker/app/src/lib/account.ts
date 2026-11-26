// Prüfungen fürs Konto mit E-Mail und Passwort, vor dem Absenden – dieselben Regeln wie im Server
// (server/src/auth/password.ts und z.email() bei der Registrierung). Ohne native Module, getestet in test/account.test.ts.
import type { Account } from "./types";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/** Länge in Zeichen nach NFKC (nicht in UTF-16-Einheiten), damit Emojis und Umlaute so zählen wie im Server. */
export const passwordLength = (password: string) => [...password.normalize("NFKC")].length;

export function passwordProblem(password: string, min = PASSWORD_MIN_LENGTH): "too_short" | "too_long" | null {
  const length = passwordLength(password);
  if (length < min) return "too_short";
  if (length > PASSWORD_MAX_LENGTH) return "too_long";
  return null;
}

/** Regel von Zod (z.email()), mit der der Server Adressen bei der Registrierung prüft. */
const EMAIL = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

export const looksLikeEmail = (email: string) => email.trim().length <= 254 && EMAIL.test(email.trim());

/** Dateiname für „Meine Daten exportieren“, wie ihn auch der Server vorschlägt. */
export const accountExportName = (date: string) => `foodtracker-konto-${date}.json`;

/**
 * Werte für Fehlertexte aus der Antwort des Servers: Wartezeit nach zu vielen Versuchen in ganzen Minuten
 * (aufgerundet, mindestens 1) und Mindestlänge des Passworts. Fehlen sie (älterer Server), gelten Standardwerte.
 */
export function errorParams(details: Record<string, unknown>): { minutes: number; min: number } {
  const retryAfter = typeof details.retryAfter === "number" && details.retryAfter > 0 ? details.retryAfter : 60;
  const min = typeof details.minLength === "number" && details.minLength > 0 ? details.minLength : PASSWORD_MIN_LENGTH;
  return { minutes: Math.max(1, Math.ceil(retryAfter / 60)), min };
}

const PROVIDER_NAMES = { apple: "Apple", google: "Google", dev: "Test" } as const;

/** Name der Anmeldeart für „über …“; bei E-Mail und Passwort der übersetzte Text `emailLabel`. */
export const providerName = (provider: Account["provider"], emailLabel: string): string =>
  provider === "password" ? emailLabel : (PROVIDER_NAMES[provider] ?? provider);
