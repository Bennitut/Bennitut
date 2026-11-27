// Abgleich der Daten eines Kontos zwischen seinen Geräten (Vorrang 1, 9.2 Teil 4 bis 6; Gegenstück im Server:
// server/src/sync/userData.ts): Profil und Fragebogen, Plan mit Einkaufsliste, Vorrat, eigene und importierte Rezepte
// (mit Fotos), Favoriten (samt gespeicherten Community-Rezepten), von der KI übersetzte bzw. verbesserte Texte und eigene
// Fotos aus der Galerie der Rezepte. Ohne native Module, damit alles in test/ läuft.
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
// - Fotos eigener Rezepte gehören nicht in die Datenbank: Die App schickt ein eigenes Foto einmal als data-URI, der
//   Server legt es in den Bildspeicher des Kontos und schickt den Pfad zurück. Auf dem Gerät bleibt die data-URI (offline
//   sichtbar), daneben der Pfad (`server`) – den schickt die App künftig statt des Fotos. Andere Geräte zeigen das Foto
//   über den Pfad vom Server. Genauso private eigene Fotos der Galerie („Nur ich“); öffentliche liegen schon in der
//   Galerie – von ihnen geht nur die ID dort (`remoteId`) hoch, den Pfad trägt der Server ein.
import { REGIONS, isUILanguage } from "../i18n";
import type { StockItem } from "./pantry";
import { SERVER_IMAGE_PATH } from "./serverImages";
import type { MonthPlan, MyPhoto, Recipe, RecipeText, Settings } from "./types";

export const DATA_KINDS = ["settings", "plan", "pantry", "recipes", "favorites", "texts", "photos"] as const;
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
  /** Eigene und importierte Rezepte. */
  myRecipes: Recipe[];
  /** Eigene Rezepte, die in der Community geteilt sind: Rezept-ID → Community-ID. */
  shared: Record<string, string>;
  favoriteIds: string[];
  /** Kopien favorisierter Community-Rezepte. */
  savedRecipes: Recipe[];
  /** Von der KI übersetzte Rezepttexte: Rezept-ID → Sprache → Text. */
  translations: Record<string, Record<string, RecipeText>>;
  /** Mit der KI verbesserte Rezepttexte: Rezept-ID → Sprache → Text. */
  textOverrides: Record<string, Record<string, RecipeText>>;
  /** Eigene Fotos aus der Galerie der Rezepte (privat oder zusätzlich öffentlich). */
  myPhotos: MyPhoto[];
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
/** IDs von Rezepten: Katalog („linsen_dal“), eigene („eigen_…“), importierte („import_…“), Community („community_<UUID>“). */
const RECIPE_ID = "[A-Za-z0-9_-]{1,100}";
const TEXT_ID = new RegExp(`^([to]):([a-z]{2,3}(?:-[A-Z]{2})?):(${RECIPE_ID})$`);
/** Eintrags-IDs, die der Server annimmt – genau wie in server/src/sync/userData.ts (ein Test vergleicht beide). */
export const SYNC_IDS: Record<DataKind, RegExp> = {
  settings: /^settings$/,
  plan: /^(?:plan|e:\d{4}-\d{2}-\d{2}:\d{1,2}:(?:breakfast|lunch|dinner)|[cb]:\d{4}-\d{2}-\d{2}:\d:[a-z0-9_]{1,60})$/,
  pantry: /^[a-z0-9_]{1,60}@\d{4}-\d{2}-\d{2}$/,
  recipes: new RegExp(`^${RECIPE_ID}$`),
  favorites: new RegExp(`^${RECIPE_ID}$`),
  texts: TEXT_ID,
  photos: new RegExp(`^${RECIPE_ID}$`),
};
/**
 * Höchstens so viele Zeichen JSON pro Eintrag (wie im Server; bei eigenen Rezepten und Fotos ohne das Foto); Größeres
 * bleibt auf dem Gerät.
 */
export const MAX_JSON: Record<DataKind, number> = { settings: 20_000, plan: 1_000_000, pantry: 500, recipes: 100_000, favorites: 100_000, texts: 100_000, photos: 2000 };
/**
 * Foto eines eigenen Rezepts bzw. eigenes Foto der Galerie als data-URI höchstens so lang (wie im Server, rund 1,5 MB);
 * größere bleiben auf dem Gerät.
 */
export const MAX_IMAGE_URI = 2_000_000;
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
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/** Fotos, die nur auf diesem Gerät liegen (andere Geräte könnten sie nicht öffnen; Fotos gehören nicht in die Datenbank). */
const LOCAL_IMAGE = /^(?:data|file|blob|content|ph|assets-library):/i;
/** Ein Foto als data-URI – das einzige vom Gerät, das der Server in den Bildspeicher legen kann. */
const DATA_IMAGE = /^data:image\//i;

type RecipeImage = NonNullable<NonNullable<Recipe["media"]>["image"]>;

/** Rezepte des Plans und gespeicherte Community-Rezepte ohne Fotos vom Gerät. */
function shareableRecipe(recipe: Recipe): Recipe {
  const uri = recipe.media?.image?.uri;
  if (!uri || !LOCAL_IMAGE.test(uri)) return recipe;
  const { image: _image, ...media } = recipe.media!;
  return { ...recipe, media };
}

/** Rezept mit anderem bzw. ohne Foto (ohne Foto fällt `media.image` weg, ein leeres `media` ganz). */
function withImage(recipe: Recipe, image: RecipeImage | undefined): Recipe {
  const { image: _old, ...media } = recipe.media ?? {};
  const next = image ? { ...media, image } : media;
  const { media: _media, ...rest } = recipe;
  return Object.keys(next).length > 0 ? { ...rest, media: next } : rest;
}

/**
 * Foto eines eigenen Rezepts, wie es zum Server geht: Kennt die App den Pfad im Bildspeicher des Kontos schon
 * (`server`), geht der Pfad – sonst die data-URI (der Server legt sie in den Bildspeicher). Fotos im Netz und im
 * Bildspeicher gehen, wie sie sind; andere Dateien auf dem Gerät (file:, blob: …) und zu große Fotos bleiben hier.
 * `fresh` (erster Abgleich mit diesem Konto): immer das Foto selbst – der Server kennt den Pfad vielleicht nicht.
 * Unverändert dasselbe Objekt.
 */
function uploadImage(image: RecipeImage, fresh: boolean): RecipeImage | undefined {
  const { server, ...plain } = image;
  if (server !== undefined && !fresh && LOCAL_IMAGE.test(image.uri)) return { ...plain, uri: server };
  const ok = DATA_IMAGE.test(image.uri) ? image.uri.length <= MAX_IMAGE_URI : !LOCAL_IMAGE.test(image.uri);
  if (!ok) return undefined;
  return server === undefined ? image : plain;
}

/** Der Eintrag eines eigenen Rezepts: das Rezept (Foto wie in uploadImage) und, falls geteilt, die Community-ID. */
function ownRecipeRecord(recipe: Recipe, sharedAs: string | undefined, fresh: boolean) {
  const image = recipe.media?.image;
  const sent = image ? uploadImage(image, fresh) : undefined;
  const r = sent === image ? recipe : withImage(recipe, sent);
  return sharedAs ? { recipe: r, sharedAs } : { recipe: r };
}

/**
 * Der Eintrag eines eigenen Fotos der Galerie: Rezept, Zeitpunkt der Aufnahme und ob es öffentlich ist. Öffentliche nur
 * mit der ID in der Galerie (das Foto liegt dort schon, den Pfad trägt der Server ein), private mit dem Foto wie in
 * uploadImage. Nur einfache Werte, damit trackChanges auch große Fotos nicht als JSON vergleichen muss.
 */
function photoRecord(photo: MyPhoto, fresh: boolean): Record<string, unknown> {
  const base = { recipeId: photo.recipeId, createdAt: photo.createdAt, public: photo.public };
  if (photo.public) return { ...base, remoteId: photo.remoteId };
  const image = uploadImage(photo.server === undefined ? { uri: photo.uri } : { uri: photo.uri, server: photo.server }, fresh);
  return image ? { ...base, uri: image.uri } : base;
}

/** Texte im Zustand und ihr Kürzel in der ID: übersetzt („t:en:linsen_dal“) und verbessert („o:de:eigen_…“). */
const TEXTS = [
  ["t", "translations"],
  ["o", "textOverrides"],
] as const;

/** „t:en:linsen_dal“ → Feld, Sprache und Rezept. */
export function parseTextId(id: string): { field: (typeof TEXTS)[number][1]; language: string; recipeId: string } | null {
  const match = TEXT_ID.exec(id);
  if (!match) return null;
  return { field: match[1] === "t" ? "translations" : "textOverrides", language: match[2]!, recipeId: match[3]! };
}

/** Der Eintrag „plan“: Monatsplan und KI-Rezepte. */
const planRecord = (data: SyncedData) => ({ plan: data.plan, recipes: data.planRecipes.map(shareableRecipe) });

/**
 * Alle Einträge einer Art, wie sie sich aus dem Zustand ergeben (ID → Inhalt). `fresh`: für den ersten Abgleich mit
 * einem Konto (eigene Fotos als data-URI statt als Pfad, siehe uploadImage).
 */
export function recordsOf(kind: DataKind, data: SyncedData, fresh = false): Map<string, unknown> {
  const records = new Map<string, unknown>();
  if (kind === "settings") {
    // Unveränderte Voreinstellungen eines neuen Geräts sollen nie die eines Kontos ersetzen: erst nach dem Fragebogen.
    if (data.settings.onboarded) records.set("settings", data.settings);
  } else if (kind === "plan") {
    if (!data.plan) return records;
    records.set("plan", planRecord(data));
    for (const id of markIds(data)) records.set(id, {});
  } else if (kind === "pantry") {
    const totals = new Map<string, number>();
    for (const item of data.pantry) totals.set(postId(item), (totals.get(postId(item)) ?? 0) + item.amount);
    for (const [id, amount] of totals) if (round1(amount) > 0) records.set(id, { amount: round1(amount) });
  } else if (kind === "recipes") {
    for (const recipe of data.myRecipes) records.set(recipe.id, ownRecipeRecord(recipe, data.shared[recipe.id], fresh));
  } else if (kind === "favorites") {
    const saved = new Map(data.savedRecipes.map((r) => [r.id, r]));
    for (const id of data.favoriteIds) {
      const copy = saved.get(id);
      records.set(id, copy ? { recipe: shareableRecipe(copy) } : {});
    }
  } else if (kind === "photos") {
    for (const photo of data.myPhotos) records.set(photo.id, photoRecord(photo, fresh));
  } else {
    for (const [prefix, field] of TEXTS) {
      for (const [recipeId, byLanguage] of Object.entries(data[field])) {
        for (const [language, text] of Object.entries(byLanguage ?? {})) records.set(`${prefix}:${language}:${recipeId}`, text);
      }
    }
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
  if (kind === "recipes") return a.myRecipes !== b.myRecipes || a.shared !== b.shared;
  if (kind === "favorites") return a.favoriteIds !== b.favoriteIds || a.savedRecipes !== b.savedRecipes;
  if (kind === "texts") return a.translations !== b.translations || a.textOverrides !== b.textOverrides;
  if (kind === "photos") return a.myPhotos !== b.myPhotos;
  return a.plan !== b.plan || a.planRecipes !== b.planRecipes || a.eatenMeals !== b.eatenMeals || a.shoppingChecked !== b.shoppingChecked || a.shoppingBooked !== b.shoppingBooked;
}

/**
 * Gleicher Inhalt – zuerst ohne JSON (eigene Rezepte mit Foto als data-URI sind groß): dieselben Objekte bzw. ein
 * Eintrag aus denselben Teilen (unverändertes Rezept, gleiche Community-ID).
 */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    if (keys.length === Object.keys(b).length && keys.every((key) => key in b && a[key] === b[key])) return true;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

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
export const emptyDataSync = (): DataSync => Object.fromEntries(DATA_KINDS.map((kind) => [kind, { at: {}, pending: [], mark: null }])) as unknown as DataSync;

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
    // Ohne Inhalt (undefined) ist es weder Eintrag noch Löschmarke.
    if (typeof record.id !== "string" || !Number.isFinite(time) || record.data === undefined) continue;
    const local = k.at[record.id];
    if (local !== undefined && time < local) continue;
    // Gleicher Zeitpunkt: dieselbe Fassung wie auf dem Gerät, z. B. die vom Server beim Speichern angepasste.
    const next = applyRecord(kind, data, record, k, local === time);
    if (!next) continue;
    data = next;
    k.at[record.id] = time;
    k.pending.delete(record.id);
    changed = true;
  }
  if (!changed) return state;
  const { settings, plan, planRecipes, eatenMeals, shoppingChecked, shoppingBooked, pantry, myRecipes, shared, favoriteIds, savedRecipes, translations, textOverrides, myPhotos } = data;
  return {
    ...state,
    settings,
    plan,
    planRecipes,
    eatenMeals,
    shoppingChecked,
    shoppingBooked,
    pantry,
    myRecipes,
    shared,
    favoriteIds,
    savedRecipes,
    translations,
    textOverrides,
    myPhotos,
    dataSync: { ...state.dataSync, [kind]: { ...state.dataSync[kind], at: k.at, pending: [...k.pending] } },
  };
}

/**
 * Rezept von einem anderen Gerät: nur mit allem, was die Ansichten brauchen (sonst null – dann bleibt das eigene).
 * Fehlende Listen gelten als leer; der Pfad `server` eines fremden Geräts gilt hier nicht.
 */
export function readRecipe(raw: unknown): Recipe | null {
  if (!isObject(raw)) return null;
  const { id, language, name, mealTypes, ingredients, source, media } = raw;
  if (typeof id !== "string" || typeof name !== "string" || typeof language !== "string" || !strings(mealTypes)) return null;
  if (!Array.isArray(ingredients) || !ingredients.every((i) => isObject(i) && typeof i.ingredientId === "string" && isNumber(i.amount))) return null;
  if (!isObject(source) || typeof source.kind !== "string") return null;
  const list = (v: unknown) => (v === undefined ? [] : strings(v) ? v : null);
  const steps = list(raw.steps);
  const otherIngredients = list(raw.otherIngredients);
  const tags = list(raw.tags);
  if (!steps || !otherIngredients || !tags) return null;
  if (media !== undefined && !isObject(media)) return null;
  const image = isObject(media) ? media.image : undefined;
  if (image !== undefined && !(isObject(image) && typeof image.uri === "string")) return null;
  const recipe = { ...raw, steps, otherIngredients, tags, cookMinutes: isNumber(raw.cookMinutes) ? raw.cookMinutes : 0 } as unknown as Recipe;
  if (!isObject(image) || !("server" in image)) return recipe;
  const { server: _foreign, ...plain } = image as RecipeImage;
  return withImage(recipe, plain);
}

/**
 * Foto vom Gerät behalten, wenn es dasselbe ist wie auf dem Server: dieselbe Fassung (der Server hat das Foto in den
 * Bildspeicher gelegt und schickt den Pfad zurück) oder derselbe Pfad, den das Gerät schon kennt (ein anderes Gerät hat
 * nur etwas anderes am Rezept geändert). So bleibt ein eigenes Foto offline sichtbar; die App merkt sich den Pfad
 * (`server`) und schickt künftig diesen. Hat ein anderes Gerät das Foto ersetzt oder entfernt, gilt dessen Fassung.
 */
function mergeImage(received: Recipe, local: Recipe | undefined, sameVersion: boolean): Recipe {
  const mine = local?.media?.image;
  if (!mine || !LOCAL_IMAGE.test(mine.uri)) return received;
  const theirs = received.media?.image?.uri;
  const path = theirs?.startsWith(SERVER_IMAGE_PATH) ? theirs : undefined;
  if (!sameVersion && (path === undefined || path !== mine.server)) return received;
  const { server: _old, ...plain } = mine;
  return withImage(received, path ? { ...plain, server: path } : plain);
}

/** Eigenes Rezept vom Server: neu, geändert (Foto wie in mergeImage) oder gelöscht; dazu, ob es geteilt ist. */
function applyOwnRecipe(data: SyncedData, record: RemoteRecord, sameVersion: boolean): SyncedData | null {
  const local = data.myRecipes.find((r) => r.id === record.id);
  const { [record.id]: wasShared, ...unshared } = data.shared;
  if (record.data === null) {
    return local || wasShared !== undefined ? { ...data, myRecipes: data.myRecipes.filter((r) => r.id !== record.id), shared: unshared } : data;
  }
  if (!isObject(record.data)) return null;
  const received = readRecipe(record.data.recipe);
  if (!received || received.id !== record.id) return null;
  const recipe = mergeImage(received, local, sameVersion);
  const sharedAs = record.data.sharedAs;
  const shared = typeof sharedAs === "string" && sharedAs ? { ...unshared, [record.id]: sharedAs } : unshared;
  const myRecipes = local ? data.myRecipes.map((r) => (r.id === record.id ? recipe : r)) : [recipe, ...data.myRecipes];
  return { ...data, myRecipes, shared };
}

/** Favorit vom Server, bei Community-Rezepten mit der gespeicherten Kopie; Löschmarke: kein Favorit mehr. */
function applyFavorite(data: SyncedData, record: RemoteRecord, sameVersion: boolean): SyncedData | null {
  const id = record.id;
  if (record.data === null) {
    if (!data.favoriteIds.includes(id) && !data.savedRecipes.some((r) => r.id === id)) return data;
    return { ...data, favoriteIds: data.favoriteIds.filter((f) => f !== id), savedRecipes: data.savedRecipes.filter((r) => r.id !== id) };
  }
  if (!isObject(record.data)) return null;
  let savedRecipes = data.savedRecipes;
  if (record.data.recipe !== undefined) {
    const received = readRecipe(record.data.recipe);
    if (!received || received.id !== id) return null;
    const local = data.savedRecipes.find((r) => r.id === id);
    const recipe = mergeImage(received, local, sameVersion);
    savedRecipes = local ? data.savedRecipes.map((r) => (r.id === id ? recipe : r)) : [recipe, ...data.savedRecipes];
  }
  const favoriteIds = data.favoriteIds.includes(id) ? data.favoriteIds : [...data.favoriteIds, id];
  return { ...data, favoriteIds, savedRecipes };
}

/**
 * Eigenes Foto der Galerie von einem anderen Gerät, Feld für Feld geprüft (null, wenn es nicht passt); `uri` fehlt, wenn
 * der Server das Foto nicht hat (z. B. ein öffentliches, das es in der Galerie nicht mehr gibt). Felder einer neueren
 * App fallen weg.
 */
export function readPhoto(id: string, raw: unknown): (Omit<MyPhoto, "uri"> & { uri?: string }) | null {
  if (!isObject(raw)) return null;
  const { recipeId, createdAt, uri, remoteId } = raw;
  if (typeof recipeId !== "string" || !SYNC_IDS.recipes.test(recipeId) || typeof createdAt !== "string" || typeof raw.public !== "boolean") return null;
  if ((uri !== undefined && typeof uri !== "string") || (remoteId !== undefined && remoteId !== null && typeof remoteId !== "string")) return null;
  if (raw.public && typeof remoteId !== "string") return null;
  return { id, recipeId, createdAt, public: raw.public, remoteId: typeof remoteId === "string" ? remoteId : null, ...(typeof uri === "string" ? { uri } : {}) };
}

/**
 * Wie mergeImage bei eigenen Rezepten: Das Foto des Geräts bleibt bei derselben Fassung (der Server hat es in den
 * Bildspeicher gelegt bzw. den Pfad der Galerie eingetragen) oder demselben Pfad, den das Gerät schon kennt; daneben
 * merkt sich die App den Pfad. Sonst gilt das Foto vom Server – fehlt es dort, bleibt das bisherige des Geräts. Ganz ohne
 * Foto: null (nichts zu zeigen).
 */
function mergePhoto(received: NonNullable<ReturnType<typeof readPhoto>>, local: MyPhoto | undefined, sameVersion: boolean): MyPhoto | null {
  const path = received.uri?.startsWith(SERVER_IMAGE_PATH) ? received.uri : undefined;
  if (local && LOCAL_IMAGE.test(local.uri) && (sameVersion || (path !== undefined && path === local.server))) {
    return { ...received, uri: local.uri, ...(path ? { server: path } : {}) };
  }
  const uri = received.uri ?? local?.uri;
  return uri === undefined ? null : { ...received, uri };
}

/** Eigenes Foto der Galerie vom Server: neu, geändert (z. B. öffentlich gemacht) oder gelöscht. */
function applyPhoto(data: SyncedData, record: RemoteRecord, sameVersion: boolean): SyncedData | null {
  const local = data.myPhotos.find((p) => p.id === record.id);
  if (record.data === null) return local ? { ...data, myPhotos: data.myPhotos.filter((p) => p.id !== record.id) } : data;
  const received = readPhoto(record.id, record.data);
  const photo = received ? mergePhoto(received, local, sameVersion) : null;
  if (!photo) return null;
  return { ...data, myPhotos: local ? data.myPhotos.map((p) => (p.id === record.id ? photo : p)) : [photo, ...data.myPhotos] };
}

/** Text vom Server (übersetzt oder verbessert), Feld für Feld geprüft; null, wenn er nicht passt. */
function readText(raw: unknown): RecipeText | null {
  if (!isObject(raw) || typeof raw.name !== "string") return null;
  const { steps, otherIngredients } = raw;
  if ((steps !== undefined && !strings(steps)) || (otherIngredients !== undefined && !strings(otherIngredients))) return null;
  return { name: raw.name, ...(steps ? { steps } : {}), ...(otherIngredients ? { otherIngredients } : {}) };
}

function applyText(data: SyncedData, record: RemoteRecord): SyncedData | null {
  const target = parseTextId(record.id);
  if (!target) return null;
  const { field, language, recipeId } = target;
  const texts = data[field];
  const { [language]: old, ...others } = texts[recipeId] ?? {};
  let forRecipe: Record<string, RecipeText>;
  if (record.data === null) {
    if (old === undefined) return data;
    forRecipe = others;
  } else {
    const text = readText(record.data);
    if (!text) return null;
    forRecipe = { ...others, [language]: text };
  }
  const next = { ...texts, [recipeId]: forRecipe };
  return field === "translations" ? { ...data, translations: next } : { ...data, textOverrides: next };
}

/**
 * Ein Eintrag vom Server im Zustand; null, wenn er nicht passt (dann bleibt alles, wie es ist). `sameVersion`: Das
 * Gerät kennt diese Fassung schon (gleicher Zeitpunkt), z. B. weil der Server beim Speichern ein Foto in den
 * Bildspeicher gelegt hat.
 */
function applyRecord(kind: DataKind, data: SyncedData, record: RemoteRecord, k: { at: Record<string, number>; pending: Set<string> }, sameVersion: boolean): SyncedData | null {
  if (kind === "recipes") return applyOwnRecipe(data, record, sameVersion);
  if (kind === "favorites") return applyFavorite(data, record, sameVersion);
  if (kind === "texts") return applyText(data, record);
  if (kind === "photos") return applyPhoto(data, record, sameVersion);
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

/** Ob der Server ein Rezept annimmt: dieselben Pflichtfelder und Grenzen wie in server/src/sync/userData.ts. */
function recipeAcceptable(raw: unknown, id: string): boolean {
  if (!isObject(raw) || raw.id !== id || typeof raw.name !== "string" || raw.name.length > 500) return false;
  if (!Array.isArray(raw.ingredients) || raw.ingredients.length > 300 || !Array.isArray(raw.mealTypes) || raw.mealTypes.length > 10) return false;
  if (raw.media !== undefined && !isObject(raw.media)) return false;
  const image = isObject(raw.media) ? raw.media.image : undefined;
  if (image !== undefined && !(isObject(image) && typeof image.uri === "string" && image.uri.length <= MAX_IMAGE_URI)) return false;
  return JSON.stringify(withImage(raw as unknown as Recipe, undefined)).length <= MAX_JSON.recipes;
}

/** Ob der Server einen Text annimmt (wie in server/src/sync/userData.ts). */
function textAcceptable(raw: unknown): boolean {
  if (!isObject(raw) || typeof raw.name !== "string" || raw.name.length > 500) return false;
  const list = (v: unknown, n: number, len: number) => v === undefined || (strings(v) && v.length <= n && v.every((x) => x.length <= len));
  return list(raw.steps, 200, 5000) && list(raw.otherIngredients, 300, 500);
}

/** Ob der Server ein eigenes Foto der Galerie annimmt (wie in server/src/sync/userData.ts). */
function photoAcceptable(raw: unknown): boolean {
  if (!isObject(raw) || typeof raw.recipeId !== "string" || !SYNC_IDS.recipes.test(raw.recipeId) || typeof raw.public !== "boolean") return false;
  if (typeof raw.createdAt !== "string" || raw.createdAt.length > 40) return false;
  if (raw.public && !(typeof raw.remoteId === "string" && raw.remoteId.length >= 1 && raw.remoteId.length <= 100)) return false;
  if (raw.uri !== undefined && !(typeof raw.uri === "string" && raw.uri.length <= MAX_IMAGE_URI)) return false;
  const { uri: _uri, ...rest } = raw;
  return JSON.stringify(rest).length <= MAX_JSON.photos;
}

/** Ob der Server einen Eintrag annimmt (ID, Form, Größe) – sonst bleibt er auf dem Gerät, statt den Abgleich scheitern zu lassen. */
function acceptable(kind: DataKind, id: string, data: unknown): boolean {
  if (!SYNC_IDS[kind].test(id)) return false;
  if (data === null) return true;
  if (kind === "photos") return photoAcceptable(data);
  if (kind === "pantry" && (!isObject(data) || !isNumber(data.amount) || data.amount > MAX_AMOUNT)) return false;
  if (kind === "recipes") return isObject(data) && recipeAcceptable(data.recipe, id) && (data.sharedAs === undefined || (typeof data.sharedAs === "string" && data.sharedAs.length >= 1 && data.sharedAs.length <= 100));
  if (kind === "favorites" && (!isObject(data) || (data.recipe !== undefined && !recipeAcceptable(data.recipe, id)))) return false;
  if (kind === "texts" && !textAcceptable(data)) return false;
  return JSON.stringify(data).length <= MAX_JSON[kind];
}

/**
 * Einträge zum Hochladen: alle bekannten (ohne `ids`, für ein neues Konto – auch Löschmarken) oder nur die genannten;
 * der Plan zuerst, damit der Server die Häkchen dem richtigen Plan zuordnet. `skipped`: was der Server nicht annähme
 * (z. B. viel zu lange Wünsche) – bleibt auf dem Gerät.
 */
export function uploadRecords(kind: DataKind, state: SyncedState, ids?: Iterable<string>): { records: RemoteRecord[]; skipped: string[] } {
  // Ohne `ids` (neues Konto): eigene Fotos als data-URI, siehe uploadImage.
  const derived = recordsOf(kind, state, ids === undefined);
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
/**
 * Höchstens so viele Zeichen JSON je Art in einer Anfrage (der Server nimmt bis zu 30 MB pro Anfrage) – eigene Rezepte
 * mit Foto haben rund 150 KB. Ein einzelner größerer Eintrag geht trotzdem, allein.
 */
export const UPLOAD_CHARS = 4_000_000;
const MAX_ROUNDS = 50;

/** Nimmt die nächsten Einträge aus der Warteschlange: höchstens UPLOAD_CHUNK Stück und UPLOAD_CHARS Zeichen. */
function takeChunk(queue: RemoteRecord[]): RemoteRecord[] {
  let chars = 0;
  let n = 0;
  while (n < queue.length && n < UPLOAD_CHUNK) {
    const size = JSON.stringify(queue[n]).length;
    if (n > 0 && chars + size > UPLOAD_CHARS) break;
    chars += size;
    n++;
  }
  return queue.splice(0, n);
}

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
 * Gleicht alle Arten mit dem Konto auf dem Server ab: lädt Geändertes und Gelöschtes hoch und holt,
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
      const chunk = takeChunk(run.queue);
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
