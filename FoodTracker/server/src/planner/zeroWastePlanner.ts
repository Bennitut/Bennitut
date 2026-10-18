import type {
  Diet,
  Ingredient,
  IngredientDiet,
  MealPlan,
  MealType,
  PantryItem,
  PlanRequest,
  PlannedMeal,
  Recipe,
  ShoppingItem,
  SpoilageWarning,
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
 *  5. genug Abwechslung bleibt,
 *  6. Lieblingsrezepte bevorzugt und vom Nutzer fixierte Gerichte beibehalten werden.
 *
 * Das ist ein kombinatorisches Problem (Rezepte teilen sich Packungen). Gelöst wird es
 * per lokaler Suche mit mehreren Neustarts und festem Seed, damit Ergebnisse reproduzierbar sind.
 */

/** Ab dieser Haltbarkeit gilt ein Rest als Vorrat, der praktisch nicht verdirbt. */
const DURABLE_DAYS = 60;
/** Reste, die nach Planende noch so viele Tage halten, gehen in den Vorrat für den nächsten Plan. */
const CARRY_OVER_DAYS = 7;
const MIN_PORTION = 0.7;
const MAX_PORTION = 1.5;
/** Resteverwertung darf die Menge einer Zutat in einem Gericht um höchstens so viel erhöhen. */
const MAX_EXTRA_SHARE = 0.5;
/** …und den Tag höchstens auf diesen Anteil des Kalorienziels bringen. */
const MAX_DAY_KCAL_WITH_EXTRAS = 1.15;

const START_TEMPERATURE = 3;
const END_TEMPERATURE = 0.02;

const WEIGHTS = {
  perishableLeftover: 10, // pro übrig gebliebener (Anteil einer) Packung
  carryOverLeftover: 1.5, // hält noch bis in den nächsten Plan
  durableLeftover: 0.2,
  unusedPantry: 15,
  kcalDeviation: 8, // pro 100 % Abweichung pro Tag
  spoilage: 50,
  repeat: 40,
  sameAsYesterday: 1.5,
  price: 0.05, // pro Euro
  preferredCuisine: 1.5, // Bonus pro Mahlzeit aus einer bevorzugten Küche
  recent: 3, // Malus pro Mahlzeit, die schon im Vorplan dran war
  protein: 4, // Bonus pro Mahlzeit, gewichtet nach Eiweißanteil (nur bei Eiweiß-Fokus)
  favoriteFirst: 12, // Bonus, wenn ein Lieblingsrezept mindestens einmal vorkommt
  favoriteRepeat: 2, // kleiner Bonus für jede weitere Wiederholung
};

const ALLOWED_DIETS: Record<Diet, IngredientDiet[]> = {
  vegan: ["vegan"],
  vegetarisch: ["vegan", "vegetarisch"],
  pescetarisch: ["vegan", "vegetarisch", "fisch"],
  alles: ["vegan", "vegetarisch", "fisch", "fleisch"],
};

/** Fehler mit Code, damit die App ihn übersetzen kann. */
export class PlanError extends Error {
  constructor(
    readonly code: "no_recipe_for_meal" | "unknown_locked_recipe" | "unknown_ingredient",
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}

const keepsDays = (ingredient: Ingredient) => ingredient.openedShelfLifeDays ?? ingredient.shelfLifeDays;

/**
 * Ob ein Rest nach Ende eines Plans über `planDays` Tage noch verwendbar ist und in den Vorrat
 * wandert (statt Verschwendung). Geöffnete Dosen etc. verderben schnell und zählen nicht dazu.
 */
export function keepsAfterPlan(ingredient: Ingredient, planDays: number): boolean {
  return keepsDays(ingredient) >= planDays + CARRY_OVER_DAYS;
}

function leftoverWeight(ingredient: Ingredient, planDays: number): number {
  if (keepsDays(ingredient) >= DURABLE_DAYS) return WEIGHTS.durableLeftover;
  return keepsAfterPlan(ingredient, planDays) ? WEIGHTS.carryOverLeftover : WEIGHTS.perishableLeftover;
}

/** Prüft, ob ein Rezept zu Ernährungsform, Allergien, Abneigungen und Zeitbudget passt. */
export function matchesPreferences(
  recipe: Recipe,
  request: Pick<PlanRequest, "diet" | "allergens" | "excludeIngredients" | "maxCookMinutes" | "rules">,
  ingredients: Map<string, Ingredient>,
): boolean {
  if (request.maxCookMinutes > 0 && recipe.cookMinutes > request.maxCookMinutes) return false;
  const allowed = ALLOWED_DIETS[request.diet];
  const rules = request.rules ?? [];
  const used = recipe.ingredients.map((ri) => ingredients.get(ri.ingredientId));
  if (used.some((i) => i === undefined)) return false;
  const list = used as Ingredient[];
  if (rules.length > 0 && list.some((i) => i.pork)) return false;
  if (rules.includes("koscher")) {
    // Vereinfacht: keine Krebstiere, Fleisch nicht zusammen mit Milchprodukten.
    if (list.some((i) => i.allergens.includes("krebstiere"))) return false;
    if (list.some((i) => i.diet === "fleisch") && list.some((i) => i.allergens.includes("laktose"))) return false;
  }
  return list.every(
    (ingredient) =>
      allowed.includes(ingredient.diet) &&
      !ingredient.allergens.some((a) => request.allergens.includes(a)) &&
      !request.excludeIngredients.includes(ingredient.id),
  );
}

/** Strengste Ernährungsform, zu der ein Rezept passt. */
export function recipeDiet(recipe: Recipe, ingredients: Map<string, Ingredient>): Diet {
  const diets = new Set(recipe.ingredients.map((ri) => ingredients.get(ri.ingredientId)?.diet));
  if (diets.has("fleisch")) return "alles";
  if (diets.has("fisch")) return "pescetarisch";
  if (diets.has("vegetarisch")) return "vegetarisch";
  return "vegan";
}

interface Slot {
  day: number;
  mealType: MealType;
  candidates: number[]; // Indizes in recipes
  locked: boolean;
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
  // Eigene Rezepte überschreiben gleichnamige IDs; fixierte Gerichte dürfen auch außerhalb der Filter liegen.
  const byId = new Map(recipes.map((r) => [r.id, r]));
  for (const recipe of byId.values()) {
    const unknown = recipe.ingredients.find((ri) => !ingredients.has(ri.ingredientId));
    if (unknown) throw new PlanError("unknown_ingredient", `${recipe.id}/${unknown.ingredientId}`);
  }
  const lockedIds = new Set(request.locked.map((l) => l.recipeId));
  const usable = [...byId.values()].filter((r) => lockedIds.has(r.id) || matchesPreferences(r, request, ingredients));
  const recipeKcal = usable.map((r) => recipeNutrients(r, ingredients).kcal);
  const favorites = new Set(request.favoriteRecipeIds);
  const isFavorite = usable.map((r) => favorites.has(r.id));
  // Pro Rezept vorab: Bonus/Malus für Küche, Wiederholung aus dem Vorplan und Eiweißanteil.
  const preferred = new Set(request.preferredTags ?? []);
  const recent = new Set(request.recentRecipeIds ?? []);
  const slotBonus = usable.map((r, i) => {
    let bonus = r.tags.some((t) => preferred.has(t)) ? WEIGHTS.preferredCuisine : 0;
    if (recent.has(r.id)) bonus -= WEIGHTS.recent;
    if (request.proteinFocus) {
      const n = recipeNutrients(r, ingredients);
      bonus += WEIGHTS.protein * Math.min(1, (n.protein * 4) / Math.max(recipeKcal[i]!, 1) / 0.35);
    }
    return bonus;
  });
  const slots = buildSlots(request, usable, ingredients);
  const pantry = aggregatePantry(request.pantry);
  const rng = mulberry32(request.seed ?? 42);

  const evaluate = (assignment: number[]): Evaluation =>
    evaluateAssignment(assignment, slots, usable, recipeKcal, isFavorite, slotBonus, ingredients, pantry, request);

  let best: number[] = slots.map((s) => s.candidates[0]!);
  let bestEval: Evaluation | undefined = evaluate(best);
  const effort = request.effort ?? 1;
  const restarts = effort >= 1 ? 4 : 2;
  const iterations = Math.round((2000 + slots.length * 250) * Math.min(effort * 2, 1));

  for (let restart = 0; restart < restarts; restart++) {
    let current = slots.map((s) => pick(s.candidates, rng));
    let currentEval = evaluate(current);
    for (let i = 0; i < iterations; i++) {
      const next = [...current];
      if (rng() < 0.7) {
        const slotIndex = Math.floor(rng() * slots.length);
        if (slots[slotIndex]!.locked) continue;
        next[slotIndex] = pick(slots[slotIndex]!.candidates, rng);
      } else {
        // Tausch zweier Mahlzeiten gleichen Typs: hilft, Verderbliches nach vorne zu ziehen.
        const a = Math.floor(rng() * slots.length);
        const b = Math.floor(rng() * slots.length);
        if (slots[a]!.mealType !== slots[b]!.mealType || slots[a]!.locked || slots[b]!.locked) continue;
        if (!slots[a]!.candidates.includes(next[b]!) || !slots[b]!.candidates.includes(next[a]!)) continue;
        [next[a], next[b]] = [next[b]!, next[a]!];
      }
      const nextEval = evaluate(next);
      // Simulated Annealing: anfangs auch schlechtere Pläne zulassen, um lokale Optima
      // (z. B. eine angebrochene Milchpackung für ein einziges Frühstück) zu verlassen.
      const temperature = START_TEMPERATURE * Math.pow(END_TEMPERATURE / START_TEMPERATURE, i / iterations);
      const delta = nextEval.cost - currentEval.cost;
      if (delta <= 0 || rng() < Math.exp(-delta / temperature)) {
        current = next;
        currentEval = nextEval;
        if (!bestEval || currentEval.cost < bestEval.cost) {
          best = current;
          bestEval = currentEval;
        }
      }
    }
  }

  return buildPlan(best, bestEval!, slots, usable, ingredients, pantry, request);
}

function buildSlots(request: PlanRequest, recipes: Recipe[], ingredients: Map<string, Ingredient>): Slot[] {
  const slots: Slot[] = [];
  for (let day = 0; day < request.days; day++) {
    for (const mealType of request.mealTypes) {
      const lock = request.locked.find((l) => l.day === day && l.mealType === mealType);
      if (lock) {
        const index = recipes.findIndex((r) => r.id === lock.recipeId);
        if (index < 0) throw new PlanError("unknown_locked_recipe", lock.recipeId);
        slots.push({ day, mealType, candidates: [index], locked: true });
        continue;
      }
      const candidates = recipes.flatMap((r, i) =>
        r.mealTypes.includes(mealType) && matchesPreferences(r, request, ingredients) ? [i] : [],
      );
      if (candidates.length === 0) throw new PlanError("no_recipe_for_meal", mealType);
      slots.push({ day, mealType, candidates, locked: false });
    }
  }
  return slots;
}

function evaluateAssignment(
  assignment: number[],
  slots: Slot[],
  recipes: Recipe[],
  recipeKcal: number[],
  isFavorite: boolean[],
  slotBonus: number[],
  ingredients: Map<string, Ingredient>,
  pantry: Map<string, number>,
  request: PlanRequest,
): Evaluation {
  let cost = 0;
  const priceWeight = WEIGHTS.price * (request.priceFocus ?? 1);

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
    cost -= slotBonus[r]!;
    for (const ri of recipes[r]!.ingredients) {
      needed.set(ri.ingredientId, (needed.get(ri.ingredientId) ?? 0) + ri.amount * request.people * portions[slot.day]!);
      lastUseDay.set(ri.ingredientId, Math.max(lastUseDay.get(ri.ingredientId) ?? 0, slot.day));
    }
  });

  for (const [r, count] of counts) {
    if (count > request.maxRepeats) cost += WEIGHTS.repeat * (count - request.maxRepeats);
    if (isFavorite[r]) cost -= WEIGHTS.favoriteFirst + WEIGHTS.favoriteRepeat * (Math.min(count, request.maxRepeats) - 1);
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
    cost += leftoverWeight(ingredient, request.days) * (leftover / ingredient.packSize);
    cost += priceWeight * packs * ingredient.packPrice;
    // Eingekauft wird an Tag 0; Verderbliches darf nur bis zum Ablauf eingeplant werden.
    if (packs > 0 && lastUseDay.get(id)! >= ingredient.shelfLifeDays) cost += WEIGHTS.spoilage;
  }

  for (const [id, amount] of pantry) {
    const ingredient = ingredients.get(id);
    if (!ingredient || keepsAfterPlan(ingredient, request.days)) continue;
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
      locked: slot.locked,
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
  const spoilageWarnings: SpoilageWarning[] = [];
  let boughtPerishable = 0;
  let leftoverPerishable = 0;
  for (const [id, amount] of [...evaluation.needed].sort(([a], [b]) => a.localeCompare(b))) {
    const ingredient = ingredients.get(id)!;
    const fromPantry = Math.min(pantry.get(id) ?? 0, amount);
    const toBuy = amount - fromPantry;
    const packs = Math.ceil(toBuy / ingredient.packSize - 1e-9);
    let leftover = packs * ingredient.packSize - toBuy;
    const durable = keepsAfterPlan(ingredient, request.days);
    if (!durable && leftover > 0) {
      leftover -= absorbLeftover(ingredient, leftover, meals, recipes, assignment, request);
    }
    if (!durable) {
      boughtPerishable += packs * ingredient.packSize;
      leftoverPerishable += leftover;
    }
    if (packs > 0 && evaluation.lastUseDay.get(id)! >= ingredient.shelfLifeDays) {
      spoilageWarnings.push({ ingredientId: id, shelfLifeDays: ingredient.shelfLifeDays, day: evaluation.lastUseDay.get(id)! });
    }
    shoppingList.push({
      ingredientId: id,
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
    if (ingredient && !keepsAfterPlan(ingredient, request.days) && unused > 0) {
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
    // Auf eine Nachkommastelle gerundet, damit keine „0 Stk.“-Hinweise entstehen.
    const extra = Math.floor(Math.min(capacity, remaining) * 10) / 10;
    if (extra <= 0) continue;
    remaining -= extra;
    meal.extras.push({ ingredientId: ingredient.id, unit: ingredient.unit, amount: extra });
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
