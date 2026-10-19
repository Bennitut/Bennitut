import Constants from "expo-constants";
import type {
  Allergen,
  CommunityRecipe,
  DeliveryProviderInfo,
  Diet,
  FlagReason,
  ImprovedRecipe,
  LockedMeal,
  MealAnalysis,
  MonthPlan,
  MealType,
  Order,
  PantryItem,
  RatingSummary,
  ReceiptAnalysis,
  Recipe,
  RecipePhoto,
  RecipeText,
  ShoppingItem,
} from "./types";

/**
 * Adresse des Backends. Während der Entwicklung läuft es auf demselben Rechner wie Expo;
 * dessen Adresse kennt die App (z. B. "10.0.0.7:8081"), also nehmen wir denselben Host mit Port 3000.
 * Mit EXPO_PUBLIC_API_URL lässt sich die Adresse fest vorgeben (z. B. für einen echten Server).
 */
function serverUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const devHost = Constants.expoConfig?.hostUri?.split(":")[0];
  return devHost ? `http://${devHost}:3000` : "http://localhost:3000";
}

export const BASE_URL = serverUrl();

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
    // KI-Anfragen dürfen dauern; ohne Server soll die App aber nicht ewig warten.
    const slow = path.startsWith("/api/analyze") || /^\/api\/recipes\/(import|translate|improve)$/.test(path) || path === "/api/plan";
    const controller = new AbortController();
    setTimeout(() => controller.abort(), slow ? 120_000 : 10_000);
    res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
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
  analyzeMeal: (image: ImagePayload, language: string) =>
    post<MealAnalysis>("/api/analyze/meal", { imageBase64: image.data, mediaType: image.mediaType, language }),

  analyzeReceipt: (image: ImagePayload, language: string) =>
    post<{ receipt: ReceiptAnalysis; pantry: PantryItem[] }>("/api/analyze/receipt", {
      imageBase64: image.data,
      mediaType: image.mediaType,
      language,
    }),

  /** Monatsplan mit KI-Rezeptvorschlägen (ohne Wünsche plant die App selbst). */
  plan: (body: Record<string, unknown> & { startDate: string; recipes: Recipe[]; preferences: string; language: string }) =>
    post<{ plan: MonthPlan; extraRecipes: Recipe[] }>("/api/plan", {
      ...body,
      // Fotos eigener Rezepte braucht der Server nicht.
      recipes: body.recipes.map(({ media: _media, ...r }) => r),
    }),

  importRecipe: (body: { url?: string; caption?: string; frames: ImagePayload[]; language: string }) =>
    post<{ recipe: Recipe; author: string | null }>("/api/recipes/import", body),

  translateRecipe: (text: RecipeText, targetLanguage: string) =>
    post<RecipeText>("/api/recipes/translate", { text, targetLanguage }),

  communityRecipes: (sort: "popular" | "new", query: string) =>
    request<CommunityRecipe[]>(`/api/community/recipes?sort=${sort}&q=${encodeURIComponent(query)}`),

  shareRecipe: (authorName: string, recipe: Recipe) => post<CommunityRecipe>("/api/community/recipes", { authorName, recipe }),

  toggleLike: (communityId: string) => post<CommunityRecipe>(`/api/community/recipes/${communityId}/like`, {}),

  unshareRecipe: (communityId: string) => request<void>(`/api/community/recipes/${communityId}`, { method: "DELETE" }),

  ratings: () => request<Record<string, RatingSummary>>("/api/recipes/ratings"),

  topPhotos: () => request<Record<string, RecipePhoto>>("/api/recipes/top-photos"),

  rateRecipe: (recipeId: string, stars: number) => post<RatingSummary>(`/api/recipes/${encodeURIComponent(recipeId)}/rating`, { stars }),

  photos: (recipeId: string) => request<RecipePhoto[]>(`/api/recipes/${encodeURIComponent(recipeId)}/photos`),

  addPhoto: (recipeId: string, authorName: string, uri: string) =>
    post<RecipePhoto>(`/api/recipes/${encodeURIComponent(recipeId)}/photos`, { authorName, uri }),

  ratePhoto: (photoId: string, stars: number) => post<RecipePhoto>(`/api/photos/${photoId}/rating`, { stars }),

  deletePhoto: (photoId: string) => request<void>(`/api/photos/${photoId}`, { method: "DELETE" }),

  flagRecipe: (recipeId: string, reason: FlagReason, note: string) =>
    post<void>(`/api/recipes/${encodeURIComponent(recipeId)}/flags`, { reason, note }),

  /** Lässt Claude Name, Schritte und Sonstiges an Zutaten und Mengen anpassen. */
  improveRecipe: (body: { text: RecipeText; ingredients: { name: string; amount: string }[]; cookMinutes: number; problem: string; language: string }) =>
    post<ImprovedRecipe>("/api/recipes/improve", body),

  providers: () => request<DeliveryProviderInfo[]>("/api/delivery/providers"),

  order: (providerId: string, items: ShoppingItem[]) => post<Order>("/api/delivery/orders", { providerId, items }),

  orderStatus: (providerId: string, orderId: string) =>
    request<{ order: Order; pantry: PantryItem[] }>(`/api/delivery/${providerId}/orders/${orderId}`),
};
