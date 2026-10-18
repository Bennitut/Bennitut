/** Nährwerte, jeweils bezogen auf die angegebene Menge. */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type Unit = "g" | "ml" | "stk";

/** Sprachen mit fertiger Übersetzung. Weitere Sprachen fallen auf Englisch zurück. */
export const LANGUAGES = ["de", "en", "fr", "it", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * Text in mehreren Sprachen. `de` ist Pflicht; "de-AT" und "de-CH" enthalten
 * regionale Begriffe (z. B. Erdäpfel, Rüebli), wo sie sich vom Bundesdeutschen unterscheiden.
 */
export type LocalizedText = { de: string } & Partial<Record<Language | "de-AT" | "de-CH", string>>;

export type IngredientCategory =
  | "obst"
  | "gemuese"
  | "getreide"
  | "huelsenfruechte"
  | "milch_ei"
  | "fleisch"
  | "fisch"
  | "pflanzlich"
  | "nuesse_samen"
  | "vorrat";

/** Herkunft einer Zutat: bestimmt, für welche Ernährungsform sie geeignet ist. */
export type IngredientDiet = "vegan" | "vegetarisch" | "fisch" | "fleisch";
export type Diet = "alles" | "pescetarisch" | "vegetarisch" | "vegan";

/** Die wichtigsten der 14 EU-Hauptallergene. */
export const ALLERGENS = ["gluten", "laktose", "ei", "nuesse", "erdnuss", "soja", "fisch", "krebstiere", "sellerie", "sesam"] as const;
export type Allergen = (typeof ALLERGENS)[number];

export interface Ingredient {
  id: string;
  name: LocalizedText;
  category: IngredientCategory;
  unit: Unit;
  /** Nährwerte pro 100 g / 100 ml bzw. pro Stück. */
  nutrients: Nutrients;
  /** Kleinste kaufbare Packungsgröße in `unit`. */
  packSize: number;
  /** Richtpreis pro Packung in Euro (Deutschland). */
  packPrice: number;
  /** Haltbarkeit nach dem Einkauf in Tagen. */
  shelfLifeDays: number;
  /** Haltbarkeit nach dem Öffnen, falls kürzer (Dosen, Kokosmilch …). */
  openedShelfLifeDays?: number;
  diet: IngredientDiet;
  allergens: Allergen[];
  /** Schweinefleisch oder daraus hergestellt (für halal/koscher). */
  pork?: boolean;
}

export interface RecipeIngredient {
  ingredientId: string;
  /** Menge pro Portion in der Einheit der Zutat. */
  amount: number;
}

export type MealType = "breakfast" | "lunch" | "dinner";

export interface RecipeText {
  name: string;
  steps?: string[];
  /** Zutaten außerhalb des Katalogs, z. B. Gewürze („1 TL Kreuzkümmel“). */
  otherIngredients?: string[];
}

/** Küchenrichtung eines Rezepts; steht in `tags` und dient für Vorlieben im Plan. */
export const CUISINES = ["dach", "italienisch", "mediterran", "orientalisch", "indisch", "asiatisch", "mexikanisch", "international"] as const;
export type Cuisine = (typeof CUISINES)[number];

/** Religiöse Speiseregeln, die der Planer berücksichtigt. */
export const FOOD_RULES = ["halal", "koscher"] as const;
export type FoodRule = (typeof FOOD_RULES)[number];

export interface RecipeVideo {
  platform: "youtube" | "tiktok" | "instagram" | "web";
  url: string;
  title?: string;
  author?: string;
}

export interface RecipeMedia {
  /** Foto des Gerichts: URL oder data-URI (eigenes Foto). */
  image?: { uri: string; credit?: string };
  videos?: RecipeVideo[];
}

export type RecipeSource =
  | { kind: "katalog" }
  | { kind: "eigen" }
  | { kind: "ki" }
  | { kind: "import"; url?: string; platform?: "instagram" | "tiktok" | "video" }
  | { kind: "community"; communityId: string; author: string };

export interface Recipe {
  id: string;
  /** Sprache von `name`, `steps` und `otherIngredients`. */
  language: string;
  name: string;
  steps: string[];
  otherIngredients: string[];
  /** Übersetzungen, z. B. von Claude erzeugt. */
  translations?: Partial<Record<string, RecipeText>>;
  mealTypes: MealType[];
  ingredients: RecipeIngredient[];
  cookMinutes: number;
  tags: string[];
  source: RecipeSource;
  media?: RecipeMedia;
}

export interface PantryItem {
  ingredientId: string;
  amount: number;
}

export interface LockedMeal {
  day: number;
  mealType: MealType;
  recipeId: string;
}

export interface PlanRequest {
  days: number;
  people: number;
  kcalPerPersonPerDay: number;
  mealTypes: MealType[];
  /** Vorräte, die zuerst aufgebraucht werden sollen. */
  pantry: PantryItem[];
  diet: Diet;
  /** Allergene, die kein Rezept enthalten darf. */
  allergens: Allergen[];
  /** Zutaten, die man nicht mag. */
  excludeIngredients: string[];
  /** Nur Rezepte mit höchstens so viel Zubereitungszeit (0 = egal). */
  maxCookMinutes: number;
  /** Lieblingsrezepte, die bevorzugt eingeplant werden. */
  favoriteRecipeIds: string[];
  /** Vom Nutzer festgelegte Gerichte; der Planer plant den Rest drumherum. */
  locked: LockedMeal[];
  /** Gleiches Rezept höchstens so oft im Plan. */
  maxRepeats: number;
  /** Religiöse Speiseregeln (z. B. kein Schweinefleisch). */
  rules?: FoodRule[];
  /** Bevorzugte Küchen (Rezept-Tags), werden öfter eingeplant. */
  preferredTags?: string[];
  /** Wie stark der Preis zählt: 0 = egal, 1 = normal, 3 = sparsam. */
  priceFocus?: number;
  /** Eiweißreiche Gerichte bevorzugen (z. B. Muskelaufbau). */
  proteinFocus?: boolean;
  /** Rezepte, die kürzlich dran waren und seltener vorkommen sollen. */
  recentRecipeIds?: string[];
  /** Rechenaufwand der Suche (1 = Standard); kleiner ist schneller, z. B. auf dem Handy. */
  effort?: number;
  seed?: number;
}

export interface PlannedMeal {
  day: number;
  mealType: MealType;
  recipeId: string;
  recipeName: string;
  portions: number;
  nutrientsPerPortion: Nutrients;
  locked: boolean;
  /** Resteverwertung: zusätzliche Mengen, damit angebrochene Packungen leer werden. */
  extras: { ingredientId: string; unit: Unit; amount: number }[];
}

export interface ShoppingItem {
  ingredientId: string;
  unit: Unit;
  needed: number;
  fromPantry: number;
  packs: number;
  packSize: number;
  /** Richtpreis in Euro; die App rechnet in die Landeswährung um. */
  price: number;
  /** Menge, die nach dem Plan übrig bleibt. */
  leftover: number;
  /** Rest hält über das Planende hinaus und wandert in den Vorrat für den nächsten Plan. */
  durable: boolean;
}

export interface SpoilageWarning {
  ingredientId: string;
  shelfLifeDays: number;
  day: number;
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
  spoilageWarnings: SpoilageWarning[];
}

export interface WeekPlan extends MealPlan {
  /** Erster Tag dieser Woche im Monatsplan (0 = Starttag). */
  startDay: number;
  days: number;
  /** Was nach dieser Woche voraussichtlich im Vorrat bleibt (Startvorrat der nächsten Woche). */
  endPantry: PantryItem[];
}

/** Ein Monat, geplant und eingekauft in Wochenblöcken, damit Frisches frisch bleibt. */
export interface MonthPlan {
  /** Datum des ersten Tages (YYYY-MM-DD). */
  startDate: string;
  weeks: WeekPlan[];
}
