import { randomUUID } from "node:crypto";
import { nowIso } from "../storage/clock.js";
import { batches, placeholders, type Db, type Queryable } from "../storage/db.js";
import { decodeDataUri, imageUri, newImageKey, toDataUri, type ImageStore } from "../storage/images.js";

export const FLAG_REASONS = ["text", "amounts", "image", "other"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

/** Antwort an Clients: ohne fremde Geräte-IDs. `uri` ist der Pfad im Bildspeicher (/api/images/…). */
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

interface PhotoRow {
  id: string;
  recipe_id: string;
  author: string;
  author_name: string;
  image_key: string;
  created_at: string;
}

/** Anzahl und Summe der Sterne, dazu die eigenen (null = nicht bewertet). */
interface Stats {
  count: number;
  sum: number;
  mine: number | null;
}

const PHOTO_COLUMNS = "id, recipe_id, author, author_name, image_key, created_at";
const MAX_PHOTOS_PER_RECIPE = 40;
const MAX_PHOTOS_PER_DEVICE_AND_RECIPE = 5;
const NO_STATS: Stats = { count: 0, sum: 0, mine: null };

const summary = (s: Stats): RatingView => ({ avg: s.count ? Math.round((s.sum / s.count) * 10) / 10 : 0, count: s.count, mine: s.mine });

/** Sortierwert mit Vorannahme von 3,5 Sternen, damit ein einzelnes 5-Sterne-Foto nicht sofort ganz oben steht. */
const score = (s: Stats) => (s.sum + 3.5 * 2) / (s.count + 2);

const UPSERT_PHOTO_RATING =
  "INSERT INTO photo_ratings (photo_id, actor, stars) VALUES (?, ?, ?) ON CONFLICT (photo_id, actor) DO UPDATE SET stars = excluded.stars";
const UPSERT_RECIPE_RATING =
  "INSERT INTO recipe_ratings (recipe_id, actor, stars) VALUES (?, ?, ?) ON CONFLICT (recipe_id, actor) DO UPDATE SET stars = excluded.stars";
export const INSERT_PHOTO = `INSERT INTO recipe_photos (${PHOTO_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`;

/** Bilder erst nach der Transaktion löschen: Scheitert sie, bleibt alles, wie es war. */
async function deleteImages(images: ImageStore, keys: readonly string[]) {
  for (const key of keys) await images.delete(key).catch(() => undefined);
}

/** Sterne aller Fotos in `photoIds` (für `actor` auch die eigenen). */
async function photoStats(q: Queryable, photoIds: readonly string[], actor: string): Promise<Map<string, Stats>> {
  const stats = new Map<string, Stats>();
  for (const batch of batches([...new Set(photoIds)])) {
    const rows = await q.all<{ photo_id: string; actor: string; stars: number | string }>(
      `SELECT photo_id, actor, stars FROM photo_ratings WHERE photo_id IN (${placeholders(batch)})`,
      batch,
    );
    for (const r of rows) {
      const s = stats.get(r.photo_id) ?? { count: 0, sum: 0, mine: null };
      s.count++;
      s.sum += Number(r.stars);
      if (r.actor === actor) s.mine = Number(r.stars);
      stats.set(r.photo_id, s);
    }
  }
  return stats;
}

/**
 * Fotos, Sterne und Meldungen zu Rezepten in der Datenbank (Tabellen recipe_photos, photo_ratings, recipe_ratings und
 * recipe_flags, Migration 3), die Fotos selbst im Bildspeicher (storage/images.ts). Bis 27.11.2026 lag alles samt Fotos
 * als data-URI in `data/feedback.json` (Umzug in storage/legacy.ts). `actor` ist „user:<Konto-ID>“ oder die Geräte-ID.
 */
export class FeedbackStore {
  constructor(
    private readonly db: Db,
    private readonly images: ImageStore,
  ) {}

  async photos(recipeId: string, actor: string): Promise<PhotoView[]> {
    const rows = await this.db.all<PhotoRow>(`SELECT ${PHOTO_COLUMNS} FROM recipe_photos WHERE recipe_id = ? ORDER BY created_at, id`, [recipeId]);
    const stats = await photoStats(this.db, rows.map((r) => r.id), actor);
    const of = (r: PhotoRow) => stats.get(r.id) ?? NO_STATS;
    return rows
      .sort((a, b) => score(of(b)) - score(of(a)) || b.created_at.localeCompare(a.created_at))
      .map((r) => this.photoView(r, of(r), actor));
  }

  /** Bestbewertetes Foto je Rezept (mindestens eine Bewertung mit Schnitt ab 4 Sternen). */
  async topPhotos(actor: string): Promise<Record<string, PhotoView>> {
    const rated = await this.db.all<{ photo_id: string; n: number | string; total: number | string }>(
      "SELECT photo_id, COUNT(*) AS n, SUM(stars) AS total FROM photo_ratings GROUP BY photo_id",
    );
    const candidates = rated.filter((r) => Number(r.n) > 0 && summary({ count: Number(r.n), sum: Number(r.total), mine: null }).avg >= 4);
    const rows: PhotoRow[] = [];
    for (const batch of batches(candidates.map((r) => r.photo_id))) {
      rows.push(...(await this.db.all<PhotoRow>(`SELECT ${PHOTO_COLUMNS} FROM recipe_photos WHERE id IN (${placeholders(batch)})`, batch)));
    }
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const stats = await photoStats(this.db, rows.map((r) => r.id), actor);
    const best = new Map<string, { row: PhotoRow; stats: Stats }>();
    for (const row of rows) {
      const s = stats.get(row.id) ?? NO_STATS;
      const current = best.get(row.recipe_id);
      if (!current || score(s) > score(current.stats)) best.set(row.recipe_id, { row, stats: s });
    }
    return Object.fromEntries([...best].map(([recipeId, b]) => [recipeId, this.photoView(b.row, b.stats, actor)]));
  }

  /** Neues Foto aus einer data-URI; "invalid", wenn es kein JPEG, PNG oder WebP ist, "limit" bei zu vielen Fotos. */
  async addPhoto(actor: string, recipeId: string, authorName: string, uri: string): Promise<PhotoView | "limit" | "invalid"> {
    const image = decodeDataUri(uri);
    if (!image) return "invalid";
    const row: PhotoRow = { id: randomUUID(), recipe_id: recipeId, author: actor, author_name: authorName, image_key: newImageKey(image.type), created_at: nowIso() };
    // Erst das Bild, dann der Eintrag (in der Transaktion nichts Langsames); klappt der Eintrag nicht, kommt das Bild weg.
    await this.images.put(row.image_key, image);
    let added: boolean;
    try {
      added = await this.db.transaction(async (tx) => {
        const authors = await tx.all<{ author: string }>("SELECT author FROM recipe_photos WHERE recipe_id = ?", [recipeId]);
        if (authors.length >= MAX_PHOTOS_PER_RECIPE || authors.filter((a) => a.author === actor).length >= MAX_PHOTOS_PER_DEVICE_AND_RECIPE) return false;
        await tx.run(INSERT_PHOTO, [row.id, row.recipe_id, row.author, row.author_name, row.image_key, row.created_at]);
        return true;
      });
    } catch (e) {
      await deleteImages(this.images, [row.image_key]);
      throw e;
    }
    if (!added) {
      await deleteImages(this.images, [row.image_key]);
      return "limit";
    }
    return this.photoView(row, NO_STATS, actor);
  }

  async ratePhoto(actor: string, photoId: string, stars: number): Promise<PhotoView | undefined> {
    return this.db.transaction(async (tx) => {
      const photo = await tx.get<PhotoRow>(`SELECT ${PHOTO_COLUMNS} FROM recipe_photos WHERE id = ?`, [photoId]);
      if (!photo) return undefined;
      // Eigene Fotos kann man nicht selbst hochbewerten.
      if (photo.author !== actor) await tx.run(UPSERT_PHOTO_RATING, [photoId, actor, stars]);
      return this.photoView(photo, (await photoStats(tx, [photoId], actor)).get(photoId) ?? NO_STATS, actor);
    });
  }

  /** Nur wer das Foto hochgeladen hat, darf es löschen. */
  removePhoto(actor: string, photoId: string): Promise<boolean> {
    return this.removePhotosWhere("id = ? AND author = ?", [photoId, actor]);
  }

  /** Für Admins: neueste Fotos aller Rezepte zur Kontrolle. */
  async recentPhotos(actor: string, limit = 60): Promise<PhotoView[]> {
    const rows = await this.db.all<PhotoRow>(`SELECT ${PHOTO_COLUMNS} FROM recipe_photos ORDER BY created_at DESC, id DESC LIMIT ?`, [limit]);
    const stats = await photoStats(this.db, rows.map((r) => r.id), actor);
    return rows.map((r) => this.photoView(r, stats.get(r.id) ?? NO_STATS, actor));
  }

  /** Für Admins: beliebiges Foto entfernen. */
  removePhotoAsAdmin(photoId: string): Promise<boolean> {
    return this.removePhotosWhere("id = ?", [photoId]);
  }

  /**
   * Fotos nach ID: Rezept und Pfad im Bildspeicher – für eigene öffentliche Fotos im Abgleich eines Kontos
   * (sync/userData.ts), damit dessen andere Geräte das Foto zeigen und löschen können. Unbekannte IDs fehlen.
   */
  async galleryPhotos(ids: readonly string[]): Promise<Map<string, { recipeId: string; uri: string }>> {
    const found = new Map<string, { recipeId: string; uri: string }>();
    for (const batch of batches([...new Set(ids)])) {
      const rows = await this.db.all<PhotoRow>(`SELECT ${PHOTO_COLUMNS} FROM recipe_photos WHERE id IN (${placeholders(batch)})`, batch);
      for (const r of rows) found.set(r.id, { recipeId: r.recipe_id, uri: imageUri(r.image_key) });
    }
    return found;
  }

  /** Fotos je Konto bzw. Gerät – für Nutzerverzeichnis und Admin-Bereich. */
  async photoCountsByAuthor(): Promise<Map<string, number>> {
    const rows = await this.db.all<{ author: string; n: number | string }>("SELECT author, COUNT(*) AS n FROM recipe_photos GROUP BY author");
    return new Map(rows.map((r) => [r.author, Number(r.n)]));
  }

  /** Für „Meine Daten exportieren“: eigene Fotos (als data-URI, damit die Datei vollständig ist), Sterne und Meldungen. */
  async exportFor(actor: string) {
    const rows = await this.db.all<PhotoRow>(`SELECT ${PHOTO_COLUMNS} FROM recipe_photos WHERE author = ? ORDER BY created_at, id`, [actor]);
    const photos = [];
    for (const r of rows) {
      const image = await this.images.get(r.image_key);
      photos.push({ id: r.id, recipeId: r.recipe_id, uri: image ? toDataUri(image) : null, authorName: r.author_name, createdAt: r.created_at });
    }
    const photoRatings = await this.db.all<{ photo_id: string; stars: number | string }>("SELECT photo_id, stars FROM photo_ratings WHERE actor = ? ORDER BY photo_id", [actor]);
    const recipeRatings = await this.db.all<{ recipe_id: string; stars: number | string }>("SELECT recipe_id, stars FROM recipe_ratings WHERE actor = ? ORDER BY recipe_id", [actor]);
    const flags = await this.db.all<{ recipe_id: string; reason: FlagReason; note: string; created_at: string }>(
      "SELECT recipe_id, reason, note, created_at FROM recipe_flags WHERE author = ? ORDER BY created_at, id",
      [actor],
    );
    return {
      photos,
      photoRatings: Object.fromEntries(photoRatings.map((r) => [r.photo_id, Number(r.stars)])),
      recipeRatings: Object.fromEntries(recipeRatings.map((r) => [r.recipe_id, Number(r.stars)])),
      flags: flags.map((f) => ({ recipeId: f.recipe_id, reason: f.reason, note: f.note, createdAt: f.created_at })),
    };
  }

  /**
   * Beim Anmelden: Fotos, Sterne und Meldungen eines Geräts ohne Konto gehören danach dem Konto. Nichts doppelt: Hat
   * das Konto dasselbe Rezept bzw. Foto schon bewertet oder dasselbe Rezept gemeldet, gilt die Fassung des Kontos (Sterne
   * haben keinen Zeitpunkt, und eine Person bewertet bzw. meldet jedes Rezept einmal). Eigene Fotos bleiben auch danach
   * ohne eigene Sterne. Liefert, wie viele Fotos, Sterne und Meldungen übernommen wurden.
   */
  async transferActor(from: string, to: string): Promise<{ photos: number; ratings: number; flags: number }> {
    if (from === to) return { photos: 0, ratings: 0, flags: 0 };
    return this.db.transaction(async (tx) => {
      const moved = { photos: 0, ratings: 0, flags: 0 };
      moved.photos = await tx.run("UPDATE recipe_photos SET author = ? WHERE author = ?", [to, from]);

      // Sterne für Fotos: übernehmen, wo das Konto noch keine vergeben hat – außer für eigene Fotos des Kontos.
      const ratedByAccount = new Set((await tx.all<{ photo_id: string }>("SELECT photo_id FROM photo_ratings WHERE actor = ?", [to])).map((r) => r.photo_id));
      const fromPhotoRatings = await tx.all<{ photo_id: string; author: string }>(
        "SELECT r.photo_id, p.author FROM photo_ratings r JOIN recipe_photos p ON p.id = r.photo_id WHERE r.actor = ?",
        [from],
      );
      for (const r of fromPhotoRatings) {
        if (r.author === to || ratedByAccount.has(r.photo_id)) {
          await tx.run("DELETE FROM photo_ratings WHERE photo_id = ? AND actor = ?", [r.photo_id, from]);
        } else {
          await tx.run("UPDATE photo_ratings SET actor = ? WHERE photo_id = ? AND actor = ?", [to, r.photo_id, from]);
          moved.ratings++;
        }
      }
      // Ein Foto des Geräts, das das Konto schon bewertet hatte, ist jetzt ein eigenes.
      const ownRated = await tx.all<{ photo_id: string }>(
        "SELECT r.photo_id FROM photo_ratings r JOIN recipe_photos p ON p.id = r.photo_id WHERE r.actor = ? AND p.author = ?",
        [to, to],
      );
      for (const r of ownRated) await tx.run("DELETE FROM photo_ratings WHERE photo_id = ? AND actor = ?", [r.photo_id, to]);

      // Sterne für Rezepte.
      const recipesRated = new Set((await tx.all<{ recipe_id: string }>("SELECT recipe_id FROM recipe_ratings WHERE actor = ?", [to])).map((r) => r.recipe_id));
      for (const { recipe_id } of await tx.all<{ recipe_id: string }>("SELECT recipe_id FROM recipe_ratings WHERE actor = ?", [from])) {
        if (recipesRated.has(recipe_id)) {
          await tx.run("DELETE FROM recipe_ratings WHERE recipe_id = ? AND actor = ?", [recipe_id, from]);
        } else {
          await tx.run("UPDATE recipe_ratings SET actor = ? WHERE recipe_id = ? AND actor = ?", [to, recipe_id, from]);
          moved.ratings++;
        }
      }

      // Meldungen: je Rezept eine; hat das Konto das Rezept schon gemeldet, gilt seine.
      const flagged = new Set((await tx.all<{ recipe_id: string }>("SELECT recipe_id FROM recipe_flags WHERE author = ?", [to])).map((r) => r.recipe_id));
      for (const f of await tx.all<{ id: string; recipe_id: string }>("SELECT id, recipe_id FROM recipe_flags WHERE author = ? ORDER BY created_at, id", [from])) {
        if (flagged.has(f.recipe_id)) {
          await tx.run("DELETE FROM recipe_flags WHERE id = ?", [f.id]);
        } else {
          await tx.run("UPDATE recipe_flags SET author = ? WHERE id = ?", [to, f.id]);
          flagged.add(f.recipe_id);
          moved.flags++;
        }
      }
      return moved;
    });
  }

  /** Beim Löschen eines Kontos: eigene Fotos (samt Bilddateien), vergebene Sterne und Meldungen entfernen. */
  async removeActor(actor: string): Promise<void> {
    const keys = await this.db.transaction(async (tx) => {
      const own = await tx.all<{ id: string; image_key: string }>("SELECT id, image_key FROM recipe_photos WHERE author = ?", [actor]);
      await deletePhotoRatings(tx, own.map((r) => r.id));
      await tx.run("DELETE FROM recipe_photos WHERE author = ?", [actor]);
      await tx.run("DELETE FROM photo_ratings WHERE actor = ?", [actor]);
      await tx.run("DELETE FROM recipe_ratings WHERE actor = ?", [actor]);
      await tx.run("DELETE FROM recipe_flags WHERE author = ?", [actor]);
      return own.map((r) => r.image_key);
    });
    await deleteImages(this.images, keys);
  }

  async rateRecipe(actor: string, recipeId: string, stars: number): Promise<RatingView> {
    return this.db.transaction(async (tx) => {
      await tx.run(UPSERT_RECIPE_RATING, [recipeId, actor, stars]);
      const rows = await tx.all<{ actor: string; stars: number | string }>("SELECT actor, stars FROM recipe_ratings WHERE recipe_id = ?", [recipeId]);
      return summary({ count: rows.length, sum: rows.reduce((a, r) => a + Number(r.stars), 0), mine: stars });
    });
  }

  async recipeRatings(actor: string): Promise<Record<string, RatingView>> {
    const all = await this.db.all<{ recipe_id: string; n: number | string; total: number | string }>(
      "SELECT recipe_id, COUNT(*) AS n, SUM(stars) AS total FROM recipe_ratings GROUP BY recipe_id",
    );
    const mine = new Map(
      (await this.db.all<{ recipe_id: string; stars: number | string }>("SELECT recipe_id, stars FROM recipe_ratings WHERE actor = ?", [actor])).map((r) => [r.recipe_id, Number(r.stars)]),
    );
    return Object.fromEntries(all.map((r) => [r.recipe_id, summary({ count: Number(r.n), sum: Number(r.total), mine: mine.get(r.recipe_id) ?? null })]));
  }

  async flag(actor: string, recipeId: string, reason: FlagReason, note: string): Promise<void> {
    await this.db.run("INSERT INTO recipe_flags (id, recipe_id, author, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      randomUUID(),
      recipeId,
      actor,
      reason,
      note,
      nowIso(),
    ]);
  }

  /** Meldungen zu einem Rezept als erledigt entfernen. */
  resolveFlags(recipeId: string): Promise<number> {
    return this.db.run("DELETE FROM recipe_flags WHERE recipe_id = ?", [recipeId]);
  }

  /** Gemeldete Rezepte zum späteren Verbessern, die häufigsten zuerst. */
  async flagSummary(): Promise<FlagSummary[]> {
    const flags = await this.db.all<{ recipe_id: string; reason: FlagReason; note: string; created_at: string }>(
      "SELECT recipe_id, reason, note, created_at FROM recipe_flags ORDER BY created_at, id",
    );
    const byRecipe = new Map<string, FlagSummary>();
    for (const f of flags) {
      const entry = byRecipe.get(f.recipe_id) ?? { recipeId: f.recipe_id, count: 0, reasons: {}, notes: [], lastAt: f.created_at };
      entry.count++;
      entry.reasons[f.reason] = (entry.reasons[f.reason] ?? 0) + 1;
      // Die neuesten Notizen zuerst, höchstens zehn.
      if (f.note) entry.notes = [f.note, ...entry.notes].slice(0, 10);
      if (f.created_at > entry.lastAt) entry.lastAt = f.created_at;
      byRecipe.set(f.recipe_id, entry);
    }
    return [...byRecipe.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
  }

  private async removePhotosWhere(where: string, params: string[]): Promise<boolean> {
    const key = await this.db.transaction(async (tx) => {
      const row = await tx.get<{ id: string; image_key: string }>(`SELECT id, image_key FROM recipe_photos WHERE ${where}`, params);
      if (!row) return undefined;
      await deletePhotoRatings(tx, [row.id]);
      await tx.run("DELETE FROM recipe_photos WHERE id = ?", [row.id]);
      return row.image_key;
    });
    if (!key) return false;
    await deleteImages(this.images, [key]);
    return true;
  }

  private photoView(p: PhotoRow, s: Stats, actor: string): PhotoView {
    const { avg, count, mine } = summary(s);
    return {
      id: p.id,
      recipeId: p.recipe_id,
      uri: imageUri(p.image_key),
      authorName: p.author_name,
      createdAt: p.created_at,
      avg,
      count,
      myRating: mine,
      mine: p.author === actor,
    };
  }
}

/** Sterne dieser Fotos löschen (vor dem Foto selbst – die Datenbank verlangt es so). */
async function deletePhotoRatings(tx: Queryable, photoIds: readonly string[]) {
  for (const batch of batches(photoIds)) await tx.run(`DELETE FROM photo_ratings WHERE photo_id IN (${placeholders(batch)})`, batch);
}
