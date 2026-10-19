import type { Allergen, Ingredient, IngredientCategory, IngredientDiet, Unit } from "../types.js";

type Names = [de: string, en: string, fr: string, it: string, es: string];

interface Extra {
  allergens?: Allergen[];
  at?: string;
  ch?: string;
  /** Haltbarkeit nach dem Öffnen in Tagen. */
  opened?: number;
  pork?: boolean;
}

/**
 * Kompakte Schreibweise: Namen (de, en, fr, it, es), Kategorie, Einheit,
 * Nährwerte [kcal, Eiweiß, Kohlenhydrate, Fett] pro 100 g/ml bzw. Stück,
 * Packungsgröße, Richtpreis (€, Deutschland), Haltbarkeit in Tagen, Ernährungsform.
 */
function ing(
  id: string,
  [de, en, fr, it, es]: Names,
  category: IngredientCategory,
  unit: Unit,
  [kcal, protein, carbs, fat]: [number, number, number, number],
  packSize: number,
  packPrice: number,
  shelfLifeDays: number,
  diet: IngredientDiet,
  { allergens = [], at, ch, opened, pork }: Extra = {},
): Ingredient {
  return {
    id,
    name: { de, en, fr, it, es, ...(at ? { "de-AT": at } : {}), ...(ch ? { "de-CH": ch } : {}) },
    category,
    unit,
    nutrients: { kcal, protein, carbs, fat },
    packSize,
    packPrice,
    shelfLifeDays,
    ...(opened ? { openedShelfLifeDays: opened } : {}),
    diet,
    allergens,
    ...(pork ? { pork } : {}),
  };
}

const gluten: Extra = { allergens: ["gluten"] };
const laktose: Extra = { allergens: ["laktose"] };
const soja: Extra = { allergens: ["soja"] };
const nuesse: Extra = { allergens: ["nuesse"] };
const fisch: Extra = { allergens: ["fisch"] };
const dose: Extra = { opened: 3 };

// Nährwerte und Preise sind gerundete Richtwerte typischer Supermarktprodukte.
export const INGREDIENTS: Ingredient[] = [
  // Getreide, Brot, Kartoffeln
  ing("haferflocken", ["Haferflocken", "Rolled oats", "Flocons d'avoine", "Fiocchi d'avena", "Copos de avena"], "getreide", "g", [370, 13, 59, 7], 500, 0.89, 180, "vegan", gluten),
  ing("nudeln", ["Vollkornnudeln", "Wholewheat pasta", "Pâtes complètes", "Pasta integrale", "Pasta integral"], "getreide", "g", [350, 13, 64, 2.5], 500, 1.19, 365, "vegan", gluten),
  ing("spaghetti", ["Spaghetti", "Spaghetti", "Spaghetti", "Spaghetti", "Espaguetis"], "getreide", "g", [355, 12, 71, 1.5], 500, 0.99, 365, "vegan", gluten),
  ing("reis", ["Basmatireis", "Basmati rice", "Riz basmati", "Riso basmati", "Arroz basmati"], "getreide", "g", [350, 8, 77, 1], 500, 1.69, 365, "vegan"),
  ing("vollkornreis", ["Vollkornreis", "Brown rice", "Riz complet", "Riso integrale", "Arroz integral"], "getreide", "g", [350, 7.5, 72, 2.5], 500, 1.49, 365, "vegan"),
  ing("quinoa", ["Quinoa", "Quinoa", "Quinoa", "Quinoa", "Quinoa"], "getreide", "g", [360, 14, 58, 6], 500, 3.49, 365, "vegan"),
  ing("couscous", ["Couscous", "Couscous", "Couscous", "Cuscus", "Cuscús"], "getreide", "g", [355, 12, 72, 1.5], 500, 1.29, 365, "vegan", gluten),
  ing("bulgur", ["Bulgur", "Bulgur wheat", "Boulgour", "Bulgur", "Bulgur"], "getreide", "g", [350, 12, 69, 1.5], 500, 1.39, 365, "vegan", gluten),
  ing("polenta", ["Polenta (Maisgrieß)", "Polenta", "Polenta", "Polenta", "Polenta"], "getreide", "g", [350, 8, 75, 1.5], 500, 1.29, 365, "vegan"),
  ing("mehl", ["Weizenmehl", "Wheat flour", "Farine de blé", "Farina di frumento", "Harina de trigo"], "getreide", "g", [340, 10, 71, 1], 1000, 0.79, 365, "vegan", gluten),
  ing("vollkornbrot", ["Vollkornbrot", "Wholegrain bread", "Pain complet", "Pane integrale", "Pan integral"], "getreide", "g", [220, 8, 38, 2], 500, 1.79, 6, "vegan", gluten),
  ing("broetchen", ["Brötchen", "Bread rolls", "Petits pains", "Panini", "Panecillos"], "getreide", "stk", [150, 5, 29, 1], 6, 1.49, 2, "vegan", { ...gluten, at: "Semmeln", ch: "Brötli" }),
  ing("tortilla", ["Weizentortillas", "Wheat tortillas", "Tortillas de blé", "Tortillas di frumento", "Tortillas de trigo"], "getreide", "stk", [190, 5, 32, 4.5], 8, 1.79, 14, "vegan", gluten),
  ing("gnocchi", ["Gnocchi", "Gnocchi", "Gnocchis", "Gnocchi", "Ñoquis"], "getreide", "g", [150, 3.5, 32, 0.5], 400, 1.49, 30, "vegan", gluten),
  ing("kartoffeln", ["Kartoffeln", "Potatoes", "Pommes de terre", "Patate", "Patatas"], "gemuese", "g", [77, 2, 17, 0.1], 1500, 2.49, 21, "vegan", { at: "Erdäpfel" }),
  ing("suesskartoffel", ["Süßkartoffeln", "Sweet potatoes", "Patates douces", "Patate dolci", "Boniatos"], "gemuese", "g", [86, 1.6, 20, 0.1], 1000, 2.99, 14, "vegan", { at: "Süßerdäpfel" }),

  // Hülsenfrüchte
  ing("linsen", ["Rote Linsen", "Red lentils", "Lentilles corail", "Lenticchie rosse", "Lentejas rojas"], "huelsenfruechte", "g", [340, 24, 50, 1.5], 500, 1.99, 365, "vegan"),
  ing("berglinsen", ["Braune Linsen", "Brown lentils", "Lentilles brunes", "Lenticchie marroni", "Lentejas pardinas"], "huelsenfruechte", "g", [330, 24, 48, 1.5], 500, 1.79, 365, "vegan"),
  ing("kichererbsen", ["Kichererbsen (Dose)", "Chickpeas (tinned)", "Pois chiches (conserve)", "Ceci (in scatola)", "Garbanzos (lata)"], "huelsenfruechte", "g", [120, 7, 15, 2.5], 400, 0.89, 365, "vegan", dose),
  ing("kidneybohnen", ["Kidneybohnen (Dose)", "Kidney beans (tinned)", "Haricots rouges (conserve)", "Fagioli rossi (in scatola)", "Alubias rojas (lata)"], "huelsenfruechte", "g", [100, 7, 13, 0.5], 400, 0.79, 365, "vegan", dose),
  ing("weisse_bohnen", ["Weiße Bohnen (Dose)", "White beans (tinned)", "Haricots blancs (conserve)", "Fagioli cannellini (in scatola)", "Alubias blancas (lata)"], "huelsenfruechte", "g", [95, 6.5, 13, 0.5], 400, 0.79, 365, "vegan", dose),
  ing("schwarze_bohnen", ["Schwarze Bohnen (Dose)", "Black beans (tinned)", "Haricots noirs (conserve)", "Fagioli neri (in scatola)", "Frijoles negros (lata)"], "huelsenfruechte", "g", [105, 7, 15, 0.5], 400, 0.99, 365, "vegan", dose),
  ing("erbsen_tk", ["Erbsen (TK)", "Frozen peas", "Petits pois surgelés", "Piselli surgelati", "Guisantes congelados"], "gemuese", "g", [80, 5.5, 11, 0.5], 450, 1.29, 180, "vegan"),

  // Pflanzliche Eiweißquellen und Drinks
  ing("tofu", ["Tofu natur", "Plain tofu", "Tofu nature", "Tofu al naturale", "Tofu natural"], "pflanzlich", "g", [145, 15, 2, 8.5], 400, 2.29, 14, "vegan", soja),
  ing("raeuchertofu", ["Räuchertofu", "Smoked tofu", "Tofu fumé", "Tofu affumicato", "Tofu ahumado"], "pflanzlich", "g", [160, 17, 2, 9.5], 200, 1.99, 21, "vegan", soja),
  ing("tempeh", ["Tempeh", "Tempeh", "Tempeh", "Tempeh", "Tempeh"], "pflanzlich", "g", [195, 19, 9, 11], 200, 2.79, 14, "vegan", soja),
  ing("sojadrink", ["Sojadrink", "Soy milk", "Boisson au soja", "Bevanda di soia", "Bebida de soja"], "pflanzlich", "ml", [40, 3.3, 1.5, 1.9], 1000, 1.49, 7, "vegan", soja),
  ing("haferdrink", ["Haferdrink", "Oat milk", "Boisson à l'avoine", "Bevanda d'avena", "Bebida de avena"], "pflanzlich", "ml", [45, 1, 7, 1.5], 1000, 1.29, 7, "vegan", gluten),

  // Milchprodukte und Eier
  ing("milch", ["Milch 1,5 %", "Semi-skimmed milk", "Lait demi-écrémé", "Latte parzialmente scremato", "Leche semidesnatada"], "milch_ei", "ml", [47, 3.4, 4.8, 1.5], 1000, 1.09, 7, "vegetarisch", laktose),
  ing("joghurt", ["Naturjoghurt", "Plain yoghurt", "Yaourt nature", "Yogurt bianco", "Yogur natural"], "milch_ei", "g", [63, 4, 5, 3.5], 500, 0.99, 10, "vegetarisch", laktose),
  ing("skyr", ["Skyr", "Skyr", "Skyr", "Skyr", "Skyr"], "milch_ei", "g", [63, 11, 4, 0.2], 450, 1.49, 14, "vegetarisch", laktose),
  ing("quark", ["Magerquark", "Low-fat quark", "Fromage blanc maigre", "Quark magro", "Quark desnatado"], "milch_ei", "g", [67, 12, 4, 0.3], 500, 1.19, 10, "vegetarisch", { ...laktose, at: "Magertopfen" }),
  ing("huettenkaese", ["Hüttenkäse", "Cottage cheese", "Cottage cheese", "Fiocchi di latte", "Requesón"], "milch_ei", "g", [98, 12, 3, 4.5], 200, 0.99, 10, "vegetarisch", laktose),
  ing("sahne", ["Schlagsahne", "Double cream", "Crème liquide entière", "Panna fresca", "Nata para montar"], "milch_ei", "ml", [300, 2.4, 3.2, 30], 200, 0.99, 10, "vegetarisch", { ...laktose, at: "Schlagobers", ch: "Vollrahm" }),
  ing("creme_fraiche", ["Crème fraîche", "Crème fraîche", "Crème fraîche", "Crème fraîche", "Crème fraîche"], "milch_ei", "g", [290, 2.5, 3, 30], 200, 1.29, 14, "vegetarisch", laktose),
  ing("butter", ["Butter", "Butter", "Beurre", "Burro", "Mantequilla"], "milch_ei", "g", [740, 0.7, 0.6, 82], 250, 2.29, 30, "vegetarisch", laktose),
  ing("feta", ["Feta", "Feta", "Feta", "Feta", "Queso feta"], "milch_ei", "g", [260, 17, 1, 21], 200, 1.89, 7, "vegetarisch", laktose),
  ing("mozzarella", ["Mozzarella", "Mozzarella", "Mozzarella", "Mozzarella", "Mozzarella"], "milch_ei", "g", [250, 18, 1, 19], 125, 0.89, 7, "vegetarisch", laktose),
  ing("gouda", ["Gouda", "Gouda", "Gouda", "Gouda", "Queso gouda"], "milch_ei", "g", [360, 25, 0, 29], 400, 2.99, 21, "vegetarisch", laktose),
  ing("parmesan", ["Parmesan", "Parmesan", "Parmesan", "Parmigiano", "Parmesano"], "milch_ei", "g", [400, 33, 0, 29], 150, 2.49, 60, "vegetarisch", laktose),
  ing("halloumi", ["Halloumi", "Halloumi", "Halloumi", "Halloumi", "Halloumi"], "milch_ei", "g", [320, 21, 2, 25], 225, 2.49, 30, "vegetarisch", laktose),
  ing("eier", ["Eier", "Eggs", "Œufs", "Uova", "Huevos"], "milch_ei", "stk", [80, 7, 0.5, 5.5], 10, 2.79, 21, "vegetarisch", { allergens: ["ei"] }),

  // Fleisch
  ing("haehnchen", ["Hähnchenbrust", "Chicken breast", "Blanc de poulet", "Petto di pollo", "Pechuga de pollo"], "fleisch", "g", [110, 23, 0, 1.5], 400, 4.99, 3, "fleisch", { at: "Hühnerbrust", ch: "Pouletbrust" }),
  ing("putenbrust", ["Putenbrust", "Turkey breast", "Blanc de dinde", "Petto di tacchino", "Pechuga de pavo"], "fleisch", "g", [105, 24, 0, 1], 400, 5.49, 3, "fleisch", { ch: "Trutenbrust" }),
  ing("hackfleisch", ["Rinderhackfleisch", "Beef mince", "Bœuf haché", "Macinato di manzo", "Carne picada de ternera"], "fleisch", "g", [220, 20, 0, 15], 500, 4.99, 2, "fleisch", { at: "Rinderfaschiertes", ch: "Rindshackfleisch" }),
  ing("schweinefilet", ["Schweinefilet", "Pork tenderloin", "Filet mignon de porc", "Filetto di maiale", "Solomillo de cerdo"], "fleisch", "g", [120, 21, 0, 4], 500, 6.99, 3, "fleisch", { at: "Schweinslungenbraten", ch: "Schweinsfilet", pork: true }),
  ing("schinken", ["Kochschinken", "Cooked ham", "Jambon cuit", "Prosciutto cotto", "Jamón cocido"], "fleisch", "g", [110, 19, 1, 3.5], 200, 1.99, 7, "fleisch", { at: "Beinschinken", pork: true }),
  ing("speck", ["Speckwürfel", "Bacon lardons", "Lardons", "Pancetta a cubetti", "Taquitos de beicon"], "fleisch", "g", [300, 15, 0.5, 27], 125, 1.49, 21, "fleisch", { pork: true }),

  // Fisch und Meeresfrüchte
  ing("lachs", ["Lachsfilet", "Salmon fillet", "Pavé de saumon", "Filetto di salmone", "Lomo de salmón"], "fisch", "g", [200, 20, 0, 13], 250, 4.49, 2, "fisch", fisch),
  ing("thunfisch", ["Thunfisch (Dose)", "Tuna (tinned)", "Thon (conserve)", "Tonno (in scatola)", "Atún (lata)"], "fisch", "g", [110, 26, 0, 1], 150, 1.49, 365, "fisch", { ...fisch, opened: 2 }),
  ing("kabeljau", ["Kabeljau (TK)", "Frozen cod", "Cabillaud surgelé", "Merluzzo surgelato", "Bacalao congelado"], "fisch", "g", [80, 18, 0, 0.7], 400, 4.49, 180, "fisch", { ...fisch, ch: "Dorsch (TK)" }),
  ing("garnelen", ["Garnelen (TK)", "Frozen prawns", "Crevettes surgelées", "Gamberi surgelati", "Gambas congeladas"], "fisch", "g", [75, 17, 0, 0.8], 250, 4.99, 180, "fisch", { allergens: ["krebstiere"], ch: "Crevetten (TK)" }),

  // Gemüse
  ing("zwiebel", ["Zwiebeln", "Onions", "Oignons", "Cipolle", "Cebollas"], "gemuese", "stk", [40, 1, 9, 0.1], 6, 1.29, 30, "vegan"),
  ing("knoblauch", ["Knoblauch (Zehen)", "Garlic (cloves)", "Ail (gousses)", "Aglio (spicchi)", "Ajo (dientes)"], "gemuese", "stk", [4, 0.2, 1, 0], 30, 0.99, 60, "vegan"),
  ing("paprika", ["Paprika", "Peppers", "Poivrons", "Peperoni", "Pimientos"], "gemuese", "stk", [30, 1, 6, 0.3], 3, 1.99, 7, "vegan", { ch: "Peperoni" }),
  ing("zucchini", ["Zucchini", "Courgettes", "Courgettes", "Zucchine", "Calabacines"], "gemuese", "stk", [35, 2.5, 6, 0.6], 2, 1.49, 7, "vegan", { ch: "Zucchetti" }),
  ing("brokkoli", ["Brokkoli", "Broccoli", "Brocoli", "Broccoli", "Brócoli"], "gemuese", "g", [34, 2.8, 7, 0.4], 500, 1.49, 5, "vegan"),
  ing("blumenkohl", ["Blumenkohl", "Cauliflower", "Chou-fleur", "Cavolfiore", "Coliflor"], "gemuese", "g", [25, 1.9, 5, 0.3], 800, 1.99, 7, "vegan", { at: "Karfiol" }),
  ing("spinat", ["Babyspinat", "Baby spinach", "Pousses d'épinards", "Spinacino", "Espinacas baby"], "gemuese", "g", [23, 2.9, 3.6, 0.4], 200, 1.79, 4, "vegan"),
  ing("spinat_tk", ["Blattspinat (TK)", "Frozen spinach", "Épinards surgelés", "Spinaci surgelati", "Espinacas congeladas"], "gemuese", "g", [22, 2.5, 1, 0.4], 450, 1.29, 180, "vegan"),
  ing("karotten", ["Karotten", "Carrots", "Carottes", "Carote", "Zanahorias"], "gemuese", "g", [41, 0.9, 10, 0.2], 1000, 1.29, 21, "vegan", { ch: "Rüebli" }),
  ing("tomaten", ["Tomaten", "Tomatoes", "Tomates", "Pomodori", "Tomates"], "gemuese", "g", [18, 0.9, 3.9, 0.2], 500, 1.99, 7, "vegan", { at: "Paradeiser" }),
  ing("kirschtomaten", ["Cherrytomaten", "Cherry tomatoes", "Tomates cerises", "Pomodorini", "Tomates cherry"], "gemuese", "g", [20, 1, 3.5, 0.3], 250, 1.49, 7, "vegan", { at: "Cocktailparadeiser" }),
  ing("gurke", ["Salatgurke", "Cucumber", "Concombre", "Cetriolo", "Pepino"], "gemuese", "stk", [48, 2.6, 9, 0.4], 1, 0.69, 7, "vegan", { ch: "Gurke" }),
  ing("salat", ["Blattsalat-Mix", "Mixed salad leaves", "Mélange de salades", "Insalata mista", "Mezcla de lechugas"], "gemuese", "g", [15, 1.3, 2, 0.2], 200, 1.29, 4, "vegan", { at: "Häuptelsalat-Mix" }),
  ing("feldsalat", ["Feldsalat", "Lamb's lettuce", "Mâche", "Valerianella", "Canónigos"], "gemuese", "g", [21, 1.8, 2.5, 0.4], 150, 1.79, 3, "vegan", { at: "Vogerlsalat", ch: "Nüsslisalat" }),
  ing("rucola", ["Rucola", "Rocket", "Roquette", "Rucola", "Rúcula"], "gemuese", "g", [25, 2.6, 2, 0.7], 125, 1.29, 3, "vegan"),
  ing("champignons", ["Champignons", "Mushrooms", "Champignons de Paris", "Champignon", "Champiñones"], "gemuese", "g", [22, 3, 3.3, 0.3], 400, 1.99, 5, "vegan"),
  ing("aubergine", ["Aubergine", "Aubergine", "Aubergine", "Melanzana", "Berenjena"], "gemuese", "stk", [75, 3, 18, 0.6], 1, 0.99, 7, "vegan", { at: "Melanzani" }),
  ing("lauch", ["Lauch", "Leek", "Poireau", "Porro", "Puerro"], "gemuese", "stk", [60, 3, 12, 0.6], 2, 1.49, 10, "vegan", { at: "Porree" }),
  ing("kuerbis", ["Hokkaido-Kürbis", "Red kuri squash", "Potimarron", "Zucca Hokkaido", "Calabaza hokkaido"], "gemuese", "g", [63, 1.7, 12, 0.6], 1200, 2.49, 30, "vegan"),
  ing("gruene_bohnen", ["Grüne Bohnen (TK)", "Frozen green beans", "Haricots verts surgelés", "Fagiolini surgelati", "Judías verdes congeladas"], "gemuese", "g", [30, 2, 5, 0.2], 450, 1.49, 180, "vegan", { at: "Fisolen (TK)" }),
  ing("rote_bete", ["Rote Bete (gekocht)", "Cooked beetroot", "Betteraves cuites", "Barbabietole cotte", "Remolacha cocida"], "gemuese", "g", [45, 1.6, 8.5, 0.1], 500, 1.29, 14, "vegan", { at: "Rote Rüben (gekocht)", ch: "Randen (gekocht)" }),
  ing("avocado", ["Avocado", "Avocado", "Avocat", "Avocado", "Aguacate"], "gemuese", "stk", [240, 3, 2.5, 22], 2, 2.49, 5, "vegan"),
  ing("ingwer", ["Ingwer", "Ginger", "Gingembre", "Zenzero", "Jengibre"], "gemuese", "g", [80, 1.8, 15, 0.8], 100, 0.99, 21, "vegan"),
  ing("fruehlingszwiebeln", ["Frühlingszwiebeln (Bund)", "Spring onions (bunch)", "Oignons nouveaux (botte)", "Cipollotti (mazzo)", "Cebolletas (manojo)"], "gemuese", "stk", [32, 1.8, 6, 0.2], 1, 0.79, 7, "vegan", { at: "Jungzwiebeln (Bund)" }),
  ing("petersilie", ["Petersilie (Bund)", "Parsley (bunch)", "Persil (botte)", "Prezzemolo (mazzo)", "Perejil (manojo)"], "gemuese", "stk", [11, 1, 2, 0.2], 1, 0.99, 5, "vegan"),
  ing("zitrone", ["Zitronen", "Lemons", "Citrons", "Limoni", "Limones"], "obst", "stk", [20, 0.7, 6, 0.2], 3, 1.49, 21, "vegan"),
  ing("mais", ["Mais (Dose)", "Sweetcorn (tinned)", "Maïs (conserve)", "Mais (in scatola)", "Maíz (lata)"], "gemuese", "g", [85, 2.8, 15, 1.2], 285, 0.79, 365, "vegan", dose),
  ing("tomaten_dose", ["Gehackte Tomaten (Dose)", "Chopped tomatoes (tinned)", "Tomates concassées (conserve)", "Polpa di pomodoro", "Tomate troceado (lata)"], "vorrat", "g", [22, 1.2, 3.5, 0.2], 400, 0.69, 365, "vegan", { opened: 3, at: "Gehackte Paradeiser (Dose)" }),
  ing("passata", ["Passierte Tomaten", "Passata", "Coulis de tomates", "Passata di pomodoro", "Tomate triturado"], "vorrat", "ml", [30, 1.4, 5, 0.2], 500, 0.79, 365, "vegan", { opened: 4, at: "Passierte Paradeiser" }),
  ing("tomatenmark", ["Tomatenmark", "Tomato purée", "Concentré de tomates", "Concentrato di pomodoro", "Concentrado de tomate"], "vorrat", "g", [80, 4.5, 13, 0.5], 200, 0.59, 365, "vegan", { opened: 7, at: "Paradeismark", ch: "Tomatenpüree" }),

  // Obst
  ing("banane", ["Bananen", "Bananas", "Bananes", "Banane", "Plátanos"], "obst", "stk", [105, 1.3, 27, 0.4], 5, 1.49, 6, "vegan"),
  ing("apfel", ["Äpfel", "Apples", "Pommes", "Mele", "Manzanas"], "obst", "stk", [80, 0.4, 19, 0.3], 6, 2.49, 21, "vegan"),
  ing("birne", ["Birnen", "Pears", "Poires", "Pere", "Peras"], "obst", "stk", [95, 0.6, 23, 0.2], 5, 2.49, 10, "vegan"),
  ing("orange", ["Orangen", "Oranges", "Oranges", "Arance", "Naranjas"], "obst", "stk", [70, 1.3, 15, 0.2], 6, 2.49, 21, "vegan"),
  ing("beeren", ["Beerenmischung (TK)", "Frozen mixed berries", "Fruits rouges surgelés", "Frutti di bosco surgelati", "Frutos rojos congelados"], "obst", "g", [45, 1, 8, 0.4], 300, 2.29, 180, "vegan"),
  ing("heidelbeeren", ["Heidelbeeren", "Blueberries", "Myrtilles", "Mirtilli", "Arándanos"], "obst", "g", [57, 0.7, 12, 0.3], 125, 1.99, 6, "vegan"),
  ing("erdbeeren", ["Erdbeeren", "Strawberries", "Fraises", "Fragole", "Fresas"], "obst", "g", [32, 0.7, 6, 0.3], 500, 2.99, 3, "vegan"),

  // Nüsse und Samen
  ing("erdnussbutter", ["Erdnussbutter", "Peanut butter", "Beurre de cacahuète", "Burro di arachidi", "Crema de cacahuete"], "nuesse_samen", "g", [600, 25, 14, 50], 350, 2.99, 180, "vegan", { allergens: ["erdnuss"] }),
  ing("mandeln", ["Mandeln", "Almonds", "Amandes", "Mandorle", "Almendras"], "nuesse_samen", "g", [600, 24, 6, 50], 200, 2.99, 180, "vegan", nuesse),
  ing("walnuesse", ["Walnüsse", "Walnuts", "Noix", "Noci", "Nueces"], "nuesse_samen", "g", [690, 15, 7, 66], 200, 2.99, 180, "vegan", nuesse),
  ing("cashews", ["Cashewkerne", "Cashews", "Noix de cajou", "Anacardi", "Anacardos"], "nuesse_samen", "g", [590, 20, 30, 46], 200, 2.79, 180, "vegan", nuesse),
  ing("chiasamen", ["Chiasamen", "Chia seeds", "Graines de chia", "Semi di chia", "Semillas de chía"], "nuesse_samen", "g", [490, 17, 8, 31], 200, 2.49, 365, "vegan"),
  ing("sonnenblumenkerne", ["Sonnenblumenkerne", "Sunflower seeds", "Graines de tournesol", "Semi di girasole", "Pipas de girasol peladas"], "nuesse_samen", "g", [600, 22, 12, 51], 200, 1.29, 180, "vegan"),
  ing("sesam", ["Sesam", "Sesame seeds", "Graines de sésame", "Semi di sesamo", "Semillas de sésamo"], "nuesse_samen", "g", [570, 18, 12, 50], 100, 0.99, 365, "vegan", { allergens: ["sesam"] }),

  // Vorrat, Öle, Saucen
  ing("olivenoel", ["Olivenöl", "Olive oil", "Huile d'olive", "Olio d'oliva", "Aceite de oliva"], "vorrat", "ml", [820, 0, 0, 91], 500, 5.99, 365, "vegan"),
  ing("rapsoel", ["Rapsöl", "Rapeseed oil", "Huile de colza", "Olio di colza", "Aceite de colza"], "vorrat", "ml", [820, 0, 0, 91], 1000, 2.49, 365, "vegan"),
  ing("kokosmilch", ["Kokosmilch", "Coconut milk", "Lait de coco", "Latte di cocco", "Leche de coco"], "vorrat", "ml", [180, 1.5, 3, 18], 400, 1.49, 365, "vegan", dose),
  ing("gemuesebruehe", ["Gemüsebrühe (Pulver)", "Vegetable stock powder", "Bouillon de légumes", "Brodo vegetale granulare", "Caldo de verduras en polvo"], "vorrat", "g", [200, 8, 25, 7], 150, 1.49, 365, "vegan", { allergens: ["sellerie"], ch: "Gemüsebouillon (Pulver)" }),
  ing("sojasauce", ["Sojasauce", "Soy sauce", "Sauce soja", "Salsa di soia", "Salsa de soja"], "vorrat", "ml", [55, 8, 5, 0], 250, 1.79, 365, "vegan", { allergens: ["soja", "gluten"] }),
  ing("currypaste", ["Rote Currypaste", "Red curry paste", "Pâte de curry rouge", "Pasta di curry rosso", "Pasta de curry rojo"], "vorrat", "g", [120, 2, 12, 6], 110, 1.99, 365, "vegan", { opened: 14 }),
  ing("pesto", ["Pesto Genovese", "Green pesto", "Pesto alla genovese", "Pesto alla genovese", "Pesto genovés"], "vorrat", "g", [480, 5, 5, 48], 190, 1.99, 21, "vegetarisch", { allergens: ["laktose", "nuesse"] }),
  ing("honig", ["Honig", "Honey", "Miel", "Miele", "Miel"], "vorrat", "g", [305, 0.4, 76, 0], 500, 3.99, 365, "vegetarisch"),
  ing("zucker", ["Zucker", "Sugar", "Sucre", "Zucchero", "Azúcar"], "vorrat", "g", [400, 0, 100, 0], 1000, 1.19, 365, "vegan"),
  ing("rosinen", ["Rosinen", "Raisins", "Raisins secs", "Uvetta", "Pasas"], "vorrat", "g", [300, 2.5, 69, 0.5], 250, 1.49, 365, "vegan", { ch: "Sultaninen" }),
  ing("apfelmus", ["Apfelmus (Glas)", "Apple sauce (jar)", "Compote de pommes", "Purea di mele", "Puré de manzana"], "vorrat", "g", [75, 0.2, 18, 0.1], 700, 1.29, 365, "vegan", { opened: 7, ch: "Apfelmus (Glas)" }),
  ing("marmelade", ["Konfitüre", "Jam", "Confiture", "Marmellata", "Mermelada"], "vorrat", "g", [250, 0.4, 60, 0.1], 450, 1.99, 365, "vegan", { opened: 30, at: "Marmelade" }),
  ing("semmelbroesel", ["Paniermehl", "Breadcrumbs", "Chapelure", "Pangrattato", "Pan rallado"], "getreide", "g", [360, 12, 72, 2], 400, 0.99, 365, "vegan", { ...gluten, at: "Semmelbrösel" }),
  ing("hefe", ["Trockenhefe", "Dried yeast", "Levure sèche", "Lievito secco", "Levadura seca"], "vorrat", "g", [330, 40, 41, 7], 21, 0.39, 365, "vegan"),
  ing("sauerkraut", ["Sauerkraut", "Sauerkraut", "Choucroute", "Crauti", "Chucrut"], "gemuese", "g", [20, 1.5, 2, 0.3], 500, 0.99, 365, "vegan", { opened: 5 }),
  ing("rotkohl", ["Rotkohl (Glas)", "Red cabbage (jar)", "Chou rouge (bocal)", "Cavolo rosso (vasetto)", "Lombarda (tarro)"], "gemuese", "g", [55, 1, 11, 0.2], 700, 1.29, 365, "vegan", { opened: 5, at: "Rotkraut (Glas)", ch: "Rotkabis (Glas)" }),
  ing("weisskohl", ["Weißkohl", "White cabbage", "Chou blanc", "Cavolo cappuccio", "Repollo"], "gemuese", "g", [25, 1.4, 4, 0.2], 1000, 1.29, 21, "vegan", { at: "Weißkraut", ch: "Weisskabis" }),
];

/** Weitere Zutaten für klassische Gerichte aus Deutschland, Österreich, der Schweiz und der Welt. */
INGREDIENTS.push(
  ing("spaetzle", ["Eierspätzle (getrocknet)", "Spätzle egg noodles", "Spätzle", "Spätzle", "Spätzle"], "getreide", "g", [360, 13, 68, 3.5], 500, 1.69, 365, "vegetarisch", { allergens: ["gluten", "ei"], ch: "Spätzli (getrocknet)" }),
  ing("lasagneplatten", ["Lasagneplatten", "Lasagne sheets", "Feuilles de lasagne", "Sfoglie per lasagne", "Placas de lasaña"], "getreide", "g", [360, 13, 70, 2], 500, 1.29, 365, "vegan", gluten),
  ing("risottoreis", ["Risottoreis", "Risotto rice", "Riz à risotto", "Riso per risotti", "Arroz para risotto"], "getreide", "g", [350, 7, 78, 0.6], 500, 1.79, 365, "vegan"),
  ing("reisnudeln", ["Reisnudeln", "Rice noodles", "Nouilles de riz", "Spaghetti di riso", "Fideos de arroz"], "getreide", "g", [360, 6, 80, 0.6], 250, 1.79, 365, "vegan"),
  ing("bergkaese", ["Bergkäse", "Alpine cheese", "Fromage de montagne", "Formaggio di montagna", "Queso de montaña"], "milch_ei", "g", [400, 28, 0, 32], 200, 2.79, 30, "vegetarisch", laktose),
  ing("ricotta", ["Ricotta", "Ricotta", "Ricotta", "Ricotta", "Ricotta"], "milch_ei", "g", [140, 9, 3, 10], 250, 1.49, 7, "vegetarisch", laktose),
  ing("saure_sahne", ["Saure Sahne", "Sour cream", "Crème aigre", "Panna acida", "Nata agria"], "milch_ei", "g", [115, 3, 4, 10], 200, 0.79, 10, "vegetarisch", { ...laktose, at: "Sauerrahm", ch: "Saurer Halbrahm" }),
  ing("rindergulasch", ["Rindergulasch", "Beef stewing steak", "Bœuf à braiser", "Spezzatino di manzo", "Ternera para guisar"], "fleisch", "g", [135, 21, 0, 5.5], 500, 7.99, 2, "fleisch", { at: "Rindsgulasch", ch: "Rindsragout" }),
  ing("hackfleisch_gemischt", ["Hackfleisch gemischt", "Mixed mince (beef & pork)", "Viande hachée mixte", "Macinato misto", "Carne picada mixta"], "fleisch", "g", [250, 18, 0, 20], 500, 3.99, 2, "fleisch", { at: "Faschiertes gemischt", pork: true }),
  ing("schweineschnitzel", ["Schweineschnitzel", "Pork escalopes", "Escalopes de porc", "Scaloppine di maiale", "Escalopes de cerdo"], "fleisch", "g", [120, 22, 0, 3], 400, 4.99, 3, "fleisch", { at: "Schweinsschnitzel", ch: "Schweinsplätzli", pork: true }),
  ing("kalbfleisch", ["Kalbfleisch (geschnetzelt)", "Veal strips", "Émincé de veau", "Straccetti di vitello", "Ternera lechal en tiras"], "fleisch", "g", [110, 21, 0, 2.5], 400, 9.99, 2, "fleisch", { ch: "Kalbsgeschnetzeltes" }),
  ing("bratwurst", ["Bratwürste", "Bratwurst sausages", "Saucisses à griller", "Salsicce bratwurst", "Salchichas bratwurst"], "fleisch", "stk", [290, 13, 1, 26], 4, 3.49, 7, "fleisch", { ch: "Bratwürste", pork: true }),
);

export const ingredientById = new Map(INGREDIENTS.map((i) => [i.id, i]));
