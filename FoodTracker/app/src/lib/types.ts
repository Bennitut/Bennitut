// Domain-Typen des Backends; reine Typ-Importe, im Bundle entfällt der Import.
export type {
  Allergen,
  Diet,
  Ingredient,
  LockedMeal,
  MealPlan,
  MealType,
  Nutrients,
  PantryItem,
  PlannedMeal,
  Recipe,
  RecipeText,
  ShoppingItem,
} from "../../../server/src/types";
import type { Allergen, Diet, MealType, Nutrients, Recipe } from "../../../server/src/types";
import type { Region, UILanguage } from "../i18n";

export const ALLERGENS: Allergen[] = ["gluten", "laktose", "ei", "nuesse", "erdnuss", "soja", "fisch", "krebstiere", "sellerie", "sesam"];
export const DIETS: Diet[] = ["alles", "pescetarisch", "vegetarisch", "vegan"];
export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
  nutrients: Nutrients;
  source: "foto" | "plan" | "manuell";
}

export interface MealAnalysis {
  description: string;
  items: { name: string; estimatedGrams: number; nutrients: Nutrients }[];
  total: Nutrients;
  confidence: "hoch" | "mittel" | "niedrig";
  notes: string;
}

export interface ReceiptAnalysis {
  store: string | null;
  date: string | null;
  currency: string | null;
  items: {
    rawText: string;
    name: string;
    isFood: boolean;
    ingredientId: string | null;
    quantity: number;
    price: number | null;
  }[];
  total: number | null;
}

export interface DeliveryProviderInfo {
  id: string;
  name: string;
  description: string;
}

export interface Order {
  id: string;
  providerId: string;
  status: "warenkorb" | "bestellt" | "geliefert";
  lines: { ingredientId: string; packs: number; packSize: number; unit: string }[];
  checkoutUrl: string | null;
  createdAt: string;
}

export interface CommunityRecipe {
  id: string;
  recipe: Recipe;
  authorName: string;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
  mine: boolean;
}

export interface Settings {
  language: UILanguage;
  region: Region;
  displayName: string;
  kcalPerPersonPerDay: number;
  people: number;
  days: number;
  mealTypes: MealType[];
  diet: Diet;
  allergens: Allergen[];
  excludeIngredients: string[];
  maxCookMinutes: number;
  preferences: string;
}
