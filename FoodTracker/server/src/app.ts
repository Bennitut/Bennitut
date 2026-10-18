import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { AnalysisError, analyzeMealPhoto, analyzeReceipt, generateRecipes, importRecipe, translateRecipe } from "./ai/claude.js";
import { CommunityStore } from "./community/store.js";
import { INGREDIENTS, RECIPES, ingredientById } from "./data/catalog.js";
import { findProvider, linesFromShoppingList, pantryFromOrder, providers } from "./delivery/providers.js";
import { PlanError, matchesPreferences, planMeals, recipeDiet } from "./planner/zeroWastePlanner.js";
import { SocialFetchError, fetchSocialPost } from "./social/fetchPost.js";
import { ALLERGENS, type Recipe } from "./types.js";

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
});
const asRecipe = (r: z.infer<typeof RecipeBody>) => r as unknown as Recipe;

const Preferences = z.object({
  diet: z.enum(["alles", "pescetarisch", "vegetarisch", "vegan"]).default("alles"),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  excludeIngredients: z.array(z.string()).default([]),
  maxCookMinutes: z.number().int().min(0).default(0),
});

const PlanBody = Preferences.extend({
  days: z.number().int().min(1).max(14),
  people: z.number().int().min(1).max(10),
  kcalPerPersonPerDay: z.number().min(1000).max(5000),
  mealTypes: z.array(MealType).min(1),
  pantry: z.array(z.object({ ingredientId: z.string(), amount: z.number().positive() })).default([]),
  favoriteRecipeIds: z.array(z.string()).default([]),
  locked: z.array(z.object({ day: z.number().int().min(0), mealType: MealType, recipeId: z.string() })).default([]),
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

const DeviceId = z.string().min(8).max(100);

function deviceId(c: Context): string {
  return DeviceId.parse(c.req.header("X-Device-Id"));
}

export function createApp({ communityFile }: { communityFile: string | null }) {
  const community = new CommunityStore(communityFile);
  const app = new Hono();

  // Bis zu 10 Videobilder plus Vorschaubild.
  app.use("/api/*", bodyLimit({ maxSize: 30 * 1024 * 1024 }));

  app.onError((err, c) => {
    if (err instanceof z.ZodError) return c.json({ error: "invalid_request", details: err.issues }, 400);
    if (err instanceof AnalysisError) return c.json({ error: `analysis_${err.code}` }, 422);
    if (err instanceof PlanError) return c.json({ error: `plan_${err.code}`, detail: err.detail }, 422);
    if (err instanceof SocialFetchError) return c.json({ error: `social_${err.code}` }, 422);
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/catalog", (c) =>
    c.json({
      ingredients: INGREDIENTS,
      recipes: RECIPES.map((r) => ({ ...r, diet: recipeDiet(r, ingredientById) })),
    }),
  );

  app.post("/api/analyze/meal", async (c) => {
    const body = ImageBody.parse(await c.req.json());
    return c.json(await analyzeMealPhoto({ data: body.imageBase64, mediaType: body.mediaType }, body.language));
  });

  app.post("/api/analyze/receipt", async (c) => {
    const body = ImageBody.parse(await c.req.json());
    const receipt = await analyzeReceipt({ data: body.imageBase64, mediaType: body.mediaType }, body.language);
    const pantry = receipt.items.flatMap((i) =>
      i.isFood && i.ingredientId ? [{ ingredientId: i.ingredientId, amount: i.quantity }] : [],
    );
    return c.json({ receipt, pantry });
  });

  app.post("/api/plan", async (c) => {
    const { preferences, language, recipes, ...request } = PlanBody.parse(await c.req.json());
    const extraRecipes = preferences ? await generateRecipes(preferences, 6, language) : [];
    const plan = planMeals({
      request,
      recipes: [...RECIPES, ...recipes.map(asRecipe), ...extraRecipes],
      ingredients: ingredientById,
    });
    return c.json({ plan, extraRecipes });
  });

  /** Rezepte, die zu den Präferenzen passen – z. B. als Alternativen beim Tauschen eines Gerichts. */
  app.post("/api/recipes/matching", async (c) => {
    const body = Preferences.extend({ mealType: MealType.optional(), recipes: z.array(RecipeBody).max(500).default([]) }).parse(
      await c.req.json(),
    );
    const ids = [...RECIPES, ...body.recipes.map(asRecipe)]
      .filter((r) => (!body.mealType || r.mealTypes.includes(body.mealType)) && matchesPreferences(r, body, ingredientById))
      .map((r) => r.id);
    return c.json({ recipeIds: [...new Set(ids)] });
  });

  app.post("/api/recipes/import", async (c) => {
    const body = ImportBody.parse(await c.req.json());
    const post = body.url ? await fetchSocialPost(body.url) : null;
    if (post && !post.caption && !post.thumbnail && !body.caption && body.frames.length === 0) {
      throw new SocialFetchError("fetch_failed");
    }
    const recipe = await importRecipe({ post, caption: body.caption ?? null, frames: body.frames, language: body.language });
    return c.json({ recipe, author: post?.author ?? null });
  });

  app.post("/api/recipes/translate", async (c) => {
    const body = z.object({ text: RecipeTextBody, targetLanguage: z.string().min(2).max(10) }).parse(await c.req.json());
    return c.json(await translateRecipe(body.text, body.targetLanguage));
  });

  app.get("/api/community/recipes", (c) => {
    const sort = c.req.query("sort") === "new" ? "new" : "popular";
    return c.json(community.list(deviceId(c), { sort, query: c.req.query("q") ?? "" }));
  });

  app.post("/api/community/recipes", async (c) => {
    const body = z.object({ authorName: z.string().trim().min(1).max(40), recipe: RecipeBody }).parse(await c.req.json());
    return c.json(community.publish(deviceId(c), body.authorName, asRecipe(body.recipe)), 201);
  });

  app.post("/api/community/recipes/:id/like", (c) => {
    const view = community.toggleLike(deviceId(c), c.req.param("id"));
    return view ? c.json(view) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/community/recipes/:id", (c) =>
    community.remove(deviceId(c), c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not_found" }, 404),
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
