// Abgleich von Profil und Fragebogen, Plan mit Einkaufsliste und Vorrat zwischen den Geräten eines Kontos (Vorrang 1,
// 9.2 Teil 4; Gegenstück im Server: server/src/sync/userData.ts). Ohne native Module, damit alles in test/ läuft.
//
// Grundsätze:
// - Nur mit Konto. Ohne Konto bleiben diese Daten auf dem Gerät (das Tagebuch sichert lib/diary.ts weiter pro Gerät).
// - Der Zustand der App bleibt, wie er ist (store.tsx); daraus ergeben sich Einträge mit IDs (`recordsOf`). Jede
//   Änderung vergleicht die Einträge vorher und nachher (`trackChanges`) und merkt sich je Eintrag den Zeitpunkt der
//   letzten Änderung; Geändertes und Gelöschtes wartet in `pending` auf den nächsten Abgleich.
// - Je Eintrag gewinnt die neuere Fassung, bei gleichem Zeitpunkt die des Servers. Was ein Gerät schon vor dem Abgleich
//   hatte, trägt den Zeitpunkt 0: Beim ersten Abgleich übernimmt das Konto Plan und Einstellungen des ersten Geräts, die
//   weiteren Geräte bekommen sie; Vorratsposten und Häkchen, die nur ein Gerät kennt, kommen dazu.
// - Häkchen (gegessen, abgehakt, in den Vorrat gebucht) gehören zu einem Plan – sein Startdatum steht in der ID. Kommt
//   ein Plan mit anderem Startdatum, gelten die Häkchen des alten nicht mehr, wie beim Neuplanen auf dem Gerät selbst.
import { REGIONS, isUILanguage } from "../i18n";
import type { StockItem } from "./pantry";
import type { MonthPlan, Recipe, Settings } from "./types";

export const DATA_KINDS = ["settings", "plan", "pantry"] as const;
export type DataKind = (typeof DATA_KINDS)[number];

/** Was abgeglichen wird – ein Ausschnitt des Zustands der App (store.tsx). */
export interface SyncedData {
  settings: Settings;
  plan: MonthPlan | null;
  /** Rezepte, die nur im Plan vorkommen (KI-Vorschläge). */
  planRecipes: Recipe[];
  eatenMeals: string[];
  shoppingChecked: string[];
  shoppingBooked: string[];
  pantry: StockItem[];
}

/** Letzter erfolgreicher Abgleich einer Art: für welches Konto, bis zu welcher Revision des Servers und wann. */
export interface SyncMark {
  owner: string;
  rev: number;
  at: string;
}

export interface KindSync {
  /** Zeitpunkt (ms) der neuesten Fassung, die dieses Gerät von einem Eintrag kennt – auch von gelöschten. */
  at: Record<string, number>;
  /** IDs mit Änderungen, die der Server noch nicht hat. */
  pending: string[];
  mark: SyncMark | null;
}
export type DataSync = Record<DataKind, KindSync>;

/** Zustand samt Abgleich-Stand, so wie er gespeichert wird. */
export type SyncedState = SyncedData & { dataSync: DataSync };

/** Ein Eintrag oder eine Löschmarke (`data: null`), so wie er zwischen App und Server wandert. */
export interface RemoteRecord {
  id: string;
  updatedAt: string;
  data: unknown;
}

export interface DataSyncRequest {
  kinds: Partial<Record<DataKind, { since: number; changes: RemoteRecord[] }>>;
}

export interface DataSyncResponse {
  /** „user:<Konto-ID>“ */
  owner: string;
  kinds: Partial<Record<DataKind, { rev: number; changes: RemoteRecord[]; more: boolean }>>;
}

// --------------------------------------------------------------------------------------------------------------
// Einträge aus dem Zustand
// --------------------------------------------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Eintrags-IDs, die der Server annimmt – genau wie in server/src/sync/userData.ts (ein Test vergleicht beide). */
export const SYNC_IDS: Record<DataKind, RegExp> = {
  settings: /^settings$/,
  plan: /^(?:plan|e:\d{4}-\d{2}-\d{2}:\d{1,2}:(?:breakfast|lunch|dinner)|[cb]:\d{4}-\d{2}-\d{2}:\d:[a-z0-9_]{1,60})$/,
  pantry: /^[a-z0-9_]{1,60}@\d{4}-\d{2}-\d{2}$/,
};
/** Höchstens so viele Zeichen JSON pro Eintrag (wie im Server); Größeres bleibt auf dem Gerät. */
export const MAX_JSON: Record<DataKind, number> = { settings: 20_000, plan: 1_000_000, pantry: 500 };
const MAX_AMOUNT = 1_000_000;

/** Häkchen im Zustand (Felder) und ihr Kürzel in der ID: gegessen, abgehakt, in den Vorrat gebucht. */
const MARKS = [
  ["e", "eatenMeals"],
  ["c", "shoppingChecked"],
  ["b", "shoppingBooked"],
] as const;
type MarkField = (typeof MARKS)[number][1];

/** „c:2026-11-27:0:reis“ → Feld, Startdatum des Plans und Schlüssel („0:reis“, wie im Zustand). */
export function parseMarkId(id: string): { field: MarkField; start: string; key: string } | null {
  const mark = MARKS.find(([prefix]) => id.startsWith(`${prefix}:`));
  if (!mark || id.length < 14 || id[12] !== ":") return null;
  const start = id.slice(2, 12);
  return DATE.test(start) ? { field: mark[1], start, key: id.slice(13) } : null;
}

const markId = (prefix: string, start: string, key: string) => `${prefix}:${start}:${key}`;

/** Vorratsposten: Zutat und Einkaufstag. */
export const postId = (item: Pick<StockItem, "ingredientId" | "addedAt">) => `${item.ingredientId}@${item.addedAt}`;

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Fotos, die nur auf diesem Gerät liegen (andere Geräte könnten sie nicht öffnen; Fotos gehören nicht in die Datenbank). */
const LOCAL_IMAGE = /^(?:data|file|blob|content|ph|assets-library):/i;

/** KI-Rezepte des Plans ohne Fotos vom Gerät. */
function shareableRecipe(recipe: Recipe): Recipe {
  const uri = recipe.media?.image?.uri;
  if (!uri || !LOCAL_IMAGE.test(uri)) return recipe;
  const { image: _image, ...media } = recipe.media!;
  return { ...recipe, media };
}

/** Der Eintrag „plan“: Monatsplan und KI-Rezepte. */
const planRecord = (data: SyncedData) => ({ plan: data.plan, recipes: data.planRecipes.map(shareableRecipe) });

/** Alle Einträge einer Art, wie sie sich aus dem Zustand ergeben (ID → Inhalt). */
export function recordsOf(kind: DataKind, data: SyncedData): Map<string, unknown> {
  const records = new Map<string, unknown>();
  if (kind === "settings") {
    // Unveränderte Voreinstellungen eines neuen Geräts sollen nie die eines Kontos ersetzen: erst nach dem Fragebogen.
    if (data.settings.onboarded) records.set("settings", data.settings);
  } else if (kind === "plan") {
    if (!data.plan) return records;
    records.set("plan", planRecord(data));
    for (const id of markIds(data)) records.set(id, {});
  } else {
    const totals = new Map<string, number>();
    for (const item of data.pantry) totals.set(postId(item), (totals.get(postId(item)) ?? 0) + item.amount);
    for (const [id, amount] of totals) if (round1(amount) > 0) records.set(id, { amount: round1(amount) });
  }
  return records;
}

function markIds(data: SyncedData): string[] {
  if (!data.plan) return [];
  const start = data.plan.startDate;
  return MARKS.flatMap(([prefix, field]) => data[field].map((key) => markId(prefix, start, key)));
}

/** Ob sich eine Art geändert haben kann (nur andere Objekte – der Zustand wird nie verändert, nur ersetzt). */
function touches(kind: DataKind, a: SyncedData, b: SyncedData): boolean {
  if (kind === "settings") return a.settings !== b.settings;
  if (kind === "pantry") return a.pantry !== b.pantry;
  return a.plan !== b.plan || a.planRecipes !== b.planRecipes || a.eatenMeals !== b.eatenMeals || a.shoppingChecked !== b.shoppingChecked || a.shoppingBooked !== b.shoppingBooked;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Nach einer Änderung auf diesem Gerät: Was sich zwischen `before` und `after` geändert hat, bekommt den Zeitpunkt `now`
 * (mindestens eine Millisekunde nach der Fassung, die das Gerät kannte – auch wenn die Uhr eines anderen Geräts vorgeht)
 * und wartet auf den Abgleich. Unverändertes Ergebnis: dasselbe Objekt.
 */
export function trackChanges(sync: DataSync, before: SyncedData, after: SyncedData, now = Date.now()): DataSync {
  let next = sync;
  for (const kind of DATA_KINDS) {
    if (!touches(kind, before, after)) continue;
    const old = recordsOf(kind, before);
    const fresh = recordsOf(kind, after);
    // Der Plan selbst ist groß (rund 50 KB): nur vergleichen, wenn er bzw. seine Rezepte ersetzt wurden.
    const planUnchanged = kind === "plan" && before.plan === after.plan && before.planRecipes === after.planRecipes;
    const changed: string[] = [];
    for (const [id, data] of fresh) {
      if (!old.has(id)) changed.push(id);
      else if (!(planUnchanged && id === "plan") && !same(old.get(id), data)) changed.push(id);
    }
    for (const id of old.keys()) if (!fresh.has(id)) changed.push(id);
    const syncable = changed.filter((id) => SYNC_IDS[kind].test(id));
    if (syncable.length === 0) continue;
    const k = next[kind];
    const at = { ...k.at };
    for (const id of syncable) at[id] = Math.max(now, (at[id] ?? 0) + 1);
    next = { ...next, [kind]: { ...k, at, pending: [...new Set([...k.pending, ...syncable])] } };
  }
  return next;
}

/** Abgleich-Stand ohne Einträge (neues Gerät). */
export const emptyDataSync = (): DataSync => ({
  settings: { at: {}, pending: [], mark: null },
  plan: { at: {}, pending: [], mark: null },
  pantry: { at: {}, pending: [], mark: null },
});

/**
 * Abgleich-Stand aus dem Speicher; fehlt er (Daten aus der Zeit vor dem Abgleich) oder ist er unlesbar, tragen alle
 * Einträge den Zeitpunkt 0 – beim ersten Abgleich gilt dann bei Plan und Einstellungen, was das Konto schon hat.
 */
export function readDataSync(raw: unknown, data: SyncedData): DataSync {
  const saved = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<DataKind, Partial<KindSync>>>;
  const result = emptyDataSync();
  for (const kind of DATA_KINDS) {
    const k = saved[kind];
    const at: Record<string, number> = {};
    if (k?.at && typeof k.at === "object") {
      for (const [id, time] of Object.entries(k.at)) if (typeof time === "number" && Number.isFinite(time) && time >= 0) at[id] = time;
    }
    for (const id of recordsOf(kind, data).keys()) at[id] ??= 0;
    const pending = Array.isArray(k?.pending) ? k.pending.filter((id): id is string => typeof id === "string" && id in at) : [];
    const m = k?.mark;
    const mark = m && typeof m.owner === "string" && Number.isInteger(m.rev) && m.rev >= 0 && typeof m.at === "string" ? { owner: m.owner, rev: m.rev, at: m.at } : null;
    result[kind] = { at, pending: [...new Set(pending)], mark };
  }
  return result;
}

// --------------------------------------------------------------------------------------------------------------
// Einträge vom Server übernehmen
// --------------------------------------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/**
 * Einstellungen von einem anderen Gerät, Feld für Feld geprüft: Unbrauchbares behält den Wert dieses Geräts, unbekannte
 * Felder (aus einer neueren App) fallen weg.
 */
export function readSettings(raw: unknown, current: Settings): Settings {
  if (!isObject(raw)) return current;
  const next: Record<string, unknown> = { ...current };
  for (const key of Object.keys(current) as (keyof Settings)[]) {
    if (!(key in raw)) continue;
    const value = raw[key];
    const ok =
      key === "language"
        ? typeof value === "string" && isUILanguage(value)
        : key === "region"
          ? REGIONS.includes(value as Settings["region"])
          : key === "body"
            ? value === null || (isObject(value) && isNumber(value.age) && isNumber(value.heightCm) && isNumber(value.weightKg) && typeof value.sex === "string" && typeof value.activity === "string")
            : Array.isArray(current[key])
              ? strings(value)
              : typeof value === typeof current[key] && (typeof value !== "number" || Number.isFinite(value));
    if (ok) next[key] = value;
  }
  return next as unknown as Settings;
}

/** Plan von einem anderen Gerät: nur, was die Ansichten brauchen, sonst null (dann bleibt der eigene). */
function readPlanRecord(raw: unknown): { plan: MonthPlan; recipes: Recipe[] } | null {
  if (!isObject(raw) || !isObject(raw.plan)) return null;
  const plan = raw.plan;
  if (typeof plan.startDate !== "string" || !DATE.test(plan.startDate) || !Array.isArray(plan.weeks) || plan.weeks.length === 0) return null;
  const weeksOk = plan.weeks.every(
    (w) =>
      isObject(w) &&
      isNumber(w.startDay) &&
      isNumber(w.days) &&
      Array.isArray(w.dailyKcalPerPerson) &&
      Array.isArray(w.shoppingList) &&
      w.shoppingList.every((s) => isObject(s) && typeof s.ingredientId === "string" && isNumber(s.packs) && isNumber(s.packSize)) &&
      Array.isArray(w.meals) &&
      w.meals.every(
        (m) =>
          isObject(m) &&
          isNumber(m.day) &&
          typeof m.mealType === "string" &&
          typeof m.recipeId === "string" &&
          typeof m.recipeName === "string" &&
          isNumber(m.portions) &&
          isObject(m.nutrientsPerPortion) &&
          Array.isArray(m.extras),
      ),
  );
  if (!weeksOk) return null;
  const recipes = (Array.isArray(raw.recipes) ? raw.recipes : []).filter(
    (r): r is Recipe => isObject(r) && typeof r.id === "string" && typeof r.name === "string" && Array.isArray(r.ingredients) && Array.isArray(r.mealTypes),
  );
  return { plan: plan as unknown as MonthPlan, recipes };
}

/** Häkchen und ihre Abgleich-Daten vergessen, die nicht zum Plan mit Startdatum `start` gehören (null: alle). */
function forgetMarks(k: { at: Record<string, number>; pending: Set<string> }, start: string | null) {
  for (const id of Object.keys(k.at)) {
    const mark = parseMarkId(id);
    if (mark && mark.start !== start) {
      delete k.at[id];
      k.pending.delete(id);
    }
  }
}

/**
 * Übernimmt Einträge einer Art vom Server: je Eintrag die neuere Fassung, bei gleichem Zeitpunkt die des Servers. Eine
 * eigene, neuere Fassung bleibt und wartet weiter auf den Abgleich. Unbrauchbares wird übergangen.
 */
export function applyRemote<S extends SyncedState>(state: S, kind: DataKind, records: readonly RemoteRecord[]): S {
  if (records.length === 0) return state;
  const k = { at: { ...state.dataSync[kind].at }, pending: new Set(state.dataSync[kind].pending) };
  let data: SyncedData = state;
  // Zuerst der Plan, damit die Häkchen danach zum richtigen Plan passen.
  const sorted = [...records].sort((a, b) => Number(b.id === "plan") - Number(a.id === "plan"));
  let changed = false;
  for (const record of sorted) {
    const time = typeof record.updatedAt === "string" ? Date.parse(record.updatedAt) : NaN;
    if (typeof record.id !== "string" || !Number.isFinite(time) || (record.data !== null && record.data === undefined)) continue;
    const local = k.at[record.id];
    if (local !== undefined && time < local) continue;
    const next = applyRecord(kind, data, record, k);
    if (!next) continue;
    data = next;
    k.at[record.id] = time;
    k.pending.delete(record.id);
    changed = true;
  }
  if (!changed) return state;
  const { settings, plan, planRecipes, eatenMeals, shoppingChecked, shoppingBooked, pantry } = data;
  return {
    ...state,
    settings,
    plan,
    planRecipes,
    eatenMeals,
    shoppingChecked,
    shoppingBooked,
    pantry,
    dataSync: { ...state.dataSync, [kind]: { ...state.dataSync[kind], at: k.at, pending: [...k.pending] } },
  };
}

/** Ein Eintrag vom Server im Zustand; null, wenn er nicht passt (dann bleibt alles, wie es ist). */
function applyRecord(kind: DataKind, data: SyncedData, record: RemoteRecord, k: { at: Record<string, number>; pending: Set<string> }): SyncedData | null {
  if (kind === "settings") {
    // Einstellungen werden nie gelöscht – eine Löschmarke ändert nichts.
    return record.id === "settings" && isObject(record.data) ? { ...data, settings: readSettings(record.data, data.settings) } : null;
  }
  if (kind === "pantry") {
    const match = /^([a-z0-9_]{1,60})@(\d{4}-\d{2}-\d{2})$/.exec(record.id);
    if (!match) return null;
    const [, ingredientId, addedAt] = match as unknown as [string, string, string];
    const rest = data.pantry.filter((s) => postId(s) !== record.id);
    if (record.data === null) return { ...data, pantry: rest };
    const amount = isObject(record.data) ? record.data.amount : undefined;
    if (!isNumber(amount) || amount < 0 || amount > MAX_AMOUNT) return null;
    return { ...data, pantry: amount > 0 ? [...rest, { ingredientId, addedAt, amount: round1(amount) }] : rest };
  }
  if (record.id === "plan") {
    if (record.data === null) {
      forgetMarks(k, null);
      return { ...data, plan: null, planRecipes: [], eatenMeals: [], shoppingChecked: [], shoppingBooked: [] };
    }
    const received = readPlanRecord(record.data);
    if (!received) return null;
    if (received.plan.startDate === data.plan?.startDate) return { ...data, plan: received.plan, planRecipes: received.recipes };
    // Ein anderer Monat: Die Häkchen des bisherigen Plans gelten nicht mehr (der Server hat sie schon entfernt).
    forgetMarks(k, received.plan.startDate);
    return { ...data, plan: received.plan, planRecipes: received.recipes, eatenMeals: [], shoppingChecked: [], shoppingBooked: [] };
  }
  const mark = parseMarkId(record.id);
  // Häkchen eines anderen Plans: übergehen (es gehört zu einem abgelösten Plan).
  if (!mark || !data.plan || mark.start !== data.plan.startDate) return null;
  const list = data[mark.field];
  if (record.data === null) return list.includes(mark.key) ? { ...data, [mark.field]: list.filter((key) => key !== mark.key) } : data;
  return list.includes(mark.key) ? data : { ...data, [mark.field]: [...list, mark.key] };
}

// --------------------------------------------------------------------------------------------------------------
// Abgleich mit dem Server
// --------------------------------------------------------------------------------------------------------------

/** Ob der Server einen Eintrag annimmt (ID, Größe, Menge). */
function acceptable(kind: DataKind, id: string, data: unknown): boolean {
  if (!SYNC_IDS[kind].test(id)) return false;
  if (data === null) return true;
  if (kind === "pantry" && (!isObject(data) || !isNumber(data.amount) || data.amount > MAX_AMOUNT)) return false;
  return JSON.stringify(data).length <= MAX_JSON[kind];
}

/**
 * Einträge zum Hochladen: alle bekannten (ohne `ids`, für ein neues Konto – auch Löschmarken) oder nur die genannten;
 * der Plan zuerst, damit der Server die Häkchen dem richtigen Plan zuordnet. `skipped`: was der Server nicht annähme
 * (z. B. viel zu lange Wünsche) – bleibt auf dem Gerät.
 */
export function uploadRecords(kind: DataKind, state: SyncedState, ids?: Iterable<string>): { records: RemoteRecord[]; skipped: string[] } {
  const derived = recordsOf(kind, state);
  const at = state.dataSync[kind].at;
  const wanted = ids ? [...new Set(ids)] : [...new Set([...Object.keys(at), ...derived.keys()])];
  const records: RemoteRecord[] = [];
  const skipped: string[] = [];
  for (const id of wanted) {
    const data = derived.get(id) ?? null;
    if (acceptable(kind, id, data)) records.push({ id, updatedAt: new Date(at[id] ?? 0).toISOString(), data });
    else skipped.push(id);
  }
  records.sort((a, b) => Number(b.id === "plan") - Number(a.id === "plan"));
  return { records, skipped };
}

/** Wie viele Einträge einer Art höchstens in einer Anfrage hochgehen (der Server nimmt bis zu 5000). */
export const UPLOAD_CHUNK = 1000;
const MAX_ROUNDS = 50;

/** Häkchen anderer Pläne, die nicht mehr warten, aus dem Abgleich-Stand entfernen (sonst wüchse er jeden Monat). */
function compact(kind: DataKind, state: SyncedState, k: KindSync): KindSync {
  if (kind !== "plan") return k;
  const start = state.plan?.startDate ?? null;
  const pending = new Set(k.pending);
  const stale = Object.keys(k.at).filter((id) => {
    const mark = parseMarkId(id);
    return mark !== null && mark.start !== start && !pending.has(id);
  });
  if (stale.length === 0) return k;
  const at = { ...k.at };
  for (const id of stale) delete at[id];
  return { ...k, at };
}

/**
 * Gleicht Einstellungen, Plan und Vorrat mit dem Konto auf dem Server ab: lädt Geändertes und Gelöschtes hoch und holt,
 * was das Gerät noch nicht kennt. Ist das Konto neu für dieses Gerät (erste Anmeldung, anderes Konto), geht alles hoch
 * und alles kommt zurück. Liefert eine Funktion, die das Ergebnis in den dann aktuellen Zustand einarbeitet (in der
 * Zwischenzeit Geändertes bleibt erhalten und geht beim nächsten Mal hoch).
 */
export async function syncData<S extends SyncedState>(
  state: S,
  owner: string,
  call: (request: DataSyncRequest) => Promise<DataSyncResponse>,
  now = () => new Date(),
): Promise<(current: S) => S> {
  const runs = DATA_KINDS.map((kind) => {
    const k = state.dataSync[kind];
    const fresh = k.mark?.owner !== owner;
    const { records, skipped } = fresh ? uploadRecords(kind, state) : uploadRecords(kind, state, k.pending);
    return { kind, fresh, since: fresh ? 0 : k.mark!.rev, queue: records, skipped, sent: [] as RemoteRecord[], received: [] as RemoteRecord[], more: true, failed: false };
  });
  let serverOwner = owner;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const active = runs.filter((r) => !r.failed && (r.queue.length > 0 || r.more));
    if (active.length === 0) break;
    const request: DataSyncRequest = { kinds: {} };
    const chunks = new Map<DataKind, RemoteRecord[]>();
    for (const run of active) {
      const chunk = run.queue.splice(0, UPLOAD_CHUNK);
      chunks.set(run.kind, chunk);
      request.kinds[run.kind] = { since: run.since, changes: chunk };
    }
    const response = await call(request);
    if (typeof response?.owner === "string" && response.owner) serverOwner = response.owner;
    for (const run of active) {
      const result = response?.kinds?.[run.kind];
      // Ein Server, der die Art nicht kennt: nichts davon gilt als abgeglichen.
      if (!result) {
        run.failed = true;
        continue;
      }
      run.sent.push(...chunks.get(run.kind)!);
      if (Array.isArray(result.changes)) run.received.push(...result.changes);
      if (Number.isInteger(result.rev) && result.rev >= 0) run.since = result.rev;
      run.more = result.more === true;
    }
  }
  const at = now().toISOString();
  return (current) => {
    let next = current;
    for (const run of runs) {
      if (run.failed) continue;
      next = applyRemote(next, run.kind, run.received);
      const k = next.dataSync[run.kind];
      // Hochgeladenes ist erledigt, sofern es seitdem nicht noch einmal geändert wurde; Unannehmbares bleibt nur hier.
      const done = new Set(run.skipped);
      for (const sent of run.sent) if (k.at[sent.id] !== undefined && new Date(k.at[sent.id]!).toISOString() === sent.updatedAt) done.add(sent.id);
      const complete = run.queue.length === 0 && !run.more;
      const updated: KindSync = {
        ...k,
        pending: k.pending.filter((id) => !done.has(id)),
        // Nicht alles geschafft (sehr viele Einträge): beim nächsten Mal mit dem Rest weitermachen.
        mark: complete || !run.fresh ? { owner: serverOwner, rev: run.since, at } : k.mark,
      };
      next = { ...next, dataSync: { ...next.dataSync, [run.kind]: compact(run.kind, next, updated) } };
    }
    return next;
  };
}

/** Wie viele Änderungen auf den Abgleich warten. */
export const pendingChanges = (sync: DataSync) => DATA_KINDS.reduce((n, kind) => n + sync[kind].pending.length, 0);

/** Ob alle Arten zuletzt mit diesem Konto abgeglichen wurden. */
export const syncedWith = (sync: DataSync, owner: string) => DATA_KINDS.every((kind) => sync[kind].mark?.owner === owner);

/** Ältester der letzten Abgleiche (ISO) – so lange ist sicher alles auf dem Stand. */
export function lastSynced(sync: DataSync): string | null {
  const times = DATA_KINDS.map((kind) => sync[kind].mark?.at ?? null);
  if (times.some((t) => t === null)) return null;
  return (times as string[]).sort()[0] ?? null;
}
