import type { RatingSummary, Recipe } from "./types";

/**
 * Lange Rezeptlisten („Entdecken“, Tauschen im Plan) zeigen zuerst so viele Einträge, „Mehr anzeigen“ jeweils so viele
 * weitere. Alle auf einmal hieße bis zu 184 Fotos gleichzeitig: Das kostet auf älteren iPhones Speicher, und Wikimedia
 * drosselt dann (HTTP 429, einzelne Fotos bleiben leer).
 */
export const PAGE_SIZE = 30;

/** Die ersten `limit` Einträge, auf die `matches` passt (z. B. die Suche), und wie viele insgesamt passen. */
export function firstPage<T>(items: readonly T[], limit: number, matches: (item: T) => boolean = () => true): { shown: T[]; total: number } {
  const all = items.filter(matches);
  return { shown: all.slice(0, Math.max(0, limit)), total: all.length };
}

type Ratings = Readonly<Record<string, RatingSummary | undefined>>;

/** Bewertung mit Vorannahme von 3 Sternen, damit eine einzelne 5-Sterne-Bewertung nicht alles überholt. */
export function ratingScore(rating: RatingSummary | undefined): number {
  return rating?.count ? (rating.avg * rating.count + 3 * 2) / (rating.count + 2) : 3;
}

/** Am besten bewertete Rezepte zuerst; bei Gleichstand (z. B. ganz ohne Bewertungen) in der bisherigen Reihenfolge. */
export function sortByRating(recipes: readonly Recipe[], ratings: Ratings): Recipe[] {
  return [...recipes].sort((a, b) => ratingScore(ratings[b.id]) - ratingScore(ratings[a.id]));
}

/** „Am besten bewertet“: Rezepte mit mindestens einer Bewertung und im Schnitt 4 Sternen oder mehr, höchstens `max`. */
export function topRated(sorted: readonly Recipe[], ratings: Ratings, max = 10): Recipe[] {
  return sorted.filter((r) => (ratings[r.id]?.count ?? 0) > 0 && (ratings[r.id]?.avg ?? 0) >= 4).slice(0, max);
}
