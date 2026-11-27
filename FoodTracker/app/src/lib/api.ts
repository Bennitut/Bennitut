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
import { aiConsentHeaders, type AiConsent } from "./aiConsent";
import type { DataSyncRequest, DataSyncResponse } from "./dataSync";
import type { DeviceClaim } from "./deviceClaim";
import type { DiarySyncRequest, DiarySyncResponse } from "./diary";
import { defaultServer, type ServerAddress } from "./serverAddress";
import { resolveImageUri } from "./serverImages";
import type { ServerHealth } from "./serverStatus";

/**
 * Standard-Adresse des Backends (lib/serverAddress.ts): EXPO_PUBLIC_API_URL beim Start bzw. Bauen, sonst während der
 * Entwicklung der Rechner, auf dem Expo läuft (dessen Adresse kennt die App, z. B. "10.0.0.7:8081" – also derselbe
 * Host mit Port 3000), in der exportierten Web-Version ohne feste Adresse keiner. Im Profil lässt sich eine andere
 * eintragen (store.tsx, setServer).
 */
export const DEFAULT_SERVER: ServerAddress = defaultServer({
  env: process.env.EXPO_PUBLIC_API_URL,
  devHost: Constants.expoConfig?.hostUri?.split(":")[0],
  web: Platform.OS === "web",
  dev: __DEV__,
  pageHost: typeof window !== "undefined" ? window.location?.hostname : undefined,
});

let server: ServerAddress = DEFAULT_SERVER;
/** Adresse des Servers, mit dem die App gerade spricht; null = kein Server. */
export const serverUrl = () => server.url;
/** Ob es überhaupt einen Server gibt; sonst zeigen Server-Funktionen „Bald verfügbar“ statt eines Fehlers. */
export const hasServer = () => server.url !== null;
/** Andere Adresse (store.tsx): gilt für jede Anfrage, die danach beginnt. */
export function setServer(address: ServerAddress) {
  server = address;
}

let isLoaded = false;
let markReady: () => void = () => {};
/** Erst wenn die App Adresse und Geräte-ID geladen hat (store.tsx, `serverReady`), gehen Anfragen hinaus. */
const loaded = new Promise<void>((resolve) => {
  markReady = () => {
    isLoaded = true;
    resolve();
  };
});
export const serverReady = () => markReady();

/** Adresse zum Anzeigen eines Bildes – Fotos aus dem Bildspeicher des Servers mit dessen Adresse (lib/serverImages.ts). */
export const imageUrl = (uri: string | undefined) => resolveImageUri(uri, server.url);
/** Fotos der Galerie kommen als Pfad im Bildspeicher; die App zeigt sie mit der Adresse des Servers. */
const withImageUrl = (photo: RecipePhoto): RecipePhoto => ({ ...photo, uri: imageUrl(photo.uri) ?? photo.uri });
const withImageUrls = (photos: RecipePhoto[]) => photos.map(withImageUrl);

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
let aiConsent: AiConsent | null = null;
/**
 * Einwilligung in die KI-Funktionen (lib/aiConsent.ts). Ohne verschickt die App keine KI-Anfrage (Fehler
 * „ai_consent_required“) – auch dann nicht, wenn ein Bildschirm vergisst, vorher zu fragen.
 */
export function setAiConsent(consent: AiConsent | null) {
  aiConsent = consent;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isLoaded) await loaded;
  // Adresse, Geräte-ID und Anmeldung gehören zusammen und gelten ab dem Aufruf (ohne `await` davor): Wechselt danach die
  // Adresse, geht diese Anfrage noch an den bisherigen Server – z. B. das Abmelden beim Wechsel.
  const base = server.url;
  const device = deviceId;
  const token = authToken;
  // Ohne Server wie ohne Verbindung: Katalog, Planer, Vorrat und Tagebuch laufen in der App weiter.
  if (!base) throw new ApiError("network");
  let res: Response;
  // KI-Anfragen dürfen dauern – mit lokaler KI (Ollama) oft 20–90 Sekunden, beim ersten Mal länger. Der Server
  // bricht nach 240 Sekunden selbst ab und meldet „ai_timeout“; ohne Server soll die App nicht ewig warten.
  const slow = path.startsWith("/api/analyze") || /^\/api\/recipes\/(import|translate|improve)$/.test(path) || path === "/api/plan";
  const controller = new AbortController();
  // Der Abgleich schickt beim ersten Mal alles (Tagebuch bis zu 2000 Einträge pro Anfrage, dazu Plan und Vorrat).
  const syncing = path === "/api/diary/sync" || path === "/api/sync";
  const timer = setTimeout(() => controller.abort(), slow ? 300_000 : syncing ? 60_000 : 10_000);
  try {
    res = await fetch(`${base}${path}`, {
      signal: controller.signal,
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": device,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
/** KI-Anfrage: nur mit Einwilligung, die der Server im Header sieht (sonst antwortet er mit 403). */
const postAi = <T>(path: string, body: unknown): Promise<T> => {
  const headers = aiConsentHeaders(aiConsent);
  if (Object.keys(headers).length === 0) return Promise.reject(new ApiError("ai_consent_required"));
  return request<T>(path, { method: "POST", body: JSON.stringify(body), headers });
};
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

/**
 * Prüft eine Adresse, bevor die App sie nutzt (Profil → Server): GET /api/health ohne Geräte-ID und ohne Anmeldung –
 * ein fremder Server erfährt dabei nichts über dieses Gerät. Liefert die Antwort bzw. null, wenn dort kein
 * FoodTracker-Server antwortet (keine Verbindung, kein JSON, kein `ok`). Großzügiges Zeitlimit: Gratis-Server
 * schlafen und brauchen zum Aufwachen bis zu einer Minute.
 */
export async function probeServer(url: string, timeoutMs = 60_000): Promise<ServerHealth | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/health`, { signal: controller.signal, credentials: "omit" });
    const body = (await res.json().catch(() => null)) as ServerHealth | null;
    return res.ok && body && body.ok === true ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  /** Lebenszeichen des Servers und welche KI er gerade nutzen kann (Profilzeile). */
  health: () => request<ServerHealth>("/api/health"),
  // KI-Funktionen (postAi): nur mit Einwilligung, siehe components/AiConsent.tsx.
  analyzeMeal: (image: ImagePayload, language: string) =>
    postAi<MealAnalysis>("/api/analyze/meal", { imageBase64: image.data, mediaType: image.mediaType, language }),

  analyzeReceipt: (image: ImagePayload, language: string) =>
    postAi<{ receipt: ReceiptAnalysis; pantry: PantryItem[] }>("/api/analyze/receipt", {
      imageBase64: image.data,
      mediaType: image.mediaType,
      language,
    }),

  /** Monatsplan mit KI-Rezeptvorschlägen (ohne Wünsche plant die App selbst). */
  plan: (body: Record<string, unknown> & { startDate: string; recipes: Recipe[]; preferences: string; language: string }) =>
    postAi<{ plan: MonthPlan; extraRecipes: Recipe[] }>("/api/plan", {
      ...body,
      // Fotos eigener Rezepte braucht der Server nicht.
      recipes: body.recipes.map(({ media: _media, ...r }) => r),
    }),

  /** Tagebuch abgleichen (siehe lib/diary.ts, syncDiary). */
  diarySync: (body: DiarySyncRequest) => post<DiarySyncResponse>("/api/diary/sync", body),

  /** Einstellungen, Plan und Vorrat mit dem Konto abgleichen (siehe lib/dataSync.ts, syncData) – nur angemeldet. */
  dataSync: (body: DataSyncRequest) => post<DataSyncResponse>("/api/sync", body),

  importRecipe: (body: { url?: string; caption?: string; frames: ImagePayload[]; language: string }) =>
    postAi<{ recipe: Recipe; author: string | null }>("/api/recipes/import", body),

  translateRecipe: (text: RecipeText, targetLanguage: string) =>
    postAi<RecipeText>("/api/recipes/translate", { text, targetLanguage }),

  communityRecipes: (sort: "popular" | "new", query: string) =>
    request<CommunityRecipe[]>(`/api/community/recipes?sort=${sort}&q=${encodeURIComponent(query)}`),

  shareRecipe: (authorName: string, recipe: Recipe) => post<CommunityRecipe>("/api/community/recipes", { authorName, recipe }),

  toggleLike: (communityId: string) => post<CommunityRecipe>(`/api/community/recipes/${communityId}/like`, {}),

  unshareRecipe: (communityId: string) => request<void>(`/api/community/recipes/${communityId}`, { method: "DELETE" }),

  ratings: () => request<Record<string, RatingSummary>>("/api/recipes/ratings"),

  topPhotos: async () =>
    Object.fromEntries(Object.entries(await request<Record<string, RecipePhoto>>("/api/recipes/top-photos")).map(([id, p]) => [id, withImageUrl(p)])),

  rateRecipe: (recipeId: string, stars: number) => post<RatingSummary>(`/api/recipes/${encodeURIComponent(recipeId)}/rating`, { stars }),

  photos: async (recipeId: string) => withImageUrls(await request<RecipePhoto[]>(`/api/recipes/${encodeURIComponent(recipeId)}/photos`)),

  addPhoto: async (recipeId: string, authorName: string, uri: string) =>
    withImageUrl(await post<RecipePhoto>(`/api/recipes/${encodeURIComponent(recipeId)}/photos`, { authorName, uri })),

  ratePhoto: async (photoId: string, stars: number) => withImageUrl(await post<RecipePhoto>(`/api/photos/${photoId}/rating`, { stars })),

  deletePhoto: (photoId: string) => request<void>(`/api/photos/${photoId}`, { method: "DELETE" }),

  flagRecipe: (recipeId: string, reason: FlagReason, note: string) =>
    post<void>(`/api/recipes/${encodeURIComponent(recipeId)}/flags`, { reason, note }),

  /** Lässt Claude Name, Schritte und Sonstiges an Zutaten und Mengen anpassen. */
  improveRecipe: (body: { text: RecipeText; ingredients: { name: string; amount: string }[]; cookMinutes: number; problem: string; language: string }) =>
    postAi<ImprovedRecipe>("/api/recipes/improve", body),

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
  /** Nach der Anmeldung: Was dieses Gerät ohne Konto auf dem Server hat, gehört danach dem Konto (lib/deviceClaim.ts). */
  claimDevice: () => post<DeviceClaim>("/api/auth/claim-device", {}),
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
  adminPhotos: async () => withImageUrls(await request<RecipePhoto[]>("/api/admin/photos")),
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
