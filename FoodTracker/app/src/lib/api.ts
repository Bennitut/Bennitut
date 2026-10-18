import type {
  Allergen,
  CommunityRecipe,
  DeliveryProviderInfo,
  Diet,
  Ingredient,
  LockedMeal,
  MealAnalysis,
  MealPlan,
  MealType,
  Order,
  PantryItem,
  ReceiptAnalysis,
  Recipe,
  RecipeText,
  ShoppingItem,
} from "./types";

// Im Simulator reicht localhost; auf einem echten Gerät die LAN-IP des Rechners eintragen.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export interface ImagePayload {
  data: string;
  mediaType: ImageMediaType;
}

export function toMediaType(mimeType: string | undefined | null): ImageMediaType {
  return mimeType === "image/png" || mimeType === "image/webp" || mimeType === "image/gif" ? mimeType : "image/jpeg";
}

/** Fehler mit Code aus dem Backend (z. B. "plan_no_recipe_for_meal"), wird in der App übersetzt. */
export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

let deviceId = "";
/** Anonyme Geräte-ID für Community-Funktionen (Favoriten zählen, eigene Rezepte verwalten). */
export function setDeviceId(id: string) {
  deviceId = id;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId, ...init?.headers },
    });
  } catch {
    throw new ApiError("network");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof body.error === "string" ? body.error : "internal");
  return body as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export interface PlanPreferences {
  diet: Diet;
  allergens: Allergen[];
  excludeIngredients: string[];
  maxCookMinutes: number;
}

export const api = {
  catalog: () => request<{ ingredients: Ingredient[]; recipes: Recipe[] }>("/api/catalog"),

  analyzeMeal: (image: ImagePayload, language: string) =>
    post<MealAnalysis>("/api/analyze/meal", { imageBase64: image.data, mediaType: image.mediaType, language }),

  analyzeReceipt: (image: ImagePayload, language: string) =>
    post<{ receipt: ReceiptAnalysis; pantry: PantryItem[] }>("/api/analyze/receipt", {
      imageBase64: image.data,
      mediaType: image.mediaType,
      language,
    }),

  plan: (
    body: PlanPreferences & {
      days: number;
      people: number;
      kcalPerPersonPerDay: number;
      mealTypes: MealType[];
      pantry: PantryItem[];
      favoriteRecipeIds: string[];
      locked: LockedMeal[];
      recipes: Recipe[];
      preferences?: string;
      language: string;
    },
  ) => post<{ plan: MealPlan; extraRecipes: Recipe[] }>("/api/plan", body),

  matchingRecipes: (body: PlanPreferences & { mealType?: MealType; recipes: Recipe[] }) =>
    post<{ recipeIds: string[] }>("/api/recipes/matching", body),

  importRecipe: (body: { url?: string; caption?: string; frames: ImagePayload[]; language: string }) =>
    post<{ recipe: Recipe; author: string | null }>("/api/recipes/import", body),

  translateRecipe: (text: RecipeText, targetLanguage: string) =>
    post<RecipeText>("/api/recipes/translate", { text, targetLanguage }),

  communityRecipes: (sort: "popular" | "new", query: string) =>
    request<CommunityRecipe[]>(`/api/community/recipes?sort=${sort}&q=${encodeURIComponent(query)}`),

  shareRecipe: (authorName: string, recipe: Recipe) => post<CommunityRecipe>("/api/community/recipes", { authorName, recipe }),

  toggleLike: (communityId: string) => post<CommunityRecipe>(`/api/community/recipes/${communityId}/like`, {}),

  unshareRecipe: (communityId: string) => request<void>(`/api/community/recipes/${communityId}`, { method: "DELETE" }),

  providers: () => request<DeliveryProviderInfo[]>("/api/delivery/providers"),

  order: (providerId: string, items: ShoppingItem[]) => post<Order>("/api/delivery/orders", { providerId, items }),

  orderStatus: (providerId: string, orderId: string) =>
    request<{ order: Order; pantry: PantryItem[] }>(`/api/delivery/${providerId}/orders/${orderId}`),
};
