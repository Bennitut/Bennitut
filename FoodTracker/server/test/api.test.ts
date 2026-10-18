import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp({ communityFile: null });
const DEVICE_A = "device-aaaaaaaa";
const DEVICE_B = "device-bbbbbbbb";

const request = (method: string, path: string, body?: unknown, device = DEVICE_A) =>
  app.request(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json", "X-Device-Id": device },
  });
const post = (path: string, body: unknown, device?: string) => request("POST", path, body, device);

const ownRecipe = {
  id: "eigen_1",
  language: "de",
  name: "Omas Kartoffelsalat",
  steps: ["Kartoffeln kochen", "Mit Gurke mischen"],
  otherIngredients: ["Essig"],
  mealTypes: ["lunch"],
  ingredients: [{ ingredientId: "kartoffeln", amount: 300 }, { ingredientId: "gurke", amount: 0.5 }],
  cookMinutes: 30,
  tags: [],
  source: { kind: "eigen" },
};

const basePlan = { days: 3, people: 2, kcalPerPersonPerDay: 2000, mealTypes: ["lunch", "dinner"] };

describe("Planung", () => {
  it("erstellt einen Plan ohne KI-Wünsche", async () => {
    const res = await post("/api/plan", basePlan);
    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.meals).toHaveLength(6);
  });

  it("plant eigene Rezepte und fixierte Gerichte ein", async () => {
    const res = await post("/api/plan", {
      ...basePlan,
      recipes: [ownRecipe],
      locked: [{ day: 1, mealType: "lunch", recipeId: "eigen_1" }],
    });
    const { plan } = await res.json();
    expect(plan.meals.find((m: { day: number; mealType: string }) => m.day === 1 && m.mealType === "lunch").recipeId).toBe("eigen_1");
  });

  it("lehnt ungültige Pläne und Rezepte mit unbekannten Zutaten ab", async () => {
    expect((await post("/api/plan", { ...basePlan, days: 0 })).status).toBe(400);
    const bad = { ...ownRecipe, ingredients: [{ ingredientId: "einhorn", amount: 1 }] };
    expect((await post("/api/plan", { ...basePlan, recipes: [bad] })).status).toBe(400);
  });

  it("meldet nicht erfüllbare Präferenzen mit einem Fehlercode", async () => {
    const res = await post("/api/plan", { ...basePlan, mealTypes: ["breakfast"], diet: "vegan", maxCookMinutes: 1 });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("plan_no_recipe_for_meal");
  });

  it("liefert passende Alternativen für eine Mahlzeit", async () => {
    const res = await post("/api/recipes/matching", { diet: "vegan", mealType: "dinner", recipes: [ownRecipe] });
    const { recipeIds } = await res.json();
    expect(recipeIds).toContain("chili_sin_carne");
    expect(recipeIds).not.toContain("chili_con_carne");
    expect(recipeIds).not.toContain("eigen_1"); // nur Mittagessen
  });
});

describe("Rezept-Import", () => {
  it("akzeptiert nur Instagram- und TikTok-Links", async () => {
    const res = await post("/api/recipes/import", { url: "https://example.com/rezept" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("social_unsupported_url");
  });

  it("verlangt einen Link, Text oder Videobilder", async () => {
    expect((await post("/api/recipes/import", {})).status).toBe(400);
  });
});

describe("Community", () => {
  it("teilt Rezepte, zählt Favoriten und lässt nur die Autorin löschen", async () => {
    const created = await post("/api/community/recipes", { authorName: "Lena", recipe: ownRecipe });
    expect(created.status).toBe(201);
    const shared = await created.json();
    expect(shared.recipe.source).toEqual({ kind: "community", communityId: shared.id, author: "Lena" });

    const liked = await (await post(`/api/community/recipes/${shared.id}/like`, {}, DEVICE_B)).json();
    expect(liked).toMatchObject({ likes: 1, likedByMe: true, mine: false });

    const list = await (await request("GET", "/api/community/recipes?sort=popular", undefined, DEVICE_B)).json();
    expect(list[0].id).toBe(shared.id);
    expect(JSON.stringify(list)).not.toContain(DEVICE_A);

    expect((await request("DELETE", `/api/community/recipes/${shared.id}`, undefined, DEVICE_B)).status).toBe(404);
    expect((await request("DELETE", `/api/community/recipes/${shared.id}`)).status).toBe(204);
  });

  it("verlangt eine Geräte-ID", async () => {
    const res = await app.request("/api/community/recipes");
    expect(res.status).toBe(400);
  });
});

describe("Lieferdienst", () => {
  it("bestellt beim Demo-Lieferdienst und bucht die Lieferung in den Vorrat", async () => {
    const { plan } = await (await post("/api/plan", { ...basePlan, days: 2, people: 1, mealTypes: ["dinner"] })).json();
    const orderRes = await post("/api/delivery/orders", { providerId: "demo", items: plan.shoppingList });
    expect(orderRes.status).toBe(201);
    const order = await orderRes.json();

    const { order: delivered, pantry } = await (await request("GET", `/api/delivery/demo/orders/${order.id}`)).json();
    expect(delivered.status).toBe("geliefert");
    expect(pantry).toHaveLength(plan.shoppingList.filter((i: { packs: number }) => i.packs > 0).length);
  });

  it("meldet unbekannte Lieferdienste", async () => {
    const res = await post("/api/delivery/orders", {
      providerId: "gibtsnicht",
      items: [{ ingredientId: "reis", unit: "g", needed: 1, fromPantry: 0, packs: 1, packSize: 500, price: 1, leftover: 0, durable: true }],
    });
    expect(res.status).toBe(404);
  });
});
