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

const basePlan = { startDate: "2026-11-01", people: 2, kcalPerPersonPerDay: 2000, mealTypes: ["lunch", "dinner"] };

describe("Planung", () => {
  it("erstellt einen Monatsplan ohne KI-Wünsche", async () => {
    const res = await post("/api/plan", basePlan);
    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.startDate).toBe("2026-11-01");
    expect(plan.weeks).toHaveLength(4);
    expect(plan.weeks.flatMap((w: { meals: unknown[] }) => w.meals)).toHaveLength(60);
  });

  it("plant eigene Rezepte und fixierte Gerichte ein", async () => {
    const res = await post("/api/plan", {
      ...basePlan,
      recipes: [ownRecipe],
      locked: [{ day: 15, mealType: "lunch", recipeId: "eigen_1" }],
    });
    const { plan } = await res.json();
    const meals = plan.weeks.flatMap((w: { meals: { day: number; mealType: string; recipeId: string }[] }) => w.meals);
    expect(meals.find((m: { day: number; mealType: string }) => m.day === 15 && m.mealType === "lunch").recipeId).toBe("eigen_1");
  });

  it("akzeptiert eigene Rezepte mit Foto und Videolink", async () => {
    const withMedia = {
      ...ownRecipe,
      media: { image: { uri: "data:image/jpeg;base64,AAAA" }, videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@koch/video/1" }] },
    };
    expect((await post("/api/plan", { ...basePlan, recipes: [withMedia] })).status).toBe(200);
  });

  it("lehnt ungültige Pläne und Rezepte mit unbekannten Zutaten ab", async () => {
    expect((await post("/api/plan", { ...basePlan, startDate: "morgen" })).status).toBe(400);
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

describe("Bewertungen, Fotos und Meldungen", () => {
  const photo = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

  it("bewertet Rezepte und liefert den Schnitt", async () => {
    await post("/api/recipes/kaiserschmarrn/rating", { stars: 5 });
    const res = await post("/api/recipes/kaiserschmarrn/rating", { stars: 3 }, DEVICE_B);
    expect(await res.json()).toEqual({ avg: 4, count: 2, mine: 3 });
    const all = await (await request("GET", "/api/recipes/ratings")).json();
    expect(all.kaiserschmarrn).toEqual({ avg: 4, count: 2, mine: 5 });
    expect((await post("/api/recipes/kaiserschmarrn/rating", { stars: 6 })).status).toBe(400);
  });

  it("sammelt öffentliche Fotos, sortiert nach Bewertung und lässt nur die Urheberin löschen", async () => {
    const a = await (await post("/api/recipes/shakshuka/photos", { authorName: "Lena", uri: photo })).json();
    const b = await (await post("/api/recipes/shakshuka/photos", { authorName: "Tom", uri: photo }, DEVICE_B)).json();
    expect(a.mine).toBe(true);
    // Eigene Fotos zählen nicht als Bewertung.
    expect((await (await post(`/api/photos/${a.id}/rating`, { stars: 5 })).json()).count).toBe(0);
    await post(`/api/photos/${b.id}/rating`, { stars: 5 });
    const list = await (await request("GET", "/api/recipes/shakshuka/photos", undefined, DEVICE_B)).json();
    expect(list.map((p: { id: string }) => p.id)).toEqual([b.id, a.id]);
    expect(JSON.stringify(list)).not.toContain(DEVICE_A);
    const top = await (await request("GET", "/api/recipes/top-photos")).json();
    expect(top.shakshuka.id).toBe(b.id);

    expect((await request("DELETE", `/api/photos/${a.id}`, undefined, DEVICE_B)).status).toBe(404);
    expect((await request("DELETE", `/api/photos/${a.id}`)).status).toBe(204);
  });

  it("nimmt nur Bilder als data-URI an", async () => {
    expect((await post("/api/recipes/shakshuka/photos", { uri: "https://example.com/x.jpg" })).status).toBe(400);
  });

  it("sammelt Meldungen zu Rezepten", async () => {
    expect((await post("/api/recipes/linsen_dal/flags", { reason: "image", note: "Foto zeigt ein Restaurant" })).status).toBe(204);
    await post("/api/recipes/linsen_dal/flags", { reason: "text" }, DEVICE_B);
    expect((await post("/api/recipes/linsen_dal/flags", { reason: "egal" })).status).toBe(400);
    const flags = await (await request("GET", "/api/recipes/flags")).json();
    expect(flags[0]).toMatchObject({ recipeId: "linsen_dal", count: 2, reasons: { image: 1, text: 1 }, notes: ["Foto zeigt ein Restaurant"] });
  });
});

describe("Lieferdienst", () => {
  it("bestellt beim Demo-Lieferdienst und bucht die Lieferung in den Vorrat", async () => {
    const { plan } = await (await post("/api/plan", { ...basePlan, people: 1, mealTypes: ["dinner"] })).json();
    const week = plan.weeks[0];
    const orderRes = await post("/api/delivery/orders", { providerId: "demo", items: week.shoppingList });
    expect(orderRes.status).toBe(201);
    const order = await orderRes.json();

    const { order: delivered, pantry } = await (await request("GET", `/api/delivery/demo/orders/${order.id}`)).json();
    expect(delivered.status).toBe("geliefert");
    expect(pantry).toHaveLength(week.shoppingList.filter((i: { packs: number }) => i.packs > 0).length);
  });

  it("meldet unbekannte Lieferdienste", async () => {
    const res = await post("/api/delivery/orders", {
      providerId: "gibtsnicht",
      items: [{ ingredientId: "reis", unit: "g", needed: 1, fromPantry: 0, packs: 1, packSize: 500, price: 1, leftover: 0, durable: true }],
    });
    expect(res.status).toBe(404);
  });
});
