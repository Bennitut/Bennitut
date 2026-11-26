import { z } from "zod";
import { batches, placeholders, type Queryable } from "../storage/db.js";
import { decodeDataUri, imageKeyOf, imageUri, newImageKey, toDataUri, type ImageStore } from "../storage/images.js";
import { SyncStore, type SyncKind, type SyncRecord, type SyncResult } from "../storage/sync.js";

// Abgleich der Daten eines Kontos zwischen seinen Geräten (Vorrang 1, 9.2 Teil 4 und 5; Gegenstück in der App:
// app/src/lib/dataSync.ts). Gespeichert in der allgemeinen Tabelle sync_records wie das Tagebuch – aber nur mit Konto.
// Ohne Konto bleiben diese Daten auf dem Gerät: Eine Sicherung unter der Geräte-ID brächte nichts zurück (mit den Daten
// des Geräts ist auch seine Geräte-ID weg), und Allergien und Körperdaten sind Gesundheitsangaben, die der Server dann
// ohne Nutzen hätte.
//
// Arten und ihre Einträge – je Eintrag gewinnt die neuere Fassung, bei gleichem Zeitpunkt die des Servers:
//  - „settings“: ein Eintrag „settings“ mit Profil, Fragebogen, Sprache und Region (Einstellungen der App).
//  - „plan“: „plan“ mit dem Monatsplan und seinen KI-Rezepten; dazu je Häkchen ein kleiner Eintrag, dessen ID den Plan
//    (Startdatum) nennt: „e:<Start>:<Tag>:<Mahlzeit>“ gegessen, „c:<Start>:<Woche>:<Zutat>“ abgehakt und
//    „b:<Start>:<Woche>:<Zutat>“ in den Vorrat gebucht. So geht kein Häkchen verloren, wenn zwei Geräte gleichzeitig
//    abhaken. Häkchen eines anderen Plans als des aktuellen löscht der Server (sie gehören zu einem abgelösten Plan).
//  - „pantry“: je Vorratsposten (Zutat und Einkaufstag, „<Zutat>@<JJJJ-MM-TT>“) die Menge.
//  - „recipes“: je eigenem bzw. importiertem Rezept (ID des Rezepts) `{ recipe, sharedAs? }` – `sharedAs` ist die
//    Community-ID, wenn es geteilt ist. Das Foto gehört nicht in die Datenbank: Eine data-URI legt der Server beim
//    Speichern in den Bildspeicher (dem Rezept zugeordnet) und speichert den Pfad; die App bekommt diese Fassung zurück.
//  - „favorites“: je Favorit (ID des Rezepts) `{}` bzw. bei Community-Rezepten `{ recipe }` mit der gespeicherten Kopie.
//  - „texts“: je Rezept und Sprache ein Text – „t:<Sprache>:<Rezept>“ von der KI übersetzt, „o:<Sprache>:<Rezept>“ mit
//    der KI verbessert (ersetzt das Original).
// Der Server prüft nur die Form (IDs, Größe, ein paar Pflichtfelder), nicht den ganzen Inhalt: Die Daten sieht nur das
// Konto selbst, und eine neuere App mit zusätzlichen Feldern soll mit einem älteren Server weiter abgleichen können.

/** Zeitpunkt in einheitlicher ISO-Form (mit Millisekunden und „Z“), damit Server und App gleich vergleichen. */
export const IsoTime = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "Kein Zeitpunkt")
  .transform((s) => new Date(s).toISOString());

/** Höchstens die größte Revision, die Postgres speichern kann (INTEGER, storage/sync.ts). */
const Rev = z.number().int().min(0).max(2_147_483_647).default(0);

export const USER_DATA_KINDS = ["settings", "plan", "pantry", "recipes", "favorites", "texts"] as const;
export type UserDataKindName = (typeof USER_DATA_KINDS)[number];

interface UserDataKind extends SyncKind {
  /** Ist das eine zulässige Eintrags-ID dieser Art? */
  validId: (id: string) => boolean;
  /** Schema für den Inhalt eines Eintrags (Löschmarken haben keinen). */
  schema: (id: string) => z.ZodType;
  /** Höchstens so viele Zeichen JSON pro Eintrag (so wie geschickt, bei Rezepten mit dem Foto als data-URI). */
  maxJson: number;
}

const DATE = "\\d{4}-\\d{2}-\\d{2}";
const INGREDIENT = "[a-z0-9_]{1,60}";
const MARK = new RegExp(`^(?:e:${DATE}:\\d{1,2}:(?:breakfast|lunch|dinner)|[cb]:${DATE}:\\d:${INGREDIENT})$`);
const POST = new RegExp(`^${INGREDIENT}@${DATE}$`);
/** IDs von Rezepten: Katalog („linsen_dal“), eigene („eigen_…“), importierte („import_…“), Community („community_<UUID>“). */
const RECIPE_ID = "[A-Za-z0-9_-]{1,100}";
const RECIPE = new RegExp(`^${RECIPE_ID}$`);
/** „t:en:linsen_dal“ (übersetzt) bzw. „o:de:eigen_…“ (verbessert). */
const TEXT = new RegExp(`^[to]:[a-z]{2,3}(?:-[A-Z]{2})?:${RECIPE_ID}$`);
/** Startdatum des Plans, zu dem ein Häkchen gehört („c:2026-11-27:0:reis“ → „2026-11-27“). */
export const markStart = (id: string) => id.slice(2, 12);

/** Rezept ohne Foto höchstens so groß (Zeichen JSON); ein Rezept hat meist 1–5 KB. */
export const MAX_RECIPE_JSON = 100_000;
/**
 * Foto eines eigenen Rezepts als data-URI höchstens so lang (rund 1,5 MB Bild). Die App verkleinert Fotos beim Aufnehmen
 * auf 800 px (rund 100 KB), Vorschaubilder importierter Rezepte haben höchstens rund 450 KB.
 */
export const MAX_IMAGE_URI = 2_000_000;

const Settings = z.record(z.string(), z.unknown());
const Plan = z
  .object({
    plan: z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), weeks: z.array(z.object({}).passthrough()).min(1).max(8) }).passthrough(),
    /** Rezepte, die nur in diesem Plan vorkommen (KI-Vorschläge). */
    recipes: z.array(z.object({ id: z.string().min(1).max(100) }).passthrough()).max(300),
  })
  .passthrough();
const Mark = z.object({}).passthrough();
const Post = z.object({ amount: z.number().min(0).max(1_000_000) }).passthrough();

/** Ein Rezept, so weit es der Server prüft: ID, Name, Zutaten, Mahlzeiten und – falls vorhanden – das Foto. */
const RecipeShape = z
  .object({
    id: z.string().regex(RECIPE),
    name: z.string().max(500),
    ingredients: z.array(z.unknown()).max(300),
    mealTypes: z.array(z.unknown()).max(10),
    media: z.object({ image: z.object({ uri: z.string().max(MAX_IMAGE_URI) }).passthrough().optional() }).passthrough().optional(),
  })
  .passthrough();
type RecipeData = z.infer<typeof RecipeShape>;
type RecipeImage = NonNullable<NonNullable<RecipeData["media"]>["image"]>;

/** Rezept mit anderem (bzw. ohne) Foto; ohne Foto fällt `media.image` ganz weg. */
function withImage<R extends { media?: { image?: unknown } }>(recipe: R, image: RecipeImage | undefined): R {
  const { image: _old, ...media } = recipe.media ?? {};
  const next = image ? { ...media, image } : media;
  const { media: _media, ...rest } = recipe;
  return (Object.keys(next).length > 0 ? { ...rest, media: next } : rest) as R;
}

const recipeFits = (recipe: RecipeData) => JSON.stringify(withImage(recipe, undefined)).length <= MAX_RECIPE_JSON;

const OwnRecipe = (id: string) =>
  z
    .object({ recipe: RecipeShape, sharedAs: z.string().min(1).max(100).optional() })
    .passthrough()
    .refine((d) => d.recipe.id === id, "ID des Rezepts passt nicht zum Eintrag")
    .refine((d) => recipeFits(d.recipe), "Rezept zu groß");
type OwnRecipeData = z.infer<ReturnType<typeof OwnRecipe>>;

const Favorite = (id: string) =>
  z
    .object({ recipe: RecipeShape.optional() })
    .passthrough()
    .refine((d) => !d.recipe || d.recipe.id === id, "ID des Rezepts passt nicht zum Eintrag");

const Text = z
  .object({
    name: z.string().max(500),
    steps: z.array(z.string().max(5000)).max(200).optional(),
    otherIngredients: z.array(z.string().max(500)).max(300).optional(),
  })
  .passthrough();

/**
 * Nach Änderungen am Plan: Häkchen, die nicht zum aktuellen Plan des Kontos gehören, entfernen – ohne Löschmarke, die
 * Geräte verwerfen sie ohnehin, sobald sie den neuen Plan haben. So wächst die Tabelle nicht mit jedem Monat.
 */
async function pruneMarks(tx: Queryable, owner: string): Promise<string[]> {
  const row = await tx.get<{ data: string | null }>("SELECT data FROM sync_records WHERE owner = ? AND kind = ? AND id = ?", [owner, "plan", "plan"]);
  let start: unknown = null;
  if (row?.data) start = (JSON.parse(row.data) as { plan?: { startDate?: unknown } }).plan?.startDate ?? null;
  const marks = await tx.all<{ id: string }>("SELECT id FROM sync_records WHERE owner = ? AND kind = ? AND id <> ?", [owner, "plan", "plan"]);
  const stale = marks.map((m) => m.id).filter((id) => markStart(id) !== start);
  for (const batch of batches(stale)) {
    await tx.run(`DELETE FROM sync_records WHERE owner = ? AND kind = ? AND id IN (${placeholders(batch)})`, [owner, "plan", ...batch]);
  }
  return stale;
}

/**
 * Die Arten mit ihren Grenzen. Bei allen gewinnt bei gleichem Zeitpunkt der Server (`serverWinsTies`): Was ein Gerät
 * schon vor dem Abgleich hatte, trägt den Zeitpunkt 0 – so übernimmt ein Konto beim ersten Abgleich, was das erste
 * Gerät mitbringt, und die weiteren Geräte bekommen dessen Fassung, statt dass jedes seine behält.
 */
export const USER_DATA: Record<UserDataKindName, UserDataKind> = {
  settings: { name: "settings", pageSize: 10, maxRecords: 10, serverWinsTies: true, maxJson: 20_000, validId: (id) => id === "settings", schema: () => Settings },
  plan: {
    name: "plan",
    pageSize: 2000,
    // Ein Monatsplan hat rund 400 Häkchen (90 Mahlzeiten, je Woche bis zu 40 Zeilen abgehakt und gebucht).
    maxRecords: 5000,
    serverWinsTies: true,
    // Ein Monatsplan für vier Personen hat rund 50 KB.
    maxJson: 1_000_000,
    validId: (id) => id === "plan" || MARK.test(id),
    schema: (id) => (id === "plan" ? Plan : Mark),
    afterChanges: pruneMarks,
  },
  pantry: { name: "pantry", pageSize: 2000, maxRecords: 5000, serverWinsTies: true, maxJson: 500, validId: (id) => POST.test(id), schema: () => Post },
  // Gespeichert ohne Foto (höchstens 100 KB, meist 1–5 KB); 200 pro Antwort sind schlimmstenfalls 20 MB.
  recipes: { name: "recipes", pageSize: 200, maxRecords: 3000, serverWinsTies: true, maxJson: MAX_RECIPE_JSON + MAX_IMAGE_URI + 1000, validId: (id) => RECIPE.test(id), schema: OwnRecipe },
  favorites: { name: "favorites", pageSize: 500, maxRecords: 5000, serverWinsTies: true, maxJson: MAX_RECIPE_JSON, validId: (id) => RECIPE.test(id), schema: Favorite },
  // Fünf Sprachen, übersetzt und verbessert, für alle Katalogrezepte und viele eigene.
  texts: { name: "texts", pageSize: 1000, maxRecords: 20_000, serverWinsTies: true, maxJson: 100_000, validId: (id) => TEXT.test(id), schema: () => Text },
};

const changeFor = (kind: UserDataKind) =>
  z.object({ id: z.string().min(1).max(120), updatedAt: IsoTime, data: z.unknown() }).transform((c, ctx): SyncRecord => {
    if (!kind.validId(c.id)) {
      ctx.addIssue({ code: "custom", message: `Unbekannte ID für ${kind.name}`, path: ["id"] });
      return z.NEVER;
    }
    if (c.data === null) return { id: c.id, updatedAt: c.updatedAt, data: null };
    const parsed = kind.schema(c.id).safeParse(c.data);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: `Ungültiger Inhalt für ${kind.name}`, path: ["data"] });
      return z.NEVER;
    }
    if (JSON.stringify(parsed.data).length > kind.maxJson) {
      ctx.addIssue({ code: "custom", message: `Eintrag zu groß für ${kind.name}`, path: ["data"] });
      return z.NEVER;
    }
    return { id: c.id, updatedAt: c.updatedAt, data: parsed.data };
  });

const kindBody = (kind: UserDataKind) => z.object({ since: Rev, changes: z.array(changeFor(kind)).max(5000).default([]) });

/** Anfrage an POST /api/sync: je Art, ab welcher Revision die App alles kennt, und was sie geändert hat. */
export const UserDataSyncBody = z.object({
  kinds: z
    .object({
      settings: kindBody(USER_DATA.settings).optional(),
      plan: kindBody(USER_DATA.plan).optional(),
      pantry: kindBody(USER_DATA.pantry).optional(),
      recipes: kindBody(USER_DATA.recipes).optional(),
      favorites: kindBody(USER_DATA.favorites).optional(),
      texts: kindBody(USER_DATA.texts).optional(),
    })
    .strict(),
});
export type UserDataSyncRequest = z.infer<typeof UserDataSyncBody>;

export interface UserDataSyncResponse {
  /** „user:<Konto-ID>“ */
  owner: string;
  kinds: Partial<Record<UserDataKindName, SyncResult>>;
}

// --------------------------------------------------------------------------------------------------------------
// Fotos eigener Rezepte im Bildspeicher
// --------------------------------------------------------------------------------------------------------------

/** Schlüssel des Fotos eines gespeicherten Rezept-Eintrags im Bildspeicher; null ohne Foto bzw. bei einem Foto im Netz. */
export function recipeImageKey(data: unknown): string | null {
  const uri = (data as Partial<OwnRecipeData> | null | undefined)?.recipe?.media?.image?.uri;
  return typeof uri === "string" ? imageKeyOf(uri) : null;
}

/**
 * Foto eines eigenen Rezepts zum Speichern: Jeder Eintrag hat seine eigene Datei im Bildspeicher. Bleibt es beim Foto,
 * das der Eintrag schon hat (derselbe Pfad), ändert sich nichts. Eine data-URI vom Gerät und ein Foto, das einem
 * anderen Eintrag oder einem Community-Rezept gehört (Kopie eines geteilten Rezepts), bekommen eine eigene Datei – so
 * bleibt das Foto, auch wenn das Original verschwindet. Fotos im Netz (https, z. B. Katalog) bleiben verlinkt; alles
 * andere fällt weg (eine Datei auf dem Gerät, die der Server nicht lesen kann, ein unbekanntes Format). `created`
 * sammelt die neuen Dateien (zum Aufräumen, falls die Transaktion scheitert).
 */
async function storeOwnImage(images: ImageStore, change: SyncRecord, currentKey: string | null, created: string[]): Promise<SyncRecord> {
  const data = change.data as OwnRecipeData;
  const image = data.recipe.media?.image;
  if (!image) return change;
  const key = imageKeyOf(image.uri);
  if (key !== null && key === currentKey) return change;
  if (/^https:\/\//i.test(image.uri)) return change;
  const stored = key !== null ? await images.get(key) : decodeDataUri(image.uri);
  const replaced = (next: RecipeImage | undefined): SyncRecord => ({ ...change, data: { ...data, recipe: withImage(data.recipe, next) } });
  if (!stored) return replaced(undefined);
  const fresh = newImageKey(stored.type);
  await images.put(fresh, stored);
  created.push(fresh);
  return replaced({ ...image, uri: imageUri(fresh) });
}

/** Bilder erst nach der Transaktion löschen: Scheitert sie, bleibt alles, wie es war. */
async function deleteImages(images: ImageStore, keys: readonly string[]) {
  for (const key of keys) await images.delete(key).catch(() => undefined);
}

/** Abgleich eigener Rezepte mit ihren Fotos: neue Fotos in den Bildspeicher, ersetzte und gelöschte danach weg. */
async function syncRecipes(store: SyncStore, images: ImageStore, owner: string, since: number, changes: readonly SyncRecord[]) {
  const created: string[] = [];
  const obsolete: string[] = [];
  const kind: SyncKind = {
    ...USER_DATA.recipes,
    prepare: async (change, current) => {
      const old = current?.data ? recipeImageKey(current.data) : null;
      const next = change.data === null ? change : await storeOwnImage(images, change, old, created);
      if (old !== null && old !== recipeImageKey(next.data)) obsolete.push(old);
      return next;
    },
  };
  let result: SyncResult;
  try {
    result = await store.sync(kind, owner, since, changes);
  } catch (e) {
    await deleteImages(images, created);
    throw e;
  }
  await deleteImages(images, obsolete);
  return result;
}

/**
 * Gleicht jede genannte Art ab (je Art eine Transaktion, siehe SyncStore.sync). Wirft SyncFullError, wenn das Konto bei
 * einer Art zu viele Einträge hätte – die Arten davor sind dann schon gespeichert; die App schickt beim nächsten Mal
 * alles noch einmal, das schadet nicht. `images`: Bildspeicher für die Fotos eigener Rezepte.
 */
export async function syncUserData(store: SyncStore, owner: string, request: UserDataSyncRequest, images: ImageStore): Promise<UserDataSyncResponse> {
  const kinds: UserDataSyncResponse["kinds"] = {};
  for (const name of USER_DATA_KINDS) {
    const body = request.kinds[name];
    if (!body) continue;
    kinds[name] = name === "recipes" ? await syncRecipes(store, images, owner, body.since, body.changes) : await store.sync(USER_DATA[name], owner, body.since, body.changes);
  }
  return { owner, kinds };
}

/** Beim Löschen des Kontos: alle abgeglichenen Daten (auch das Tagebuch) samt den Fotos eigener Rezepte. */
export async function removeUserData(store: SyncStore, owner: string, images: ImageStore): Promise<void> {
  const keys = (await store.records(USER_DATA.recipes, owner)).map((r) => recipeImageKey(r.data)).filter((k): k is string => k !== null);
  await store.remove(owner);
  await deleteImages(images, keys);
}

/**
 * Für „Meine Daten exportieren“: Einstellungen, Plan mit Häkchen, Vorrat, eigene Rezepte (Fotos als data-URI, damit
 * die Datei auch ohne Server vollständig ist), Favoriten und Rezepttexte, wie der Server sie zum Konto hat.
 */
export async function exportUserData(store: SyncStore, owner: string, images: ImageStore) {
  const [settings, plan, pantry, recipes, favorites, texts] = await Promise.all(USER_DATA_KINDS.map((name) => store.records(USER_DATA[name], owner)));
  const current = plan!.find((r) => r.id === "plan")?.data as Record<string, unknown> | undefined;
  // „c:2026-11-27:0:reis“ → „0:reis“ (Woche und Zutat), wie die App die Häkchen speichert.
  const marks = (type: string) => plan!.filter((r) => r.id.startsWith(`${type}:`)).map((r) => r.id.slice(13));
  const ownRecipes = [];
  for (const record of recipes!) {
    const data = record.data as OwnRecipeData;
    const key = recipeImageKey(data);
    const image = key ? await images.get(key) : undefined;
    const recipe = key ? withImage(data.recipe, image ? { ...data.recipe.media!.image!, uri: toDataUri(image) } : undefined) : data.recipe;
    ownRecipes.push({ ...recipe, ...(data.sharedAs ? { sharedAs: data.sharedAs } : {}) });
  }
  const textsOf = (type: "t" | "o") => {
    const result: Record<string, Record<string, unknown>> = {};
    for (const r of texts!) {
      const [prefix, language, ...rest] = r.id.split(":");
      if (prefix !== type || !language) continue;
      (result[rest.join(":")] ??= {})[language] = r.data;
    }
    return result;
  };
  return {
    settings: settings!.find((r) => r.id === "settings")?.data ?? null,
    plan: current ? { ...current, eaten: marks("e"), checked: marks("c"), booked: marks("b") } : null,
    pantry: pantry!.map((r) => {
      const [ingredientId, addedAt] = r.id.split("@");
      return { ingredientId, addedAt, amount: (r.data as { amount: number }).amount };
    }),
    recipes: ownRecipes,
    favorites: favorites!.map((r) => {
      const saved = (r.data as { recipe?: unknown }).recipe;
      return saved ? { recipeId: r.id, recipe: saved } : { recipeId: r.id };
    }),
    texts: { translated: textsOf("t"), improved: textsOf("o") },
  };
}
