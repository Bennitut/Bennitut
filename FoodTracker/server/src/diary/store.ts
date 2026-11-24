import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

interface StoredRecord extends DiaryRecord {
  /** Revision, mit der der Datensatz zuletzt geändert wurde (pro Besitzer fortlaufend). */
  rev: number;
}

interface OwnerData {
  owner: string;
  rev: number;
  records: Record<string, StoredRecord>;
}

export interface DiarySyncResult {
  rev: number;
  changes: DiaryRecord[];
  more: boolean;
}

/** Höchstens so viele Datensätze pro Antwort; den Rest holt die App mit `since` = `rev` (more = true). */
export const DIARY_PAGE_SIZE = 5000;
/** Höchstens so viele Einträge und Löschmarken pro Konto bzw. Gerät (Schutz vor Missbrauch; reicht für Jahrzehnte). */
export const DIARY_MAX_RECORDS = 200_000;

export class DiaryFullError extends Error {}

/** Neuere Fassung gewinnt, bei Gleichstand das Löschen – genau wie in der App (app/src/lib/diary.ts). */
function wins(incoming: DiaryRecord, current: DiaryRecord): boolean {
  if (incoming.updatedAt !== current.updatedAt) return incoming.updatedAt > current.updatedAt;
  return incoming.entry === null && current.entry !== null;
}

const strip = ({ rev: _rev, ...record }: StoredRecord): DiaryRecord => record;

/**
 * Sicherung der Ernährungshistorie: pro Konto („user:<id>“), sonst pro Geräte-ID („device:<id>“) eine JSON-Datei
 * unter `dir` (Name = Prüfsumme des Besitzers, damit keine fremden Zeichen im Dateinamen landen). Gelöschtes bleibt
 * als Löschmarke ohne Inhalt, damit es von anderen Geräten nicht zurückkommt. `dir` = null: nur im Speicher (Tests).
 */
export class DiaryStore {
  private readonly owners = new Map<string, OwnerData>();

  constructor(
    private readonly dir: string | null,
    private readonly pageSize = DIARY_PAGE_SIZE,
    private readonly maxRecords = DIARY_MAX_RECORDS,
  ) {}

  /**
   * Übernimmt `changes` (was neuer ist) und liefert, was seit `since` dazugekommen ist – ohne das gerade
   * Übernommene, dafür mit der Fassung des Servers, wo die geschickte älter war.
   */
  sync(owner: string, since: number, changes: DiaryRecord[]): DiarySyncResult {
    const data = this.load(owner);
    let count = Object.keys(data.records).length;
    const applied = new Set<string>();
    const conflicts = new Map<string, StoredRecord>();
    for (const change of changes) {
      const current = data.records[change.id];
      if (current && !wins(change, current)) {
        const same = current.updatedAt === change.updatedAt && (current.entry === null) === (change.entry === null);
        if (!same) conflicts.set(change.id, current);
        continue;
      }
      if (!current && count >= this.maxRecords) throw new DiaryFullError();
      if (!current) count++;
      data.rev++;
      data.records[change.id] = { ...change, rev: data.rev };
      applied.add(change.id);
      conflicts.delete(change.id);
    }
    if (applied.size > 0) this.save(data);
    const newer = Object.values(data.records)
      .filter((r) => r.rev > since && !applied.has(r.id))
      .sort((a, b) => a.rev - b.rev);
    const page = newer.slice(0, this.pageSize);
    const more = newer.length > page.length;
    const rev = more ? page[page.length - 1]!.rev : data.rev;
    const inPage = new Set(page.map((r) => r.id));
    const extra = [...conflicts.values()].filter((r) => !inPage.has(r.id));
    return { rev, changes: [...page, ...extra].map(strip), more };
  }

  /** Anzahl gespeicherter Einträge (ohne Löschmarken), z. B. für Tests. */
  count(owner: string): number {
    return Object.values(this.load(owner).records).filter((r) => r.entry !== null).length;
  }

  private file(owner: string): string | null {
    return this.dir ? join(this.dir, `${createHash("sha256").update(owner).digest("hex").slice(0, 40)}.json`) : null;
  }

  private load(owner: string): OwnerData {
    const cached = this.owners.get(owner);
    if (cached) return cached;
    let data: OwnerData = { owner, rev: 0, records: {} };
    const file = this.file(owner);
    if (file) {
      try {
        const saved = JSON.parse(readFileSync(file, "utf8")) as OwnerData;
        if (saved && typeof saved.rev === "number" && saved.records && typeof saved.records === "object") data = { ...saved, owner };
      } catch (e) {
        // Keine Datei = noch nichts gesichert. Eine unlesbare Datei nicht überschreiben.
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    this.owners.set(owner, data);
    return data;
  }

  private save(data: OwnerData) {
    const file = this.file(data.owner);
    if (!file || !this.dir) return;
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  }
}
