import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addToPantry, totalOf } from "../src/lib/pantry";
import { checkedToBook, deliveryToBook, shoppingKey } from "../src/lib/shopping";
import type { PantryItem, ShoppingItem } from "../src/lib/types";

/** Zeile der Einkaufsliste in Kurzform: Zutat, Packungen, Packungsgröße. */
const line = (ingredientId: string, packs: number, packSize: number): ShoppingItem => ({
  ingredientId,
  unit: "g",
  needed: packs * packSize,
  fromPantry: 0,
  packs,
  packSize,
  price: 1,
  leftover: 0,
  durable: false,
});

// Woche 2 (Index 1): Milch, Linsen, Karotten; Salz ist schon im Vorrat (0 Packungen).
const list = [line("milch", 2, 1000), line("linsen", 1, 500), line("karotten", 3, 250), line("salz", 0, 500)];
const WEEK = 1;
const key = (id: string) => shoppingKey(WEEK, id);
const amounts = (items: PantryItem[]) => Object.fromEntries(items.map((i) => [i.ingredientId, i.amount]));

describe("Einkaufsliste → Vorrat (Abgehaktes in den Vorrat)", () => {
  it("bucht abgehakte Zeilen als Packungen × Packungsgröße", () => {
    const booking = checkedToBook(list, WEEK, [key("milch"), key("karotten")], []);
    assert.deepEqual(amounts(booking.items), { milch: 2000, karotten: 750 });
    assert.deepEqual(booking.keys, [key("milch"), key("karotten")]);
  });

  it("bucht nur Zeilen dieser Woche und nichts mit 0 Packungen", () => {
    const otherWeek = shoppingKey(0, "linsen");
    const booking = checkedToBook(list, WEEK, [otherWeek, key("salz")], []);
    assert.deepEqual(booking, { items: [], keys: [] });
  });

  it("bucht nichts doppelt: ein zweiter Tipp bucht nur neu Abgehaktes", () => {
    let booked: string[] = [];
    let stock = addToPantry([], [], "2026-11-24");
    const tap = (checked: string[]) => {
      const booking = checkedToBook(list, WEEK, checked, booked);
      stock = addToPantry(stock, booking.items, "2026-11-24");
      booked = [...booked, ...booking.keys];
      return booking.keys.length;
    };
    assert.equal(tap([key("milch")]), 1);
    assert.equal(tap([key("milch")]), 0, "dieselbe Zeile noch einmal");
    assert.equal(tap([key("milch"), key("linsen")]), 1, "nur die neu abgehakten Linsen");
    assert.equal(totalOf(stock, "milch"), 2000);
    assert.equal(totalOf(stock, "linsen"), 500);
  });

  it("bucht wieder abgehakte Zeilen nicht noch einmal (Haken weg und wieder dran)", () => {
    const booked = [key("milch")];
    assert.deepEqual(checkedToBook(list, WEEK, [key("milch")], booked).items, []);
  });
});

describe("Gelieferte Bestellung und schon gebuchte Zeilen", () => {
  const PLAN = "2026-11-24";
  const delivered = list.filter((l) => l.packs > 0).map((l) => ({ ingredientId: l.ingredientId, amount: l.packs * l.packSize }));

  it("bucht nur, was nicht schon über die Einkaufsliste im Vorrat ist", () => {
    const booking = deliveryToBook(delivered, { planStart: PLAN, week: WEEK }, PLAN, [key("milch")]);
    assert.deepEqual(amounts(booking.items), { linsen: 500, karotten: 750 });
    assert.deepEqual(booking.keys.sort(), [key("karotten"), key("linsen")]);
  });

  it("Abhaken nach der Lieferung bucht die gelieferten Zeilen nicht noch einmal", () => {
    const afterDelivery = deliveryToBook(delivered, { planStart: PLAN, week: WEEK }, PLAN, []).keys;
    const checked = [key("milch"), key("linsen"), key("karotten")];
    assert.deepEqual(checkedToBook(list, WEEK, checked, afterDelivery), { items: [], keys: [] });
  });

  it("Bestellungen ohne Woche (ältere App) oder aus einem früheren Plan werden wie bisher ganz gebucht", () => {
    assert.deepEqual(deliveryToBook(delivered, undefined, PLAN, [key("milch")]), { items: delivered, keys: [] });
    const oldPlan = deliveryToBook(delivered, { planStart: "2026-10-25", week: WEEK }, PLAN, [key("milch")]);
    assert.deepEqual(oldPlan, { items: delivered, keys: [] });
  });

  it("Liste und Lieferung zusammen ergeben genau einmal die Einkaufsliste", () => {
    // Milch über die Liste gebucht, danach die ganze Bestellung geliefert.
    let booked: string[] = [];
    const viaList = checkedToBook(list, WEEK, [key("milch")], booked);
    booked = [...booked, ...viaList.keys];
    const viaDelivery = deliveryToBook(delivered, { planStart: PLAN, week: WEEK }, PLAN, booked);
    const stock = addToPantry(addToPantry([], viaList.items, PLAN), viaDelivery.items, PLAN);
    for (const l of list) assert.equal(totalOf(stock, l.ingredientId), l.packs * l.packSize, l.ingredientId);
  });
});
