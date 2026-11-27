import type { Order, PantryItem, ShoppingItem } from "./types";

/*
 * Einkaufsliste → Vorrat (Benjamins Entscheidung vom 24.11.2026, Variante b): Ein Knopf unter der Einkaufsliste bucht
 * alle abgehakten Zeilen als ganze Packungen in den Vorrat. Jede Zeile („Woche:Zutat“) kommt höchstens einmal in den
 * Vorrat – egal ob über den Knopf oder über eine gelieferte Bestellung für dieselbe Woche.
 */

/** Schlüssel einer Zeile der Einkaufsliste: Woche des Plans (ab 0) und Zutat. */
export const shoppingKey = (week: number, ingredientId: string) => `${week}:${ingredientId}`;

export interface Booking {
  /** Was in den Vorrat kommt. */
  items: PantryItem[];
  /** Zeilen der Einkaufsliste, die damit gebucht sind. */
  keys: string[];
}

/** Abgehakte, noch nicht gebuchte Zeilen einer Woche als Vorratsposten (Packungen × Packungsgröße). */
export function checkedToBook(list: ShoppingItem[], week: number, checked: readonly string[], booked: readonly string[]): Booking {
  const booking: Booking = { items: [], keys: [] };
  for (const item of list) {
    const key = shoppingKey(week, item.ingredientId);
    if (item.packs <= 0 || !checked.includes(key) || booked.includes(key) || booking.keys.includes(key)) continue;
    booking.items.push({ ingredientId: item.ingredientId, amount: item.packs * item.packSize });
    booking.keys.push(key);
  }
  return booking;
}

/**
 * Gelieferte Bestellung: Zeilen, die schon über die Einkaufsliste gebucht sind, kommen nicht noch einmal in den Vorrat;
 * die übrigen gelten danach als gebucht. Bestellungen ohne Woche (ältere App-Versionen) oder aus einem früheren Plan
 * werden wie bisher ganz gebucht und markieren nichts.
 */
export function deliveryToBook(delivered: PantryItem[], forWeek: Order["forWeek"], planStart: string | undefined, booked: readonly string[]): Booking {
  if (!forWeek || forWeek.planStart !== planStart) return { items: delivered, keys: [] };
  const items = delivered.filter((d) => !booked.includes(shoppingKey(forWeek.week, d.ingredientId)));
  return { items, keys: [...new Set(items.map((d) => shoppingKey(forWeek.week, d.ingredientId)))] };
}
