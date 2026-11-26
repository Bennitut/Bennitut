import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { isUILanguage, regionFromCode } from "../i18n";
import { readAiConsent, type AiConsent } from "./aiConsent";
import { ApiError, BASE_URL, HAS_SERVER, api, setAiConsent as setApiAiConsent, setAuthToken, setDeviceId } from "./api";
import { INGREDIENTS, RECIPES, applyOverrides } from "./catalog";
import { emptyDataSync, lastSynced, pendingChanges, readDataSync, syncData, syncedWith, trackChanges, type DataSync } from "./dataSync";
import { claimedAnything, needsDeviceClaim, type DeviceClaim } from "./deviceClaim";
import { addEntry, emptyDiary, loadDiary, removeEntry, saveDiary, syncDiary, type DiaryState } from "./diary";
import { importDiaryJson, type ImportResult } from "./history";
import { addToPantry, consumeMeal, migrateStock, newId, nowTime, setPantryAmount, today, type StockItem } from "./pantry";
import { withStoredTexts } from "./recipeText";
import { loadSession, sessionWriter, type Session } from "./session";
import { resolveImage } from "./serverImages";
import { sessionStore } from "./sessionStore";
import { checkedToBook, deliveryToBook } from "./shopping";
import type {
  DiaryEntry,
  Ingredient,
  MonthPlan,
  MyPhoto,
  Order,
  PantryItem,
  PlannedMeal,
  RatingSummary,
  Recipe,
  RecipeMedia,
  RecipeOverride,
  RecipePhoto,
  RecipeText,
  Settings,
} from "./types";

/**
 * Zustand der App unter einem Schlüssel. Das Tagebuch gehört nicht dazu: Es liegt unter eigenen Schlüsseln
 * (lib/diary.ts), damit es auch gespeichert wird, wenn Fotos und importierte Rezepte den Speicher füllen, und damit
 * kein neuer Plan, Fragebogen oder Neustart des übrigen Zustands Einträge löschen kann.
 */
interface PersistedState {
  deviceId: string;
  /** Lagerbestand in der Küche, je Einkauf ein Posten. */
  pantry: StockItem[];
  plan: MonthPlan | null;
  /** Rezepte, die nur im aktuellen Plan vorkommen (z. B. KI-Vorschläge). */
  planRecipes: Recipe[];
  /** Gegessene Mahlzeiten im aktuellen Plan als "Tag:Mahlzeit". */
  eatenMeals: string[];
  /** Abgehakte Einträge der Einkaufsliste ("Woche:Zutat"), gelten für den aktuellen Plan. */
  shoppingChecked: string[];
  /**
   * Einträge der Einkaufsliste ("Woche:Zutat"), die schon im Vorrat gebucht sind – über „Abgehaktes in den Vorrat“ oder
   * eine gelieferte Bestellung. Gelten für den aktuellen Plan; so kommt nichts doppelt in den Vorrat.
   */
  shoppingBooked: string[];
  orders: Order[];
  /** Eigene und importierte Rezepte. */
  myRecipes: Recipe[];
  favoriteIds: string[];
  /** Kopien favorisierter Community-Rezepte, damit sie offline und im Plan verfügbar sind. */
  savedRecipes: Recipe[];
  /** Eigene Rezepte, die in der Community geteilt sind: Rezept-ID → Community-ID. */
  shared: Record<string, string>;
  /** Von Claude übersetzte Rezepttexte: Rezept-ID → Sprache → Text. */
  translations: Record<string, Record<string, RecipeText>>;
  /** Mit Claude verbesserte Rezepttexte: Rezept-ID → Sprache → Text; ersetzen den Originaltext. */
  textOverrides: Record<string, Record<string, RecipeText>>;
  /** Rezepte, die von diesem Gerät gemeldet wurden. */
  flaggedIds: string[];
  /** Eigene Rezeptfotos (privat oder zusätzlich öffentlich in der Galerie). */
  myPhotos: MyPhoto[];
  /** Zuletzt geladene Bewertungen aller Rezepte (für Planung und Anzeige, auch offline). */
  ratings: Record<string, RatingSummary>;
  /** Änderungen der Admins an Katalogrezepten (zuletzt geladener Stand, gilt auch offline). */
  catalogOverrides: Record<string, RecipeOverride>;
  /**
   * Konto, in das die Daten dieses Geräts auf dem Server zuletzt übernommen wurden (lib/deviceClaim.ts); null =
   * abgemeldet bzw. noch nicht übernommen.
   */
  claimedFor: string | null;
  /** Einwilligung in die KI-Funktionen (lib/aiConsent.ts); null = noch nicht gefragt bzw. widerrufen. */
  aiConsent: AiConsent | null;
  settings: Settings;
  /**
   * Abgleich von Einstellungen, Plan mit Einkaufsliste und Vorrat mit dem Konto (lib/dataSync.ts): Zeitpunkt jeder
   * Änderung, was noch hoch muss, letzter Abgleich. Steht hier, damit er immer zusammen mit diesen Daten gespeichert wird.
   */
  dataSync: DataSync;
}

/** Fest eingebauter Katalog – funktioniert auch ohne Verbindung zum Server. */
const baseCatalog = { ingredients: INGREDIENTS, recipes: RECIPES };

const STORAGE_KEY = "foodtracker/state/v2";
const LEGACY_STORAGE_KEY = "foodtracker/state/v1";

function defaultSettings(): Settings {
  const locale = getLocales()[0];
  return {
    language: isUILanguage(locale?.languageCode) ? locale.languageCode : "en",
    region: regionFromCode(locale?.regionCode),
    displayName: "",
    kcalPerPersonPerDay: 2000,
    people: 1,
    days: 7,
    mealTypes: ["breakfast", "lunch", "dinner"],
    diet: "alles",
    allergens: [],
    excludeIngredients: [],
    maxCookMinutes: 0,
    preferences: "",
    onboarded: false,
    rules: [],
    goal: "halten",
    body: null,
    cuisines: [],
    budget: "normal",
    variety: "normal",
  };
}

function initialState(): PersistedState {
  return {
    deviceId: `${newId()}${newId()}`,
    pantry: [],
    plan: null,
    planRecipes: [],
    eatenMeals: [],
    shoppingChecked: [],
    shoppingBooked: [],
    orders: [],
    myRecipes: [],
    favoriteIds: [],
    savedRecipes: [],
    shared: {},
    translations: {},
    textOverrides: {},
    flaggedIds: [],
    myPhotos: [],
    ratings: {},
    catalogOverrides: {},
    claimedFor: null,
    aiConsent: null,
    settings: defaultSettings(),
    dataSync: emptyDataSync(),
  };
}

/** Unlesbaren Inhalt beiseitelegen, bevor er überschrieben wird. */
const keepCorrupt = (key: string, raw: string) => AsyncStorage.setItem(`${key}/kaputt-${Date.now()}`, raw).catch(() => {});

/**
 * Lädt den gespeicherten Zustand; aus Version 1 wird der Vorrat übernommen. `legacyDiary`: Tagebuch vom alten
 * Speicherort (bis November 2026 lag es hier mit drin) – lib/diary.ts übernimmt es in den eigenen Speicher.
 * `legacyAuth`: Anmeldung vom alten Speicherort – lib/session.ts übernimmt sie in den sicheren Speicher.
 */
async function loadState(): Promise<{ state: PersistedState; legacyDiary: unknown; legacyAuth?: unknown }> {
  const base = initialState();
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    let parsed: (Partial<PersistedState> & { catalog?: unknown; diary?: unknown; auth?: unknown }) | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await keepCorrupt(STORAGE_KEY, raw);
    }
    if (!parsed) return { state: base, legacyDiary: undefined };
    // Ältere Versionen speicherten auch den Katalog (kommt jetzt immer aus der App) und die Anmeldung (jetzt in
    // lib/session.ts, auf dem Handy verschlüsselt).
    const { catalog: _oldCatalog, diary: legacyDiary, auth: legacyAuth, ...saved } = parsed;
    // Pläne aus Versionen vor dem Monatsplan werden verworfen (das Tagebuch bleibt).
    const plan = saved.plan && "weeks" in saved.plan ? saved.plan : null;
    const state: PersistedState = {
      ...base,
      ...saved,
      plan,
      eatenMeals: plan ? (saved.eatenMeals ?? []).filter((e): e is string => typeof e === "string") : [],
      shoppingChecked: plan ? (saved.shoppingChecked ?? []).filter((e): e is string => typeof e === "string") : [],
      shoppingBooked: plan ? (saved.shoppingBooked ?? []).filter((e): e is string => typeof e === "string") : [],
      pantry: migrateStock(saved.pantry ?? []),
      aiConsent: readAiConsent(saved.aiConsent),
      settings: { ...base.settings, ...saved.settings },
      dataSync: base.dataSync,
    };
    // Ohne Abgleich-Stand (Daten von vor dem Abgleich): alles mit dem Zeitpunkt 0, siehe lib/dataSync.ts.
    return { state: { ...state, dataSync: readDataSync(saved.dataSync, state) }, legacyDiary, legacyAuth };
  }
  const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacy) return { state: base, legacyDiary: undefined };
  let old: { diary?: unknown; pantry?: PantryItem[]; settings?: Partial<Settings> };
  try {
    old = JSON.parse(legacy);
  } catch {
    return { state: base, legacyDiary: undefined };
  }
  const state: PersistedState = {
    ...base,
    pantry: migrateStock(old.pantry ?? []),
    settings: {
      ...base.settings,
      kcalPerPersonPerDay: old.settings?.kcalPerPersonPerDay ?? base.settings.kcalPerPersonPerDay,
      people: old.settings?.people ?? base.settings.people,
      days: old.settings?.days ?? base.settings.days,
    },
  };
  return { state: { ...state, dataSync: readDataSync(undefined, state) }, legacyDiary: old.diary };
}

/** Hinweis, wenn etwas nicht gespeichert werden konnte (Tagebuch: unlesbar bzw. Speichern gescheitert). */
export interface StorageIssues {
  diary: "unreadable" | "failed" | null;
  state: boolean;
}

/** Sicherung des Tagebuchs auf dem Server: aus (kein Server), gleich, läuft, erledigt oder Server nicht erreichbar. */
export interface DiarySyncStatus {
  state: "off" | "waiting" | "syncing" | "synced" | "offline";
  pending: number;
  /** Letzter erfolgreicher Abgleich (ISO). */
  at: string | null;
}

/**
 * Abgleich von Einstellungen, Plan und Vorrat mit dem Konto: aus (kein Server), nur auf dem Gerät (ohne Konto), gleich,
 * läuft, erledigt oder Server nicht erreichbar.
 */
export interface DataSyncStatus {
  state: "off" | "local" | "waiting" | "syncing" | "synced" | "offline";
  pending: number;
  /** Letzter erfolgreicher Abgleich aller drei Arten (ISO). */
  at: string | null;
}

interface Store extends PersistedState {
  ready: boolean;
  /** Angemeldetes Konto mit Sitzungstoken; null = anonym. Gespeichert über lib/session.ts. */
  auth: Session | null;
  /** Alle Tagebucheinträge, nach Tag und Uhrzeit sortiert. */
  diary: DiaryEntry[];
  /** Tagebuch samt Löschmarken (für den Export). */
  diaryState: DiaryState;
  /** Übernimmt eine Sicherung (JSON) ins Tagebuch, ohne Doppeltes. */
  importDiary: (text: string) => Omit<Extract<ImportResult, { ok: true }>, "state"> | Extract<ImportResult, { ok: false }>;
  diarySync: DiarySyncStatus;
  /** Abgleich von Einstellungen, Plan und Vorrat mit dem Konto. */
  dataSyncStatus: DataSyncStatus;
  /** Jetzt mit dem Server abgleichen – Tagebuch, Einstellungen, Plan und Vorrat (z. B. beim Öffnen des Profils). */
  refreshSync: () => void;
  storageIssues: StorageIssues;
  catalog: typeof baseCatalog;
  /** Anmelden (Konto und Token speichern) bzw. mit null abmelden. */
  setAuth: (auth: Session | null) => void;
  /** Was nach der Anmeldung vom Gerät ins Konto übernommen wurde – nur wenn etwas dabei war, nur in dieser Sitzung. */
  deviceClaim: DeviceClaim | null;
  isAdmin: boolean;
  /** Lädt die Änderungen der Admins an Katalogrezepten neu. */
  refreshOverrides: () => Promise<void>;
  ingredients: Map<string, Ingredient>;
  /** Alle bekannten Rezepte: Katalog, eigene, gespeicherte Community-Rezepte und Plan-Rezepte. */
  recipes: Map<string, Recipe>;
  /** Rezepte, die der Server zusätzlich zum Katalog kennen muss. */
  userRecipes: Recipe[];
  addDiaryEntry: (entry: Omit<DiaryEntry, "id" | "date" | "time">) => void;
  removeDiaryEntry: (id: string) => void;
  addPantryItems: (items: PantryItem[]) => void;
  /** Setzt die Gesamtmenge einer Zutat im Vorrat (0 = entfernen). */
  setPantryAmount: (ingredientId: string, amount: number) => void;
  setPlan: (plan: MonthPlan, extraRecipes: Recipe[]) => void;
  markMealEaten: (meal: PlannedMeal, title: string) => void;
  toggleShoppingItem: (key: string) => void;
  /** Bucht die abgehakten, noch nicht gebuchten Zeilen einer Woche (ab 0) als ganze Packungen in den Vorrat. */
  bookCheckedShopping: (week: number) => void;
  toggleLock: (meal: PlannedMeal) => void;
  /** Nach dem Fragebogen soll der Plan-Tab gleich einen Plan erstellen. */
  pendingPlan: boolean;
  setPendingPlan: (pending: boolean) => void;
  saveOrder: (order: Order) => void;
  /** Neuer Stand einer Bestellung; ist sie gerade geliefert worden, kommt die Ware (ohne schon Gebuchtes) in den Vorrat. */
  receiveOrder: (order: Order, delivered: PantryItem[]) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  saveRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: string) => void;
  setFavorite: (recipe: Recipe, favorite: boolean) => void;
  cacheTranslation: (recipeId: string, language: string, text: RecipeText) => void;
  setTextOverride: (recipeId: string, language: string, text: RecipeText | null) => void;
  markFlagged: (recipeId: string) => void;
  addMyPhoto: (photo: MyPhoto) => void;
  updateMyPhoto: (id: string, patch: Partial<MyPhoto>) => void;
  removeMyPhoto: (id: string) => void;
  setRating: (recipeId: string, rating: RatingSummary) => void;
  /** Bestbewertete öffentliche Fotos je Rezept (nicht gespeichert, wird beim Start geladen). */
  topPhotos: Record<string, RecipePhoto>;
  /** Lädt Bewertungen und Top-Fotos vom Server; ohne Verbindung bleibt der letzte Stand. */
  refreshFeedback: () => Promise<void>;
  /** Anzeigefoto: eigenes Foto, sonst bestbewertetes Galeriefoto, sonst Katalogfoto. */
  imageFor: (recipe: Recipe) => RecipeMedia["image"];
  /** Durchschnittliche Sterne je Rezept mit mindestens einer Bewertung (für den Planer). */
  ratingAverages: () => Record<string, number>;
  setShared: (recipeId: string, communityId: string | null) => void;
  /** Einwilligung in die KI-Funktionen erteilen bzw. mit null widerrufen; gilt sofort für die nächste Anfrage. */
  setAiConsent: (consent: AiConsent | null) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(initialState);
  const [session, setSession] = useState<Session | null>(null);
  const writeSession = useRef<((session: Session | null) => Promise<void>) | null>(null);
  const [diary, setDiary] = useState<DiaryState>(emptyDiary);
  const [ready, setReady] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(false);
  const [topPhotos, setTopPhotos] = useState<Record<string, RecipePhoto>>({});
  const [storageIssues, setStorageIssues] = useState<StorageIssues>({ diary: null, state: false });
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "offline">("idle");
  const [syncRequest, setSyncRequest] = useState(0);
  const [dataSyncState, setDataSyncState] = useState<"idle" | "syncing" | "offline">("idle");
  const [dataSyncRequest, setDataSyncRequest] = useState(0);
  const [deviceClaim, setDeviceClaim] = useState<DeviceClaim | null>(null);
  // Speichern: was darf geschrieben werden (nach einem Lesefehler nichts, damit nichts überschrieben wird), was steht
  // schon im Speicher, und das Tagebuch vom alten Speicherort, bis es unter dem eigenen Schlüssel gespeichert ist.
  const persist = useRef({
    main: true,
    diary: true,
    legacyDiary: undefined as unknown,
    written: new Map<string, string>(),
    queue: Promise.resolve(),
  });
  const sync = useRef({ running: false, pulled: false, latest: emptyDiary() });
  // Abgleich von Einstellungen, Plan und Vorrat: läuft gerade, schon einmal geholt (für dieses Konto), neuester Zustand.
  const dataRef = useRef({ running: false, pulled: false, owner: "", latest: state });
  // Gerade abgehakte Mahlzeiten (Plan-Start und Mahlzeit), damit ein schneller Doppeltipp nicht zweimal einträgt.
  const marked = useRef(new Set<string>());

  useEffect(() => {
    (async () => {
      let loaded: Awaited<ReturnType<typeof loadState>>;
      try {
        loaded = await loadState();
      } catch {
        // Speicher nicht lesbar: in dieser Sitzung nichts speichern, sonst wäre der alte Zustand weg.
        persist.current.main = false;
        loaded = { state: initialState(), legacyDiary: undefined };
        setStorageIssues((i) => ({ ...i, state: true }));
      }
      try {
        const loadedDiary = await loadDiary(AsyncStorage, loaded.legacyDiary);
        persist.current.written = loadedDiary.written;
        if (loadedDiary.migrated) {
          // Erst unter dem eigenen Schlüssel speichern; bis das klappt, bleibt das Tagebuch auch am alten Ort.
          persist.current.legacyDiary = loaded.legacyDiary;
          await saveDiary(AsyncStorage, loadedDiary.state, loadedDiary.written).then(
            () => (persist.current.legacyDiary = undefined),
            () => setStorageIssues((i) => ({ ...i, diary: "failed" })),
          );
        }
        setDiary(loadedDiary.state);
      } catch {
        persist.current.diary = false;
        persist.current.legacyDiary = loaded.legacyDiary;
        setStorageIssues((i) => ({ ...i, diary: "unreadable" }));
      }
      const loadedSession = await loadSession(sessionStore, loaded.legacyAuth);
      writeSession.current = sessionWriter(sessionStore, loadedSession);
      setDeviceId(loaded.state.deviceId);
      setAuthToken(loadedSession?.token ?? null);
      setApiAiConsent(loaded.state.aiConsent);
      setSession(loadedSession);
      setState(loaded.state);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready || !persist.current.main) return;
    const legacyDiary = persist.current.legacyDiary;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(legacyDiary === undefined ? state : { ...state, diary: legacyDiary })).then(
      () => setStorageIssues((i) => (i.state ? { ...i, state: false } : i)),
      () => setStorageIssues((i) => (i.state ? i : { ...i, state: true })),
    );
  }, [state, ready]);

  // Anmelden, Abmelden und neue Kontodaten (Name, Rolle) sofort merken – unabhängig vom übrigen Zustand.
  useEffect(() => {
    if (ready) writeSession.current?.(session);
  }, [session, ready]);

  useEffect(() => {
    sync.current.latest = diary;
    if (!ready || !persist.current.diary) return;
    const p = persist.current;
    // Nacheinander speichern, damit ein älterer Stand nie einen neueren überschreibt.
    p.queue = p.queue
      .then(() => saveDiary(AsyncStorage, diary, p.written))
      .then(
        () => {
          p.legacyDiary = undefined;
          setStorageIssues((i) => (i.diary === "failed" ? { ...i, diary: null } : i));
        },
        () => setStorageIssues((i) => (i.diary ? i : { ...i, diary: "failed" })),
      );
  }, [diary, ready]);

  /**
   * Zustand ändern und merken, was davon mit dem Konto abgeglichen werden muss (lib/dataSync.ts). Alle Änderungen auf
   * diesem Gerät laufen hierüber; nur das Übernehmen vom Server nicht (das muss nicht wieder hoch).
   */
  const update = useCallback(
    (change: (s: PersistedState) => PersistedState) =>
      setState((s) => {
        const next = change(s);
        if (next === s) return s;
        const dataSync = trackChanges(next.dataSync, s, next);
        return dataSync === next.dataSync ? next : { ...next, dataSync };
      }),
    [],
  );

  /**
   * Beim nächsten Durchlauf auch ohne eigene Änderungen beim Server nachfragen – Tagebuch, Einstellungen, Plan und Vorrat
   * (z. B. beim Öffnen des Profils oder wenn die App wieder in den Vordergrund kommt).
   */
  const refreshSync = useCallback(() => {
    sync.current.pulled = false;
    dataRef.current.pulled = false;
    setSyncRequest((n) => n + 1);
    setDataSyncRequest((n) => n + 1);
  }, []);

  // Zurück in der App bzw. im Browser-Tab: holen, was andere Geräte inzwischen geändert haben.
  useEffect(() => {
    if (!HAS_SERVER) return;
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") refreshSync();
    });
    return () => subscription.remove();
  }, [refreshSync]);

  // Sicherung auf dem Server: beim Start einmal abgleichen, danach kurz nach jeder Änderung und nach dem An- oder
  // Abmelden (dann geht alles hoch und alles kommt zurück). Ohne Verbindung in einer Minute noch einmal.
  const owner = session ? `user:${session.user.id}` : `device:${state.deviceId}`;
  const pendingCount = diary.pending.length;
  const syncedOwner = diary.sync?.owner;
  useEffect(() => {
    if (!ready || !HAS_SERVER) return;
    const s = sync.current;
    if (s.running || (s.pulled && pendingCount === 0 && syncedOwner === owner)) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(
      async () => {
        s.running = true;
        setSyncState("syncing");
        try {
          const apply = await syncDiary(s.latest, owner, api.diarySync);
          s.pulled = true;
          setDiary((current) => apply(current));
          setSyncState("idle");
          // Während des Abgleichs Geändertes gleich hinterherschicken.
          setSyncRequest((n) => n + 1);
        } catch (e) {
          if (e instanceof ApiError && e.code.startsWith("auth_")) {
            // Sitzung abgelaufen: abmelden, dann geht die Historie wieder unter der Geräte-ID in die Sicherung.
            setAuthToken(null);
            setSession(null);
          } else {
            retry = setTimeout(() => setSyncRequest((n) => n + 1), 60_000);
          }
          setSyncState("offline");
        } finally {
          s.running = false;
        }
      },
      pendingCount > 0 ? 1500 : 0,
    );
    return () => {
      clearTimeout(timer);
      if (retry) clearTimeout(retry);
    };
  }, [ready, owner, pendingCount, syncedOwner, syncRequest]);

  // Abgleich von Einstellungen, Plan mit Einkaufsliste und Vorrat – nur mit Konto (lib/dataSync.ts): beim Start bzw.
  // nach der Anmeldung einmal, danach kurz nach jeder Änderung; ohne Verbindung in einer Minute noch einmal. Ein anderes
  // Konto als beim letzten Mal bekommt alles vom Gerät und schickt alles zurück.
  const signedIn = session !== null;
  const dataPending = pendingChanges(state.dataSync);
  const dataSyncedFor = syncedWith(state.dataSync, owner);
  useEffect(() => {
    dataRef.current.latest = state;
  }, [state]);
  useEffect(() => {
    if (!ready || !HAS_SERVER || !signedIn) return;
    const d = dataRef.current;
    if (d.owner !== owner) {
      d.owner = owner;
      d.pulled = false;
    }
    if (d.running || (d.pulled && dataPending === 0 && dataSyncedFor)) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(
      async () => {
        d.running = true;
        setDataSyncState("syncing");
        try {
          const apply = await syncData(d.latest, owner, api.dataSync);
          d.pulled = true;
          // Ohne update: Was vom Server kommt, muss nicht wieder hoch.
          setState((current) => apply(current));
          setDataSyncState("idle");
          // Während des Abgleichs Geändertes gleich hinterherschicken.
          setDataSyncRequest((n) => n + 1);
        } catch (e) {
          if (e instanceof ApiError && e.code.startsWith("auth_")) {
            // Sitzung abgelaufen: abmelden; Plan, Vorrat und Einstellungen bleiben auf dem Gerät.
            setAuthToken(null);
            setSession(null);
          } else {
            retry = setTimeout(() => setDataSyncRequest((n) => n + 1), 60_000);
          }
          setDataSyncState("offline");
        } finally {
          d.running = false;
        }
      },
      dataPending > 0 ? 1500 : 0,
    );
    return () => {
      clearTimeout(timer);
      if (retry) clearTimeout(retry);
    };
  }, [ready, owner, signedIn, dataPending, dataSyncedFor, dataSyncRequest]);

  // Nach jeder Anmeldung einmal: Was dieses Gerät ohne Konto auf dem Server hat (Fotos, Sterne, geteilte Rezepte,
  // Favoriten, Meldungen, Sicherung des Tagebuchs), gehört danach dem Konto (lib/deviceClaim.ts). Ohne Verbindung beim
  // nächsten Start noch einmal. setAuth setzt `claimedFor` zurück, damit auch kommt, was ohne Konto dazukam.
  const accountId = session?.user.id ?? null;
  useEffect(() => {
    if (!ready || !HAS_SERVER || !needsDeviceClaim(accountId, state.claimedFor)) return;
    let current = true;
    api.claimDevice().then(
      (claim) => {
        if (!current) return;
        setState((s) => ({ ...s, claimedFor: accountId }));
        if (!claimedAnything(claim)) return;
        setDeviceClaim(claim);
        // Die übernommenen Sterne und Fotos zählen jetzt als „meine“.
        Promise.all([api.ratings(), api.topPhotos()])
          .then(([ratings, top]) => {
            setState((s) => ({ ...s, ratings }));
            setTopPhotos(top);
          })
          .catch(() => {});
      },
      () => {
        // Kein Server, abgelaufene Sitzung o. Ä.: beim nächsten Start bzw. nach der nächsten Anmeldung noch einmal.
      },
    );
    return () => {
      current = false;
    };
  }, [ready, accountId, state.claimedFor]);

  // Bewertungen, Galerie-Fotos, Admin-Änderungen und Konto einmal beim Start laden;
  // ohne Server gilt der gespeicherte Stand.
  useEffect(() => {
    if (!ready) return;
    api
      .overrides()
      .then((catalogOverrides) => setState((s) => ({ ...s, catalogOverrides })))
      .catch(() => {});
    if (session) {
      const { token } = session;
      api
        .me()
        // Nur für dieselbe Sitzung übernehmen – wer inzwischen ein anderes Konto angemeldet hat, behält dessen Daten.
        .then((user) => setSession((s) => (s?.token === token ? { ...s, user } : s)))
        .catch((e) => {
          // Abgelaufene oder gesperrte Sitzung: abmelden. Netzwerkfehler ändern nichts.
          if (e instanceof ApiError && e.code.startsWith("auth_")) {
            setAuthToken(null);
            setSession(null);
          }
        });
    }
    Promise.all([api.ratings(), api.topPhotos()])
      .then(([ratings, top]) => {
        setState((s) => ({ ...s, ratings }));
        setTopPhotos(top);
      })
      .catch(() => {});
    // Absichtlich nur einmal nach dem Laden: eine spätere Anmeldung bringt das Konto über setAuth mit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const store = useMemo<Store>(() => {
    // Katalog mit den Änderungen der Admins; ausgeblendete Rezepte fallen weg.
    const catalog = { ingredients: baseCatalog.ingredients, recipes: applyOverrides(baseCatalog.recipes, state.catalogOverrides) };
    const ingredients = new Map(catalog.ingredients.map((i) => [i.id, i]));
    const userRecipes = [...state.myRecipes, ...state.savedRecipes, ...state.planRecipes];
    const recipes = new Map<string, Recipe>();
    for (const recipe of [...catalog.recipes, ...userRecipes]) {
      recipes.set(recipe.id, withStoredTexts(recipe, state.translations[recipe.id], state.textOverrides[recipe.id]));
    }
    return {
      ...state,
      ready,
      catalog,
      ingredients,
      recipes,
      userRecipes,
      diary: diary.entries,
      diaryState: diary,
      addDiaryEntry: (entry) => {
        const added = { ...entry, id: newId(), date: today(), time: nowTime() };
        setDiary((d) => addEntry(d, added));
      },
      removeDiaryEntry: (id) => setDiary((d) => removeEntry(d, id)),
      importDiary: (text) => {
        const result = importDiaryJson(diary, text);
        if (!result.ok) return result;
        setDiary((d) => {
          const again = importDiaryJson(d, text);
          return again.ok ? again.state : d;
        });
        const { state: _state, ...counts } = result;
        return counts;
      },
      diarySync: {
        state: !HAS_SERVER
          ? "off"
          : syncState === "syncing"
            ? "syncing"
            : syncState === "offline"
              ? "offline"
              : diary.pending.length > 0 || diary.sync?.owner !== owner
                ? "waiting"
                : "synced",
        pending: diary.pending.length,
        at: diary.sync?.at ?? null,
      },
      dataSyncStatus: {
        state: !HAS_SERVER
          ? "off"
          : !session
            ? "local"
            : dataSyncState === "syncing"
              ? "syncing"
              : dataSyncState === "offline"
                ? "offline"
                : pendingChanges(state.dataSync) > 0 || !syncedWith(state.dataSync, owner)
                  ? "waiting"
                  : "synced",
        pending: pendingChanges(state.dataSync),
        at: lastSynced(state.dataSync),
      },
      refreshSync,
      storageIssues,
      addPantryItems: (items) => update((s) => ({ ...s, pantry: addToPantry(s.pantry, items) })),
      setPantryAmount: (ingredientId, amount) =>
        update((s) => ({ ...s, pantry: setPantryAmount(s.pantry, ingredientId, Math.max(0, amount)) })),
      pendingPlan,
      setPendingPlan,
      setPlan: (plan, extraRecipes) =>
        update((s) => {
          // KI-Rezepte aus dem alten Plan behalten, solange sie noch eingeplant sind.
          const used = new Set(plan.weeks.flatMap((w) => w.meals.map((m) => m.recipeId)));
          const planRecipes = [...s.planRecipes, ...extraRecipes].filter((r) => used.has(r.id));
          // Gegessenes bleibt markiert, wenn derselbe Monat neu geplant wurde.
          const samePlan = s.plan?.startDate === plan.startDate;
          return {
            ...s,
            plan,
            planRecipes,
            eatenMeals: samePlan ? s.eatenMeals : [],
            shoppingChecked: samePlan ? s.shoppingChecked : [],
            shoppingBooked: samePlan ? s.shoppingBooked : [],
          };
        }),
      markMealEaten: (meal, title) => {
        const key = mealKey(meal);
        const once = `${state.plan?.startDate}:${key}`;
        const recipe = recipes.get(meal.recipeId);
        if (!recipe || state.eatenMeals.includes(key) || marked.current.has(once)) return;
        marked.current.add(once);
        update((s) =>
          s.eatenMeals.includes(key) ? s : { ...s, eatenMeals: [...s.eatenMeals, key], pantry: consumeMeal(s.pantry, meal, recipe) },
        );
        const entry: DiaryEntry = { id: newId(), date: today(), time: nowTime(), title, nutrients: meal.nutrientsPerPortion, source: "plan" };
        setDiary((d) => addEntry(d, entry));
      },
      toggleShoppingItem: (key) =>
        update((s) => ({
          ...s,
          shoppingChecked: s.shoppingChecked.includes(key) ? s.shoppingChecked.filter((k) => k !== key) : [...s.shoppingChecked, key],
        })),
      bookCheckedShopping: (week) =>
        update((s) => {
          const list = s.plan?.weeks[week]?.shoppingList;
          if (!list) return s;
          const booking = checkedToBook(list, week, s.shoppingChecked, s.shoppingBooked);
          if (booking.keys.length === 0) return s;
          return { ...s, pantry: addToPantry(s.pantry, booking.items), shoppingBooked: [...s.shoppingBooked, ...booking.keys] };
        }),
      toggleLock: (meal) =>
        update((s) =>
          s.plan
            ? {
                ...s,
                plan: {
                  ...s.plan,
                  weeks: s.plan.weeks.map((w) => ({
                    ...w,
                    meals: w.meals.map((m) => (mealKey(m) === mealKey(meal) ? { ...m, locked: !m.locked } : m)),
                  })),
                },
              }
            : s,
        ),
      saveOrder: (order) => update((s) => ({ ...s, orders: [order, ...s.orders.filter((o) => o.id !== order.id)] })),
      receiveOrder: (order, delivered) =>
        update((s) => {
          const previous = s.orders.find((o) => o.id === order.id);
          // Der Server kennt die Woche nicht; sie steht nur in der gespeicherten Bestellung.
          const merged: Order = { ...order, forWeek: order.forWeek ?? previous?.forWeek };
          const orders = [merged, ...s.orders.filter((o) => o.id !== order.id)];
          // Genau einmal buchen: nur beim Wechsel auf „geliefert“.
          if (order.status !== "geliefert" || previous?.status === "geliefert") return { ...s, orders };
          const booking = deliveryToBook(delivered, merged.forWeek, s.plan?.startDate, s.shoppingBooked);
          return {
            ...s,
            orders,
            pantry: addToPantry(s.pantry, booking.items),
            shoppingBooked: [...s.shoppingBooked, ...booking.keys.filter((k) => !s.shoppingBooked.includes(k))],
          };
        }),
      updateSettings: (settings) => update((s) => ({ ...s, settings: { ...s.settings, ...settings } })),
      saveRecipe: (recipe) =>
        update((s) => ({ ...s, myRecipes: [recipe, ...s.myRecipes.filter((r) => r.id !== recipe.id)] })),
      deleteRecipe: (id) =>
        update((s) => ({
          ...s,
          myRecipes: s.myRecipes.filter((r) => r.id !== id),
          favoriteIds: s.favoriteIds.filter((f) => f !== id),
        })),
      setFavorite: (recipe, favorite) =>
        update((s) => {
          const isCommunity = recipe.source.kind === "community";
          return {
            ...s,
            favoriteIds: favorite ? [...new Set([...s.favoriteIds, recipe.id])] : s.favoriteIds.filter((f) => f !== recipe.id),
            savedRecipes: isCommunity
              ? favorite
                ? [recipe, ...s.savedRecipes.filter((r) => r.id !== recipe.id)]
                : s.savedRecipes.filter((r) => r.id !== recipe.id)
              : s.savedRecipes,
          };
        }),
      setShared: (recipeId, communityId) =>
        update((s) => {
          const shared = { ...s.shared };
          if (communityId) shared[recipeId] = communityId;
          else delete shared[recipeId];
          return { ...s, shared };
        }),
      cacheTranslation: (recipeId, language, text) =>
        update((s) => ({
          ...s,
          translations: { ...s.translations, [recipeId]: { ...s.translations[recipeId], [language]: text } },
        })),
      setTextOverride: (recipeId, language, text) =>
        update((s) => {
          const forRecipe = { ...s.textOverrides[recipeId] };
          if (text) forRecipe[language] = text;
          else delete forRecipe[language];
          return { ...s, textOverrides: { ...s.textOverrides, [recipeId]: forRecipe } };
        }),
      markFlagged: (recipeId) =>
        update((s) => (s.flaggedIds.includes(recipeId) ? s : { ...s, flaggedIds: [...s.flaggedIds, recipeId] })),
      addMyPhoto: (photo) => update((s) => ({ ...s, myPhotos: [photo, ...s.myPhotos] })),
      updateMyPhoto: (id, patch) => update((s) => ({ ...s, myPhotos: s.myPhotos.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removeMyPhoto: (id) => update((s) => ({ ...s, myPhotos: s.myPhotos.filter((p) => p.id !== id) })),
      auth: session,
      deviceClaim,
      setAuth: (auth) => {
        setAuthToken(auth?.token ?? null);
        setSession(auth);
        setDeviceClaim(null);
        update((s) => ({
          ...s,
          // Nach jeder An- und Abmeldung übernimmt die nächste Anmeldung, was das Gerät dann ohne Konto hat.
          claimedFor: null,
          // Der Kontoname wird auch als Anzeigename für geteilte Rezepte genutzt.
          settings: auth && !s.settings.displayName ? { ...s.settings, displayName: auth.user.name } : s.settings,
        }));
      },
      isAdmin: session?.user.role === "admin",
      refreshOverrides: async () => {
        const catalogOverrides = await api.overrides();
        update((s) => ({ ...s, catalogOverrides }));
      },
      setRating: (recipeId, rating) => update((s) => ({ ...s, ratings: { ...s.ratings, [recipeId]: rating } })),
      topPhotos,
      refreshFeedback: async () => {
        const [ratings, top] = await Promise.all([api.ratings(), api.topPhotos()]);
        update((s) => ({ ...s, ratings }));
        setTopPhotos(top);
      },
      imageFor: (recipe) => {
        const own = state.myPhotos.find((p) => p.recipeId === recipe.id);
        if (own) return { uri: own.uri };
        const top = topPhotos[recipe.id];
        if (top) return { uri: top.uri, credit: top.authorName || undefined };
        // Fotos geteilter Rezepte liegen im Bildspeicher des Servers (Pfad statt data-URI, lib/serverImages.ts).
        return resolveImage(recipe.media?.image, BASE_URL);
      },
      ratingAverages: () =>
        Object.fromEntries(Object.entries(state.ratings).filter(([, r]) => r.count > 0).map(([id, r]) => [id, r.avg])),
      setAiConsent: (aiConsent) => {
        // Sofort, nicht erst nach dem nächsten Rendern: Gleich nach „Einverstanden“ geht die Anfrage los.
        setApiAiConsent(aiConsent);
        update((s) => ({ ...s, aiConsent }));
      },
    };
  }, [state, session, diary, ready, pendingPlan, topPhotos, storageIssues, syncState, dataSyncState, owner, refreshSync, update, deviceClaim]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore muss innerhalb von StoreProvider verwendet werden");
  return store;
}

/** Eindeutiger Schlüssel einer geplanten Mahlzeit im Monat. */
export const mealKey = (meal: Pick<PlannedMeal, "day" | "mealType">) => `${meal.day}:${meal.mealType}`;
