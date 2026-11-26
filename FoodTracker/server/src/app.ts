import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
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
import { RateLimiter, clientIp } from "./http/rateLimit.js";
import { resetMail, type Mailer } from "./mail/mailer.js";
import { SocialFetchError, detectPlatform, fetchSocialPost } from "./social/fetchPost.js";
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
/** Zeitpunkt in einheitlicher ISO-Form (mit Millisekunden und „Z“), damit Server und App gleich vergleichen. */
const IsoTime = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "Kein Zeitpunkt")
  .transform((s) => new Date(s).toISOString());
const DiaryEntryBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  title: z.string().max(300),
  nutrients: z.object({ kcal: Amount, protein: Amount, carbs: Amount, fat: Amount }),
  source: z.enum(["foto", "plan", "manuell"]),
});
const DiarySyncBody = z.object({
  since: z.number().int().min(0).default(0),
  changes: z
    .array(z.object({ id: z.string().min(1).max(100), updatedAt: IsoTime, entry: DiaryEntryBody.nullable() }))
    .max(5000)
    .default([]),
});

function deviceId(c: Context): string {
  return DeviceId.parse(c.req.header("X-Device-Id"));
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
  communityFile,
  feedbackFile = null,
  usersFile = null,
  overridesFile = null,
  diaryDir = null,
  auth = NO_AUTH,
  ai = new Ai(aiSettingsFromEnv()),
  corsOrigins = [],
  mailer = null,
  passwordCost,
  authLimits = defaultAuthLimits(),
  trustProxy = false,
}: {
  communityFile: string | null;
  feedbackFile?: string | null;
  usersFile?: string | null;
  overridesFile?: string | null;
  /** Ordner für die Sicherung der Ernährungshistorie (eine Datei pro Konto bzw. Gerät); null = nur im Speicher. */
  diaryDir?: string | null;
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
  /** Hinter einem Proxy (Cloudflare Tunnel, Render …): IP-Adresse aus dessen Header nehmen (TRUST_PROXY=1). */
  trustProxy?: boolean;
}) {
  const community = new CommunityStore(communityFile);
  const feedback = new FeedbackStore(feedbackFile);
  const users = new UserStore(usersFile, auth.adminEmails.map((e) => e.toLowerCase()), passwordCost);
  const overrides = new OverrideStore(overridesFile);
  const diary = new DiaryStore(diaryDir);
  /** Katalog inklusive Änderungen der Admins. */
  const catalogRecipes = () => overrides.apply(RECIPES);

  const bearer = (c: Context) => c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  const currentUser = (c: Context): User | undefined => {
    const token = bearer(c);
    return token ? users.userForToken(token) : undefined;
  };
  /** Wer handelt: angemeldetes Konto, sonst die anonyme Geräte-ID. */
  const actorId = (c: Context) => {
    const user = currentUser(c);
    return user ? `user:${user.id}` : deviceId(c);
  };
  const requireUser = (c: Context): User => {
    const user = currentUser(c);
    if (!user) throw new AuthError("unauthorized");
    return user;
  };
  const requireAdmin = (c: Context): User => {
    const user = requireUser(c);
    if (user.role !== "admin") throw new AuthError("forbidden");
    return user;
  };
  const me = (user: User) => ({ id: user.id, name: user.name, email: user.email, role: user.role, provider: user.provider, createdAt: user.createdAt });
  const app = new Hono();

  // Zuerst CORS, damit auch Vorab-Anfragen (OPTIONS) und Fehlerantworten im Browser ankommen.
  app.use("/api/*", corsMiddleware(corsOrigins));
  // Bis zu 10 Videobilder plus Vorschaubild.
  app.use("/api/*", bodyLimit({ maxSize: 30 * 1024 * 1024 }));

  app.onError((err, c) => {
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
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });

  /** Lebenszeichen und welche KI gerade nutzbar ist (Profilzeile in der App). */
  app.get("/api/health", async (c) => c.json({ ok: true, ai: await ai.status() }));

  app.get("/api/catalog", (c) =>
    c.json({
      ingredients: INGREDIENTS,
      recipes: catalogRecipes().map((r) => ({ ...r, diet: recipeDiet(r, ingredientById) })),
    }),
  );

  app.post("/api/analyze/meal", async (c) => {
    const body = ImageBody.parse(await c.req.json());
    return c.json(await analyzeMealPhoto(ai, { data: body.imageBase64, mediaType: body.mediaType }, body.language));
  });

  app.post("/api/analyze/receipt", async (c) => {
    const body = ImageBody.parse(await c.req.json());
    const receipt = await analyzeReceipt(ai, { data: body.imageBase64, mediaType: body.mediaType }, body.language);
    const pantry = receipt.items.flatMap((i) =>
      i.isFood && i.ingredientId ? [{ ingredientId: i.ingredientId, amount: i.quantity }] : [],
    );
    return c.json({ receipt, pantry });
  });

  app.post("/api/plan", async (c) => {
    const { preferences, language, recipes, startDate, ...request } = PlanBody.parse(await c.req.json());
    const extraRecipes = preferences ? await generateRecipes(ai, preferences, 8, language) : [];
    const plan = planMonth({
      request,
      recipes: [...catalogRecipes(), ...recipes.map(asRecipe), ...extraRecipes],
      ingredients: ingredientById,
      startDate,
    });
    return c.json({ plan, extraRecipes });
  });

  /** Rezepte, die zu den Präferenzen passen – z. B. als Alternativen beim Tauschen eines Gerichts. */
  app.post("/api/recipes/matching", async (c) => {
    const body = Preferences.extend({ mealType: MealType.optional(), recipes: z.array(RecipeBody).max(500).default([]) }).parse(
      await c.req.json(),
    );
    const ids = [...catalogRecipes(), ...body.recipes.map(asRecipe)]
      .filter((r) => (!body.mealType || r.mealTypes.includes(body.mealType)) && matchesPreferences(r, body, ingredientById))
      .map((r) => r.id);
    return c.json({ recipeIds: [...new Set(ids)] });
  });

  app.post("/api/recipes/import", async (c) => {
    const body = ImportBody.parse(await c.req.json());
    if (body.url && !detectPlatform(body.url)) throw new SocialFetchError("unsupported_url");
    // Ohne KI gleich abbrechen, bevor der Beitrag geladen wird.
    await ai.require();
    const post = body.url ? await fetchSocialPost(body.url) : null;
    if (post && !post.caption && !post.thumbnail && !body.caption && body.frames.length === 0) {
      throw new SocialFetchError("fetch_failed");
    }
    const recipe = await importRecipe(ai, { post, caption: body.caption ?? null, frames: body.frames, language: body.language });
    return c.json({ recipe, author: post?.author ?? null });
  });

  app.post("/api/recipes/translate", async (c) => {
    const body = z.object({ text: RecipeTextBody, targetLanguage: z.string().min(2).max(10) }).parse(await c.req.json());
    return c.json(await translateRecipe(ai, body.text, body.targetLanguage));
  });

  // Bewertungen, Fotos und Meldungen zu Rezepten (Katalog, eigene und Community).
  app.get("/api/recipes/ratings", (c) => c.json(feedback.recipeRatings(actorId(c))));

  app.get("/api/recipes/top-photos", (c) => c.json(feedback.topPhotos(actorId(c))));

  app.get("/api/recipes/flags", (c) => {
    requireAdmin(c);
    return c.json(feedback.flagSummary());
  });

  app.get("/api/recipes/overrides", (c) => c.json(overrides.all()));

  app.post("/api/recipes/improve", async (c) => {
    const body = z
      .object({
        text: RecipeTextBody,
        ingredients: z.array(z.object({ name: z.string().max(100), amount: z.string().max(40) })).min(1).max(40),
        cookMinutes: z.number().min(0).max(1440),
        problem: z.string().max(500).default(""),
        language: Language,
      })
      .parse(await c.req.json());
    return c.json(await improveRecipe(ai, body));
  });

  app.post("/api/recipes/:id/rating", async (c) => {
    const { stars } = Stars.parse(await c.req.json());
    return c.json(feedback.rateRecipe(actorId(c), RecipeIdParam.parse(c.req.param("id")), stars));
  });

  app.get("/api/recipes/:id/photos", (c) => c.json(feedback.photos(RecipeIdParam.parse(c.req.param("id")), actorId(c))));

  app.post("/api/recipes/:id/photos", async (c) => {
    const body = PhotoBody.parse(await c.req.json());
    const photo = feedback.addPhoto(actorId(c), RecipeIdParam.parse(c.req.param("id")), currentUser(c)?.name ?? body.authorName, body.uri);
    return photo === "limit" ? c.json({ error: "photo_limit" }, 429) : c.json(photo, 201);
  });

  app.post("/api/photos/:id/rating", async (c) => {
    const { stars } = Stars.parse(await c.req.json());
    const photo = feedback.ratePhoto(actorId(c), c.req.param("id"), stars);
    return photo ? c.json(photo) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/photos/:id", (c) =>
    feedback.removePhoto(actorId(c), c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not_found" }, 404),
  );

  app.post("/api/recipes/:id/flags", async (c) => {
    const body = z.object({ reason: z.enum(FLAG_REASONS), note: z.string().trim().max(500).default("") }).parse(await c.req.json());
    feedback.flag(actorId(c), RecipeIdParam.parse(c.req.param("id")), body.reason, body.note);
    return c.body(null, 204);
  });

  // Sicherung der Ernährungshistorie: Die App schickt Neues, Geändertes und Gelöschtes und bekommt, was sie noch nicht
  // kennt (siehe app/src/lib/diary.ts). Mit Konto gehört die Historie dem Konto, sonst der Geräte-ID.
  app.post("/api/diary/sync", async (c) => {
    const user = currentUser(c);
    // Abgelaufene Sitzung: nicht still unter der Geräte-ID speichern, sondern melden – die App meldet dann ab.
    if (bearer(c) && !user) throw new AuthError("invalid_token");
    const owner = user ? `user:${user.id}` : `device:${deviceId(c)}`;
    const body = DiarySyncBody.parse(await c.req.json());
    const changes = body.changes.map((r) => ({ id: r.id, updatedAt: r.updatedAt, entry: r.entry ? { ...r.entry, id: r.id, updatedAt: r.updatedAt } : null }));
    try {
      return c.json({ owner, ...diary.sync(owner, body.since, changes) });
    } catch (e) {
      if (e instanceof DiaryFullError) return c.json({ error: "diary_full" }, 413);
      throw e;
    }
  });

  // Anmeldung mit Apple oder Google; das Ergebnis ist ein eigenes Sitzungstoken für die App.
  app.post("/api/auth/apple", async (c) => {
    const body = z.object({ identityToken: z.string().min(10).max(5000), fullName: z.string().trim().max(80).optional() }).parse(await c.req.json());
    const identity = await verifyAppleToken(body.identityToken, auth.appleAudiences);
    const { token, user } = users.login({ provider: "apple", sub: identity.sub, email: identity.email, name: body.fullName ?? null });
    return c.json({ token, user: me(user) });
  });

  app.post("/api/auth/google", async (c) => {
    const body = z.object({ idToken: z.string().min(10).max(5000) }).parse(await c.req.json());
    const identity = await verifyGoogleToken(body.idToken, auth.googleAudiences);
    const { token, user } = users.login({ provider: "google", sub: identity.sub, email: identity.email, name: identity.name });
    return c.json({ token, user: me(user) });
  });

  app.post("/api/auth/dev", async (c) => {
    if (!auth.allowDevLogin) return c.json({ error: "not_found" }, 404);
    const body = z.object({ name: z.string().trim().min(1).max(40), email: z.string().email().optional() }).parse(await c.req.json());
    const { token, user } = users.login({ provider: "dev", sub: (body.email ?? body.name).toLowerCase(), email: body.email ?? null, name: body.name });
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
      .parse(await c.req.json());
    const email = normalizeEmail(body.email);
    const wait = authLimits.register.hit(clientIp(c, trustProxy)) || authLimits.failures.wait(email);
    if (wait) return tooMany(c, wait);
    requireStrong(body.password);
    const { token, user, created } = await countingFailures(email, () => users.register({ email, password: body.password, name: body.name ?? null }));
    return c.json({ token, user: me(user), created }, created ? 201 : 200);
  });

  app.post("/api/auth/login", async (c) => {
    const body = z.object({ email: EmailField, password: PasswordField }).parse(await c.req.json());
    const email = normalizeEmail(body.email);
    const wait = authLimits.login.hit(clientIp(c, trustProxy)) || authLimits.failures.wait(email);
    if (wait) return tooMany(c, wait);
    const { token, user } = await countingFailures(email, () => users.loginWithPassword(email, body.password));
    return c.json({ token, user: me(user) });
  });

  /** Neues Passwort; andere Geräte werden abgemeldet, dieses bleibt angemeldet. */
  app.post("/api/auth/password", async (c) => {
    const user = requireUser(c);
    const body = z.object({ currentPassword: PasswordField, newPassword: PasswordField }).parse(await c.req.json());
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
    const body = z.object({ email: EmailField, language: Language }).parse(await c.req.json());
    const email = normalizeEmail(body.email);
    const wait = authLimits.forgot.hit(clientIp(c, trustProxy)) || authLimits.forgot.hit(`email:${email}`);
    if (wait) return tooMany(c, wait);
    const reset = users.createResetCode(email);
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
    const body = z.object({ email: EmailField, code: z.string().trim().max(20), newPassword: PasswordField }).parse(await c.req.json());
    const email = normalizeEmail(body.email);
    const key = `reset:${email}`;
    const wait = authLimits.login.hit(clientIp(c, trustProxy)) || authLimits.failures.wait(key);
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
  app.post("/api/auth/claim-device", (c) => {
    const user = requireUser(c);
    const device = deviceId(c);
    const actor = `user:${user.id}`;
    // Zuerst das Tagebuch: Nur dort kann es scheitern (Konto voll), dann bleibt alles beim Gerät.
    let diaryEntries: number;
    try {
      diaryEntries = diary.transfer(`device:${device}`, actor);
    } catch (e) {
      if (e instanceof DiaryFullError) return c.json({ error: "diary_full" }, 413);
      throw e;
    }
    return c.json({ ...community.transferActor(device, actor), ...feedback.transferActor(device, actor), diary: diaryEntries });
  });

  /**
   * Konto löschen (Art. 17 DSGVO) – mit allen Daten auf dem Server: Sicherung des Tagebuchs, geteilte Rezepte,
   * Favoriten, Fotos, Sterne und Meldungen. Konten mit Passwort bestätigen mit dem Passwort.
   */
  app.delete("/api/auth/me", async (c) => {
    const user = requireUser(c);
    const body = z.object({ password: PasswordField.optional() }).parse(await c.req.json().catch(() => ({})));
    if (user.passwordHash) {
      const key = `user:${user.id}`;
      const wait = authLimits.failures.wait(key);
      if (wait) return tooMany(c, wait);
      await countingFailures(key, () => users.checkPassword(user.id, body.password ?? ""));
    }
    const actor = `user:${user.id}`;
    community.removeActor(actor);
    feedback.removeActor(actor);
    diary.remove(actor);
    if (user.role === "admin") overrides.anonymize(user.name);
    users.delete(user.id);
    return c.body(null, 204);
  });

  /** „Meine Daten exportieren“ (Art. 15 und 20 DSGVO): alles, was der Server zum Konto speichert, als JSON. */
  app.get("/api/auth/export", (c) => {
    const user = requireUser(c);
    const actor = `user:${user.id}`;
    const exportedAt = new Date().toISOString();
    c.header("Content-Disposition", `attachment; filename="foodtracker-konto-${exportedAt.slice(0, 10)}.json"`);
    c.header("Cache-Control", "no-store");
    return c.json({
      format: "foodtracker-account-export",
      version: 1,
      exportedAt,
      account: { ...me(user), lastLoginAt: user.lastLoginAt, ...(user.provider === "password" ? { emailVerified: user.emailVerified === true } : {}) },
      diary: diary.entries(actor),
      community: community.exportFor(actor),
      ...feedback.exportFor(actor),
    });
  });

  app.get("/api/auth/config", (c) =>
    c.json({
      apple: auth.appleAudiences.length > 0,
      google: auth.googleAudiences.length > 0,
      dev: auth.allowDevLogin,
      password: true,
      passwordReset: mailer !== null,
      passwordMinLength: PASSWORD_MIN_LENGTH,
    }),
  );

  app.get("/api/auth/me", (c) => c.json(me(requireUser(c))));

  app.patch("/api/auth/me", async (c) => {
    const user = requireUser(c);
    const { name } = z.object({ name: z.string().trim().min(1).max(40) }).parse(await c.req.json());
    return c.json(me(users.rename(user.id, name)!));
  });

  app.post("/api/auth/logout", (c) => {
    const token = bearer(c);
    if (token) users.logout(token);
    return c.body(null, 204);
  });

  /** Nutzerverzeichnis für angemeldete Nutzer:innen – ohne E-Mail-Adressen. */
  app.get("/api/users", (c) => {
    requireUser(c);
    return c.json(
      users
        .list(c.req.query("q") ?? "")
        .filter((u) => !u.blocked)
        .map((u) => ({ ...UserStore.toPublic(u), photos: feedback.photoCount(`user:${u.id}`), recipes: community.count(`user:${u.id}`) })),
    );
  });

  // Admin-Bereich: Nutzer, Meldungen, Fotos, Community und Katalogrezepte verwalten.
  app.get("/api/admin/users", (c) => {
    requireAdmin(c);
    return c.json(
      users.list(c.req.query("q") ?? "").map((u) => ({
        ...me(u),
        blocked: u.blocked,
        lastLoginAt: u.lastLoginAt,
        photos: feedback.photoCount(`user:${u.id}`),
        recipes: community.count(`user:${u.id}`),
      })),
    );
  });

  app.patch("/api/admin/users/:id", async (c) => {
    const admin = requireAdmin(c);
    const patch = z.object({ role: z.enum(ROLES).optional(), blocked: z.boolean().optional() }).parse(await c.req.json());
    if (c.req.param("id") === admin.id && patch.blocked) return c.json({ error: "cannot_block_self" }, 400);
    const result = users.update(c.req.param("id"), patch);
    if (result === "last_admin") return c.json({ error: "last_admin" }, 400);
    return result ? c.json(me(result)) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/admin/flags/:recipeId", (c) => {
    requireAdmin(c);
    return c.json({ resolved: feedback.resolveFlags(c.req.param("recipeId")) });
  });

  app.get("/api/admin/photos", (c) => {
    requireAdmin(c);
    return c.json(feedback.recentPhotos(actorId(c)));
  });

  app.delete("/api/admin/photos/:id", (c) => {
    requireAdmin(c);
    return feedback.removePhotoAsAdmin(c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/admin/community/:id", (c) => {
    requireAdmin(c);
    return community.removeAsAdmin(c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  });

  app.put("/api/admin/recipes/:id", async (c) => {
    const admin = requireAdmin(c);
    const id = c.req.param("id");
    if (!RECIPES.some((r) => r.id === id)) return c.json({ error: "not_found" }, 404);
    const patch = RecipeBody.pick({ name: true, steps: true, otherIngredients: true, translations: true, mealTypes: true, cookMinutes: true, ingredients: true, media: true })
      .partial()
      .extend({ hidden: z.boolean().optional() })
      .parse(await c.req.json());
    return c.json(overrides.set(id, patch as Parameters<typeof overrides.set>[1], admin.name));
  });

  app.delete("/api/admin/recipes/:id", (c) => {
    requireAdmin(c);
    return overrides.remove(c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  });

  app.get("/api/community/recipes", (c) => {
    const sort = c.req.query("sort") === "new" ? "new" : "popular";
    return c.json(community.list(actorId(c), { sort, query: c.req.query("q") ?? "" }));
  });

  app.post("/api/community/recipes", async (c) => {
    const body = z.object({ authorName: z.string().trim().min(1).max(40), recipe: RecipeBody }).parse(await c.req.json());
    return c.json(community.publish(actorId(c), currentUser(c)?.name ?? body.authorName, asRecipe(body.recipe)), 201);
  });

  app.post("/api/community/recipes/:id/like", (c) => {
    const view = community.toggleLike(actorId(c), c.req.param("id"));
    return view ? c.json(view) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/community/recipes/:id", (c) =>
    community.remove(actorId(c), c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not_found" }, 404),
  );

  app.get("/api/delivery/providers", (c) =>
    c.json(providers.map(({ id, name, description }) => ({ id, name, description }))),
  );

  app.post("/api/delivery/orders", async (c) => {
    const body = OrderBody.parse(await c.req.json());
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
