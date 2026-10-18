import type {
  Ingredient,
  MealPlan,
  MealType,
  PantryItem,
  PlanRequest,
  PlannedMeal,
  Recipe,
  ShoppingItem,
} from "../types.js";
import { addNutrients, nutrientsFor, recipeNutrients, roundNutrients } from "./nutrition.js";

/**
 * Zero-Waste-Planer.
 *
 * Wählt für jede Mahlzeit ein Rezept so, dass
 *  1. gekaufte Packungen verderblicher Zutaten möglichst vollständig aufgebraucht werden,
 *  2. vorhandene Vorräte zuerst verwertet werden,
 *  3. nichts nach Ablauf der Haltbarkeit eingeplant wird,
 *  4. der Kalorienbedarf pro Tag getroffen wird (über die Portionsgröße),
 *  5. genug Abwechslung bleibt.
 *
 * Das ist ein kombinatorisches Problem (Rezepte teilen sich Packungen). Gelöst wird es
 * per lokaler Suche mit mehreren Neustarts und festem Seed, damit Ergebnisse reproduzierbar sind.
 */

/** Ab dieser Haltbarkeit gilt ein Rest nicht als Verschwendung, sondern als Vorrat. */
const DURABLE_DAYS = 60;
const MIN_PORTION = 0.7;
const MAX_PORTION = 1.5;
/** Resteverwertung darf die Menge einer Zutat in einem Gericht um höchstens so viel erhöhen. */
const MAX_EXTRA_SHARE = 0.5;
/** …und den Tag höchstens auf diesen Anteil des Kalorienziels bringen. */
const MAX_DAY_KCAL_WITH_EXTRAS = 1.15;

const WEIGHTS = {
  perishableLeftover: 10, // pro übrig gebliebener (Anteil einer) Packung
  durableLeftover: 0.2,
  unusedPantry: 15,
  kcalDeviation: 8, // pro 100 % Abweichung pro Tag
  spoilage: 50,
  repeat: 40,
  sameAsYesterday: 1.5,
  price: 0.05, // pro Euro
};

interface Slot {
  day: number;
  mealType: MealType;
  candidates: number[]; // Indizes in recipes
}

interface Evaluation {
  cost: number;
  portions: number[]; // pro Tag
  needed: Map<string, number>;
  lastUseDay: Map<string, number>;
}

export interface PlannerInput {
  request: PlanRequest;
  recipes: Recipe[];
  ingredients: Map<string, Ingredient>;
}

export function planMeals({ request, recipes, ingredients }: PlannerInput): MealPlan {
  const usable = recipes.filter((r) => !r.tags.some((t) => request.excludeTags.includes(t)));
  const recipeKcal = usable.map((r) => recipeNutrients(r, ingredients).kcal);
  const slots = buildSlots(request, usable);
  const pantry = aggregatePantry(request.pantry);
  const rng = mulberry32(request.seed ?? 42);

  const evaluate = (assignment: number[]): Evaluation =>
    evaluateAssignment(assignment, slots, usable, recipeKcal, ingredients, pantry, request);

  let best: number[] = [];
  let bestEval: Evaluation | undefined;
  const restarts = 6;
  const iterations = 1500 + slots.length * 150;

  for (let restart = 0; restart < restarts; restart++) {
    let current = slots.map((s) => pick(s.candidates, rng));
    let currentEval = evaluate(current);
    for (let i = 0; i < iterations; i++) {
      const next = [...current];
      if (rng() < 0.7) {
        const slotIndex = Math.floor(rng() * slots.length);
        next[slotIndex] = pick(slots[slotIndex]!.candidates, rng);
      } else {
        // Tausch zweier Mahlzeiten gleichen Typs: hilft, Verderbliches nach vorne zu ziehen.
        const a = Math.floor(rng() * slots.length);
        const b = Math.floor(rng() * slots.length);
        if (slots[a]!.mealType !== slots[b]!.mealType) continue;
        [next[a], next[b]] = [next[b]!, next[a]!];
      }
      const nextEval = evaluate(next);
      // Gleich gute Lösungen akzeptieren, um Plateaus zu verlassen.
      if (nextEval.cost <= currentEval.cost) {
        current = next;
        currentEval = nextEval;
      }
    }
    if (!bestEval || currentEval.cost < bestEval.cost) {
      best = current;
      bestEval = currentEval;
    }
  }

  return buildPlan(best, bestEval!, slots, usable, ingredients, pantry, request);
}

function buildSlots(request: PlanRequest, recipes: Recipe[]): Slot[] {
  const slots: Slot[] = [];
  for (let day = 0; day < request.days; day++) {
    for (const mealType of request.mealTypes) {
      const candidates = recipes.flatMap((r, i) => (r.mealTypes.includes(mealType) ? [i] : []));
      if (candidates.length === 0) {
        throw new Error(`Kein passendes Rezept für Mahlzeit "${mealType}" mit den gewählten Filtern`);
      }
      slots.push({ day, mealType, candidates });
    }
  }
  return slots;
}

function evaluateAssignment(
  assignment: number[],
  slots: Slot[],
  recipes: Recipe[],
  recipeKcal: number[],
  ingredients: Map<string, Ingredient>,
  pantry: Map<string, number>,
  request: PlanRequest,
): Evaluation {
  let cost = 0;

  // Portionsgröße pro Tag so wählen, dass der Kalorienbedarf getroffen wird.
  const dayKcal = new Array<number>(request.days).fill(0);
  assignment.forEach((r, i) => (dayKcal[slots[i]!.day]! += recipeKcal[r]!));
  const portions = dayKcal.map((kcal) => {
    const factor = clamp(request.kcalPerPersonPerDay / Math.max(kcal, 1), MIN_PORTION, MAX_PORTION);
    return Math.round(factor * 20) / 20;
  });
  dayKcal.forEach((kcal, day) => {
    const deviation = Math.abs(kcal * portions[day]! - request.kcalPerPersonPerDay) / request.kcalPerPersonPerDay;
    cost += WEIGHTS.kcalDeviation * deviation;
  });

  const needed = new Map<string, number>();
  const lastUseDay = new Map<string, number>();
  const counts = new Map<number, number>();
  assignment.forEach((r, i) => {
    const slot = slots[i]!;
    counts.set(r, (counts.get(r) ?? 0) + 1);
    for (const ri of recipes[r]!.ingredients) {
      needed.set(ri.ingredientId, (needed.get(ri.ingredientId) ?? 0) + ri.amount * request.people * portions[slot.day]!);
      lastUseDay.set(ri.ingredientId, Math.max(lastUseDay.get(ri.ingredientId) ?? 0, slot.day));
    }
  });

  for (const count of counts.values()) {
    if (count > request.maxRepeats) cost += WEIGHTS.repeat * (count - request.maxRepeats);
  }
  // Nicht zweimal hintereinander dasselbe zur selben Mahlzeit.
  const perDay = request.mealTypes.length;
  for (let i = perDay; i < assignment.length; i++) {
    if (assignment[i] === assignment[i - perDay]) cost += WEIGHTS.sameAsYesterday;
  }

  for (const [id, amount] of needed) {
    const ingredient = ingredients.get(id)!;
    const fromPantry = Math.min(pantry.get(id) ?? 0, amount);
    const toBuy = amount - fromPantry;
    const packs = Math.ceil(toBuy / ingredient.packSize - 1e-9);
    const leftover = packs * ingredient.packSize - toBuy;
    const leftoverPacks = leftover / ingredient.packSize;
    const durable = ingredient.shelfLifeDays >= DURABLE_DAYS;
    cost += (durable ? WEIGHTS.durableLeftover : WEIGHTS.perishableLeftover) * leftoverPacks;
    cost += WEIGHTS.price * packs * ingredient.packPrice;
    // Eingekauft wird an Tag 0; Verderbliches darf nur bis zum Ablauf eingeplant werden.
    if (packs > 0 && lastUseDay.get(id)! >= ingredient.shelfLifeDays) cost += WEIGHTS.spoilage;
  }

  for (const [id, amount] of pantry) {
    const ingredient = ingredients.get(id);
    if (!ingredient || ingredient.shelfLifeDays >= DURABLE_DAYS) continue;
    const unused = Math.max(0, amount - (needed.get(id) ?? 0));
    cost += WEIGHTS.unusedPantry * (unused / ingredient.packSize);
  }

  return { cost, portions, needed, lastUseDay };
}

function buildPlan(
  assignment: number[],
  evaluation: Evaluation,
  slots: Slot[],
  recipes: Recipe[],
  ingredients: Map<string, Ingredient>,
  pantry: Map<string, number>,
  request: PlanRequest,
): MealPlan {
  const meals = assignment.map((r, i) => {
    const slot = slots[i]!;
    const recipe = recipes[r]!;
    const portion = evaluation.portions[slot.day]!;
    const n = recipeNutrients(recipe, ingredients);
    return {
      day: slot.day,
      mealType: slot.mealType,
      recipeId: recipe.id,
      recipeName: recipe.name,
      portions: portion * request.people,
      nutrientsPerPortion: {
        kcal: n.kcal * portion,
        protein: n.protein * portion,
        carbs: n.carbs * portion,
        fat: n.fat * portion,
      },
      extras: [] as PlannedMeal["extras"],
    };
  });

  const shoppingList: ShoppingItem[] = [];
  const spoilageWarnings: string[] = [];
  let boughtPerishable = 0;
  let leftoverPerishable = 0;
  for (const [id, amount] of [...evaluation.needed].sort(([a], [b]) => a.localeCompare(b))) {
    const ingredient = ingredients.get(id)!;
    const fromPantry = Math.min(pantry.get(id) ?? 0, amount);
    const toBuy = amount - fromPantry;
    const packs = Math.ceil(toBuy / ingredient.packSize - 1e-9);
    let leftover = packs * ingredient.packSize - toBuy;
    const durable = ingredient.shelfLifeDays >= DURABLE_DAYS;
    if (!durable && leftover > 0) {
      leftover -= absorbLeftover(ingredient, leftover, meals, recipes, assignment, request);
    }
    if (!durable) {
      boughtPerishable += packs * ingredient.packSize;
      leftoverPerishable += leftover;
    }
    if (packs > 0 && evaluation.lastUseDay.get(id)! >= ingredient.shelfLifeDays) {
      spoilageWarnings.push(
        `${ingredient.name} ist nur ${ingredient.shelfLifeDays} Tage haltbar, wird aber an Tag ${evaluation.lastUseDay.get(id)! + 1} gebraucht – zweite Lieferung einplanen.`,
      );
    }
    shoppingList.push({
      ingredientId: id,
      name: ingredient.name,
      unit: ingredient.unit,
      needed: round1(amount),
      fromPantry: round1(fromPantry),
      packs,
      packSize: ingredient.packSize,
      price: round2(packs * ingredient.packPrice),
      leftover: round1(leftover),
      durable,
    });
  }

  const unusedPantry: PantryItem[] = [];
  for (const [id, amount] of pantry) {
    let unused = amount - (evaluation.needed.get(id) ?? 0);
    const ingredient = ingredients.get(id);
    if (ingredient && ingredient.shelfLifeDays < DURABLE_DAYS && unused > 0) {
      unused -= absorbLeftover(ingredient, unused, meals, recipes, assignment, request);
    }
    if (unused > 1e-6) unusedPantry.push({ ingredientId: id, amount: round1(unused) });
  }

  const dailyKcalPerPerson = new Array<number>(request.days).fill(0);
  for (const meal of meals) {
    dailyKcalPerPerson[meal.day]! += meal.nutrientsPerPortion.kcal;
    meal.nutrientsPerPortion = roundNutrients(meal.nutrientsPerPortion);
  }

  return {
    meals,
    shoppingList,
    totalPrice: round2(shoppingList.reduce((s, i) => s + i.price, 0)),
    wasteRatio: boughtPerishable > 0 ? Math.round((leftoverPerishable / boughtPerishable) * 1000) / 1000 : 0,
    unusedPantry,
    dailyKcalPerPerson: dailyKcalPerPerson.map(Math.round),
    spoilageWarnings,
  };
}

/**
 * Verteilt den Rest einer angebrochenen Packung auf Gerichte, die die Zutat ohnehin
 * enthalten – von hinten nach vorne, damit nichts nach Ablauf eingeplant wird.
 * Gibt die verwertete Menge zurück.
 */
function absorbLeftover(
  ingredient: Ingredient,
  leftover: number,
  meals: PlannedMeal[],
  recipes: Recipe[],
  assignment: number[],
  request: PlanRequest,
): number {
  const kcalLimit = request.kcalPerPersonPerDay * MAX_DAY_KCAL_WITH_EXTRAS;
  const kcalPerUnit = nutrientsFor(ingredient, 1).kcal / request.people;
  let remaining = leftover;
  for (let i = meals.length - 1; i >= 0 && remaining > 1e-9; i--) {
    const meal = meals[i]!;
    if (meal.day >= ingredient.shelfLifeDays) continue;
    const base = recipes[assignment[i]!]!.ingredients.find((ri) => ri.ingredientId === ingredient.id);
    if (!base) continue;
    const dayKcal = meals.reduce((sum, m) => (m.day === meal.day ? sum + m.nutrientsPerPortion.kcal : sum), 0);
    const kcalRoom = Math.max(0, kcalLimit - dayKcal);
    const capacity = Math.min(
      base.amount * meal.portions * MAX_EXTRA_SHARE,
      kcalPerUnit > 0 ? kcalRoom / kcalPerUnit : Infinity,
    );
    const extra = Math.min(capacity, remaining);
    if (extra <= 1e-9) continue;
    remaining -= extra;
    meal.extras.push({ ingredientId: ingredient.id, name: ingredient.name, unit: ingredient.unit, amount: round1(extra) });
    meal.nutrientsPerPortion = addNutrients(meal.nutrientsPerPortion, nutrientsFor(ingredient, extra / request.people));
  }
  return leftover - remaining;
}

function aggregatePantry(items: PantryItem[]): Map<string, number> {
  const pantry = new Map<string, number>();
  for (const item of items) pantry.set(item.ingredientId, (pantry.get(item.ingredientId) ?? 0) + item.amount);
  return pantry;
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Kleiner deterministischer Zufallszahlengenerator. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
