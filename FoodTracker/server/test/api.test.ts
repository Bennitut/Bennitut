import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

const post = (path: string, body: unknown) =>
  app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe("API", () => {
  it("erstellt einen Plan ohne KI-Wünsche", async () => {
    const res = await post("/api/plan", { days: 3, people: 2, kcalPerPersonPerDay: 2000, mealTypes: ["lunch", "dinner"] });
    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.meals).toHaveLength(6);
  });

  it("lehnt ungültige Pläne ab", async () => {
    const res = await post("/api/plan", { days: 0, people: 2, kcalPerPersonPerDay: 2000, mealTypes: [] });
    expect(res.status).toBe(400);
  });

  it("bestellt beim Demo-Lieferdienst und bucht die Lieferung in den Vorrat", async () => {
    const planRes = await post("/api/plan", { days: 2, people: 1, kcalPerPersonPerDay: 2000, mealTypes: ["dinner"] });
    const { plan } = await planRes.json();
    const orderRes = await post("/api/delivery/orders", { providerId: "demo", items: plan.shoppingList });
    expect(orderRes.status).toBe(201);
    const order = await orderRes.json();

    const statusRes = await app.request(`/api/delivery/demo/orders/${order.id}`);
    const { order: delivered, pantry } = await statusRes.json();
    expect(delivered.status).toBe("geliefert");
    const bought = plan.shoppingList.filter((i: { packs: number }) => i.packs > 0);
    expect(pantry).toHaveLength(bought.length);
  });

  it("meldet unbekannte Lieferdienste", async () => {
    const res = await post("/api/delivery/orders", {
      providerId: "gibtsnicht",
      items: [{ ingredientId: "reis", name: "Reis", unit: "g", needed: 1, fromPantry: 0, packs: 1, packSize: 500, price: 1, leftover: 0, durable: true }],
    });
    expect(res.status).toBe(404);
  });
});
