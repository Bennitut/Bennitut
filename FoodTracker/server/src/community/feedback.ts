import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const FLAG_REASONS = ["text", "amounts", "image", "other"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

interface Photo {
  id: string;
  recipeId: string;
  authorId: string;
  authorName: string;
  /** Bild als data-URI (in der App verkleinert). */
  uri: string;
  createdAt: string;
  /** Sterne (1–5) je Geräte-ID. */
  ratings: Record<string, number>;
}

interface Flag {
  id: string;
  recipeId: string;
  authorId: string;
  reason: FlagReason;
  note: string;
  createdAt: string;
}

interface Data {
  photos: Photo[];
  recipeRatings: Record<string, Record<string, number>>;
  flags: Flag[];
}

/** Antwort an Clients: ohne fremde Geräte-IDs. */
export interface PhotoView {
  id: string;
  recipeId: string;
  uri: string;
  authorName: string;
  createdAt: string;
  avg: number;
  count: number;
  myRating: number | null;
  mine: boolean;
}

export interface RatingView {
  avg: number;
  count: number;
  mine: number | null;
}

export interface FlagSummary {
  recipeId: string;
  count: number;
  reasons: Partial<Record<FlagReason, number>>;
  notes: string[];
  lastAt: string;
}

const MAX_PHOTOS_PER_RECIPE = 40;
const MAX_PHOTOS_PER_DEVICE_AND_RECIPE = 5;

function summary(ratings: Record<string, number>, deviceId: string): RatingView {
  const values = Object.values(ratings);
  const sum = values.reduce((a, b) => a + b, 0);
  return { avg: values.length ? Math.round((sum / values.length) * 10) / 10 : 0, count: values.length, mine: ratings[deviceId] ?? null };
}

/** Sortierwert mit Vorannahme von 3,5 Sternen, damit ein einzelnes 5-Sterne-Foto nicht sofort ganz oben steht. */
const score = (ratings: Record<string, number>) => {
  const values = Object.values(ratings);
  return (values.reduce((a, b) => a + b, 0) + 3.5 * 2) / (values.length + 2);
};

/**
 * Fotos, Bewertungen und Fehlermeldungen zu Rezepten in einer JSON-Datei.
 * Für den Betrieb mit vielen Nutzer:innen gehört das in eine Datenbank mit Bildspeicher.
 */
export class FeedbackStore {
  private data: Data = { photos: [], recipeRatings: {}, flags: [] };

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.data = { ...this.data, ...(JSON.parse(readFileSync(file, "utf8")) as Partial<Data>) };
    } catch {
      // Noch keine Datei: leer starten.
    }
  }

  photos(recipeId: string, deviceId: string): PhotoView[] {
    return this.data.photos
      .filter((p) => p.recipeId === recipeId)
      .sort((a, b) => score(b.ratings) - score(a.ratings) || b.createdAt.localeCompare(a.createdAt))
      .map((p) => this.photoView(p, deviceId));
  }

  /** Bestbewertetes Foto je Rezept (mindestens eine Bewertung mit Schnitt ab 4 Sternen). */
  topPhotos(deviceId: string): Record<string, PhotoView> {
    const top: Record<string, PhotoView> = {};
    for (const p of this.data.photos) {
      const s = summary(p.ratings, deviceId);
      if (s.count === 0 || s.avg < 4) continue;
      const current = top[p.recipeId];
      if (!current || score(p.ratings) > (current.avg * current.count + 7) / (current.count + 2)) top[p.recipeId] = this.photoView(p, deviceId);
    }
    return top;
  }

  addPhoto(deviceId: string, recipeId: string, authorName: string, uri: string): PhotoView | "limit" {
    const forRecipe = this.data.photos.filter((p) => p.recipeId === recipeId);
    if (forRecipe.length >= MAX_PHOTOS_PER_RECIPE || forRecipe.filter((p) => p.authorId === deviceId).length >= MAX_PHOTOS_PER_DEVICE_AND_RECIPE) {
      return "limit";
    }
    const photo: Photo = { id: randomUUID(), recipeId, authorId: deviceId, authorName, uri, createdAt: new Date().toISOString(), ratings: {} };
    this.data.photos.push(photo);
    this.save();
    return this.photoView(photo, deviceId);
  }

  ratePhoto(deviceId: string, photoId: string, stars: number): PhotoView | undefined {
    const photo = this.data.photos.find((p) => p.id === photoId);
    if (!photo) return undefined;
    // Eigene Fotos kann man nicht selbst hochbewerten.
    if (photo.authorId !== deviceId) photo.ratings[deviceId] = stars;
    this.save();
    return this.photoView(photo, deviceId);
  }

  /** Nur wer das Foto hochgeladen hat, darf es löschen. */
  removePhoto(deviceId: string, photoId: string): boolean {
    const before = this.data.photos.length;
    this.data.photos = this.data.photos.filter((p) => !(p.id === photoId && p.authorId === deviceId));
    if (this.data.photos.length === before) return false;
    this.save();
    return true;
  }

  rateRecipe(deviceId: string, recipeId: string, stars: number): RatingView {
    const ratings = (this.data.recipeRatings[recipeId] ??= {});
    ratings[deviceId] = stars;
    this.save();
    return summary(ratings, deviceId);
  }

  recipeRatings(deviceId: string): Record<string, RatingView> {
    return Object.fromEntries(Object.entries(this.data.recipeRatings).map(([id, ratings]) => [id, summary(ratings, deviceId)]));
  }

  flag(deviceId: string, recipeId: string, reason: FlagReason, note: string) {
    this.data.flags.push({ id: randomUUID(), recipeId, authorId: deviceId, reason, note, createdAt: new Date().toISOString() });
    this.save();
  }

  /** Gemeldete Rezepte zum späteren Verbessern, die häufigsten zuerst. */
  flagSummary(): FlagSummary[] {
    const byRecipe = new Map<string, FlagSummary>();
    for (const f of this.data.flags) {
      const entry = byRecipe.get(f.recipeId) ?? { recipeId: f.recipeId, count: 0, reasons: {}, notes: [], lastAt: f.createdAt };
      entry.count++;
      entry.reasons[f.reason] = (entry.reasons[f.reason] ?? 0) + 1;
      if (f.note) entry.notes = [f.note, ...entry.notes].slice(0, 10);
      if (f.createdAt > entry.lastAt) entry.lastAt = f.createdAt;
      byRecipe.set(f.recipeId, entry);
    }
    return [...byRecipe.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
  }

  private photoView(p: Photo, deviceId: string): PhotoView {
    const s = summary(p.ratings, deviceId);
    return {
      id: p.id,
      recipeId: p.recipeId,
      uri: p.uri,
      authorName: p.authorName,
      createdAt: p.createdAt,
      avg: s.avg,
      count: s.count,
      myRating: s.mine,
      mine: p.authorId === deviceId,
    };
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}
