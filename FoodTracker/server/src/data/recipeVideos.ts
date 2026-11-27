import { VIDEOS_DE } from "./videos/de.js";
import { VIDEOS_EN } from "./videos/en.js";
import { VIDEOS_ES } from "./videos/es.js";
import { VIDEOS_FR } from "./videos/fr.js";
import { VIDEOS_IT } from "./videos/it.js";

/**
 * Zu den Katalog-Rezepten passende, öffentlich verfügbare Kochvideos auf YouTube – je Sprache höchstens eines
 * (Benjamins Wunsch vom 24.11.2026: Videos in der Sprache, die unter Profil → Sprache & Region gewählt ist).
 * Die App verlinkt die Videos nur; sie gehören ihren Kanälen. Rezeptfotos kommen aus frei lizenzierten Quellen
 * (recipeImages.ts), nicht aus den Videos. Gibt es zu einem Rezept kein Video in der gewählten Sprache, öffnet die App
 * eine YouTube-Suche in dieser Sprache (app/src/lib/videos.ts).
 *
 * Regeln für neue Videos (Daueraufgabe in BACKLOG.md): Verfügbarkeit, Titel und Kanal per YouTube-oEmbed prüfen
 * (`https://www.youtube.com/oembed?url=…&format=json`). `title` ist der Originaltitel laut oEmbed – die Websuche zeigt
 * oft eine automatische Übersetzung, die nichts über die Sprache des Videos sagt. Der Titel steht in der Sprache der
 * Datei und zeigt dasselbe Gericht. Vegetarische und vegane Rezepte verlinken nur Videos, deren Titel kein Fleisch und
 * keinen Fisch nennt (Server-Test in allen fünf Sprachen). Lieber kein Video als ein ungeprüftes.
 *
 * Geschichte: Ausgewählt im Oktober 2026, fast alle auf Deutsch. Am 24.11.2026 für vegetarische und vegane Rezepte acht
 * Videos ersetzt (Titel mit Hähnchen, Garnelen oder Hackfleisch, dazu Erbsensuppe „nach Bundeswehr Art“ und
 * „authentisches“ Mapo Tofu). Am selben Tag alle 224 per oEmbed nachgeprüft und nach der Sprache ihres Originaltitels
 * aufgeteilt: 193 Deutsch, 28 Englisch, je eines Italienisch und Spanisch. 16 davon standen hier in automatischer
 * deutscher Übersetzung (z. B. „Englisches Frühstück voller Geschmack“ statt „Full Flavour English Breakfast“, dazu
 * GialloZafferano auf Italienisch); entfernt wurde Keema Matar (Kanal auf Urdu). Fünf deutsche Videos haben das Einbetten abgeschaltet (oEmbed 401, Vorschaubild und Link
 * funktionieren): gefuellte_paprika, linsen_spaetzle, suesskartoffel_hash, m_paprikahendl, vg_eiernockerl.
 */
export interface YoutubeVideo {
  youtubeId: string;
  /** Originaltitel laut YouTube-oEmbed. */
  title: string;
  channel: string;
}

/** Sprachen der Videos, zugleich die Sprachen der App; in dieser Reihenfolge stehen sie im Rezept. */
export const VIDEO_LANGUAGES = ["de", "en", "fr", "it", "es"] as const;
export type VideoLanguage = (typeof VIDEO_LANGUAGES)[number];

/** Videos je Sprache, Schlüssel ist die Rezept-ID. */
export const RECIPE_VIDEOS: Record<VideoLanguage, Record<string, YoutubeVideo>> = {
  de: VIDEOS_DE,
  en: VIDEOS_EN,
  fr: VIDEOS_FR,
  it: VIDEOS_IT,
  es: VIDEOS_ES,
};

/** Alle Videos eines Rezepts mit ihrer Sprache, höchstens eines je Sprache. */
export function videosOfRecipe(recipeId: string): (YoutubeVideo & { language: VideoLanguage })[] {
  return VIDEO_LANGUAGES.flatMap((language) => {
    const video = RECIPE_VIDEOS[language][recipeId];
    return video ? [{ ...video, language }] : [];
  });
}
