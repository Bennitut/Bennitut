import type { Db } from "../storage/db.js";
import { SyncStore, type SyncKind, type SyncRecord } from "../storage/sync.js";

export { SyncFullError as DiaryFullError } from "../storage/sync.js";

/** Tagebucheintrag, wie ihn die App schickt (app/src/lib/types.ts, DiaryEntry). */
export interface DiaryEntryData {
  id: string;
  date: string;
  time: string;
  title: string;
  nutrients: { kcal: number; protein: number; carbs: number; fat: number };
  source: "foto" | "plan" | "manuell";
  updatedAt?: string;
}

/** Eintrag oder Löschmarke (`entry: null`); `updatedAt` immer als ISO-Zeitpunkt mit Millisekunden und „Z“. */
export interface DiaryRecord {
  id: string;
  updatedAt: string;
  entry: DiaryEntryData | null;
}

export interface DiarySyncResult {
  rev: number;
  changes: DiaryRecord[];
  more: boolean;
}

/** Art in der Tabelle für den Abgleich (storage/sync.ts). */
export const DIARY_KIND = "diary";
/** Höchstens so viele Datensätze pro Antwort; den Rest holt die App mit `since` = `rev` (more = true). */
export const DIARY_PAGE_SIZE = 5000;
/** Höchstens so viele Einträge und Löschmarken pro Konto bzw. Gerät (Schutz vor Missbrauch; reicht für Jahrzehnte). */
export const DIARY_MAX_RECORDS = 200_000;

/** Gespeichert wird der Eintrag ohne ID und Zeitpunkt – die stehen in eigenen Spalten. */
export type DiaryData = Omit<DiaryEntryData, "id" | "updatedAt">;
export function diaryData(entry: object): DiaryData {
  const { id: _id, updatedAt: _updatedAt, ...data } = entry as DiaryEntryData;
  return data;
}

const toSync = (r: DiaryRecord): SyncRecord<DiaryData> => ({ id: r.id, updatedAt: r.updatedAt, data: r.entry ? diaryData(r.entry) : null });
const fromSync = (r: SyncRecord<DiaryData>): DiaryRecord => ({
  id: r.id,
  updatedAt: r.updatedAt,
  entry: r.data ? { ...r.data, id: r.id, updatedAt: r.updatedAt } : null,
});

/**
 * Sicherung der Ernährungshistorie in der Datenbank (Tabelle sync_records, Art „diary“): pro Konto („user:<id>“),
 * sonst pro Geräte-ID („device:<id>“). Gelöschtes bleibt als Löschmarke ohne Inhalt, damit es von anderen Geräten nicht
 * zurückkommt. Bis 27.11.2026 lag sie als eine Datei pro Besitzer unter `data/diary/` (Umzug in storage/legacy.ts).
 */
export class DiaryStore {
  private readonly store: SyncStore;
  private readonly kind: SyncKind;

  constructor(db: Db, pageSize = DIARY_PAGE_SIZE, maxRecords = DIARY_MAX_RECORDS) {
    this.store = new SyncStore(db);
    this.kind = { name: DIARY_KIND, pageSize, maxRecords };
  }

  /**
   * Übernimmt `changes` (was neuer ist) und liefert, was seit `since` dazugekommen ist – ohne das gerade
   * Übernommene, dafür mit der Fassung des Servers, wo die geschickte älter war. Wirft DiaryFullError, ohne etwas zu
   * ändern, wenn der Besitzer zu viele Einträge hätte.
   */
  async sync(owner: string, since: number, changes: readonly DiaryRecord[]): Promise<DiarySyncResult> {
    const result = await this.store.sync(this.kind, owner, since, changes.map(toSync));
    return { ...result, changes: result.changes.map(fromSync) };
  }

  /**
   * Übernimmt die Sicherung von `from` (z. B. „device:<id>“) in `to` („user:<id>“), danach hat `from` keine mehr. Neuere
   * Fassung gewinnt, bei Gleichstand das Löschen. Liefert die Zahl übernommener Einträge (ohne Löschmarken); wirft
   * DiaryFullError, ohne etwas zu ändern, wenn `to` dafür zu voll ist.
   */
  transfer(from: string, to: string): Promise<number> {
    return this.store.transfer(this.kind, from, to);
  }

  /** Anzahl gespeicherter Einträge (ohne Löschmarken), z. B. für Tests. */
  count(owner: string): Promise<number> {
    return this.store.count(this.kind, owner);
  }

  /** Alle Einträge ohne Löschmarken, nach Tag und Uhrzeit sortiert – für „Meine Daten exportieren“. */
  async entries(owner: string): Promise<DiaryEntryData[]> {
    return (await this.store.records<DiaryData>(this.kind, owner))
      .flatMap((r) => (r.data ? [fromSync(r).entry!] : []))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) || a.id.localeCompare(b.id));
  }

  /** Die ganze Sicherung eines Besitzers entfernen. */
  remove(owner: string): Promise<void> {
    return this.store.remove(owner, this.kind);
  }
}
