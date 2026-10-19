import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isUILanguage, regionFromCode } from "../i18n";
import { ApiError, api, setAuthToken, setDeviceId } from "./api";
import { INGREDIENTS, RECIPES, applyOverrides } from "./catalog";
import { addToPantry, consumeMeal, migrateStock, newId, nowTime, setPantryAmount, today, type StockItem } from "./pantry";
import type {
  Account,
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

interface PersistedState {
  deviceId: string;
  diary: DiaryEntry[];
  /** Lagerbestand in der Küche, je Einkauf ein Posten. */
  pantry: StockItem[];
  plan: MonthPlan | null;
  /** Rezepte, die nur im aktuellen Plan vorkommen (z. B. KI-Vorschläge). */
  planRecipes: Recipe[];
  /** Gegessene Mahlzeiten im aktuellen Plan als "Tag:Mahlzeit". */
  eatenMeals: string[];
  /** Abgehakte Einträge der Einkaufsliste ("Woche:Zutat"), gelten für den aktuellen Plan. */
  shoppingChecked: string[];
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
  /** Angemeldetes Konto mit Sitzungstoken; null = anonym. */
  auth: { token: string; user: Account } | null;
  /** Änderungen der Admins an Katalogrezepten (zuletzt geladener Stand, gilt auch offline). */
  catalogOverrides: Record<string, RecipeOverride>;
  settings: Settings;
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
    diary: [],
    pantry: [],
    plan: null,
    planRecipes: [],
    eatenMeals: [],
    shoppingChecked: [],
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
    auth: null,
    catalogOverrides: {},
    settings: defaultSettings(),
  };
}

/** Lädt den gespeicherten Zustand; aus Version 1 werden Tagebuch und Vorrat übernommen. */
async function loadState(): Promise<PersistedState> {
  const base = initialState();
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    // Ältere Versionen speicherten auch den Katalog; der kommt jetzt immer aus der App.
    const { catalog: _oldCatalog, ...saved } = JSON.parse(raw) as Partial<PersistedState> & { catalog?: unknown };
    // Pläne aus Versionen vor dem Monatsplan werden verworfen.
    const plan = saved.plan && "weeks" in saved.plan ? saved.plan : null;
    return {
      ...base,
      ...saved,
      plan,
      eatenMeals: plan ? (saved.eatenMeals ?? []).filter((e): e is string => typeof e === "string") : [],
      shoppingChecked: plan ? (saved.shoppingChecked ?? []).filter((e): e is string => typeof e === "string") : [],
      pantry: migrateStock(saved.pantry ?? []),
      settings: { ...base.settings, ...saved.settings },
    };
  }
  const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacy) return base;
  const old = JSON.parse(legacy) as { diary?: DiaryEntry[]; pantry?: PantryItem[]; settings?: Partial<Settings> };
  return {
    ...base,
    diary: old.diary ?? [],
    pantry: migrateStock(old.pantry ?? []),
    settings: {
      ...base.settings,
      kcalPerPersonPerDay: old.settings?.kcalPerPersonPerDay ?? base.settings.kcalPerPersonPerDay,
      people: old.settings?.people ?? base.settings.people,
      days: old.settings?.days ?? base.settings.days,
    },
  };
}

interface Store extends PersistedState {
  ready: boolean;
  catalog: typeof baseCatalog;
  /** Anmelden (Konto und Token speichern) bzw. mit null abmelden. */
  setAuth: (auth: { token: string; user: Account } | null) => void;
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
  toggleLock: (meal: PlannedMeal) => void;
  /** Nach dem Fragebogen soll der Plan-Tab gleich einen Plan erstellen. */
  pendingPlan: boolean;
  setPendingPlan: (pending: boolean) => void;
  saveOrder: (order: Order) => void;
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
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(initialState);
  const [ready, setReady] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(false);
  const [topPhotos, setTopPhotos] = useState<Record<string, RecipePhoto>>({});

  useEffect(() => {
    loadState()
      .catch(() => initialState())
      .then((loaded) => {
        setDeviceId(loaded.deviceId);
        setAuthToken(loaded.auth?.token ?? null);
        setState(loaded);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  // Bewertungen, Galerie-Fotos, Admin-Änderungen und Konto einmal beim Start laden;
  // ohne Server gilt der gespeicherte Stand.
  useEffect(() => {
    if (!ready) return;
    api
      .overrides()
      .then((catalogOverrides) => setState((s) => ({ ...s, catalogOverrides })))
      .catch(() => {});
    if (state.auth) {
      api
        .me()
        .then((user) => setState((s) => (s.auth ? { ...s, auth: { ...s.auth, user } } : s)))
        .catch((e) => {
          // Abgelaufene oder gesperrte Sitzung: abmelden. Netzwerkfehler ändern nichts.
          if (e instanceof ApiError && e.code.startsWith("auth_")) {
            setAuthToken(null);
            setState((s) => ({ ...s, auth: null }));
          }
        });
    }
    Promise.all([api.ratings(), api.topPhotos()])
      .then(([ratings, top]) => {
        setState((s) => ({ ...s, ratings }));
        setTopPhotos(top);
      })
      .catch(() => {});
  }, [ready]);

  const store = useMemo<Store>(() => {
    // Katalog mit den Änderungen der Admins; ausgeblendete Rezepte fallen weg.
    const catalog = { ingredients: baseCatalog.ingredients, recipes: applyOverrides(baseCatalog.recipes, state.catalogOverrides) };
    const ingredients = new Map(catalog.ingredients.map((i) => [i.id, i]));
    const userRecipes = [...state.myRecipes, ...state.savedRecipes, ...state.planRecipes];
    const recipes = new Map<string, Recipe>();
    for (const recipe of [...catalog.recipes, ...userRecipes]) {
      const cached = state.translations[recipe.id];
      let r = cached ? { ...recipe, translations: { ...recipe.translations, ...cached } } : recipe;
      // Verbesserte Texte ersetzen das Original bzw. die Übersetzung der jeweiligen Sprache.
      for (const [language, text] of Object.entries(state.textOverrides[recipe.id] ?? {})) {
        r =
          language === r.language
            ? { ...r, name: text.name, steps: text.steps ?? r.steps, otherIngredients: text.otherIngredients ?? r.otherIngredients }
            : { ...r, translations: { ...r.translations, [language]: text } };
      }
      recipes.set(recipe.id, r);
    }
    return {
      ...state,
      ready,
      catalog,
      ingredients,
      recipes,
      userRecipes,
      addDiaryEntry: (entry) =>
        setState((s) => ({ ...s, diary: [...s.diary, { ...entry, id: newId(), date: today(), time: nowTime() }] })),
      removeDiaryEntry: (id) => setState((s) => ({ ...s, diary: s.diary.filter((e) => e.id !== id) })),
      addPantryItems: (items) => setState((s) => ({ ...s, pantry: addToPantry(s.pantry, items) })),
      setPantryAmount: (ingredientId, amount) =>
        setState((s) => ({ ...s, pantry: setPantryAmount(s.pantry, ingredientId, Math.max(0, amount)) })),
      pendingPlan,
      setPendingPlan,
      setPlan: (plan, extraRecipes) =>
        setState((s) => {
          // KI-Rezepte aus dem alten Plan behalten, solange sie noch eingeplant sind.
          const used = new Set(plan.weeks.flatMap((w) => w.meals.map((m) => m.recipeId)));
          const planRecipes = [...s.planRecipes, ...extraRecipes].filter((r) => used.has(r.id));
          // Gegessenes bleibt markiert, wenn derselbe Monat neu geplant wurde.
          const samePlan = s.plan?.startDate === plan.startDate;
          return { ...s, plan, planRecipes, eatenMeals: samePlan ? s.eatenMeals : [], shoppingChecked: samePlan ? s.shoppingChecked : [] };
        }),
      markMealEaten: (meal, title) =>
        setState((s) => {
          const key = mealKey(meal);
          const recipe = recipes.get(meal.recipeId);
          if (!recipe || s.eatenMeals.includes(key)) return s;
          return {
            ...s,
            eatenMeals: [...s.eatenMeals, key],
            pantry: consumeMeal(s.pantry, meal, recipe),
            diary: [...s.diary, { id: newId(), date: today(), time: nowTime(), title, nutrients: meal.nutrientsPerPortion, source: "plan" }],
          };
        }),
      toggleShoppingItem: (key) =>
        setState((s) => ({
          ...s,
          shoppingChecked: s.shoppingChecked.includes(key) ? s.shoppingChecked.filter((k) => k !== key) : [...s.shoppingChecked, key],
        })),
      toggleLock: (meal) =>
        setState((s) =>
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
      saveOrder: (order) => setState((s) => ({ ...s, orders: [order, ...s.orders.filter((o) => o.id !== order.id)] })),
      updateSettings: (settings) => setState((s) => ({ ...s, settings: { ...s.settings, ...settings } })),
      saveRecipe: (recipe) =>
        setState((s) => ({ ...s, myRecipes: [recipe, ...s.myRecipes.filter((r) => r.id !== recipe.id)] })),
      deleteRecipe: (id) =>
        setState((s) => ({
          ...s,
          myRecipes: s.myRecipes.filter((r) => r.id !== id),
          favoriteIds: s.favoriteIds.filter((f) => f !== id),
        })),
      setFavorite: (recipe, favorite) =>
        setState((s) => {
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
        setState((s) => {
          const shared = { ...s.shared };
          if (communityId) shared[recipeId] = communityId;
          else delete shared[recipeId];
          return { ...s, shared };
        }),
      cacheTranslation: (recipeId, language, text) =>
        setState((s) => ({
          ...s,
          translations: { ...s.translations, [recipeId]: { ...s.translations[recipeId], [language]: text } },
        })),
      setTextOverride: (recipeId, language, text) =>
        setState((s) => {
          const forRecipe = { ...s.textOverrides[recipeId] };
          if (text) forRecipe[language] = text;
          else delete forRecipe[language];
          return { ...s, textOverrides: { ...s.textOverrides, [recipeId]: forRecipe } };
        }),
      markFlagged: (recipeId) =>
        setState((s) => (s.flaggedIds.includes(recipeId) ? s : { ...s, flaggedIds: [...s.flaggedIds, recipeId] })),
      addMyPhoto: (photo) => setState((s) => ({ ...s, myPhotos: [photo, ...s.myPhotos] })),
      updateMyPhoto: (id, patch) => setState((s) => ({ ...s, myPhotos: s.myPhotos.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removeMyPhoto: (id) => setState((s) => ({ ...s, myPhotos: s.myPhotos.filter((p) => p.id !== id) })),
      setAuth: (auth) => {
        setAuthToken(auth?.token ?? null);
        setState((s) => ({
          ...s,
          auth,
          // Der Kontoname wird auch als Anzeigename für geteilte Rezepte genutzt.
          settings: auth && !s.settings.displayName ? { ...s.settings, displayName: auth.user.name } : s.settings,
        }));
      },
      isAdmin: state.auth?.user.role === "admin",
      refreshOverrides: async () => {
        const catalogOverrides = await api.overrides();
        setState((s) => ({ ...s, catalogOverrides }));
      },
      setRating: (recipeId, rating) => setState((s) => ({ ...s, ratings: { ...s.ratings, [recipeId]: rating } })),
      topPhotos,
      refreshFeedback: async () => {
        const [ratings, top] = await Promise.all([api.ratings(), api.topPhotos()]);
        setState((s) => ({ ...s, ratings }));
        setTopPhotos(top);
      },
      imageFor: (recipe) => {
        const own = state.myPhotos.find((p) => p.recipeId === recipe.id);
        if (own) return { uri: own.uri };
        const top = topPhotos[recipe.id];
        if (top) return { uri: top.uri, credit: top.authorName || undefined };
        return recipe.media?.image;
      },
      ratingAverages: () =>
        Object.fromEntries(Object.entries(state.ratings).filter(([, r]) => r.count > 0).map(([id, r]) => [id, r.avg])),
    };
  }, [state, ready, pendingPlan, topPhotos]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore muss innerhalb von StoreProvider verwendet werden");
  return store;
}

/** Eindeutiger Schlüssel einer geplanten Mahlzeit im Monat. */
export const mealKey = (meal: Pick<PlannedMeal, "day" | "mealType">) => `${meal.day}:${meal.mealType}`;
