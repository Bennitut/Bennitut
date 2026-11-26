import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Bildspeicher (Vorrang 1, 9.2): Fotos aus der Galerie eines Rezepts und Fotos geteilter Rezepte liegen als Dateien
// statt als data-URI in der Datenbank bzw. in JSON-Dateien. So bleibt die Datenbank klein (kostenlose Postgres-Angebote
// haben wenig Platz), Listen wie „Aus der Community“ laden schnell (vorher bis zu 700 KB pro Rezept), und die App lädt
// jedes Bild einzeln über GET /api/images/<Schlüssel> – mit Zwischenspeicher, weil sich ein Bild nie ändert. Die
// Datenbank kennt nur den Schlüssel. Heute ein Ordner (data/photos/); für Cloud-Dienste, die Dateien beim Neustart
// verlieren, kommt mit 9.3 ein Objektspeicher hinter dieselbe Schnittstelle.

/** Bildformate, die der Server annimmt, mit der Dateiendung. */
export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type ImageType = keyof typeof IMAGE_TYPES;

export interface StoredImage {
  type: ImageType;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Größer wird kein Foto, das die App verkleinert schickt (800 px breit); Schutz beim Umzug alter Dateien. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Schlüssel: zufällige UUID plus Endung – nichts anderes, damit niemand Pfade wie „../“ unterschieben kann. */
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
export const isImageKey = (key: string) => KEY.test(key);
export const newImageKey = (type: ImageType) => `${randomUUID()}.${IMAGE_TYPES[type]}`;

function typeOfKey(key: string): ImageType {
  const ext = key.slice(key.lastIndexOf(".") + 1);
  return (Object.keys(IMAGE_TYPES) as ImageType[]).find((t) => IMAGE_TYPES[t] === ext) ?? "image/jpeg";
}

/**
 * Pfad, unter dem der Server ein Bild ausliefert. Die App setzt ihre Server-Adresse erst beim Anzeigen davor
 * (app/src/lib/serverImages.ts) – so passt er auch nach einem Umzug des Servers auf eine andere Adresse.
 */
export const IMAGE_PATH = "/api/images/";
export const imageUri = (key: string) => `${IMAGE_PATH}${key}`;
/** Schlüssel aus einem solchen Pfad; null bei allem anderen. */
export function imageKeyOf(uri: string): string | null {
  if (!uri.startsWith(IMAGE_PATH)) return null;
  const key = uri.slice(IMAGE_PATH.length);
  return isImageKey(key) ? key : null;
}

/** Erkennt das Format an den ersten Bytes – nicht an der Angabe des Absenders. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const at = (i: number, ...values: number[]) => values.every((v, j) => bytes[i + j] === v);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

const DATA_URI = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * data:image/…;base64,… → Bild. null, wenn es keine data-URI ist, zu groß ist oder die Bytes kein JPEG, PNG oder WebP
 * sind (das Format zählt, wie es die Bytes zeigen – so liefert der Server nie etwas anderes als ein Bild aus).
 */
export function decodeDataUri(uri: string): StoredImage | null {
  if (uri.length > (MAX_IMAGE_BYTES * 4) / 3 + 100) return null;
  const match = DATA_URI.exec(uri);
  if (!match) return null;
  const bytes = new Uint8Array(Buffer.from(match[1]!, "base64"));
  const type = sniffImageType(bytes);
  return type && bytes.length <= MAX_IMAGE_BYTES ? { type, bytes } : null;
}

/** Für „Meine Daten exportieren“: das Bild wieder als data-URI, damit die Datei auch ohne Server vollständig ist. */
export const toDataUri = (image: StoredImage) => `data:${image.type};base64,${Buffer.from(image.bytes).toString("base64")}`;

export interface ImageStore {
  /** Für die Startmeldung, z. B. „Ordner data/photos“. */
  readonly description: string;
  put(key: string, image: StoredImage): Promise<void>;
  get(key: string): Promise<StoredImage | undefined>;
  /** Löscht, falls vorhanden – kein Fehler, wenn es das Bild nicht (mehr) gibt. */
  delete(key: string): Promise<void>;
}

function requireKey(key: string) {
  if (!isImageKey(key)) throw new Error("Ungültiger Schlüssel für ein Bild");
}

/** Ein Ordner auf dem eigenen Rechner (Standard data/photos/, PHOTOS_DIR); eine Datei pro Bild. */
export class DirectoryImageStore implements ImageStore {
  readonly description: string;

  constructor(private readonly dir: string) {
    this.description = `Ordner ${dir}`;
  }

  async put(key: string, image: StoredImage): Promise<void> {
    requireKey(key);
    await mkdir(this.dir, { recursive: true });
    const file = join(this.dir, key);
    // Erst unter anderem Namen schreiben, dann umbenennen: Ein Absturz mittendrin hinterlässt kein halbes Bild.
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, image.bytes);
    await rename(tmp, file);
  }

  async get(key: string): Promise<StoredImage | undefined> {
    if (!isImageKey(key)) return undefined;
    try {
      return { type: typeOfKey(key), bytes: new Uint8Array(await readFile(join(this.dir, key))) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    if (!isImageKey(key)) return;
    await rm(join(this.dir, key), { force: true });
  }
}

/** Nur im Speicher – für Tests und wenn createApp keinen Bildspeicher bekommt. */
export class MemoryImageStore implements ImageStore {
  readonly description = "im Speicher (nur für Tests)";
  private readonly images = new Map<string, StoredImage>();

  async put(key: string, image: StoredImage): Promise<void> {
    requireKey(key);
    this.images.set(key, { type: image.type, bytes: new Uint8Array(image.bytes) });
  }

  async get(key: string): Promise<StoredImage | undefined> {
    return this.images.get(key);
  }

  async delete(key: string): Promise<void> {
    this.images.delete(key);
  }

  /** Gespeicherte Schlüssel, z. B. um in Tests zu prüfen, dass nichts übrig bleibt. */
  keys(): string[] {
    return [...this.images.keys()].sort();
  }
}
