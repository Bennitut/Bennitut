import type { CommunityRecipe } from "./types";

/**
 * Zuletzt geladene Community-Rezepte, damit die Detailseite sie anzeigen kann, ohne dass sie
 * gespeichert sind. Favorisierte Community-Rezepte liegen dauerhaft im Store.
 */
export const communityCache = new Map<string, CommunityRecipe>();
