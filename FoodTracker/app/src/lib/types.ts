// Domain-Typen des Backends; reine Typ-Importe, im Bundle entfällt der Import.
export type {
  Ingredient,
  MealPlan,
  MealType,
  Nutrients,
  PantryItem,
  PlannedMeal,
  Recipe,
  ShoppingItem,
} from "../../../server/src/types";
import type { Nutrients } from "../../../server/src/types";

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
  lines: { ingredientId: string; name: string; packs: number; packSize: number; unit: string }[];
  checkoutUrl: string | null;
  createdAt: string;
}

export interface Settings {
  kcalPerPersonPerDay: number;
  people: number;
  days: number;
  excludeTags: string[];
  preferences: string;
}
