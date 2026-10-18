import type {
  DeliveryProviderInfo,
  Ingredient,
  MealAnalysis,
  MealPlan,
  MealType,
  Order,
  PantryItem,
  ReceiptAnalysis,
  Recipe,
  ShoppingItem,
} from "./types";

// Im Simulator reicht localhost; auf einem echten Gerät die LAN-IP des Rechners eintragen.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Serverfehler ${res.status}`);
  return body as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  catalog: () => request<{ ingredients: Ingredient[]; recipes: Recipe[] }>("/api/catalog"),

  analyzeMeal: (imageBase64: string, mediaType: ImageMediaType) =>
    post<MealAnalysis>("/api/analyze/meal", { imageBase64, mediaType }),

  analyzeReceipt: (imageBase64: string, mediaType: ImageMediaType) =>
    post<{ receipt: ReceiptAnalysis; pantry: PantryItem[] }>("/api/analyze/receipt", { imageBase64, mediaType }),

  plan: (body: {
    days: number;
    people: number;
    kcalPerPersonPerDay: number;
    mealTypes: MealType[];
    pantry: PantryItem[];
    excludeTags: string[];
    preferences?: string;
  }) => post<{ plan: MealPlan; extraRecipes: Recipe[] }>("/api/plan", body),

  providers: () => request<DeliveryProviderInfo[]>("/api/delivery/providers"),

  order: (providerId: string, items: ShoppingItem[]) => post<Order>("/api/delivery/orders", { providerId, items }),

  orderStatus: (providerId: string, orderId: string) =>
    request<{ order: Order; pantry: PantryItem[] }>(`/api/delivery/${providerId}/orders/${orderId}`),
};
