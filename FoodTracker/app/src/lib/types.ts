// Domain-Typen des Backends; reine Typ-Importe, im Bundle entfällt der Import.
export type {
  Allergen,
  Cuisine,
  Diet,
  FoodRule,
  Ingredient,
  LockedMeal,
  MealPlan,
  MealType,
  MonthPlan,
  Nutrients,
  PantryItem,
  PlannedMeal,
  Recipe,
  RecipeMedia,
  RecipeText,
  RecipeVideo,
  ShoppingItem,
  WeekPlan,
} from "../../../server/src/types";
import type { Allergen, Cuisine, Diet, FoodRule, MealType, Nutrients, Recipe } from "../../../server/src/types";
import type { Region, UILanguage } from "../i18n";

export const ALLERGENS: Allergen[] = ["gluten", "laktose", "ei", "nuesse", "erdnuss", "soja", "fisch", "krebstiere", "sellerie", "sesam"];
export const DIETS: Diet[] = ["alles", "pescetarisch", "vegetarisch", "vegan"];
export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];
export const FOOD_RULES: FoodRule[] = ["halal", "koscher"];
export const CUISINES: Cuisine[] = ["dach", "italienisch", "mediterran", "orientalisch", "indisch", "asiatisch", "mexikanisch", "international"];

export type Goal = "abnehmen" | "halten" | "zunehmen" | "muskelaufbau";
export const GOALS: Goal[] = ["abnehmen", "halten", "zunehmen", "muskelaufbau"];
export type Activity = "wenig" | "mittel" | "viel";
export const ACTIVITIES: Activity[] = ["wenig", "mittel", "viel"];
export type Sex = "w" | "m" | "d";
export const SEXES: Sex[] = ["w", "m", "d"];
export type Budget = "guenstig" | "normal" | "egal";
export const BUDGETS: Budget[] = ["guenstig", "normal", "egal"];
export type Variety = "hoch" | "normal";
export const VARIETIES: Variety[] = ["hoch", "normal"];

export interface Body {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
}

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

/** Bewertung eines Rezepts durch alle Nutzer:innen. */
export interface RatingSummary {
  avg: number;
  count: number;
  mine: number | null;
}

/** Öffentliches Foto aus der Rezept-Galerie. */
export interface RecipePhoto {
  id: string;
  recipeId: string;
  uri: string;
  authorName: string;
  createdAt: string;
  avg: number;
  count: number;
  myRating: number | null;
  mine: boolean;
}

/** Eigenes Foto; private bleiben nur auf dem Gerät, öffentliche landen zusätzlich in der Galerie. */
export interface MyPhoto {
  id: string;
  recipeId: string;
  uri: string;
  public: boolean;
  remoteId: string | null;
  createdAt: string;
}

export const FLAG_REASONS = ["text", "amounts", "image", "other"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export interface ImprovedRecipe {
  name: string;
  steps: string[];
  otherIngredients: string[];
  changes: string[];
  remainingIssues: string[];
}

export type Role = "user" | "admin";

/** Angemeldetes Konto. */
export interface Account {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  provider: "apple" | "google" | "dev";
  createdAt: string;
}

/** Eintrag im Nutzerverzeichnis (ohne E-Mail). */
export interface DirectoryUser {
  id: string;
  name: string;
  role: Role;
  createdAt: string;
  photos: number;
  recipes: number;
}

/** Ansicht für Admins. */
export interface AdminUser extends Account {
  blocked: boolean;
  lastLoginAt: string;
  photos: number;
  recipes: number;
}

export interface FlagSummary {
  recipeId: string;
  count: number;
  reasons: Partial<Record<FlagReason, number>>;
  notes: string[];
  lastAt: string;
}

export type { RecipeOverride, RecipePatch } from "../../../server/src/admin/recipePatch";

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
  /** Fragebogen zu Essgewohnheiten beantwortet. */
  onboarded: boolean;
  rules: FoodRule[];
  goal: Goal;
  /** Körperdaten für den Kalorienbedarf; null = Kalorien selbst festgelegt. */
  body: Body | null;
  cuisines: Cuisine[];
  budget: Budget;
  variety: Variety;
}
