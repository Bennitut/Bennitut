import type { Ingredient, Nutrients, PantryItem, PlannedMeal, Recipe } from "./types";

/**
 * Ein Posten im Vorrat. Jeder Einkauf ist ein eigener Posten mit Datum, damit die App
 * anzeigen kann, wie lange etwas noch hält; verbraucht wird immer das Älteste zuerst.
 */
export interface StockItem extends PantryItem {
  /** Datum des Einkaufs (YYYY-MM-DD). */
  addedAt: string;
}

export function addToPantry(stock: StockItem[], items: PantryItem[], addedAt = today()): StockItem[] {
  const next = stock.map((s) => ({ ...s }));
  for (const item of items) {
    if (item.amount <= 0) continue;
    const sameDay = next.find((s) => s.ingredientId === item.ingredientId && s.addedAt === addedAt);
    if (sameDay) sameDay.amount = round1(sameDay.amount + item.amount);
    else next.push({ ingredientId: item.ingredientId, amount: round1(item.amount), addedAt });
  }
  return next;
}

/** Zieht eine Menge ab, älteste Posten zuerst. */
export function takeFromPantry(stock: StockItem[], ingredientId: string, amount: number): StockItem[] {
  let remaining = amount;
  const sorted = [...stock].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const next: StockItem[] = [];
  for (const s of sorted) {
    if (s.ingredientId !== ingredientId || remaining <= 0) {
      next.push(s);
      continue;
    }
    const used = Math.min(s.amount, remaining);
    remaining -= used;
    if (s.amount - used > 0.01) next.push({ ...s, amount: round1(s.amount - used) });
  }
  return next;
}

/** Zieht die Zutaten eines gekochten Gerichts (inkl. Resteverwertung) vom Vorrat ab. */
export function consumeMeal(stock: StockItem[], meal: PlannedMeal, recipe: Recipe): StockItem[] {
  const used = [
    ...recipe.ingredients.map((ri) => ({ ingredientId: ri.ingredientId, amount: ri.amount * meal.portions })),
    ...meal.extras.map((e) => ({ ingredientId: e.ingredientId, amount: e.amount })),
  ];
  return used.reduce((s, u) => takeFromPantry(s, u.ingredientId, u.amount), stock);
}

/** Setzt die Gesamtmenge einer Zutat (z. B. nach Nachzählen in der Küche). */
export function setPantryAmount(stock: StockItem[], ingredientId: string, amount: number): StockItem[] {
  const current = totalOf(stock, ingredientId);
  if (amount > current) return addToPantry(stock, [{ ingredientId, amount: amount - current }]);
  return takeFromPantry(stock, ingredientId, current - amount);
}

export function totalOf(stock: StockItem[], ingredientId: string): number {
  return stock.filter((s) => s.ingredientId === ingredientId).reduce((sum, s) => sum + s.amount, 0);
}

/** Vorrat zusammengefasst je Zutat, wie ihn der Planer braucht. */
export function aggregatePantry(stock: StockItem[]): PantryItem[] {
  const totals = new Map<string, number>();
  for (const s of stock) totals.set(s.ingredientId, (totals.get(s.ingredientId) ?? 0) + s.amount);
  return [...totals].map(([ingredientId, amount]) => ({ ingredientId, amount: round1(amount) }));
}

/** Tage, bis der älteste Posten einer Zutat voraussichtlich verdirbt (negativ = überfällig). */
export function daysLeft(stock: StockItem[], ingredient: Ingredient, now = new Date()): number | null {
  const oldest = stock
    .filter((s) => s.ingredientId === ingredient.id)
    .map((s) => s.addedAt)
    .sort()[0];
  if (!oldest) return null;
  const added = new Date(`${oldest}T00:00:00`);
  const age = Math.floor((startOfDay(now).getTime() - added.getTime()) / 86_400_000);
  return ingredient.shelfLifeDays - age;
}

/** Ältere Speicherstände kannten kein Einkaufsdatum. */
export function migrateStock(items: (PantryItem & { addedAt?: string })[]): StockItem[] {
  return items.map((i) => ({ ...i, addedAt: i.addedAt ?? today() }));
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce(
    (s, n) => ({ kcal: s.kcal + n.kcal, protein: s.protein + n.protein, carbs: s.carbs + n.carbs, fat: s.fat + n.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const nowTime = () => new Date().toTimeString().slice(0, 5);
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
