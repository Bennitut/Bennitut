import Constants from "expo-constants";
import { Platform } from "react-native";
import type {
  Account,
  AdminUser,
  Allergen,
  CommunityRecipe,
  DeliveryProviderInfo,
  Diet,
  DirectoryUser,
  FlagReason,
  FlagSummary,
  ImprovedRecipe,
  MealAnalysis,
  MonthPlan,
  Order,
  PantryItem,
  RatingSummary,
  ReceiptAnalysis,
  Recipe,
  RecipeOverride,
  RecipePatch,
  RecipePhoto,
  RecipeText,
  Role,
  ShoppingItem,
} from "./types";
import type { DiarySyncRequest, DiarySyncResponse } from "./diary";
import type { ServerHealth } from "./serverStatus";

/**
 * Adresse des Backends, null = kein Server. Während der Entwicklung läuft es auf demselben Rechner wie Expo;
 * dessen Adresse kennt die App (z. B. "10.0.0.7:8081"), also nehmen wir denselben Host mit Port 3000.
 * Mit EXPO_PUBLIC_API_URL lässt sich die Adresse fest vorgeben (z. B. für einen echten Server).
 */
function serverUrl(): string | null {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const devHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (devHost) return `http://${devHost}:3000`;
  if (Platform.OS === "web") {
    // `npx expo start --web`: Server auf dem Rechner, von dem die Seite kommt. Die exportierte Web-Version
    // (`npx expo export --platform web`) läuft ohne Server und fragt nicht bei „localhost“ der Besucher:innen an.
    return __DEV__ && typeof window !== "undefined" ? `http://${window.location.hostname}:3000` : null;
  }
  return "http://localhost:3000";
}

export const BASE_URL = serverUrl();
/** Ob es überhaupt einen Server gibt; sonst zeigen Server-Funktionen „Bald verfügbar“ statt eines Fehlers. */
export const HAS_SERVER = BASE_URL !== null;

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export interface ImagePayload {
  data: string;
  mediaType: ImageMediaType;
}

export function toMediaType(mimeType: string | undefined | null): ImageMediaType {
  return mimeType === "image/png" || mimeType === "image/webp" || mimeType === "image/gif" ? mimeType : "image/jpeg";
}

/**
 * Fehler mit Code aus dem Backend (z. B. "plan_no_recipe_for_meal"), wird in der App übersetzt. `details`: übrige
 * Felder der Antwort, z. B. `retryAfter` (Sekunden) nach zu vielen Anmeldeversuchen oder `minLength` beim Passwort.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

let deviceId = "";
let authToken: string | null = null;
/** Sitzungstoken des angemeldeten Kontos (null = anonym). */
export function setAuthToken(token: string | null) {
  authToken = token;
}
/** Anonyme Geräte-ID für Community-Funktionen (Favoriten zählen, eigene Rezepte verwalten). */
export function setDeviceId(id: string) {
  deviceId = id;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Ohne Server wie ohne Verbindung: Katalog, Planer, Vorrat und Tagebuch laufen in der App weiter.
  if (!BASE_URL) throw new ApiError("network");
  let res: Response;
  // KI-Anfragen dürfen dauern – mit lokaler KI (Ollama) oft 20–90 Sekunden, beim ersten Mal länger. Der Server
  // bricht nach 240 Sekunden selbst ab und meldet „ai_timeout“; ohne Server soll die App nicht ewig warten.
  const slow = path.startsWith("/api/analyze") || /^\/api\/recipes\/(import|translate|improve)$/.test(path) || path === "/api/plan";
  const controller = new AbortController();
  // Die Sicherung des Tagebuchs schickt beim ersten Mal alles (bis zu 2000 Einträge pro Anfrage).
  const timer = setTimeout(() => controller.abort(), slow ? 300_000 : path === "/api/diary/sync" ? 60_000 : 10_000);
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    clearTimeout(timer);
    throw new ApiError("network");
  }
  if (res.status === 204) {
    clearTimeout(timer);
    return undefined as T;
  }
  const body = (await res.json().catch(() => ({}))) ?? {};
  clearTimeout(timer);
  if (!res.ok) throw new ApiError(typeof body.error === "string" ? body.error : "internal", typeof body === "object" ? body : {});
  return body as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const send = <T>(method: "PATCH" | "PUT" | "DELETE", path: string, body?: unknown) =>
  request<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

type Login = { token: string; user: Account };

/** Welche Anmeldearten der Server anbietet; ältere Server kennen die Felder zum Passwort noch nicht. */
export interface AuthConfig {
  apple: boolean;
  google: boolean;
  dev: boolean;
  password?: boolean;
  /** „Passwort vergessen?“ – nur mit Mail-Dienst auf dem Server. */
  passwordReset?: boolean;
  passwordMinLength?: number;
}

export interface PlanPreferences {
  diet: Diet;
  allergens: Allergen[];
  excludeIngredients: string[];
  maxCookMinutes: number;
}

export const api = {
  /** Lebenszeichen des Servers und welche KI er gerade nutzen kann (Profilzeile). */
  health: () => request<ServerHealth>("/api/health"),
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

  /** Tagebuch abgleichen (siehe lib/diary.ts, syncDiary). */
  diarySync: (body: DiarySyncRequest) => post<DiarySyncResponse>("/api/diary/sync", body),

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

  // Konten
  authConfig: () => request<AuthConfig>("/api/auth/config"),
  register: (email: string, password: string, name: string | undefined) =>
    post<Login & { created: boolean }>("/api/auth/register", { email, password, ...(name ? { name } : {}) }),
  loginPassword: (email: string, password: string) => post<Login>("/api/auth/login", { email, password }),
  /** Neues Passwort; andere Geräte werden abgemeldet, dieses bleibt angemeldet. */
  changePassword: (currentPassword: string, newPassword: string) => post<void>("/api/auth/password", { currentPassword, newPassword }),
  /** Schickt einen Code per E-Mail, falls es das Konto gibt – die Antwort ist immer dieselbe. */
  forgotPassword: (email: string, language: string) => post<void>("/api/auth/password/forgot", { email, language }),
  resetPassword: (email: string, code: string, newPassword: string) => post<Login>("/api/auth/password/reset", { email, code, newPassword }),
  /** Konto mit allen Daten auf dem Server löschen; Konten mit Passwort bestätigen mit dem Passwort. */
  deleteAccount: (password: string | undefined) => send<void>("DELETE", "/api/auth/me", password === undefined ? {} : { password }),
  /** „Meine Daten exportieren“: alles, was der Server zum Konto speichert. */
  exportAccount: () => request<Record<string, unknown>>("/api/auth/export"),
  loginApple: (identityToken: string, fullName: string | undefined) => post<Login>("/api/auth/apple", { identityToken, fullName }),
  loginGoogle: (idToken: string) => post<Login>("/api/auth/google", { idToken }),
  loginDev: (name: string, email: string | undefined) => post<Login>("/api/auth/dev", { name, email }),
  me: () => request<Account>("/api/auth/me"),
  renameMe: (name: string) => send<Account>("PATCH", "/api/auth/me", { name }),
  logout: () => post<void>("/api/auth/logout", {}),
  users: (query: string) => request<DirectoryUser[]>(`/api/users?q=${encodeURIComponent(query)}`),

  // Admin
  adminUsers: (query: string) => request<AdminUser[]>(`/api/admin/users?q=${encodeURIComponent(query)}`),
  adminUpdateUser: (id: string, patch: { role?: Role; blocked?: boolean }) => send<Account>("PATCH", `/api/admin/users/${id}`, patch),
  flags: () => request<FlagSummary[]>("/api/recipes/flags"),
  resolveFlags: (recipeId: string) => send<{ resolved: number }>("DELETE", `/api/admin/flags/${encodeURIComponent(recipeId)}`),
  adminPhotos: () => request<RecipePhoto[]>("/api/admin/photos"),
  adminDeletePhoto: (id: string) => send<void>("DELETE", `/api/admin/photos/${id}`),
  adminDeleteCommunity: (id: string) => send<void>("DELETE", `/api/admin/community/${id}`),
  overrides: () => request<Record<string, RecipeOverride>>("/api/recipes/overrides"),
  adminSaveRecipe: (id: string, patch: RecipePatch) => send<RecipeOverride>("PUT", `/api/admin/recipes/${encodeURIComponent(id)}`, patch),
  adminResetRecipe: (id: string) => send<void>("DELETE", `/api/admin/recipes/${encodeURIComponent(id)}`),

  providers: () => request<DeliveryProviderInfo[]>("/api/delivery/providers"),

  order: (providerId: string, items: ShoppingItem[]) => post<Order>("/api/delivery/orders", { providerId, items }),

  orderStatus: (providerId: string, orderId: string) =>
    request<{ order: Order; pantry: PantryItem[] }>(`/api/delivery/${providerId}/orders/${orderId}`),
};
