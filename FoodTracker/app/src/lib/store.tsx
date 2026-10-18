import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { addToPantry, consumeMeal, newId, nowTime, today } from "./pantry";
import type { DiaryEntry, Ingredient, MealPlan, Order, PantryItem, PlannedMeal, Recipe, Settings } from "./types";

interface PersistedState {
  diary: DiaryEntry[];
  pantry: PantryItem[];
  plan: MealPlan | null;
  planRecipes: Recipe[];
  /** Index der gegessenen Mahlzeiten im aktuellen Plan. */
  eatenMeals: number[];
  orders: Order[];
  settings: Settings;
}

const STORAGE_KEY = "foodtracker/state/v1";

const initialState: PersistedState = {
  diary: [],
  pantry: [],
  plan: null,
  planRecipes: [],
  eatenMeals: [],
  orders: [],
  settings: { kcalPerPersonPerDay: 2000, people: 1, days: 7, excludeTags: [], preferences: "" },
};

interface Store extends PersistedState {
  ready: boolean;
  ingredients: Map<string, Ingredient>;
  addDiaryEntry: (entry: Omit<DiaryEntry, "id" | "date" | "time">) => void;
  removeDiaryEntry: (id: string) => void;
  addPantryItems: (items: PantryItem[]) => void;
  setPlan: (plan: MealPlan, recipes: Recipe[]) => void;
  markMealEaten: (index: number) => void;
  saveOrder: (order: Order) => void;
  updateSettings: (settings: Partial<Settings>) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(initialState);
  const [ready, setReady] = useState(false);
  const [ingredients, setIngredients] = useState<Map<string, Ingredient>>(new Map());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setState({ ...initialState, ...JSON.parse(raw) }))
      .catch(() => {})
      .finally(() => setReady(true));
    api
      .catalog()
      .then((c) => setIngredients(new Map(c.ingredients.map((i) => [i.id, i]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const store = useMemo<Store>(
    () => ({
      ...state,
      ready,
      ingredients,
      addDiaryEntry: (entry) =>
        setState((s) => ({ ...s, diary: [...s.diary, { ...entry, id: newId(), date: today(), time: nowTime() }] })),
      removeDiaryEntry: (id) => setState((s) => ({ ...s, diary: s.diary.filter((e) => e.id !== id) })),
      addPantryItems: (items) => setState((s) => ({ ...s, pantry: addToPantry(s.pantry, items) })),
      setPlan: (plan, recipes) => setState((s) => ({ ...s, plan, planRecipes: recipes, eatenMeals: [] })),
      markMealEaten: (index) =>
        setState((s) => {
          const meal: PlannedMeal | undefined = s.plan?.meals[index];
          const recipe = s.planRecipes.find((r) => r.id === meal?.recipeId);
          if (!meal || !recipe || s.eatenMeals.includes(index)) return s;
          return {
            ...s,
            eatenMeals: [...s.eatenMeals, index],
            pantry: consumeMeal(s.pantry, meal, recipe),
            diary: [
              ...s.diary,
              { id: newId(), date: today(), time: nowTime(), title: meal.recipeName, nutrients: meal.nutrientsPerPortion, source: "plan" },
            ],
          };
        }),
      saveOrder: (order) =>
        setState((s) => ({ ...s, orders: [order, ...s.orders.filter((o) => o.id !== order.id)] })),
      updateSettings: (settings) => setState((s) => ({ ...s, settings: { ...s.settings, ...settings } })),
    }),
    [state, ready, ingredients],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore muss innerhalb von StoreProvider verwendet werden");
  return store;
}
