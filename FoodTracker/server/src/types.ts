/** Nährwerte, jeweils bezogen auf die angegebene Menge. */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type Unit = "g" | "ml" | "stk";

export interface Ingredient {
  id: string;
  name: string;
  unit: Unit;
  /** Nährwerte pro 100 g / 100 ml bzw. pro Stück. */
  nutrients: Nutrients;
  /** Kleinste kaufbare Packungsgröße in `unit`. */
  packSize: number;
  /** Preis pro Packung in Euro. */
  packPrice: number;
  /** Haltbarkeit nach dem Einkauf in Tagen. */
  shelfLifeDays: number;
}

export interface RecipeIngredient {
  ingredientId: string;
  /** Menge pro Portion in der Einheit der Zutat. */
  amount: number;
}

export type MealType = "breakfast" | "lunch" | "dinner";

export interface Recipe {
  id: string;
  name: string;
  mealTypes: MealType[];
  ingredients: RecipeIngredient[];
  tags: string[];
}

export interface PantryItem {
  ingredientId: string;
  amount: number;
}

export interface PlanRequest {
  days: number;
  people: number;
  kcalPerPersonPerDay: number;
  mealTypes: MealType[];
  /** Vorräte, die zuerst aufgebraucht werden sollen. */
  pantry: PantryItem[];
  /** Tags, die ein Rezept nicht haben darf (z. B. "fleisch"). */
  excludeTags: string[];
  /** Gleiches Rezept höchstens so oft im Plan. */
  maxRepeats: number;
  seed?: number;
}

export interface PlannedMeal {
  day: number;
  mealType: MealType;
  recipeId: string;
  recipeName: string;
  portions: number;
  nutrientsPerPortion: Nutrients;
  /** Resteverwertung: zusätzliche Mengen, damit angebrochene Packungen leer werden. */
  extras: { ingredientId: string; name: string; unit: Unit; amount: number }[];
}

export interface ShoppingItem {
  ingredientId: string;
  name: string;
  unit: Unit;
  needed: number;
  fromPantry: number;
  packs: number;
  packSize: number;
  price: number;
  /** Menge, die nach dem Plan übrig bleibt. */
  leftover: number;
  /** Lange haltbar: Rest wandert in den Vorrat statt in den Müll. */
  durable: boolean;
}

export interface MealPlan {
  meals: PlannedMeal[];
  shoppingList: ShoppingItem[];
  totalPrice: number;
  /** Anteil der gekauften verderblichen Menge, der übrig bleibt (0 = keine Reste). */
  wasteRatio: number;
  /** Vorräte, die der Plan nicht aufbraucht. */
  unusedPantry: PantryItem[];
  dailyKcalPerPerson: number[];
  /** Zutaten, die nach Ablauf der Haltbarkeit eingeplant wurden. */
  spoilageWarnings: string[];
}
