import type { ImageStore } from "./images.js";

// Fotos von einem Bildspeicher in einen anderen kopieren (`npm run photos:copy`, Vorrang 1, 9.3) – beim Umzug vom
// Laptop (Ordner data/photos/) zu einem Server im Internet mit Objektspeicher oder zurück. Kopiert nur, was im Ziel
// fehlt (unter einem Schlüssel liegt immer dasselbe Bild), löscht nie etwas und kann beliebig oft laufen.

export interface CopyResult {
  /** Fotos in der Quelle. */
  total: number;
  copied: number;
  /** Lagen schon im Ziel. */
  present: number;
  /** Während des Kopierens aus der Quelle verschwunden (z. B. gerade gelöscht). */
  vanished: number;
  failed: { key: string; error: string }[];
}

export async function copyImages(from: ImageStore, to: ImageStore, options: { parallel?: number; onProgress?: (done: number, todo: number) => void } = {}): Promise<CopyResult> {
  const [source, target] = await Promise.all([from.list(), to.list()]);
  const existing = new Set(target);
  const todo = source.filter((key) => !existing.has(key));
  const result: CopyResult = { total: source.length, copied: 0, present: source.length - todo.length, vanished: 0, failed: [] };
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < todo.length) {
      const key = todo[next++]!;
      try {
        const image = await from.get(key);
        if (image) {
          await to.put(key, image);
          result.copied++;
        } else {
          result.vanished++;
        }
      } catch (e) {
        result.failed.push({ key, error: (e as Error).message });
      }
      options.onProgress?.(++done, todo.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.parallel ?? 4, todo.length)) }, worker));
  result.failed.sort((a, b) => (a.key < b.key ? -1 : 1));
  return result;
}
