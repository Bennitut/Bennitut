import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import type { Dictionary, TKey } from "./types";

export type { TKey } from "./types";

// Neue Sprache: Datei mit `npm run translate-ui -- <code>` (im Server-Ordner) erzeugen und hier eintragen.
export const DICTIONARIES = { de, en, fr, it, es } satisfies Record<string, Dictionary>;
export type UILanguage = keyof typeof DICTIONARIES;
export const UI_LANGUAGES = Object.keys(DICTIONARIES) as UILanguage[];

/** Name jeder Sprache in der Sprache selbst. */
export const LANGUAGE_NAMES: Record<UILanguage, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  it: "Italiano",
  es: "Español",
};

export type Region = "DE" | "AT" | "CH" | "INT";
export const REGIONS: Region[] = ["DE", "AT", "CH", "INT"];

export function isUILanguage(code: string | null | undefined): code is UILanguage {
  return !!code && code in DICTIONARIES;
}

export function regionFromCode(code: string | null | undefined): Region {
  return code === "DE" || code === "AT" || code === "CH" ? code : "INT";
}

/** Sprachcode für Inhalte: Deutsch bekommt österreichische bzw. Schweizer Begriffe. */
export function contentLocale(language: UILanguage, region: Region): string {
  if (language === "de" && (region === "AT" || region === "CH")) return `de-${region}`;
  return language;
}

/** In der Schweiz schreibt man „ss“ statt „ß“. */
export function regionalize(text: string, language: UILanguage, region: Region): string {
  return language === "de" && region === "CH" ? text.replace(/ß/g, "ss") : text;
}

export function translate(language: UILanguage, key: TKey, params?: Record<string, string | number>): string {
  const lookup = (dict: Dictionary) =>
    key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
  const raw = lookup(DICTIONARIES[language]) ?? lookup(en) ?? key;
  const text = typeof raw === "string" ? raw : key;
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;
}

/**
 * Richtpreise im Katalog sind deutsche Euro-Preise. Für Österreich und die Schweiz rechnen wir
 * mit einem groben Preisniveau-Faktor um; die App weist Preise als Richtwerte aus.
 */
const PRICE_LEVEL: Record<Region, { currency: string; factor: number }> = {
  DE: { currency: "EUR", factor: 1 },
  AT: { currency: "EUR", factor: 1.1 },
  CH: { currency: "CHF", factor: 1.6 },
  INT: { currency: "EUR", factor: 1 },
};

export function formatPrice(eur: number, language: UILanguage, region: Region): string {
  const { currency, factor } = PRICE_LEVEL[region];
  const locale = region === "INT" ? language : `${language}-${region}`;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(eur * factor);
  } catch {
    return `${(eur * factor).toFixed(2)} ${currency}`;
  }
}

export function formatNumber(value: number, language: UILanguage): string {
  try {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  } catch {
    return String(Math.round(value * 10) / 10);
  }
}
