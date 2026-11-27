import { batches, type Db, type Queryable } from "./db.js";

// Allgemeine Tabelle für den Abgleich zwischen App und Server (Vorrang 1, 9.2): pro Besitzer („user:<Konto-ID>“ bzw.
// „device:<Geräte-ID>“) und Art („diary“ für die Ernährungshistorie, „settings“, „plan“, „pantry“, „recipes“,
// „favorites“, „texts“ und „photos“ für Einstellungen, Plan, Vorrat, eigene Rezepte, Favoriten, Rezepttexte und eigene
// Fotos der Galerie eines Kontos – sync/userData.ts) Datensätze mit Eintrags-ID, Revision,
// Zeitpunkt der letzten Änderung und Inhalt – oder einer Löschmarke (Inhalt NULL), damit Gelöschtes von anderen
// Geräten nicht zurückkommt. Die Revision zählt pro Besitzer und Art hoch
// (sync_revisions); die App merkt sich, bis zu welcher sie alles kennt, und fragt beim nächsten Mal nur nach Neuerem.
// Gleichzeitige Abgleiche desselben Besitzers laufen nacheinander: SQLite schreibt ohnehin nur in einer Transaktion
// gleichzeitig, bei Postgres sperrt die Zeile in sync_revisions bis zum Ende der Transaktion.

export interface SyncRecord<T = unknown> {
  id: string;
  /** Zeitpunkt der letzten Änderung, einheitlich als ISO-Text mit Millisekunden und „Z“ (Textvergleich = Zeitvergleich). */
  updatedAt: string;
  /** Inhalt (als JSON gespeichert) oder null = Löschmarke. */
  data: T | null;
}

export interface SyncKind {
  /** Wert der Spalte kind, z. B. „diary“. */
  name: string;
  /** Höchstens so viele Datensätze pro Antwort; den Rest holt die App mit `since` = `rev` (more = true). */
  pageSize: number;
  /** Höchstens so viele Datensätze (mit Löschmarken) pro Besitzer – Schutz vor Missbrauch. */
  maxRecords: number;
  /**
   * Bei gleichem Zeitpunkt, aber anderem Inhalt behält der Server seine Fassung und schickt sie zurück, damit die App sie
   * übernimmt (sonst behielte jede Seite ihre). Für Plan, Vorrat und Einstellungen (sync/userData.ts): Was ein Gerät
   * schon vor dem Abgleich hatte, trägt dort den Zeitpunkt 0. Beim Tagebuch heißt gleicher Zeitpunkt gleicher Inhalt.
   */
  serverWinsTies?: boolean;
  /**
   * Nach dem Übernehmen von Änderungen, in derselben Transaktion, z. B. Häkchen eines abgelösten Plans entfernen. Liefert
   * die IDs der entfernten Datensätze (sie fehlen dann auch in der Antwort).
   */
  afterChanges?: (tx: Queryable, owner: string) => Promise<string[]>;
  /**
   * Für jede Änderung, die übernommen wird, kurz vor dem Speichern (in derselben Transaktion, `current` ist die bisherige
   * Fassung): darf den Inhalt anpassen, z. B. ein Foto als data-URI in den Bildspeicher legen und durch dessen Pfad
   * ersetzen (sync/userData.ts). Liefert den Datensatz, wie er gespeichert wird – unverändert dasselbe Objekt. Weicht
   * er ab, steht die gespeicherte Fassung in der Antwort, damit die App sie kennt.
   */
  prepare?: (change: SyncRecord, current: SyncRecord | undefined) => Promise<SyncRecord>;
}

export interface SyncResult<T = unknown> {
  /** Bis zu dieser Revision kennt die App nach dieser Antwort alles. */
  rev: number;
  changes: SyncRecord<T>[];
  /** true: Es gibt noch mehr, gleich noch einmal ab `rev` fragen. */
  more: boolean;
}

/** Datensatz samt Revision, mit der er zuletzt geändert wurde. */
export interface StoredSyncRecord<T = unknown> extends SyncRecord<T> {
  rev: number;
}

/** Der Besitzer hat schon `maxRecords` Datensätze dieser Art. */
export class SyncFullError extends Error {}

/** Neuere Fassung gewinnt, bei Gleichstand das Löschen – genau wie in der App (app/src/lib/diary.ts). */
export function wins(incoming: SyncRecord, current: SyncRecord): boolean {
  if (incoming.updatedAt !== current.updatedAt) return incoming.updatedAt > current.updatedAt;
  return incoming.data === null && current.data !== null;
}

/** Gleicher Stand: gleicher Zeitpunkt, beide gelöscht bzw. beide nicht – mit `sameContent` auch gleicher Inhalt. */
function sameVersion(a: SyncRecord, b: SyncRecord, sameContent: boolean): boolean {
  if (a.updatedAt !== b.updatedAt || (a.data === null) !== (b.data === null)) return false;
  return !sameContent || JSON.stringify(a.data) === JSON.stringify(b.data);
}

interface Row {
  id: string;
  rev: number | string;
  updated_at: string;
  data: string | null;
}

const COLUMNS = "id, rev, updated_at, data";
const toStored = (r: Row): StoredSyncRecord => ({
  id: r.id,
  rev: Number(r.rev),
  updatedAt: r.updated_at,
  data: r.data === null ? null : (JSON.parse(r.data) as unknown),
});
const strip = ({ rev: _rev, ...record }: StoredSyncRecord): SyncRecord => record;

async function readRecords(q: Queryable, owner: string, kind: string, ids: readonly string[]): Promise<Map<string, StoredSyncRecord>> {
  const found = new Map<string, StoredSyncRecord>();
  for (const batch of batches([...new Set(ids)])) {
    const rows = await q.all<Row>(
      `SELECT ${COLUMNS} FROM sync_records WHERE owner = ? AND kind = ? AND id IN (${batch.map(() => "?").join(", ")})`,
      [owner, kind, ...batch],
    );
    for (const row of rows) found.set(row.id, toStored(row));
  }
  return found;
}

/** Schreibt Datensätze (jede ID höchstens einmal) – neue kommen dazu, vorhandene werden ersetzt. */
async function writeRecords(q: Queryable, owner: string, kind: string, records: readonly StoredSyncRecord[]) {
  for (const batch of batches(records)) {
    await q.run(
      `INSERT INTO sync_records (owner, kind, id, rev, updated_at, data) VALUES ${batch.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}
       ON CONFLICT (owner, kind, id) DO UPDATE SET rev = excluded.rev, updated_at = excluded.updated_at, data = excluded.data`,
      batch.flatMap((r) => [owner, kind, r.id, r.rev, r.updatedAt, r.data === null ? null : JSON.stringify(r.data)]),
    );
  }
}

async function readRevision(q: Queryable, owner: string, kind: string): Promise<number> {
  const row = await q.get<{ rev: number | string }>("SELECT rev FROM sync_revisions WHERE owner = ? AND kind = ?", [owner, kind]);
  return Number(row?.rev ?? 0);
}

/**
 * Legt die Zeile mit der Revision an, falls nötig, und sperrt sie: Bei Postgres warten andere Transaktionen, die
 * dieselbe Zeile ändern wollen, bis diese fertig ist (bei SQLite schreibt ohnehin nur eine Transaktion gleichzeitig).
 */
async function lockRevision(q: Queryable, owner: string, kind: string): Promise<number> {
  await q.run("INSERT INTO sync_revisions (owner, kind, rev) VALUES (?, ?, 0) ON CONFLICT (owner, kind) DO NOTHING", [owner, kind]);
  await q.run("UPDATE sync_revisions SET rev = rev WHERE owner = ? AND kind = ?", [owner, kind]);
  return readRevision(q, owner, kind);
}

const setRevision = (q: Queryable, owner: string, kind: string, rev: number) =>
  q.run("UPDATE sync_revisions SET rev = ? WHERE owner = ? AND kind = ?", [rev, owner, kind]);

async function countRecords(q: Queryable, owner: string, kind: string, withTombstones = true): Promise<number> {
  const row = await q.get<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM sync_records WHERE owner = ? AND kind = ?${withTombstones ? "" : " AND data IS NOT NULL"}`,
    [owner, kind],
  );
  return Number(row?.n ?? 0);
}

/** Abgleich, Übernahme ins Konto und Löschen auf der Tabelle sync_records (Migration 2). */
export class SyncStore {
  constructor(private readonly db: Db) {}

  /**
   * Übernimmt `changes` (was neuer ist) und liefert, was seit `since` dazugekommen ist – ohne das gerade Übernommene
   * (außer es wurde beim Speichern angepasst, siehe `prepare`), dafür mit der Fassung des Servers, wo die geschickte
   * älter war. Alles oder nichts: Ist der Besitzer zu voll (SyncFullError), bleibt alles, wie es war.
   */
  async sync<T>(kind: SyncKind, owner: string, since: number, changes: readonly SyncRecord<T>[]): Promise<SyncResult<T>> {
    return this.db.transaction(async (tx) => {
      const before = changes.length > 0 ? await lockRevision(tx, owner, kind.name) : await readRevision(tx, owner, kind.name);
      const stored = changes.length > 0 ? await readRecords(tx, owner, kind.name, changes.map((c) => c.id)) : new Map<string, StoredSyncRecord>();
      let rev = before;
      let count: number | undefined;
      const applied = new Map<string, StoredSyncRecord>();
      const conflicts = new Map<string, StoredSyncRecord>();
      /** Übernommenes, das beim Speichern angepasst wurde – die App bekommt die gespeicherte Fassung. */
      const adjusted = new Map<string, StoredSyncRecord>();
      // Der Reihe nach wie geschickt; kommt eine ID mehrmals vor, zählt der Vergleich mit dem schon Übernommenen.
      for (const change of changes) {
        const current = applied.get(change.id) ?? stored.get(change.id);
        if (current && !wins(change, current)) {
          if (!sameVersion(current, change, kind.serverWinsTies === true)) conflicts.set(change.id, current);
          continue;
        }
        if (!current) {
          count ??= await countRecords(tx, owner, kind.name);
          if (count >= kind.maxRecords) throw new SyncFullError();
          count++;
        }
        const record = kind.prepare ? await kind.prepare(change, current) : change;
        const saved: StoredSyncRecord = { id: change.id, updatedAt: change.updatedAt, data: record.data, rev: ++rev };
        applied.set(change.id, saved);
        conflicts.delete(change.id);
        if (record.data !== change.data) adjusted.set(change.id, saved);
        else adjusted.delete(change.id);
      }
      let removed = new Set<string>();
      if (applied.size > 0) {
        await writeRecords(tx, owner, kind.name, [...applied.values()]);
        await setRevision(tx, owner, kind.name, rev);
        if (kind.afterChanges) removed = new Set(await kind.afterChanges(tx, owner));
      }
      // Was die App noch nicht kennt: alles nach `since` bis vor dieser Anfrage – das gerade Übernommene hat sie ja.
      const rows = await tx.all<Row>(
        `SELECT ${COLUMNS} FROM sync_records WHERE owner = ? AND kind = ? AND rev > ? AND rev <= ? ORDER BY rev LIMIT ?`,
        [owner, kind.name, since, before, kind.pageSize + 1],
      );
      const more = rows.length > kind.pageSize;
      const page = rows.slice(0, kind.pageSize).map(toStored);
      const inPage = new Set(page.map((r) => r.id));
      const extra = [...conflicts.values(), ...adjusted.values()].filter((r) => !inPage.has(r.id) && !removed.has(r.id));
      return {
        rev: more ? page[page.length - 1]!.rev : rev,
        changes: [...page, ...extra].map(strip) as SyncRecord<T>[],
        more,
      };
    });
  }

  /**
   * Übernimmt die Datensätze von `from` (z. B. „device:<id>“) in `to` („user:<id>“), danach hat `from` keine mehr. Wie
   * beim Abgleich gewinnt die neuere Fassung, bei Gleichstand das Löschen; Übernommenes bekommt eine neue Revision,
   * damit es auch die anderen Geräte des Kontos erreicht. Liefert die Zahl übernommener Einträge (ohne Löschmarken).
   * Ist `to` dafür zu voll, ändert sich nichts (SyncFullError). Die Revision von `from` bleibt stehen, damit sie nie
   * rückwärts zählt.
   */
  async transfer(kind: SyncKind, from: string, to: string): Promise<number> {
    if (from === to) return 0;
    return this.db.transaction(async (tx) => {
      // Immer zuerst das Gerät, dann das Konto sperren (gibt es für das Gerät nichts, gibt es auch keine Zeile).
      await tx.run("UPDATE sync_revisions SET rev = rev WHERE owner = ? AND kind = ?", [from, kind.name]);
      const source = (await tx.all<Row>(`SELECT ${COLUMNS} FROM sync_records WHERE owner = ? AND kind = ? ORDER BY rev`, [from, kind.name])).map(toStored);
      if (source.length === 0) return 0;
      let rev = await lockRevision(tx, to, kind.name);
      const target = await readRecords(tx, to, kind.name, source.map((r) => r.id));
      const incoming = source.filter((r) => {
        const current = target.get(r.id);
        return !current || wins(r, current);
      });
      const added = incoming.filter((r) => !target.has(r.id)).length;
      if (added > 0 && (await countRecords(tx, to, kind.name)) + added > kind.maxRecords) throw new SyncFullError();
      if (incoming.length > 0) {
        await writeRecords(tx, to, kind.name, incoming.map((r) => ({ ...r, rev: ++rev })));
        await setRevision(tx, to, kind.name, rev);
      }
      await tx.run("DELETE FROM sync_records WHERE owner = ? AND kind = ?", [from, kind.name]);
      return incoming.filter((r) => r.data !== null).length;
    });
  }

  /**
   * Einmaliger Umzug aus Dateien älterer Fassungen (storage/legacy.ts): übernimmt die Datensätze eines Besitzers samt
   * Revisionen, damit Geräte, die schon bis zu einer Revision abgeglichen haben, nichts verpassen. Hat die Datenbank für
   * diesen Besitzer schon etwas (z. B. nach einem abgebrochenen Umzug), wird zusammengeführt wie bei `transfer`: Neueres
   * gewinnt und bekommt eine neue Revision. Ohne Grenze für die Zahl – es sind Daten, die der Server schon hatte.
   * Liefert die Zahl übernommener Datensätze (mit Löschmarken).
   */
  async importOwner(kindName: string, owner: string, records: readonly StoredSyncRecord[], fileRev: number): Promise<number> {
    const unique = [...new Map([...records].sort((a, b) => a.rev - b.rev).map((r) => [r.id, r])).values()];
    return this.db.transaction(async (tx) => {
      const current = await lockRevision(tx, owner, kindName);
      if (current === 0 && (await countRecords(tx, owner, kindName)) === 0) {
        await writeRecords(tx, owner, kindName, unique);
        await setRevision(tx, owner, kindName, unique.reduce((top, r) => Math.max(top, r.rev), fileRev));
        return unique.length;
      }
      const target = await readRecords(tx, owner, kindName, unique.map((r) => r.id));
      const incoming = unique.filter((r) => {
        const existing = target.get(r.id);
        return !existing || wins(r, existing);
      });
      let rev = Math.max(current, fileRev);
      if (incoming.length > 0) {
        await writeRecords(tx, owner, kindName, incoming.map((r) => ({ ...r, rev: ++rev })));
        await setRevision(tx, owner, kindName, rev);
      }
      return incoming.length;
    });
  }

  /** Anzahl gespeicherter Einträge (ohne Löschmarken). */
  count(kind: SyncKind, owner: string): Promise<number> {
    return countRecords(this.db, owner, kind.name, false);
  }

  /** Alle Einträge ohne Löschmarken, in der Reihenfolge ihrer Änderung – z. B. für „Meine Daten exportieren“. */
  async records<T>(kind: SyncKind, owner: string): Promise<SyncRecord<T>[]> {
    const rows = await this.db.all<Row>(`SELECT ${COLUMNS} FROM sync_records WHERE owner = ? AND kind = ? AND data IS NOT NULL ORDER BY rev`, [owner, kind.name]);
    return rows.map((r) => strip(toStored(r)) as SyncRecord<T>);
  }

  /** Beim Löschen eines Kontos: alle Datensätze und Revisionen des Besitzers entfernen (ohne `kind`: aller Arten). */
  async remove(owner: string, kind?: SyncKind): Promise<void> {
    const where = kind ? "owner = ? AND kind = ?" : "owner = ?";
    const params = kind ? [owner, kind.name] : [owner];
    await this.db.transaction(async (tx) => {
      await tx.run(`DELETE FROM sync_records WHERE ${where}`, params);
      await tx.run(`DELETE FROM sync_revisions WHERE ${where}`, params);
    });
  }
}
