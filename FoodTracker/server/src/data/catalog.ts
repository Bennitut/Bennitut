import type { Ingredient, Recipe } from "../types.js";

// Richtwerte (gerundet) für typische Supermarktprodukte in Deutschland.
export const INGREDIENTS: Ingredient[] = [
  { id: "haferflocken", name: "Haferflocken", unit: "g", nutrients: { kcal: 370, protein: 13, carbs: 59, fat: 7 }, packSize: 500, packPrice: 0.89, shelfLifeDays: 180 },
  { id: "milch", name: "Milch 1,5 %", unit: "ml", nutrients: { kcal: 47, protein: 3.4, carbs: 4.8, fat: 1.5 }, packSize: 1000, packPrice: 1.09, shelfLifeDays: 7 },
  { id: "joghurt", name: "Naturjoghurt", unit: "g", nutrients: { kcal: 63, protein: 4, carbs: 5, fat: 3.5 }, packSize: 500, packPrice: 0.99, shelfLifeDays: 10 },
  { id: "eier", name: "Eier", unit: "stk", nutrients: { kcal: 80, protein: 7, carbs: 0.5, fat: 5.5 }, packSize: 10, packPrice: 2.79, shelfLifeDays: 21 },
  { id: "vollkornbrot", name: "Vollkornbrot", unit: "g", nutrients: { kcal: 220, protein: 8, carbs: 38, fat: 2 }, packSize: 500, packPrice: 1.79, shelfLifeDays: 6 },
  { id: "banane", name: "Banane", unit: "stk", nutrients: { kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 }, packSize: 5, packPrice: 1.49, shelfLifeDays: 6 },
  { id: "apfel", name: "Apfel", unit: "stk", nutrients: { kcal: 80, protein: 0.4, carbs: 19, fat: 0.3 }, packSize: 6, packPrice: 2.49, shelfLifeDays: 21 },
  { id: "beeren", name: "TK-Beeren", unit: "g", nutrients: { kcal: 45, protein: 1, carbs: 8, fat: 0.4 }, packSize: 300, packPrice: 2.29, shelfLifeDays: 180 },
  { id: "nudeln", name: "Vollkornnudeln", unit: "g", nutrients: { kcal: 350, protein: 13, carbs: 64, fat: 2.5 }, packSize: 500, packPrice: 1.19, shelfLifeDays: 365 },
  { id: "reis", name: "Basmatireis", unit: "g", nutrients: { kcal: 350, protein: 8, carbs: 77, fat: 1 }, packSize: 500, packPrice: 1.69, shelfLifeDays: 365 },
  { id: "kartoffeln", name: "Kartoffeln", unit: "g", nutrients: { kcal: 77, protein: 2, carbs: 17, fat: 0.1 }, packSize: 1500, packPrice: 2.49, shelfLifeDays: 21 },
  { id: "linsen", name: "Rote Linsen", unit: "g", nutrients: { kcal: 340, protein: 24, carbs: 50, fat: 1.5 }, packSize: 500, packPrice: 1.99, shelfLifeDays: 365 },
  { id: "kichererbsen", name: "Kichererbsen (Dose)", unit: "g", nutrients: { kcal: 120, protein: 7, carbs: 15, fat: 2.5 }, packSize: 400, packPrice: 0.89, shelfLifeDays: 365 },
  { id: "tomaten_dose", name: "Gehackte Tomaten (Dose)", unit: "g", nutrients: { kcal: 22, protein: 1.2, carbs: 3.5, fat: 0.2 }, packSize: 400, packPrice: 0.69, shelfLifeDays: 365 },
  { id: "zwiebel", name: "Zwiebeln", unit: "stk", nutrients: { kcal: 40, protein: 1, carbs: 9, fat: 0.1 }, packSize: 6, packPrice: 1.29, shelfLifeDays: 30 },
  { id: "paprika", name: "Paprika", unit: "stk", nutrients: { kcal: 30, protein: 1, carbs: 6, fat: 0.3 }, packSize: 3, packPrice: 1.99, shelfLifeDays: 7 },
  { id: "zucchini", name: "Zucchini", unit: "stk", nutrients: { kcal: 35, protein: 2.5, carbs: 6, fat: 0.6 }, packSize: 2, packPrice: 1.49, shelfLifeDays: 7 },
  { id: "brokkoli", name: "Brokkoli", unit: "g", nutrients: { kcal: 34, protein: 2.8, carbs: 7, fat: 0.4 }, packSize: 500, packPrice: 1.49, shelfLifeDays: 5 },
  { id: "spinat", name: "Babyspinat", unit: "g", nutrients: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 }, packSize: 200, packPrice: 1.79, shelfLifeDays: 4 },
  { id: "karotten", name: "Karotten", unit: "g", nutrients: { kcal: 41, protein: 0.9, carbs: 10, fat: 0.2 }, packSize: 1000, packPrice: 1.29, shelfLifeDays: 21 },
  { id: "haehnchen", name: "Hähnchenbrust", unit: "g", nutrients: { kcal: 110, protein: 23, carbs: 0, fat: 1.5 }, packSize: 400, packPrice: 4.99, shelfLifeDays: 3 },
  { id: "lachs", name: "Lachsfilet", unit: "g", nutrients: { kcal: 200, protein: 20, carbs: 0, fat: 13 }, packSize: 250, packPrice: 4.49, shelfLifeDays: 2 },
  { id: "tofu", name: "Tofu natur", unit: "g", nutrients: { kcal: 145, protein: 15, carbs: 2, fat: 8.5 }, packSize: 400, packPrice: 2.29, shelfLifeDays: 14 },
  { id: "feta", name: "Feta", unit: "g", nutrients: { kcal: 260, protein: 17, carbs: 1, fat: 21 }, packSize: 200, packPrice: 1.89, shelfLifeDays: 7 },
  { id: "kokosmilch", name: "Kokosmilch", unit: "ml", nutrients: { kcal: 180, protein: 1.5, carbs: 3, fat: 18 }, packSize: 400, packPrice: 1.49, shelfLifeDays: 365 },
  { id: "olivenoel", name: "Olivenöl", unit: "ml", nutrients: { kcal: 820, protein: 0, carbs: 0, fat: 91 }, packSize: 500, packPrice: 5.99, shelfLifeDays: 365 },
  { id: "erdnussbutter", name: "Erdnussbutter", unit: "g", nutrients: { kcal: 600, protein: 25, carbs: 14, fat: 50 }, packSize: 350, packPrice: 2.99, shelfLifeDays: 180 },
];

export const RECIPES: Recipe[] = [
  { id: "porridge_beeren", name: "Porridge mit Beeren", mealTypes: ["breakfast"], tags: ["vegetarisch"], ingredients: [
    { ingredientId: "haferflocken", amount: 70 }, { ingredientId: "milch", amount: 250 }, { ingredientId: "beeren", amount: 100 } ] },
  { id: "porridge_banane", name: "Bananen-Erdnuss-Porridge", mealTypes: ["breakfast"], tags: ["vegetarisch"], ingredients: [
    { ingredientId: "haferflocken", amount: 70 }, { ingredientId: "milch", amount: 250 }, { ingredientId: "banane", amount: 1 }, { ingredientId: "erdnussbutter", amount: 15 } ] },
  { id: "joghurt_bowl", name: "Joghurt-Bowl mit Apfel", mealTypes: ["breakfast"], tags: ["vegetarisch"], ingredients: [
    { ingredientId: "joghurt", amount: 250 }, { ingredientId: "haferflocken", amount: 40 }, { ingredientId: "apfel", amount: 1 } ] },
  { id: "ruehrei_brot", name: "Rührei mit Spinat & Brot", mealTypes: ["breakfast", "dinner"], tags: ["vegetarisch"], ingredients: [
    { ingredientId: "eier", amount: 3 }, { ingredientId: "spinat", amount: 50 }, { ingredientId: "vollkornbrot", amount: 100 }, { ingredientId: "olivenoel", amount: 5 } ] },
  { id: "linsen_dal", name: "Rote-Linsen-Dal mit Reis", mealTypes: ["lunch", "dinner"], tags: ["vegan"], ingredients: [
    { ingredientId: "linsen", amount: 80 }, { ingredientId: "kokosmilch", amount: 100 }, { ingredientId: "tomaten_dose", amount: 100 }, { ingredientId: "zwiebel", amount: 0.5 }, { ingredientId: "reis", amount: 60 }, { ingredientId: "spinat", amount: 50 } ] },
  { id: "kichererbsen_curry", name: "Kichererbsen-Curry", mealTypes: ["lunch", "dinner"], tags: ["vegan"], ingredients: [
    { ingredientId: "kichererbsen", amount: 200 }, { ingredientId: "kokosmilch", amount: 100 }, { ingredientId: "tomaten_dose", amount: 100 }, { ingredientId: "zwiebel", amount: 0.5 }, { ingredientId: "reis", amount: 70 }, { ingredientId: "brokkoli", amount: 125 } ] },
  { id: "nudeln_tomate", name: "Vollkornnudeln mit Tomaten-Zucchini-Sauce", mealTypes: ["lunch", "dinner"], tags: ["vegetarisch"], ingredients: [
    { ingredientId: "nudeln", amount: 125 }, { ingredientId: "tomaten_dose", amount: 200 }, { ingredientId: "zucchini", amount: 0.5 }, { ingredientId: "zwiebel", amount: 0.5 }, { ingredientId: "feta", amount: 50 }, { ingredientId: "olivenoel", amount: 10 } ] },
  { id: "haehnchen_reis", name: "Hähnchen mit Reis & Brokkoli", mealTypes: ["lunch", "dinner"], tags: ["fleisch"], ingredients: [
    { ingredientId: "haehnchen", amount: 200 }, { ingredientId: "reis", amount: 80 }, { ingredientId: "brokkoli", amount: 125 }, { ingredientId: "olivenoel", amount: 10 } ] },
  { id: "haehnchen_paprika", name: "Hähnchen-Paprika-Pfanne mit Kartoffeln", mealTypes: ["lunch", "dinner"], tags: ["fleisch"], ingredients: [
    { ingredientId: "haehnchen", amount: 200 }, { ingredientId: "paprika", amount: 1 }, { ingredientId: "kartoffeln", amount: 300 }, { ingredientId: "zwiebel", amount: 0.5 }, { ingredientId: "olivenoel", amount: 10 } ] },
  { id: "lachs_kartoffeln", name: "Lachs mit Ofenkartoffeln & Karotten", mealTypes: ["lunch", "dinner"], tags: ["fisch"], ingredients: [
    { ingredientId: "lachs", amount: 125 }, { ingredientId: "kartoffeln", amount: 300 }, { ingredientId: "karotten", amount: 150 }, { ingredientId: "olivenoel", amount: 10 } ] },
  { id: "tofu_gemuese", name: "Tofu-Gemüse-Pfanne mit Reis", mealTypes: ["lunch", "dinner"], tags: ["vegan"], ingredients: [
    { ingredientId: "tofu", amount: 200 }, { ingredientId: "paprika", amount: 1 }, { ingredientId: "zucchini", amount: 0.5 }, { ingredientId: "reis", amount: 70 }, { ingredientId: "olivenoel", amount: 10 } ] },
  { id: "ofengemuese_feta", name: "Ofengemüse mit Feta", mealTypes: ["lunch", "dinner"], tags: ["vegetarisch"], ingredients: [
    { ingredientId: "kartoffeln", amount: 250 }, { ingredientId: "karotten", amount: 150 }, { ingredientId: "paprika", amount: 1 }, { ingredientId: "feta", amount: 100 }, { ingredientId: "olivenoel", amount: 10 } ] },
  { id: "linsensuppe", name: "Linsen-Karotten-Suppe mit Brot", mealTypes: ["lunch", "dinner"], tags: ["vegan"], ingredients: [
    { ingredientId: "linsen", amount: 80 }, { ingredientId: "karotten", amount: 150 }, { ingredientId: "kartoffeln", amount: 150 }, { ingredientId: "zwiebel", amount: 0.5 }, { ingredientId: "vollkornbrot", amount: 100 } ] },
  { id: "omelett_gemuese", name: "Gemüse-Omelett", mealTypes: ["breakfast", "dinner"], tags: ["vegetarisch"], ingredients: [
    { ingredientId: "eier", amount: 3 }, { ingredientId: "paprika", amount: 0.5 }, { ingredientId: "zucchini", amount: 0.5 }, { ingredientId: "feta", amount: 30 }, { ingredientId: "olivenoel", amount: 5 } ] },
];

export const ingredientById = new Map(INGREDIENTS.map((i) => [i.id, i]));
