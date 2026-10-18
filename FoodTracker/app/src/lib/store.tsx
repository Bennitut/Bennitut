import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isUILanguage, regionFromCode } from "../i18n";
import { setDeviceId } from "./api";
import { INGREDIENTS, RECIPES } from "./catalog";
import { addToPantry, consumeMeal, migrateStock, newId, nowTime, setPantryAmount, today, type StockItem } from "./pantry";
import type {
  DiaryEntry,
  Ingredient,
  MealPlan,
  Order,
  PantryItem,
  PlannedMeal,
  Recipe,
  RecipeText,
  Settings,
} from "./types";

interface PersistedState {
  deviceId: string;
  diary: DiaryEntry[];
  /** Lagerbestand in der Küche, je Einkauf ein Posten. */
  pantry: StockItem[];
  plan: MealPlan | null;
  /** Rezepte, die nur im aktuellen Plan vorkommen (z. B. KI-Vorschläge). */
  planRecipes: Recipe[];
  /** Index der gegessenen Mahlzeiten im aktuellen Plan. */
  eatenMeals: number[];
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
  settings: Settings;
}

/** Fest eingebauter Katalog – funktioniert auch ohne Verbindung zum Server. */
const catalog = { ingredients: INGREDIENTS, recipes: RECIPES };

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
    orders: [],
    myRecipes: [],
    favoriteIds: [],
    savedRecipes: [],
    shared: {},
    translations: {},
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
    return {
      ...base,
      ...saved,
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
  catalog: typeof catalog;
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
  setPlan: (plan: MealPlan, extraRecipes: Recipe[]) => void;
  markMealEaten: (index: number, title: string) => void;
  toggleLock: (index: number) => void;
  saveOrder: (order: Order) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  saveRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: string) => void;
  setFavorite: (recipe: Recipe, favorite: boolean) => void;
  cacheTranslation: (recipeId: string, language: string, text: RecipeText) => void;
  setShared: (recipeId: string, communityId: string | null) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadState()
      .catch(() => initialState())
      .then((loaded) => {
        setDeviceId(loaded.deviceId);
        setState(loaded);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const store = useMemo<Store>(() => {
    const ingredients = new Map(catalog.ingredients.map((i) => [i.id, i]));
    const userRecipes = [...state.myRecipes, ...state.savedRecipes, ...state.planRecipes];
    const recipes = new Map<string, Recipe>();
    for (const recipe of [...catalog.recipes, ...userRecipes]) {
      const cached = state.translations[recipe.id];
      recipes.set(recipe.id, cached ? { ...recipe, translations: { ...recipe.translations, ...cached } } : recipe);
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
      setPlan: (plan, extraRecipes) =>
        setState((s) => {
          // KI-Rezepte aus dem alten Plan behalten, solange sie noch eingeplant sind.
          const used = new Set(plan.meals.map((m) => m.recipeId));
          const planRecipes = [...s.planRecipes, ...extraRecipes].filter((r) => used.has(r.id));
          return { ...s, plan, planRecipes, eatenMeals: [] };
        }),
      markMealEaten: (index, title) =>
        setState((s) => {
          const meal: PlannedMeal | undefined = s.plan?.meals[index];
          const recipe = meal && recipes.get(meal.recipeId);
          if (!meal || !recipe || s.eatenMeals.includes(index)) return s;
          return {
            ...s,
            eatenMeals: [...s.eatenMeals, index],
            pantry: consumeMeal(s.pantry, meal, recipe),
            diary: [...s.diary, { id: newId(), date: today(), time: nowTime(), title, nutrients: meal.nutrientsPerPortion, source: "plan" }],
          };
        }),
      toggleLock: (index) =>
        setState((s) =>
          s.plan
            ? { ...s, plan: { ...s.plan, meals: s.plan.meals.map((m, i) => (i === index ? { ...m, locked: !m.locked } : m)) } }
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
    };
  }, [state, ready]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore muss innerhalb von StoreProvider verwendet werden");
  return store;
}
