import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addToPantry,
  aggregatePantry,
  consumeMeal,
  daysLeft,
  migrateStock,
  nowTime,
  setPantryAmount,
  sumNutrients,
  takeFromPantry,
  today,
  totalOf,
  type StockItem,
} from "../src/lib/pantry";
import { ingredient, meal, recipe, timeZoneActive, useTimeZone } from "./fixtures";

/** Vorrat in Kurzform: [Zutat, Menge, Einkaufstag]. */
const stock = (...items: [string, number, string][]): StockItem[] =>
  items.map(([ingredientId, amount, addedAt]) => ({ ingredientId, amount, addedAt }));

describe("Vorrat: Einkäufe buchen", () => {
  it("legt je Einkaufstag einen Posten an und fasst Einkäufe vom selben Tag zusammen", () => {
    let s = addToPantry([], [{ ingredientId: "milch", amount: 500 }], "2026-11-20");
    s = addToPantry(s, [{ ingredientId: "milch", amount: 250 }, { ingredientId: "eier", amount: 6 }], "2026-11-20");
    s = addToPantry(s, [{ ingredientId: "milch", amount: 1000 }], "2026-11-24");
    assert.deepEqual(s, stock(["milch", 750, "2026-11-20"], ["eier", 6, "2026-11-20"], ["milch", 1000, "2026-11-24"]));
  });

  it("übergeht leere Mengen und rundet auf eine Nachkommastelle", () => {
    const items = [
      { ingredientId: "milch", amount: 0 },
      { ingredientId: "eier", amount: -2 },
      { ingredientId: "reis", amount: 123.456 },
    ];
    assert.deepEqual(addToPantry([], items, "2026-11-24"), stock(["reis", 123.5, "2026-11-24"]));
  });

  it("verändert den bisherigen Vorrat nicht", () => {
    const before = stock(["milch", 500, "2026-11-20"]);
    const copy = structuredClone(before);
    addToPantry(before, [{ ingredientId: "milch", amount: 500 }], "2026-11-20");
    takeFromPantry(before, "milch", 200);
    setPantryAmount(before, "milch", 100);
    assert.deepEqual(before, copy);
  });

  it("bucht ohne Datum auf heute", () => {
    assert.equal(addToPantry([], [{ ingredientId: "milch", amount: 1 }])[0]!.addedAt, today());
  });
});

describe("Vorrat: Verbrauchen", () => {
  const s = stock(["milch", 500, "2026-11-22"], ["milch", 300, "2026-11-18"], ["eier", 10, "2026-11-20"]);

  it("nimmt zuerst aus dem ältesten Einkauf", () => {
    const next = takeFromPantry(s, "milch", 400);
    assert.deepEqual(
      next.filter((x) => x.ingredientId === "milch"),
      stock(["milch", 400, "2026-11-22"]),
    );
    assert.equal(totalOf(next, "eier"), 10);
  });

  it("entfernt aufgebrauchte Posten und geht nie ins Minus", () => {
    assert.deepEqual(
      takeFromPantry(s, "milch", 5000).filter((x) => x.ingredientId === "milch"),
      [],
    );
    assert.equal(totalOf(takeFromPantry(s, "milch", 0), "milch"), 800);
    assert.equal(totalOf(takeFromPantry(s, "butter", 100), "milch"), 800);
  });

  it("lässt nach dem Runden keine Posten mit Menge 0 zurück", () => {
    // 1,04 − 1 ergibt gerundet 0,0: Der Posten muss weg, sonst zählt sein altes Einkaufsdatum weiter.
    assert.deepEqual(takeFromPantry(stock(["eier", 1.04, "2026-11-20"]), "eier", 1), []);
    // Wie beim Kochen: 2 Eier × 1,635 Portionen (Portionen werden pro Tag skaliert).
    assert.deepEqual(takeFromPantry(stock(["eier", 3.3, "2026-11-20"]), "eier", 2 * 1.635), []);
  });

  it("zieht ein gekochtes Gericht samt Resteverwertung ab", () => {
    const omelett = recipe({
      id: "omelett",
      ingredients: [
        { ingredientId: "eier", amount: 2 },
        { ingredientId: "milch", amount: 50 },
      ],
    });
    const eaten = meal({ recipeId: "omelett", portions: 2.5, extras: [{ ingredientId: "milch", unit: "ml", amount: 30 }] });
    const next = consumeMeal(s, eaten, omelett);
    assert.equal(totalOf(next, "eier"), 5); // 10 − 2 × 2,5
    assert.equal(totalOf(next, "milch"), 645); // 800 − 50 × 2,5 − 30
  });

  it("setzt nach dem Nachzählen die Gesamtmenge", () => {
    const down = setPantryAmount(s, "milch", 600);
    assert.deepEqual(
      down.filter((x) => x.ingredientId === "milch"),
      stock(["milch", 100, "2026-11-18"], ["milch", 500, "2026-11-22"]),
    );
    const up = setPantryAmount(s, "milch", 1000);
    assert.equal(totalOf(up, "milch"), 1000);
    assert.ok(up.some((x) => x.ingredientId === "milch" && x.addedAt === today() && x.amount === 200));
    assert.equal(totalOf(setPantryAmount(s, "milch", 0), "milch"), 0);
    assert.equal(totalOf(setPantryAmount(s, "eier", 10), "eier"), 10);
  });
});

describe("Vorrat: Auswertung", () => {
  it("fasst für den Planer je Zutat zusammen", () => {
    const s = stock(["milch", 300, "2026-11-18"], ["eier", 4, "2026-11-20"], ["milch", 200.04, "2026-11-22"]);
    assert.deepEqual(aggregatePantry(s), [
      { ingredientId: "milch", amount: 500 },
      { ingredientId: "eier", amount: 4 },
    ]);
  });

  it("übernimmt ältere Speicherstände ohne Einkaufsdatum", () => {
    const saved = [{ ingredientId: "reis", amount: 500 }, { ingredientId: "milch", amount: 1000, addedAt: "2026-11-01" }];
    assert.deepEqual(migrateStock(saved), stock(["reis", 500, today()], ["milch", 1000, "2026-11-01"]));
  });

  it("summiert Nährwerte", () => {
    assert.deepEqual(sumNutrients([]), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    assert.deepEqual(
      sumNutrients([
        { kcal: 500, protein: 20, carbs: 60, fat: 15 },
        { kcal: 300, protein: 10, carbs: 30, fat: 12 },
      ]),
      { kcal: 800, protein: 30, carbs: 90, fat: 27 },
    );
  });
});

const MILCH = ingredient({ id: "milch", unit: "ml", shelfLifeDays: 7 });

/** 23.11.2026, 18:30 UTC in Ortszeit: Datum und Uhrzeit. */
const LOCAL_TIME: Record<string, [string, string]> = {
  "Europe/Vienna": ["2026-11-23", "19:30"],
  "Asia/Tokyo": ["2026-11-24", "03:30"],
  "America/New_York": ["2026-11-23", "13:30"],
};

for (const zone of Object.keys(LOCAL_TIME)) {
  describe(`Vorrat: Haltbarkeit und heutiges Datum (${zone})`, () => {
    useTimeZone(zone);

    it("zählt die Haltbarkeit ab dem ältesten Einkauf", () => {
      const s = stock(["milch", 500, "2026-11-22"], ["milch", 1000, "2026-11-20"]);
      assert.equal(daysLeft(s, MILCH, new Date(2026, 10, 24, 23, 59)), 3); // 7 − 4 Tage
      assert.equal(daysLeft(s, MILCH, new Date(2026, 10, 27, 0, 1)), 0); // letzter Tag
      assert.equal(daysLeft(s, MILCH, new Date(2026, 10, 30, 12)), -3); // überfällig
      assert.equal(daysLeft([], MILCH, new Date(2026, 10, 24)), null);
    });

    it("zählt über die Zeitumstellung hinweg richtig", () => {
      // Sommerzeit ab 29.3. (EU) bzw. 8.3. (USA), Winterzeit ab 25.10. bzw. 1.11.
      const cases: [string, Date][] = [
        ["2026-03-28", new Date(2026, 2, 30, 10)],
        ["2026-03-07", new Date(2026, 2, 9, 10)],
        ["2026-10-24", new Date(2026, 9, 26, 10)],
        ["2026-10-31", new Date(2026, 10, 2, 10)],
      ];
      for (const [bought, now] of cases) {
        assert.equal(daysLeft(stock(["milch", 500, bought]), MILCH, now), 5, `gekauft am ${bought}`);
      }
    });

    it("übergeht aufgebrauchte Posten mit Menge 0 aus älteren Speicherständen", () => {
      const s = stock(["milch", 0, "2026-11-01"], ["milch", 500, "2026-11-22"]);
      assert.equal(daysLeft(s, MILCH, new Date(2026, 10, 24, 12)), 5);
    });

    it("today und nowTime nutzen die Ortszeit, nicht UTC", (t) => {
      if (!timeZoneActive(zone)) return t.skip("Zeitzone lässt sich auf diesem System nicht umstellen");
      const instant = new Date("2026-11-23T18:30:00Z");
      assert.deepEqual([today(instant), nowTime(instant)], LOCAL_TIME[zone]);
    });
  });
}
