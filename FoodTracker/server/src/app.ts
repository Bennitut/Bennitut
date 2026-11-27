import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { AI_CONSENT_HEADER, requireAiConsent } from "./ai/consent.js";
import { Ai, aiSettingsFromEnv } from "./ai/provider.js";
import { analyzeMealPhoto, analyzeReceipt, generateRecipes, improveRecipe, importRecipe, translateRecipe } from "./ai/tasks.js";
import { AI_ERROR_STATUS, AiError, AnalysisError } from "./ai/types.js";
import { OverrideStore } from "./admin/overrides.js";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordProblem, type ScryptCost } from "./auth/password.js";
import { AuthError, RESET_MINUTES, ROLES, UserStore, normalizeEmail, verifyAppleToken, verifyGoogleToken, type User } from "./auth/users.js";
import { FLAG_REASONS, FeedbackStore } from "./community/feedback.js";
import { CommunityStore } from "./community/store.js";
import { DiaryFullError, DiaryStore } from "./diary/store.js";
import { INGREDIENTS, RECIPES, ingredientById } from "./data/catalog.js";
import { findProvider, linesFromShoppingList, pantryFromOrder, providers } from "./delivery/providers.js";
import { MONTH_DAYS, planMonth } from "./planner/monthPlanner.js";
import { PlanError, matchesPreferences, recipeDiet } from "./planner/zeroWastePlanner.js";
import { corsMiddleware } from "./http/cors.js";
import { LIVE_PATH } from "./http/health.js";
import { ClientAddresses, viaProxy, type TrustProxy } from "./http/proxy.js";
import { RateLimiter, TooManyRequestsError, defaultRequestLimits, type RequestLimits } from "./http/rateLimit.js";
import { bodyLimits, httpsOnly, securityHeaders } from "./http/security.js";
import { logError } from "./log.js";
import { resetMail, type Mailer } from "./mail/mailer.js";
import { SocialFetchError, detectPlatform, fetchSocialPost } from "./social/fetchPost.js";
import { openSqlite, type Db } from "./storage/db.js";
import { MemoryImageStore, isImageKey, type ImageStore } from "./storage/images.js";
import { migrate } from "./storage/migrations.js";
import { SyncFullError, SyncStore } from "./storage/sync.js";
import { DatabaseIdField, IsoTime, UserDataSyncBody, exportUserData, removeUserData, syncUserData } from "./sync/userData.js";
import { ALLERGENS, CUISINES, FOOD_RULES, type Recipe } from "./types.js";

const MediaType = z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ImagePayload = z.object({ data: z.string().min(1), mediaType: MediaType });
const Language = z.string().min(2).max(10).default("de");
const MealType = z.enum(["breakfast", "lunch", "dinner"]);

const ImageBody = z.object({ imageBase64: z.string().min(1), mediaType: MediaType, language: Language });

const RecipeTextBody = z.object({
  name: z.string().min(1).max(200),
  steps: z.array(z.string().max(2000)).max(50).optional(),
  otherIngredients: z.array(z.string().max(200)).max(50).optional(),
});

export const RecipeBody = z.object({
  id: z.string().min(1).max(100),
  language: z.string().min(2).max(10),
  name: z.string().min(1).max(200),
  steps: z.array(z.string().max(2000)).max(50),
  otherIngredients: z.array(z.string().max(200)).max(50),
  translations: z.record(z.string(), RecipeTextBody).optional(),
  mealTypes: z.array(MealType).min(1),
  ingredients: z
    .array(
      z.object({
        ingredientId: z.string().refine((id) => ingredientById.has(id), "Unbekannte Zutat"),
        amount: z.number().positive().max(5000),
      }),
    )
    .min(1)
    .max(40),
  cookMinutes: z.number().min(0).max(1440),
  tags: z.array(z.string().max(40)).max(20),
  source: z.object({ kind: z.enum(["katalog", "eigen", "ki", "import", "community"]) }).passthrough(),
  media: z
    .object({
      // Eigene Fotos kommen als data-URI und dürfen deshalb etwas größer sein.
      image: z.object({ uri: z.string().max(700_000), credit: z.string().max(200).optional(), source: z.string().url().max(2000).optional() }).optional(),
      videos: z
        .array(
          z.object({
            platform: z.enum(["youtube", "tiktok", "instagram", "web"]),
            url: z.string().url().max(2000),
            title: z.string().max(300).optional(),
            author: z.string().max(200).optional(),
            // Sprache der Katalogvideos (z. B. in Kopien), damit die App sie nur in dieser Sprache zeigt.
            language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
          }),
        )
        .max(10)
        .optional(),
    })
    .optional(),
});
const asRecipe = (r: z.infer<typeof RecipeBody>) => r as unknown as Recipe;

const Preferences = z.object({
  diet: z.enum(["alles", "pescetarisch", "vegetarisch", "vegan"]).default("alles"),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  excludeIngredients: z.array(z.string()).default([]),
  maxCookMinutes: z.number().int().min(0).default(0),
  rules: z.array(z.enum(FOOD_RULES)).default([]),
});

const PlanBody = Preferences.extend({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredTags: z.array(z.enum(CUISINES)).default([]),
  priceFocus: z.number().min(0).max(5).default(1),
  proteinFocus: z.boolean().default(false),
  people: z.number().int().min(1).max(10),
  kcalPerPersonPerDay: z.number().min(1000).max(5000),
  mealTypes: z.array(MealType).min(1),
  pantry: z.array(z.object({ ingredientId: z.string(), amount: z.number().positive() })).default([]),
  favoriteRecipeIds: z.array(z.string()).default([]),
  /** Durchschnittliche Sterne je Rezept; gut bewertete werden öfter eingeplant. */
  recipeRatings: z.record(z.string().max(200), z.number().min(1).max(5)).default({}),
  locked: z.array(z.object({ day: z.number().int().min(0).max(MONTH_DAYS - 1), mealType: MealType, recipeId: z.string() })).default([]),
  maxRepeats: z.number().int().min(1).default(3),
  /** Eigene, importierte und favorisierte Community-Rezepte des Nutzers. */
  recipes: z.array(RecipeBody).max(500).default([]),
  /** Freitext-Wünsche; wenn gesetzt, schlägt Claude zusätzliche Rezepte vor. */
  preferences: z.string().max(1000).optional(),
  language: Language,
  seed: z.number().int().optional(),
});

const ShoppingItemBody = z.object({
  ingredientId: z.string().refine((id) => ingredientById.has(id)),
  unit: z.enum(["g", "ml", "stk"]),
  needed: z.number(),
  fromPantry: z.number(),
  packs: z.number().int().min(0),
  packSize: z.number(),
  price: z.number(),
  leftover: z.number(),
  durable: z.boolean(),
});

const OrderBody = z.object({ providerId: z.string(), items: z.array(ShoppingItemBody).min(1) });

const ImportBody = z
  .object({
    url: z.string().url().max(2000).optional(),
    caption: z.string().max(5000).optional(),
    frames: z.array(ImagePayload).max(10).default([]),
    language: Language,
  })
  .refine((b) => b.url || b.caption || b.frames.length > 0, "URL, Text oder Videobilder angeben");

/**
 * Zufällige Kennung des Geräts (in der App aus Buchstaben und Ziffern). Nur diese Zeichen: Sonst könnte sich jemand
 * mit „user:<Konto-ID>“ als fremdes Konto ausgeben – Konten handeln intern unter genau diesem Namen (actorId).
 */
const DeviceId = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);
const Stars = z.object({ stars: z.number().int().min(1).max(5) });
const RecipeIdParam = z.string().min(1).max(200);
/** Eigene Fotos kommen verkleinert als data-URI aus der App. */
const PhotoBody = z.object({
  authorName: z.string().trim().max(40).default(""),
  uri: z.string().max(700_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
});

const Amount = z.number().min(0).max(100_000);
const DiaryEntryBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  title: z.string().max(300),
  nutrients: z.object({ kcal: Amount, protein: Amount, carbs: Amount, fat: Amount }),
  source: z.enum(["foto", "plan", "manuell"]),
});
const DiarySyncBody = z.object({
  /** Kennung der Datenbank, mit der die App zuletzt abgeglichen hat (storage/identity.ts). */
  database: DatabaseIdField,
  // Höchstens die größte Revision, die Postgres speichern kann (INTEGER, storage/sync.ts).
  since: z.number().int().min(0).max(2_147_483_647).default(0),
  changes: z
    .array(z.object({ id: z.string().min(1).max(100), updatedAt: IsoTime, entry: DiaryEntryBody.nullable() }))
    .max(5000)
    .default([]),
});

function deviceId(c: Context): string {
  return DeviceId.parse(c.req.header("X-Device-Id"));
}

/** Kein gültiges JSON im Inhalt der Anfrage (400 wie andere ungültige Eingaben). */
class InvalidJsonError extends Error {}

/**
 * Inhalt der Anfrage als JSON. Kaputtes JSON wird zu InvalidJsonError: Die Meldung von JSON.parse enthält den Anfang
 * des Textes – etwa ein Passwort –, und sie soll weder als „internal“ ins Protokoll noch an die App gehen.
 */
async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (e) {
    if (e instanceof SyntaxError) throw new InvalidJsonError();
    throw e;
  }
}

export interface AuthConfig {
  /** Bundle-IDs für „Mit Apple anmelden“ (in Expo Go: host.exp.Exponent). */
  appleAudiences: string[];
  /** OAuth-Client-IDs für „Mit Google anmelden“ (iOS, Android, Web). */
  googleAudiences: string[];
  /** Diese E-Mail-Adressen werden bei der Anmeldung automatisch Admin. */
  adminEmails: string[];
  /** Anmeldung nur mit Namen, zum Testen ohne Apple/Google – nie in Produktion. */
  allowDevLogin: boolean;
}

const NO_AUTH: AuthConfig = { appleAudiences: [], googleAudiences: [], adminEmails: [], allowDevLogin: false };

/** Grenzen gegen das Durchprobieren von Passwörtern und gegen Massen-Registrierungen (pro Server, im Speicher). */
export interface AuthLimits {
  /** Anmeldeversuche (auch mit Code) pro IP-Adresse. */
  login: RateLimiter;
  /** Fehlversuche pro E-Mail-Adresse bzw. Konto – zählen auch für Adressen ohne Konto. */
  failures: RateLimiter;
  /** Registrierungen pro IP-Adresse. */
  register: RateLimiter;
  /** Mails mit Code pro IP-Adresse und pro Adresse. */
  forgot: RateLimiter;
}

export const defaultAuthLimits = (): AuthLimits => ({
  login: new RateLimiter(30, 15 * 60_000),
  failures: new RateLimiter(10, 15 * 60_000),
  register: new RateLimiter(10, 60 * 60_000),
  forgot: new RateLimiter(5, 60 * 60_000),
});

/** Passwortfeld: die Länge prüft passwordProblem (eigene Fehlermeldung statt „invalid_request“). */
const PasswordField = z.string().max(4 * PASSWORD_MAX_LENGTH);
const EmailField = z.string().trim().max(254);

export function createApp({
  db = openSqlite(":memory:"),
  images = new MemoryImageStore(),
  auth = NO_AUTH,
  ai = new Ai(aiSettingsFromEnv()),
  corsOrigins = [],
  mailer = null,
  passwordCost,
  authLimits = defaultAuthLimits(),
  limits: limitOverrides = {},
  trustProxy = false,
  warn = console.warn,
}: {
  /**
   * Datenbank für alles, was der Server speichert: Konten, Sitzungen, Sicherung der Ernährungshistorie, Community-Rezepte,
   * Favoriten, Fotos (ohne die Bilder selbst), Sterne, Meldungen und Admin-Änderungen (storage/db.ts: SQLite-Datei oder
   * Postgres); fehlende Migrationen führt der Server vor der ersten Anfrage aus. Ohne Angabe nur im Speicher (Tests).
   */
  db?: Db;
  /** Bildspeicher für Fotos (storage/images.ts, Ordner data/photos/); ohne Angabe nur im Speicher (Tests). */
  images?: ImageStore;
  auth?: AuthConfig;
  /** Claude oder Ollama (siehe ai/provider.ts); ohne Angabe aus der Umgebung bzw. server/.env. */
  ai?: Ai;
  /** Weitere Websites, die den Server aus dem Browser nutzen dürfen (CORS_ORIGINS). */
  corsOrigins?: string[];
  /** E-Mail-Versand für „Passwort vergessen?“ (SMTP_*); null = gibt es nicht, die App blendet den Knopf aus. */
  mailer?: Mailer | null;
  /** Rechenaufwand für Passwörter; Standard siehe auth/password.ts, Tests nehmen weniger. */
  passwordCost?: ScryptCost;
  authLimits?: AuthLimits;
  /** Grenzen für alle Anfragen, KI, Uploads und die Tagebuch-Sicherung ohne Konto (http/rateLimit.ts); Tests nehmen kleinere. */
  limits?: Partial<RequestLimits>;
  /**
   * Hinter einem Proxy (Cloudflare Tunnel, Render …): welchem Header die Adresse für die Rate-Limits entnommen wird
   * (TRUST_PROXY, siehe http/proxy.ts); `true` heißt wie TRUST_PROXY=1 der letzte Eintrag in X-Forwarded-For.
   */
  trustProxy?: TrustProxy | boolean;
  /** Hinweise fürs Fenster bzw. Protokoll, z. B. wenn TRUST_PROXY nicht zum Weg der Anfragen passt. */
  warn?: (message: string) => void;
} = {}) {
  const limits: RequestLimits = { ...defaultRequestLimits(), ...limitOverrides };
  const clients = new ClientAddresses(trustProxy === true ? 1 : trustProxy, warn);
  const community = new CommunityStore(db, images);
  const feedback = new FeedbackStore(db, images);
  const users = new UserStore(db, auth.adminEmails.map((e) => e.toLowerCase()), passwordCost);
  const overrides = new OverrideStore(db);
  const diary = new DiaryStore(db);
  /** Alles, was App und Server abgleichen (Tagebuch, Einstellungen, Plan und Vorrat), in der Tabelle sync_records. */
  const synced = new SyncStore(db);
  /** Katalog inklusive Änderungen der Admins. */
  const catalogRecipes = () => overrides.apply(RECIPES);

  const bearer = (c: Context) => c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  const currentUser = async (c: Context): Promise<User | undefined> => {
    const token = bearer(c);
    return token ? users.userForToken(token) : undefined;
  };
  /** Wer handelt: angemeldetes Konto, sonst die anonyme Geräte-ID. */
  const actorId = async (c: Context) => {
    const user = await currentUser(c);
    return user ? `user:${user.id}` : deviceId(c);
  };
  const requireUser = async (c: Context): Promise<User> => {
    const user = await currentUser(c);
    if (!user) throw new AuthError("unauthorized");
    return user;
  };
  const requireAdmin = async (c: Context): Promise<User> => {
    const user = await requireUser(c);
    if (user.role !== "admin") throw new AuthError("forbidden");
    return user;
  };
  const me = (user: User) => ({ id: user.id, name: user.name, email: user.email, role: user.role, provider: user.provider, createdAt: user.createdAt });
  /**
   * Vor jeder KI-Anfrage: Die App nennt im Header die Fassung der Einwilligung, der zugestimmt wurde (ai/consent.ts).
   * Erst nach dem Prüfen der Eingaben, damit Fehler in der Anfrage wie bisher als 400 bzw. 422 ankommen.
   */
  const requireConsent = (c: Context) => requireAiConsent(c.req.header(AI_CONSENT_HEADER));
  /**
   * Vor jeder Anfrage an die KI (und vor jedem Plan, der Planer rechnet lange): höchstens AI_REQUESTS_PER_HOUR je
   * Adresse und – angemeldet – je Konto. KI kostet Geld (Claude) bzw. blockiert die Grafikkarte (Ollama).
   */
  const aiQuota = async (c: Context) => {
    const limiter = limits.ai;
    if (!limiter) return;
    const user = await currentUser(c);
    const keys = [`ai:${clients.key(c)}`, ...(user ? [`ai:user:${user.id}`] : [])];
    const wait = Math.max(...keys.map((key) => limiter.wait(key)));
    if (wait > 0) throw new TooManyRequestsError("ai_rate_limited", wait);
    for (const key of keys) limiter.hit(key);
  };
  /** Neues, das der Server speichert und andere sehen (Fotos, geteilte Rezepte, Meldungen) – auch ohne Konto. */
  const uploadQuota = (c: Context) => {
    const wait = limits.uploads.hit(`upload:${clients.key(c)}`);
    if (wait > 0) throw new TooManyRequestsError("rate_limited", wait);
  };
  const app = new Hono();
  // Vor der ersten Anfrage den Aufbau der Datenbank auf den Stand bringen (index.ts macht das schon beim Start).
  const ready = migrate(db);
  ready.catch(() => undefined);
  app.use("*", async (_c, next) => {
    await ready;
    await next();
  });

  // Zuerst CORS, damit auch Vorab-Anfragen (OPTIONS) und Fehlerantworten im Browser ankommen.
  app.use("/api/*", corsMiddleware(corsOrigins));
  // Header gegen Einbetten und Umdeuten für jede Antwort, nur über https aus dem Internet (http/security.ts).
  app.use("*", securityHeaders());
  app.use("/api/*", httpsOnly());
  // Alle Anfragen je Adresse – außer dem Lebenszeichen, das Docker und der Hoster alle paar Sekunden abfragen.
  app.use("/api/*", async (c, next) => {
    if (c.req.path === LIVE_PATH) return next();
    const wait = limits.requests.take(`all:${clients.key(c)}`);
    if (wait > 0) throw new TooManyRequestsError("rate_limited", wait);
    return next();
  });
  // Größengrenze je Schnittstelle (vorher 30 MB für alles).
  app.use("/api/*", bodyLimits());

  app.onError((err, c) => {
    if (err instanceof TooManyRequestsError) {
      c.header("Retry-After", String(err.retryAfter));
      return c.json({ error: err.code, retryAfter: err.retryAfter }, 429);
    }
    if (err instanceof InvalidJsonError) return c.json({ error: "invalid_request" }, 400);
    if (err instanceof z.ZodError) return c.json({ error: "invalid_request", details: err.issues }, 400);
    if (err instanceof AnalysisError) return c.json({ error: `analysis_${err.code}` }, 422);
    if (err instanceof AiError) return c.json({ error: `ai_${err.code}` }, AI_ERROR_STATUS[err.code]);
    if (err instanceof PlanError) return c.json({ error: `plan_${err.code}`, detail: err.detail }, 422);
    if (err instanceof SocialFetchError) return c.json({ error: `social_${err.code}` }, 422);
    if (err instanceof AuthError) {
      const status = (
        {
          unauthorized: 401,
          invalid_token: 401,
          invalid_credentials: 401,
          forbidden: 403,
          blocked: 403,
          weak_password: 400,
          no_password: 400,
          invalid_code: 400,
          not_configured: 501,
        } as const
      )[err.code];
      if (err.code === "weak_password") return c.json({ error: "auth_weak_password", minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH }, status);
      return c.json({ error: `auth_${err.code}` }, status);
    }
    if (err instanceof HTTPException) return err.getResponse();
    // Ins Protokoll ohne Passwörter, Tokens und E-Mail-Adressen (log.ts) und nur mit dem Muster der Route – im Pfad
    // bzw. in der Suche könnten Namen stehen.
    logError(`Fehler bei ${c.req.method} ${c.req.routePath}`, err);
    return c.json({ error: "internal" }, 500);
  });

  /** Lebenszeichen und welche KI gerade nutzbar ist (Profilzeile in der App). */
  app.get("/api/health", async (c) => c.json({ ok: true, ai: await ai.status() }));
  /**
   * Nur das Lebenszeichen – für den Health-Check von Docker (http/health.ts) und den des Hosters. Fragt weder KI noch
   * Datenbank: Ollama hinter einem Tunnel bekäme sonst alle paar Sekunden eine Anfrage, und eine kostenlose Datenbank
   * wie Neon soll schlafen dürfen, solange niemand die App nutzt. Antwortet erst, wenn die Migrationen durch sind.
   */
  app.get(LIVE_PATH, (c) => c.json({ ok: true }));

  app.get("/api/catalog", async (c) =>
    c.json({
      ingredients: INGREDIENTS,
      recipes: (await catalogRecipes()).map((r) => ({ ...r, diet: recipeDiet(r, ingredientById) })),
    }),
  );

  /**
   * Fotos aus dem Bildspeicher (Galerie der Rezepte, Fotos geteilter Rezepte, Fotos eigener Rezepte eines Kontos) – wer
   * den Pfad kennt, bekommt das Bild; der Schlüssel ist eine zufällige UUID, Pfade zu Fotos eigener Rezepte bekommt nur
   * das Konto selbst. Unter einem Schlüssel liegt immer dasselbe Bild, deshalb darf der Browser es lange
   * zwischenspeichern – „private“: nur der Browser bzw. die App, kein Zwischenspeicher unterwegs (z. B. Cloudflare).
   */
  app.get("/api/images/:key", async (c) => {
    const key = c.req.param("key");
    const image = isImageKey(key) ? await images.get(key) : undefined;
    if (!image) return c.json({ error: "not_found" }, 404);
    return c.body(image.bytes, 200, {
      "Content-Type": image.type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
  });

  app.post("/api/analyze/meal", async (c) => {
    const body = ImageBody.parse(await readJson(c));
    requireConsent(c);
    await aiQuota(c);
    return c.json(await analyzeMealPhoto(ai, { data: body.imageBase64, mediaType: body.mediaType }, body.language));
  });

  app.post("/api/analyze/receipt", async (c) => {
    const body = ImageBody.parse(await readJson(c));
    requireConsent(c);
    await aiQuota(c);
    const receipt = await analyzeReceipt(ai, { data: body.imageBase64, mediaType: body.mediaType }, body.language);
    const pantry = receipt.items.flatMap((i) =>
      i.isFood && i.ingredientId ? [{ ingredientId: i.ingredientId, amount: i.quantity }] : [],
    );
    return c.json({ receipt, pantry });
  });

  app.post("/api/plan", async (c) => {
    const { preferences, language, recipes, startDate, ...request } = PlanBody.parse(await readJson(c));
    // Nur Wünsche gehen an die KI; ohne Wünsche plant der Server wie die App selbst. Beides zählt zur Grenze für die
    // KI – der Planer rechnet auch ohne KI ein paar Sekunden.
    if (preferences) requireConsent(c);
    await aiQuota(c);
    const extraRecipes = preferences ? await generateRecipes(ai, preferences, 8, language) : [];
    const plan = planMonth({
      request,
      recipes: [...(await catalogRecipes()), ...recipes.map(asRecipe), ...extraRecipes],
      ingredients: ingredientById,
      startDate,
    });
    return c.json({ plan, extraRecipes });
  });

  /** Rezepte, die zu den Präferenzen passen – z. B. als Alternativen beim Tauschen eines Gerichts. */
  app.post("/api/recipes/matching", async (c) => {
    const body = Preferences.extend({ mealType: MealType.optional(), recipes: z.array(RecipeBody).max(500).default([]) }).parse(
      await readJson(c),
    );
    const ids = [...(await catalogRecipes()), ...body.recipes.map(asRecipe)]
      .filter((r) => (!body.mealType || r.mealTypes.includes(body.mealType)) && matchesPreferences(r, body, ingredientById))
      .map((r) => r.id);
    return c.json({ recipeIds: [...new Set(ids)] });
  });

  app.post("/api/recipes/import", async (c) => {
    const body = ImportBody.parse(await readJson(c));
    if (body.url && !detectPlatform(body.url)) throw new SocialFetchError("unsupported_url");
    // Ohne Einwilligung bzw. ohne KI gleich abbrechen, bevor der Beitrag geladen wird.
    requireConsent(c);
    await ai.require();
    await aiQuota(c);
    const post = body.url ? await fetchSocialPost(body.url) : null;
    if (post && !post.caption && !post.thumbnail && !body.caption && body.frames.length === 0) {
      throw new SocialFetchError("fetch_failed");
    }
    const recipe = await importRecipe(ai, { post, caption: body.caption ?? null, frames: body.frames, language: body.language });
    return c.json({ recipe, author: post?.author ?? null });
  });

  app.post("/api/recipes/translate", async (c) => {
    const body = z.object({ text: RecipeTextBody, targetLanguage: z.string().min(2).max(10) }).parse(await readJson(c));
    requireConsent(c);
    await aiQuota(c);
    return c.json(await translateRecipe(ai, body.text, body.targetLanguage));
  });

  // Bewertungen, Fotos und Meldungen zu Rezepten (Katalog, eigene und Community).
  app.get("/api/recipes/ratings", async (c) => c.json(await feedback.recipeRatings(await actorId(c))));

  app.get("/api/recipes/top-photos", async (c) => c.json(await feedback.topPhotos(await actorId(c))));

  app.get("/api/recipes/flags", async (c) => {
    await requireAdmin(c);
    return c.json(await feedback.flagSummary());
  });

  app.get("/api/recipes/overrides", async (c) => c.json(await overrides.all()));

  app.post("/api/recipes/improve", async (c) => {
    const body = z
      .object({
        text: RecipeTextBody,
        ingredients: z.array(z.object({ name: z.string().max(100), amount: z.string().max(40) })).min(1).max(40),
        cookMinutes: z.number().min(0).max(1440),
        problem: z.string().max(500).default(""),
        language: Language,
      })
      .parse(await readJson(c));
    requireConsent(c);
    await aiQuota(c);
    return c.json(await improveRecipe(ai, body));
  });

  app.post("/api/recipes/:id/rating", async (c) => {
    const { stars } = Stars.parse(await readJson(c));
    return c.json(await feedback.rateRecipe(await actorId(c), RecipeIdParam.parse(c.req.param("id")), stars));
  });

  app.get("/api/recipes/:id/photos", async (c) => c.json(await feedback.photos(RecipeIdParam.parse(c.req.param("id")), await actorId(c))));

  app.post("/api/recipes/:id/photos", async (c) => {
    const body = PhotoBody.parse(await readJson(c));
    uploadQuota(c);
    const user = await currentUser(c);
    const actor = user ? `user:${user.id}` : deviceId(c);
    const photo = await feedback.addPhoto(actor, RecipeIdParam.parse(c.req.param("id")), user?.name ?? body.authorName, body.uri);
    if (photo === "limit") return c.json({ error: "photo_limit" }, 429);
    // Kein JPEG, PNG oder WebP (die ersten Bytes zählen, nicht die Angabe in der data-URI).
    if (photo === "invalid") return c.json({ error: "invalid_image" }, 400);
    return c.json(photo, 201);
  });

  app.post("/api/photos/:id/rating", async (c) => {
    const { stars } = Stars.parse(await readJson(c));
    const photo = await feedback.ratePhoto(await actorId(c), c.req.param("id"), stars);
    return photo ? c.json(photo) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/photos/:id", async (c) =>
    (await feedback.removePhoto(await actorId(c), c.req.param("id"))) ? c.body(null, 204) : c.json({ error: "not_found" }, 404),
  );

  app.post("/api/recipes/:id/flags", async (c) => {
    const body = z.object({ reason: z.enum(FLAG_REASONS), note: z.string().trim().max(500).default("") }).parse(await readJson(c));
    uploadQuota(c);
    await feedback.flag(await actorId(c), RecipeIdParam.parse(c.req.param("id")), body.reason, body.note);
    return c.body(null, 204);
  });

  // Sicherung der Ernährungshistorie: Die App schickt Neues, Geändertes und Gelöschtes und bekommt, was sie noch nicht
  // kennt (siehe app/src/lib/diary.ts). Mit Konto gehört die Historie dem Konto, sonst der Geräte-ID.
  app.post("/api/diary/sync", async (c) => {
    const user = await currentUser(c);
    // Abgelaufene Sitzung: nicht still unter der Geräte-ID speichern, sondern melden – die App meldet dann ab.
    if (bearer(c) && !user) throw new AuthError("invalid_token");
    const owner = user ? `user:${user.id}` : `device:${deviceId(c)}`;
    const body = DiarySyncBody.parse(await readJson(c));
    // Ohne Konto: Geräte-IDs kann sich jede:r ausdenken – deshalb höchstens so viele Einträge je Adresse und Stunde,
    // wie ein Gerät mit jahrelanger Historie beim ersten Abgleich schickt (Konten haben ihre Obergrenze im Speicher).
    if (!user) {
      const wait = limits.diary.take(`diary:${clients.key(c)}`, body.changes.length);
      if (wait > 0) throw new TooManyRequestsError("rate_limited", wait);
    }
    const changes = body.changes.map((r) => ({ id: r.id, updatedAt: r.updatedAt, entry: r.entry ? { ...r.entry, id: r.id, updatedAt: r.updatedAt } : null }));
    try {
      return c.json({ owner, ...(await diary.sync(owner, body.since, changes, body.database)) });
    } catch (e) {
      if (e instanceof DiaryFullError) return c.json({ error: "diary_full" }, 413);
      throw e;
    }
  });

  // Abgleich von Einstellungen (Profil und Fragebogen), Plan mit Einkaufsliste, Vorrat, eigenen Rezepten (Fotos in den
  // Bildspeicher), Favoriten, Rezepttexten und eigenen Fotos der Galerie zwischen den Geräten eines Kontos
  // (sync/userData.ts, in der App lib/dataSync.ts) – nur mit Konto, ohne bleiben diese Daten auf dem Gerät.
  app.post("/api/sync", async (c) => {
    const user = await currentUser(c);
    if (!user) throw new AuthError(bearer(c) ? "invalid_token" : "unauthorized");
    const body = UserDataSyncBody.parse(await readJson(c));
    try {
      return c.json(await syncUserData(synced, `user:${user.id}`, body, images, (ids) => feedback.galleryPhotos(ids)));
    } catch (e) {
      if (e instanceof SyncFullError) return c.json({ error: "sync_full" }, 413);
      throw e;
    }
  });

  // Anmeldung mit Apple oder Google; das Ergebnis ist ein eigenes Sitzungstoken für die App.
  app.post("/api/auth/apple", async (c) => {
    const body = z.object({ identityToken: z.string().min(10).max(5000), fullName: z.string().trim().max(80).optional() }).parse(await readJson(c));
    const identity = await verifyAppleToken(body.identityToken, auth.appleAudiences);
    const { token, user } = await users.login({ provider: "apple", sub: identity.sub, email: identity.email, name: body.fullName ?? null });
    return c.json({ token, user: me(user) });
  });

  app.post("/api/auth/google", async (c) => {
    const body = z.object({ idToken: z.string().min(10).max(5000) }).parse(await readJson(c));
    const identity = await verifyGoogleToken(body.idToken, auth.googleAudiences);
    const { token, user } = await users.login({ provider: "google", sub: identity.sub, email: identity.email, name: identity.name });
    return c.json({ token, user: me(user) });
  });

  // Dev-Login nur zum Testen im eigenen Netz: nie über einen Tunnel oder Proxy (viaProxy), im Betrieb gar nicht (runtime.ts).
  const devLoginFor = (c: Context) => auth.allowDevLogin && !viaProxy(c);

  app.post("/api/auth/dev", async (c) => {
    if (!devLoginFor(c)) return c.json({ error: "not_found" }, 404);
    const body = z.object({ name: z.string().trim().min(1).max(40), email: z.string().email().optional() }).parse(await readJson(c));
    const { token, user } = await users.login({ provider: "dev", sub: (body.email ?? body.name).toLowerCase(), email: body.email ?? null, name: body.name });
    return c.json({ token, user: me(user) });
  });

  // Konten mit E-Mail und Passwort. Keine Antwort verrät, ob es eine Adresse schon gibt: Unbekannte Adressen und falsche
  // Passwörter ergeben denselben Fehler in derselben Zeit, „Passwort vergessen?“ antwortet immer gleich. Grenze ohne
  // Bestätigungs-Mail: Wer sich mit einer vergebenen Adresse und einem fremden Passwort registriert, bekommt den Fehler
  // statt eines neuen Kontos – das Rate-Limit pro IP-Adresse macht systematisches Ausprobieren langsam.
  const tooMany = (c: Context, wait: number) => {
    c.header("Retry-After", String(wait));
    return c.json({ error: "auth_rate_limited", retryAfter: wait }, 429);
  };
  const requireStrong = (password: string) => {
    if (passwordProblem(password)) throw new AuthError("weak_password");
  };
  /** Führt `run` aus und zählt einen Fehlversuch für `key`, wenn Passwort oder Code falsch waren. */
  const countingFailures = async <T>(key: string, run: () => Promise<T>): Promise<T> => {
    try {
      const result = await run();
      authLimits.failures.reset(key);
      return result;
    } catch (e) {
      if (e instanceof AuthError && (e.code === "invalid_credentials" || e.code === "invalid_code")) authLimits.failures.hit(key);
      throw e;
    }
  };

  app.post("/api/auth/register", async (c) => {
    const body = z
      .object({ email: EmailField.pipe(z.email()), password: PasswordField, name: z.string().trim().max(40).optional() })
      .parse(await readJson(c));
    const email = normalizeEmail(body.email);
    const wait = authLimits.register.hit(clients.key(c)) || authLimits.failures.wait(email);
    if (wait) return tooMany(c, wait);
    requireStrong(body.password);
    const { token, user, created } = await countingFailures(email, () => users.register({ email, password: body.password, name: body.name ?? null }));
    return c.json({ token, user: me(user), created }, created ? 201 : 200);
  });

  app.post("/api/auth/login", async (c) => {
    const body = z.object({ email: EmailField, password: PasswordField }).parse(await readJson(c));
    const email = normalizeEmail(body.email);
    const wait = authLimits.login.hit(clients.key(c)) || authLimits.failures.wait(email);
    if (wait) return tooMany(c, wait);
    const { token, user } = await countingFailures(email, () => users.loginWithPassword(email, body.password));
    return c.json({ token, user: me(user) });
  });

  /** Neues Passwort; andere Geräte werden abgemeldet, dieses bleibt angemeldet. */
  app.post("/api/auth/password", async (c) => {
    const user = await requireUser(c);
    const body = z.object({ currentPassword: PasswordField, newPassword: PasswordField }).parse(await readJson(c));
    const key = `user:${user.id}`;
    const wait = authLimits.failures.wait(key);
    if (wait) return tooMany(c, wait);
    requireStrong(body.newPassword);
    await countingFailures(key, () => users.changePassword(user.id, body.currentPassword, body.newPassword, bearer(c)));
    return c.body(null, 204);
  });

  /** Code zum Zurücksetzen per E-Mail – nur mit Mail-Dienst; die Antwort ist immer dieselbe. */
  app.post("/api/auth/password/forgot", async (c) => {
    if (!mailer) return c.json({ error: "auth_reset_unavailable" }, 501);
    const body = z.object({ email: EmailField, language: Language }).parse(await readJson(c));
    const email = normalizeEmail(body.email);
    const wait = authLimits.forgot.hit(clients.key(c)) || authLimits.forgot.hit(`email:${email}`);
    if (wait) return tooMany(c, wait);
    const reset = await users.createResetCode(email);
    if (reset) {
      // Im Hintergrund senden, damit die Antwort nicht länger dauert, wenn es das Konto gibt. Im Protokoll nur der
      // Fehlercode – SMTP-Meldungen enthalten oft die Adresse.
      mailer.send({ to: reset.email, ...resetMail(body.language, reset.code, RESET_MINUTES) }).catch((e: { code?: string; responseCode?: number }) => {
        console.error(`Mail mit dem Code zum Zurücksetzen nicht gesendet (${e.code ?? "?"} ${e.responseCode ?? ""}).`);
      });
    }
    return c.body(null, 204);
  });

  app.post("/api/auth/password/reset", async (c) => {
    if (!mailer) return c.json({ error: "auth_reset_unavailable" }, 501);
    const body = z.object({ email: EmailField, code: z.string().trim().max(20), newPassword: PasswordField }).parse(await readJson(c));
    const email = normalizeEmail(body.email);
    const key = `reset:${email}`;
    const wait = authLimits.login.hit(clients.key(c)) || authLimits.failures.wait(key);
    if (wait) return tooMany(c, wait);
    requireStrong(body.newPassword);
    const { token, user } = await countingFailures(key, () => users.resetPassword(email, body.code, body.newPassword));
    return c.json({ token, user: me(user) });
  });

  /**
   * Nach dem Anmelden: Was dieses Gerät ohne Konto auf dem Server hat – Sicherung des Tagebuchs, geteilte Rezepte,
   * Favoriten, Fotos, Sterne und Meldungen –, gehört danach dem Konto, ohne Doppeltes (Regeln bei den Speichern). Die
   * Sicherung unter der Geräte-ID ist danach weg. Die App ruft das nach jeder Anmeldung einmal auf; ein zweiter Aufruf
   * findet nichts mehr. Wer die Geräte-ID kennt, könnte die Daten des Geräts auch sonst schon verwalten.
   */
  app.post("/api/auth/claim-device", async (c) => {
    const user = await requireUser(c);
    const device = deviceId(c);
    const actor = `user:${user.id}`;
    // Zuerst das Tagebuch: Nur dort kann es scheitern (Konto voll), dann bleibt alles beim Gerät.
    let diaryEntries: number;
    try {
      diaryEntries = await diary.transfer(`device:${device}`, actor);
    } catch (e) {
      if (e instanceof DiaryFullError) return c.json({ error: "diary_full" }, 413);
      throw e;
    }
    return c.json({ ...(await community.transferActor(device, actor)), ...(await feedback.transferActor(device, actor)), diary: diaryEntries });
  });

  /**
   * Konto löschen (Art. 17 DSGVO) – mit allen Daten auf dem Server: Sicherung des Tagebuchs, Einstellungen, Plan,
   * Vorrat, eigene Rezepte mit Fotos, Favoriten, Rezepttexte, geteilte Rezepte, Fotos, Sterne und Meldungen. Konten
   * mit Passwort bestätigen mit dem Passwort.
   */
  app.delete("/api/auth/me", async (c) => {
    const user = await requireUser(c);
    const body = z.object({ password: PasswordField.optional() }).parse(await readJson(c).catch(() => ({})));
    if (user.passwordHash) {
      const key = `user:${user.id}`;
      const wait = authLimits.failures.wait(key);
      if (wait) return tooMany(c, wait);
      await countingFailures(key, () => users.checkPassword(user.id, body.password ?? ""));
    }
    const actor = `user:${user.id}`;
    await community.removeActor(actor);
    await feedback.removeActor(actor);
    await removeUserData(synced, actor, images);
    if (user.role === "admin") await overrides.anonymize(user.name);
    await users.delete(user.id);
    return c.body(null, 204);
  });

  /** „Meine Daten exportieren“ (Art. 15 und 20 DSGVO): alles, was der Server zum Konto speichert, als JSON. */
  app.get("/api/auth/export", async (c) => {
    const user = await requireUser(c);
    const actor = `user:${user.id}`;
    const exportedAt = new Date().toISOString();
    c.header("Content-Disposition", `attachment; filename="foodtracker-konto-${exportedAt.slice(0, 10)}.json"`);
    c.header("Cache-Control", "no-store");
    return c.json({
      format: "foodtracker-account-export",
      version: 1,
      exportedAt,
      account: { ...me(user), lastLoginAt: user.lastLoginAt, ...(user.provider === "password" ? { emailVerified: user.emailVerified === true } : {}) },
      diary: await diary.entries(actor),
      ...(await exportUserData(synced, actor, images)),
      community: await community.exportFor(actor),
      ...(await feedback.exportFor(actor)),
    });
  });

  app.get("/api/auth/config", (c) =>
    c.json({
      apple: auth.appleAudiences.length > 0,
      google: auth.googleAudiences.length > 0,
      dev: devLoginFor(c),
      password: true,
      passwordReset: mailer !== null,
      passwordMinLength: PASSWORD_MIN_LENGTH,
    }),
  );

  app.get("/api/auth/me", async (c) => c.json(me(await requireUser(c))));

  app.patch("/api/auth/me", async (c) => {
    const user = await requireUser(c);
    const { name } = z.object({ name: z.string().trim().min(1).max(40) }).parse(await readJson(c));
    return c.json(me((await users.rename(user.id, name))!));
  });

  app.post("/api/auth/logout", async (c) => {
    const token = bearer(c);
    if (token) await users.logout(token);
    return c.body(null, 204);
  });

  /** Nutzerverzeichnis für angemeldete Nutzer:innen – ohne E-Mail-Adressen. */
  /** Wie viele Fotos und Rezepte jedes Konto geteilt hat (für Nutzerverzeichnis und Admin-Bereich). */
  const sharedCounts = async () => {
    const [photos, recipes] = await Promise.all([feedback.photoCountsByAuthor(), community.countsByAuthor()]);
    return (u: User) => ({ photos: photos.get(`user:${u.id}`) ?? 0, recipes: recipes.get(`user:${u.id}`) ?? 0 });
  };

  app.get("/api/users", async (c) => {
    await requireUser(c);
    const counts = await sharedCounts();
    return c.json(
      (await users.list(c.req.query("q") ?? "")).filter((u) => !u.blocked).map((u) => ({ ...UserStore.toPublic(u), ...counts(u) })),
    );
  });

  // Admin-Bereich: Nutzer, Meldungen, Fotos, Community und Katalogrezepte verwalten.
  app.get("/api/admin/users", async (c) => {
    await requireAdmin(c);
    const counts = await sharedCounts();
    return c.json(
      (await users.list(c.req.query("q") ?? "")).map((u) => ({ ...me(u), blocked: u.blocked, lastLoginAt: u.lastLoginAt, ...counts(u) })),
    );
  });

  app.patch("/api/admin/users/:id", async (c) => {
    const admin = await requireAdmin(c);
    const patch = z.object({ role: z.enum(ROLES).optional(), blocked: z.boolean().optional() }).parse(await readJson(c));
    if (c.req.param("id") === admin.id && patch.blocked) return c.json({ error: "cannot_block_self" }, 400);
    const result = await users.update(c.req.param("id"), patch);
    if (result === "last_admin") return c.json({ error: "last_admin" }, 400);
    return result ? c.json(me(result)) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/admin/flags/:recipeId", async (c) => {
    await requireAdmin(c);
    return c.json({ resolved: await feedback.resolveFlags(c.req.param("recipeId")) });
  });

  app.get("/api/admin/photos", async (c) => {
    await requireAdmin(c);
    return c.json(await feedback.recentPhotos(await actorId(c)));
  });

  app.delete("/api/admin/photos/:id", async (c) => {
    await requireAdmin(c);
    return (await feedback.removePhotoAsAdmin(c.req.param("id"))) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/admin/community/:id", async (c) => {
    await requireAdmin(c);
    return (await community.removeAsAdmin(c.req.param("id"))) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  });

  app.put("/api/admin/recipes/:id", async (c) => {
    const admin = await requireAdmin(c);
    const id = c.req.param("id");
    if (!RECIPES.some((r) => r.id === id)) return c.json({ error: "not_found" }, 404);
    const patch = RecipeBody.pick({ name: true, steps: true, otherIngredients: true, translations: true, mealTypes: true, cookMinutes: true, ingredients: true, media: true })
      .partial()
      .extend({ hidden: z.boolean().optional() })
      .parse(await readJson(c));
    return c.json(await overrides.set(id, patch as Parameters<typeof overrides.set>[1], admin.name));
  });

  app.delete("/api/admin/recipes/:id", async (c) => {
    await requireAdmin(c);
    return (await overrides.remove(c.req.param("id"))) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  });

  app.get("/api/community/recipes", async (c) => {
    const sort = c.req.query("sort") === "new" ? "new" : "popular";
    return c.json(await community.list(await actorId(c), { sort, query: c.req.query("q") ?? "" }));
  });

  /** Ein eigenes Foto des Rezepts (data-URI) kommt in den Bildspeicher; im Rezept steht danach sein Pfad. */
  app.post("/api/community/recipes", async (c) => {
    const body = z.object({ authorName: z.string().trim().min(1).max(40), recipe: RecipeBody }).parse(await readJson(c));
    uploadQuota(c);
    const user = await currentUser(c);
    return c.json(await community.publish(user ? `user:${user.id}` : deviceId(c), user?.name ?? body.authorName, asRecipe(body.recipe)), 201);
  });

  app.post("/api/community/recipes/:id/like", async (c) => {
    const view = await community.toggleLike(await actorId(c), c.req.param("id"));
    return view ? c.json(view) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/community/recipes/:id", async (c) =>
    (await community.remove(await actorId(c), c.req.param("id"))) ? c.body(null, 204) : c.json({ error: "not_found" }, 404),
  );

  app.get("/api/delivery/providers", (c) =>
    c.json(providers.map(({ id, name, description }) => ({ id, name, description }))),
  );

  app.post("/api/delivery/orders", async (c) => {
    const body = OrderBody.parse(await readJson(c));
    const provider = findProvider(body.providerId);
    if (!provider) return c.json({ error: "not_found" }, 404);
    return c.json(await provider.createCart(linesFromShoppingList(body.items)), 201);
  });

  app.get("/api/delivery/:providerId/orders/:orderId", async (c) => {
    const provider = findProvider(c.req.param("providerId"));
    const order = await provider?.getOrder(c.req.param("orderId"));
    if (!order) return c.json({ error: "not_found" }, 404);
    return c.json({ order, pantry: order.status === "geliefert" ? pantryFromOrder(order) : [] });
  });

  return app;
}
