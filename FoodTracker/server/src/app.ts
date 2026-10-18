import { Hono } from "hono";
import { z } from "zod";
import { AnalysisError, analyzeMealPhoto, analyzeReceipt, generateRecipes } from "./ai/claude.js";
import { INGREDIENTS, RECIPES, ingredientById } from "./data/catalog.js";
import { findProvider, linesFromShoppingList, pantryFromOrder, providers } from "./delivery/providers.js";
import { planMeals } from "./planner/zeroWastePlanner.js";

const ImageBody = z.object({
  imageBase64: z.string().min(1),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});

const PlanBody = z.object({
  days: z.number().int().min(1).max(14),
  people: z.number().int().min(1).max(10),
  kcalPerPersonPerDay: z.number().min(1000).max(5000),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner"])).min(1),
  pantry: z.array(z.object({ ingredientId: z.string(), amount: z.number().positive() })).default([]),
  excludeTags: z.array(z.string()).default([]),
  maxRepeats: z.number().int().min(1).default(3),
  /** Freitext-Wünsche; wenn gesetzt, schlägt Claude zusätzliche Rezepte vor. */
  preferences: z.string().optional(),
  seed: z.number().int().optional(),
});

const ShoppingItemBody = z.object({
  ingredientId: z.string(),
  name: z.string(),
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

export const app = new Hono();

app.onError((err, c) => {
  if (err instanceof z.ZodError) return c.json({ error: "Ungültige Anfrage", details: err.issues }, 400);
  if (err instanceof AnalysisError) return c.json({ error: err.message }, 422);
  console.error(err);
  return c.json({ error: "Interner Fehler" }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/catalog", (c) => c.json({ ingredients: INGREDIENTS, recipes: RECIPES }));

app.post("/api/analyze/meal", async (c) => {
  const body = ImageBody.parse(await c.req.json());
  return c.json(await analyzeMealPhoto(body.imageBase64, body.mediaType));
});

app.post("/api/analyze/receipt", async (c) => {
  const body = ImageBody.parse(await c.req.json());
  const receipt = await analyzeReceipt(body.imageBase64, body.mediaType);
  const pantry = receipt.items.flatMap((i) =>
    i.isFood && i.ingredientId ? [{ ingredientId: i.ingredientId, amount: i.quantity }] : [],
  );
  return c.json({ receipt, pantry });
});

app.post("/api/plan", async (c) => {
  const { preferences, ...request } = PlanBody.parse(await c.req.json());
  const extraRecipes = preferences ? await generateRecipes(preferences, 6) : [];
  const plan = planMeals({ request, recipes: [...RECIPES, ...extraRecipes], ingredients: ingredientById });
  return c.json({ plan, extraRecipes });
});

app.get("/api/delivery/providers", (c) =>
  c.json(providers.map(({ id, name, description }) => ({ id, name, description }))),
);

app.post("/api/delivery/orders", async (c) => {
  const body = OrderBody.parse(await c.req.json());
  const provider = findProvider(body.providerId);
  if (!provider) return c.json({ error: "Unbekannter Lieferdienst" }, 404);
  return c.json(await provider.createCart(linesFromShoppingList(body.items)), 201);
});

app.get("/api/delivery/:providerId/orders/:orderId", async (c) => {
  const provider = findProvider(c.req.param("providerId"));
  const order = await provider?.getOrder(c.req.param("orderId"));
  if (!order) return c.json({ error: "Bestellung nicht gefunden" }, 404);
  return c.json({ order, pantry: order.status === "geliefert" ? pantryFromOrder(order) : [] });
});
