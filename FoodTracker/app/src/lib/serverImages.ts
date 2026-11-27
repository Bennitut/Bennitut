// Fotos aus dem Bildspeicher des Servers (Galerie der Rezepte, Fotos geteilter Rezepte) kommen als Pfad
// („/api/images/<Schlüssel>“, server/src/storage/images.ts) statt als data-URI. Gespeichert bleibt in der App der
// Pfad (z. B. in einem favorisierten Community-Rezept); erst beim Anzeigen kommt die Server-Adresse davor. So passt
// er auch, wenn der Server umzieht (vom Laptop ins Internet) oder die App ihn unter einer anderen Adresse erreicht.
// Ohne Node- und Expo-Abhängigkeiten, damit die Tests ohne native Module laufen.

/** Pfad, unter dem der Server Bilder ausliefert. */
export const SERVER_IMAGE_PATH = "/api/images/";

/**
 * Adresse zum Anzeigen: Pfade aus dem Bildspeicher mit `baseUrl` (serverUrl() in lib/api.ts) davor; ohne Server gibt es
 * diese Bilder nicht (undefined – dann zeigt die App den Platzhalter). Alles andere (data-URI, https-Adresse) bleibt.
 */
export function resolveImageUri(uri: string | undefined, baseUrl: string | null): string | undefined {
  if (!uri || !uri.startsWith(SERVER_IMAGE_PATH)) return uri;
  return baseUrl ? `${baseUrl.replace(/\/+$/, "")}${uri}` : undefined;
}

/** Wie resolveImageUri für ein Bild mit Bildnachweis; ohne anzeigbare Adresse undefined. */
export function resolveImage<T extends { uri: string }>(image: T | undefined, baseUrl: string | null): T | undefined {
  if (!image) return undefined;
  const uri = resolveImageUri(image.uri, baseUrl);
  return uri ? { ...image, uri } : undefined;
}
