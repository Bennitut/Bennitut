// Welche Kochvideos ein Rezept in der gewählten Sprache zeigt: reine Logik ohne Store und native Module, damit sie in
// Node testbar ist (test/videos.test.ts). Benjamins Wunsch vom 24.11.2026: Videos in der Sprache, die unter Profil →
// Sprache & Region gewählt ist.
import type { Recipe, RecipeVideo } from "./types";

/** Grundsprache für Videos: "de-AT" und "de-CH" zählen als "de". */
export function videoLanguage(code: string): string {
  return code.split(/[-_]/)[0]!.toLowerCase();
}

/** YouTube-Suche; die Sprache steckt in der Suchanfrage (Rezeptname in der Sprache plus „Rezept“, „recipe“ …). */
export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/**
 * Sprache der Katalogvideos nach URL. So erkennt die App Katalogvideos auch in Rezepten, die sie ohne Sprache
 * gespeichert haben: Kopien von Katalogrezepten und Admin-Änderungen von vor dem 24.11.2026.
 */
export function videoLanguageIndex(recipes: readonly Pick<Recipe, "media">[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const recipe of recipes) {
    for (const video of recipe.media?.videos ?? []) if (video.language) index.set(video.url, video.language);
  }
  return index;
}

export interface VideoChoice {
  /** Videos für die Knöpfe, in der Reihenfolge des Rezepts. */
  videos: RecipeVideo[];
  /** Gibt es kein Video in der Sprache: YouTube-Suche in dieser Sprache für denselben Knopf. */
  searchUrl?: string;
}

/**
 * Videos eines Rezepts in der gewählten Sprache:
 * - Videos mit Sprache (Katalog) nur in ihrer Sprache,
 * - Videos ohne Sprache (Originalbeitrag eines Imports, selbst eingetragene Links) immer,
 * - bleibt so keins übrig, bekommen Katalogrezepte und Rezepte mit Videos in anderen Sprachen eine YouTube-Suche in
 *   der gewählten Sprache (`searchQuery`: Rezeptname in dieser Sprache plus Suchwort für „Rezept“).
 */
export function videosForLanguage(
  recipe: Pick<Recipe, "media" | "source">,
  language: string,
  searchQuery: string,
  known: ReadonlyMap<string, string> = new Map(),
): VideoChoice {
  const wanted = videoLanguage(language);
  const all = recipe.media?.videos ?? [];
  const languageOf = (video: RecipeVideo) => video.language ?? known.get(video.url);
  const videos = all.filter((video) => {
    const own = languageOf(video);
    return own === undefined || videoLanguage(own) === wanted;
  });
  if (videos.length > 0) return { videos };
  const hasOtherLanguages = all.some((video) => languageOf(video) !== undefined);
  return recipe.source.kind === "katalog" || hasOtherLanguages ? { videos, searchUrl: youtubeSearchUrl(searchQuery) } : { videos };
}

/**
 * Der Link, den man im Editor bearbeitet: das erste Video ohne Sprache (selbst eingetragen oder vom Import).
 * Katalogvideos einer Kopie bleiben beim Speichern unverändert erhalten.
 */
export function editableVideo(videos: readonly RecipeVideo[], known: ReadonlyMap<string, string> = new Map()): RecipeVideo | undefined {
  return videos.find((video) => (video.language ?? known.get(video.url)) === undefined);
}

/** Videos nach dem Bearbeiten: der neue eigene Link vorn, Katalogvideos und weitere Links bleiben. */
export function replaceEditableVideo(
  videos: readonly RecipeVideo[],
  edited: RecipeVideo | null,
  known: ReadonlyMap<string, string> = new Map(),
): RecipeVideo[] {
  const previous = editableVideo(videos, known);
  const rest = videos.filter((video) => video !== previous && video.url !== edited?.url);
  return [...(edited ? [edited] : []), ...rest];
}
