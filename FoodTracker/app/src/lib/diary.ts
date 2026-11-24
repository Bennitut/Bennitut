// Tagebuch (Ernährungshistorie): eigener Speicher, Löschmarken und Abgleich mit dem Server.
// Ohne native Module – Speicher und Server werden übergeben –, damit alles in test/ läuft.
//
// Grundsätze:
// - Nur ein Tipp auf „Löschen“ entfernt einen Eintrag. Er bleibt als Löschmarke, damit er beim Abgleich oder beim
//   Import nicht zurückkommt. Fehlt ein Eintrag auf dem Server oder in einer Datei, heißt das nichts.
// - Bei zwei Fassungen desselben Eintrags gewinnt die neuere (`updatedAt`), bei Gleichstand das Löschen.
// - Das Tagebuch liegt nicht mehr im übrigen Zustand der App, sondern unter eigenen Schlüsseln (ein Teil pro Jahr),
//   damit es auch dann gespeichert wird, wenn Plan, Fotos und importierte Rezepte den Speicher füllen.
import type { DiaryEntry } from "./types";

/** Gelöschter Eintrag. */
export interface DiaryTombstone {
  id: string;
  /** ISO-Zeitpunkt des Löschens. */
  deletedAt: string;
}

/** Letzter erfolgreicher Abgleich: für wen (Konto oder Gerät), bis zu welcher Revision des Servers und wann. */
export interface DiarySyncMark {
  owner: string;
  rev: number;
  at: string;
}

export interface DiaryState {
  /** Alle Einträge, jeder mit `updatedAt`, sortiert nach Tag und Uhrzeit. */
  entries: DiaryEntry[];
  deleted: DiaryTombstone[];
  /** IDs mit Änderungen, die der Server noch nicht hat. */
  pending: string[];
  sync: DiarySyncMark | null;
}

/** Ein Eintrag oder eine Löschmarke (`entry: null`), so wie sie zwischen App, Server und Sicherungsdatei wandern. */
export interface DiaryRecord {
  id: string;
  updatedAt: string;
  entry: DiaryEntry | null;
}

export interface DiarySyncRequest {
  /** Revision des letzten Abgleichs; 0 = alles schicken. */
  since: number;
  changes: DiaryRecord[];
}

export interface DiarySyncResponse {
  /** Für wen der Server gespeichert hat: "user:<id>" oder "device:<id>". */
  owner: string;
  /** Bis zu dieser Revision ist die App nach dieser Antwort auf dem Stand. */
  rev: number;
  /** Was die App noch nicht kennt – auch die Fassung des Servers, wenn sie neuer war als die geschickte. */
  changes: DiaryRecord[];
  /** true: Es gibt noch mehr, gleich noch einmal ab `rev` fragen. */
  more: boolean;
}

export const emptyDiary = (): DiaryState => ({ entries: [], deleted: [], pending: [], sync: null });

const SOURCES: DiaryEntry["source"][] = ["foto", "plan", "manuell"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const amount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000 ? value : null;

/** Einheitliche ISO-Form (immer mit Millisekunden und „Z“), damit Zeitpunkte als Text vergleichbar sind; sonst null. */
export function isoTime(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

/** Für Einträge aus der Zeit vor `updatedAt`: Tag und Uhrzeit des Eintrags (Ortszeit). */
function legacyUpdatedAt(date: string, time: string): string {
  return isoTime(`${date}T${time}:00`) ?? new Date(0).toISOString();
}

/** Prüft einen Eintrag aus Speicher, Server oder Sicherungsdatei; null, wenn er unbrauchbar ist. */
export function normalizeEntry(raw: unknown): DiaryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const n = (e.nutrients && typeof e.nutrients === "object" ? e.nutrients : {}) as Record<string, unknown>;
  if (typeof e.id !== "string" || e.id.length === 0 || e.id.length > 100) return null;
  if (typeof e.date !== "string" || !DATE.test(e.date)) return null;
  const kcal = amount(n.kcal);
  if (kcal === null) return null;
  const time = typeof e.time === "string" && TIME.test(e.time) ? e.time : "12:00";
  return {
    id: e.id,
    date: e.date,
    time,
    title: typeof e.title === "string" ? e.title.slice(0, 300) : "",
    nutrients: { kcal, protein: amount(n.protein) ?? 0, carbs: amount(n.carbs) ?? 0, fat: amount(n.fat) ?? 0 },
    source: SOURCES.includes(e.source as DiaryEntry["source"]) ? (e.source as DiaryEntry["source"]) : "manuell",
    updatedAt: isoTime(e.updatedAt) ?? legacyUpdatedAt(e.date, time),
  };
}

/** Prüft einen Datensatz vom Server oder aus einer Datei; null, wenn er unbrauchbar ist. */
export function normalizeRecord(raw: unknown): DiaryRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const updatedAt = isoTime(r.updatedAt);
  if (typeof r.id !== "string" || r.id.length === 0 || r.id.length > 100 || !updatedAt) return null;
  if (r.entry === null) return { id: r.id, updatedAt, entry: null };
  const entry = normalizeEntry({ ...(r.entry as object), id: r.id, updatedAt });
  return entry ? { id: r.id, updatedAt, entry } : null;
}

const byDateTime = (a: DiaryEntry, b: DiaryEntry) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id);

/** Neuer Eintrag von heute (Foto, Plan oder von Hand). */
export function addEntry(state: DiaryState, entry: DiaryEntry, now = new Date()): DiaryState {
  if (state.entries.some((e) => e.id === entry.id)) return state;
  const added = { ...entry, updatedAt: now.toISOString() };
  return {
    ...state,
    entries: [...state.entries, added].sort(byDateTime),
    deleted: state.deleted.filter((d) => d.id !== entry.id),
    pending: [...state.pending.filter((p) => p !== entry.id), entry.id],
  };
}

/** Löscht einen Eintrag auf Wunsch – der einzige Weg, auf dem Einträge verschwinden. */
export function removeEntry(state: DiaryState, id: string, now = new Date()): DiaryState {
  if (!state.entries.some((e) => e.id === id)) return state;
  return {
    ...state,
    entries: state.entries.filter((e) => e.id !== id),
    deleted: [...state.deleted.filter((d) => d.id !== id), { id, deletedAt: now.toISOString() }],
    pending: [...state.pending.filter((p) => p !== id), id],
  };
}

/** Neuere Fassung gewinnt; bei Gleichstand gewinnt das Löschen, sonst bleibt, was da ist. */
function wins(incoming: { at: string; deleted: boolean }, local: { at: string; deleted: boolean } | undefined): boolean {
  if (!local) return true;
  if (incoming.at !== local.at) return incoming.at > local.at;
  return incoming.deleted && !local.deleted;
}

/**
 * Übernimmt Datensätze vom Server oder aus einer Sicherungsdatei. Nichts verschwindet, weil es dort fehlt; gelöscht
 * wird nur durch eine neuere Löschmarke. `fromServer`: Übernommenes muss nicht mehr hochgeladen werden; sonst (Import)
 * kommt es in `pending`, damit es auch auf den Server gelangt.
 */
export function mergeRecords(
  state: DiaryState,
  records: DiaryRecord[],
  { fromServer }: { fromServer: boolean },
): { state: DiaryState; added: number; updated: number; removed: number } {
  const entries = new Map(state.entries.map((e) => [e.id, e]));
  const deleted = new Map(state.deleted.map((d) => [d.id, d]));
  const pending = new Set(state.pending);
  let added = 0;
  let updated = 0;
  let removed = 0;
  let changed = false;
  for (const record of records) {
    const entry = entries.get(record.id);
    const tombstone = deleted.get(record.id);
    const local = entry ? { at: entry.updatedAt ?? "", deleted: false } : tombstone ? { at: tombstone.deletedAt, deleted: true } : undefined;
    if (!wins({ at: record.updatedAt, deleted: record.entry === null }, local)) continue;
    changed = true;
    if (record.entry) {
      entries.set(record.id, { ...record.entry, id: record.id, updatedAt: record.updatedAt });
      deleted.delete(record.id);
      if (entry) updated++;
      else added++;
    } else {
      entries.delete(record.id);
      deleted.set(record.id, { id: record.id, deletedAt: record.updatedAt });
      if (entry) removed++;
    }
    if (fromServer) pending.delete(record.id);
    else pending.add(record.id);
  }
  if (!changed) return { state, added, updated, removed };
  return {
    state: { ...state, entries: [...entries.values()].sort(byDateTime), deleted: [...deleted.values()], pending: [...pending] },
    added,
    updated,
    removed,
  };
}

/** Datensätze zum Hochladen: alle (ohne `ids`) oder nur die genannten. */
export function recordsFor(state: DiaryState, ids?: Iterable<string>): DiaryRecord[] {
  const entries = new Map(state.entries.map((e) => [e.id, e]));
  const deleted = new Map(state.deleted.map((d) => [d.id, d]));
  const wanted = ids ? [...new Set(ids)] : [...entries.keys(), ...deleted.keys()];
  return wanted.flatMap((id): DiaryRecord[] => {
    const entry = entries.get(id);
    if (entry) return [{ id, updatedAt: entry.updatedAt ?? new Date(0).toISOString(), entry }];
    const tombstone = deleted.get(id);
    return tombstone ? [{ id, updatedAt: tombstone.deletedAt, entry: null }] : [];
  });
}

/** Wie viele Datensätze höchstens in einer Anfrage hochgeladen werden (der Server nimmt bis zu 5000). */
export const UPLOAD_CHUNK = 2000;
const MAX_ROUNDS = 100;

/**
 * Gleicht das Tagebuch mit dem Server ab: lädt Neues, Geändertes und Gelöschtes hoch und holt, was die App noch nicht
 * kennt. Ist der Besitzer neu (erster Abgleich, An- oder Abmelden), geht alles hoch und alles kommt zurück – so landet
 * die Historie im Konto und kommt auf einem neuen Gerät zurück. Liefert eine Funktion, die das Ergebnis in den dann
 * aktuellen Stand einarbeitet (in der Zwischenzeit Geändertes bleibt erhalten und wird beim nächsten Mal geschickt).
 */
export async function syncDiary(
  state: DiaryState,
  owner: string,
  call: (request: DiarySyncRequest) => Promise<DiarySyncResponse>,
  now = () => new Date(),
): Promise<(current: DiaryState) => DiaryState> {
  const fresh = state.sync?.owner !== owner;
  let since = fresh ? 0 : (state.sync?.rev ?? 0);
  const queue = fresh ? recordsFor(state) : recordsFor(state, state.pending);
  const sent: DiaryRecord[] = [];
  const received: DiaryRecord[] = [];
  let serverOwner = owner;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const chunk = queue.splice(0, UPLOAD_CHUNK);
    const response = await call({ since, changes: chunk });
    sent.push(...chunk);
    received.push(...response.changes.map(normalizeRecord).filter((r): r is DiaryRecord => r !== null));
    if (typeof response.rev === "number" && Number.isInteger(response.rev) && response.rev >= 0) since = response.rev;
    if (typeof response.owner === "string" && response.owner) serverOwner = response.owner;
    if (queue.length === 0 && !response.more) break;
  }
  const complete = queue.length === 0;
  return (current) => {
    const merged = mergeRecords(current, received, { fromServer: true }).state;
    // Hochgeladenes ist erledigt, sofern es seitdem nicht noch einmal geändert wurde.
    const latest = new Map(recordsFor(merged, sent.map((r) => r.id)).map((r) => [r.id, r.updatedAt]));
    const done = new Set(sent.filter((r) => latest.get(r.id) === r.updatedAt).map((r) => r.id));
    const known = new Set([...merged.entries.map((e) => e.id), ...merged.deleted.map((d) => d.id)]);
    return {
      ...merged,
      pending: merged.pending.filter((id) => !done.has(id) && known.has(id)),
      // Nicht alles hochgeladen (sehr viele Einträge): beim nächsten Mal mit dem Rest weitermachen.
      sync: complete || !fresh ? { owner: serverOwner, rev: since, at: now().toISOString() } : current.sync,
    };
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Speicher: ein Schlüssel mit Löschmarken und Abgleich, dazu ein Schlüssel pro Jahr mit den Einträgen in Kurzform.
// ---------------------------------------------------------------------------------------------------------------

/** Was AsyncStorage (in der App) bzw. localStorage (im Browser) bietet. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const DIARY_KEY = "foodtracker/diary/v1";
const yearKey = (year: string) => `${DIARY_KEY}/${year}`;

interface DiaryMeta {
  version: 1;
  years: string[];
  deleted: DiaryTombstone[];
  pending: string[];
  sync: DiarySyncMark | null;
}

/** Eintrag in Kurzform (etwa halb so lang wie als Objekt). */
type Row = [string, string, string, string, number, number, number, number, string, string];

const round1 = (n: number) => Math.round(n * 10) / 10;
const toRow = (e: DiaryEntry): Row => [
  e.id,
  e.date,
  e.time,
  e.title,
  round1(e.nutrients.kcal),
  round1(e.nutrients.protein),
  round1(e.nutrients.carbs),
  round1(e.nutrients.fat),
  e.source,
  e.updatedAt ?? "",
];
const fromRow = (row: unknown): DiaryEntry | null => {
  if (!Array.isArray(row)) return null;
  const [id, date, time, title, kcal, protein, carbs, fat, source, updatedAt] = row as unknown[];
  return normalizeEntry({ id, date, time, title, nutrients: { kcal, protein, carbs, fat }, source, updatedAt });
};

/** Alle Schlüssel mit ihrem Inhalt; Jahre ohne Einträge bekommen einen leeren Teil, damit nichts Altes stehen bleibt. */
export function diaryParts(state: DiaryState, knownYears: Iterable<string> = []): Map<string, string> {
  const byYear = new Map<string, Row[]>();
  for (const year of knownYears) byYear.set(year, []);
  for (const entry of state.entries) {
    const year = entry.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(toRow(entry));
  }
  const parts = new Map<string, string>();
  const years = [...byYear.keys()].sort();
  for (const year of years) parts.set(yearKey(year), JSON.stringify(byYear.get(year)));
  const meta: DiaryMeta = { version: 1, years, deleted: state.deleted, pending: state.pending, sync: state.sync };
  parts.set(DIARY_KEY, JSON.stringify(meta));
  return parts;
}

/**
 * Speichert, was sich seit dem letzten Mal geändert hat (`written` merkt sich das Geschriebene). Erst die Jahre, dann
 * der Schlüssel mit der Übersicht. Wirft bei einem Fehler (z. B. Speicher voll) – die App zeigt dann einen Hinweis.
 */
export async function saveDiary(storage: KeyValueStorage, state: DiaryState, written: Map<string, string>): Promise<void> {
  const knownYears = [...written.keys()].filter((k) => k.startsWith(`${DIARY_KEY}/`)).map((k) => k.slice(DIARY_KEY.length + 1));
  const parts = diaryParts(state, knownYears);
  const order = [...parts.keys()].sort((a, b) => (a === DIARY_KEY ? 1 : b === DIARY_KEY ? -1 : a.localeCompare(b)));
  for (const key of order) {
    const value = parts.get(key)!;
    if (written.get(key) === value) continue;
    await storage.setItem(key, value);
    written.set(key, value);
  }
}

export interface LoadedDiary {
  state: DiaryState;
  /** Was gerade im Speicher steht (für `saveDiary`). */
  written: Map<string, string>;
  /** Etwas aus dem alten Speicherort ist dazugekommen: gleich speichern, bevor der alte Zustand überschrieben wird. */
  migrated: boolean;
  /** Unlesbare Teile; ihr Inhalt wurde vorher unter „…/kaputt-<Zeit>“ gesichert. */
  corrupt: string[];
}

/**
 * Lädt das Tagebuch. `legacy`: Einträge vom alten Speicherort (im übrigen Zustand der App); sie kommen dazu, ohne
 * etwas zu überschreiben. Wirft nur, wenn der Speicher selbst nicht lesbar ist – dann darf die App nichts speichern.
 */
export async function loadDiary(storage: KeyValueStorage, legacy: unknown, now = new Date()): Promise<LoadedDiary> {
  const written = new Map<string, string>();
  const corrupt: string[] = [];
  const backup = async (key: string, raw: string) => {
    corrupt.push(key);
    await storage.setItem(`${key}/kaputt-${now.getTime()}`, raw).catch(() => {});
  };
  let meta: Partial<DiaryMeta> = {};
  const rawMeta = await storage.getItem(DIARY_KEY);
  if (rawMeta !== null) {
    try {
      meta = JSON.parse(rawMeta) as DiaryMeta;
      written.set(DIARY_KEY, rawMeta);
    } catch {
      await backup(DIARY_KEY, rawMeta);
    }
  }
  // Auch das laufende und das letzte Jahr ansehen – falls zuletzt nur der Teil eines Jahres gespeichert wurde. Ist die
  // Übersicht kaputt, alle Jahre seit 2020 (vorher gab es FoodTracker nicht).
  const thisYear = now.getFullYear();
  const probe = rawMeta !== null && corrupt.length > 0 ? Array.from({ length: thisYear - 2019 + 1 }, (_, i) => String(2020 + i)) : [String(thisYear - 1), String(thisYear)];
  const years = [...new Set([...(Array.isArray(meta.years) ? meta.years.filter((y) => /^\d{4}$/.test(y)) : []), ...probe])].sort();
  const entries = new Map<string, DiaryEntry>();
  for (const year of years) {
    const raw = await storage.getItem(yearKey(year));
    if (raw === null) continue;
    try {
      const rows = JSON.parse(raw) as unknown;
      if (!Array.isArray(rows)) throw new Error("keine Liste");
      for (const row of rows) {
        const entry = fromRow(row);
        if (entry) entries.set(entry.id, entry);
      }
      written.set(yearKey(year), raw);
    } catch {
      await backup(yearKey(year), raw);
    }
  }
  const deleted = (Array.isArray(meta.deleted) ? meta.deleted : []).flatMap((d): DiaryTombstone[] => {
    const deletedAt = isoTime((d as DiaryTombstone)?.deletedAt);
    return typeof d?.id === "string" && deletedAt ? [{ id: d.id, deletedAt }] : [];
  });
  const sync = meta.sync && typeof meta.sync.owner === "string" && Number.isInteger(meta.sync.rev) ? meta.sync : null;
  let state: DiaryState = {
    entries: [...entries.values()].sort(byDateTime),
    deleted,
    pending: Array.isArray(meta.pending) ? meta.pending.filter((p): p is string => typeof p === "string") : [],
    sync,
  };
  // Alter Speicherort: Einträge übernehmen, die hier noch fehlen (bzw. neuer sind) – nie etwas löschen.
  const old = (Array.isArray(legacy) ? legacy : []).map(normalizeEntry).filter((e): e is DiaryEntry => e !== null);
  const merged = mergeRecords(state, old.map((entry) => ({ id: entry.id, updatedAt: entry.updatedAt!, entry })), { fromServer: false });
  state = merged.state;
  return { state, written, migrated: merged.added + merged.updated > 0, corrupt };
}
