import type { Ingredient } from "./types";

type Category = Ingredient["category"];

/** Emoji und Farbton je Zutatenkategorie, z. B. für Einkaufsliste und Vorrat. */
export const CATEGORY_STYLE: Record<Category, { emoji: string; tint: string; color: string }> = {
  gemuese: { emoji: "🥦", tint: "#E3F4E1", color: "#2E8B3D" },
  obst: { emoji: "🍎", tint: "#FDE7E4", color: "#D2453A" },
  milch_ei: { emoji: "🧀", tint: "#FFF4D6", color: "#B98309" },
  fleisch: { emoji: "🥩", tint: "#FBE3E6", color: "#B63A4C" },
  fisch: { emoji: "🐟", tint: "#E0F0FB", color: "#2275B5" },
  pflanzlich: { emoji: "🌱", tint: "#E8F6E4", color: "#3F8F2F" },
  getreide: { emoji: "🌾", tint: "#FBEFDD", color: "#B2721B" },
  huelsenfruechte: { emoji: "🫘", tint: "#F3E9E1", color: "#8A5A3B" },
  nuesse_samen: { emoji: "🥜", tint: "#F5ECDD", color: "#9A6B2F" },
  vorrat: { emoji: "🫙", tint: "#ECEBF8", color: "#5B57A8" },
};

/** Reihenfolge wie im Supermarkt: frisch zuerst, Vorratsschrank zuletzt. */
export const CATEGORY_ORDER: Category[] = [
  "gemuese",
  "obst",
  "milch_ei",
  "fleisch",
  "fisch",
  "pflanzlich",
  "getreide",
  "huelsenfruechte",
  "nuesse_samen",
  "vorrat",
];

const INGREDIENT_EMOJI: Record<string, string> = {
  haferflocken: "🥣", nudeln: "🍝", spaghetti: "🍝", reis: "🍚", vollkornreis: "🍚", quinoa: "🌾", couscous: "🌾",
  bulgur: "🌾", polenta: "🌽", mehl: "🌾", vollkornbrot: "🍞", broetchen: "🥖", tortilla: "🫓", gnocchi: "🥟",
  semmelbroesel: "🍞", spaetzle: "🍝", lasagneplatten: "🍝", risottoreis: "🍚", reisnudeln: "🍜",
  kartoffeln: "🥔", suesskartoffel: "🍠", erbsen_tk: "🫛", zwiebel: "🧅", knoblauch: "🧄", paprika: "🫑",
  zucchini: "🥒", brokkoli: "🥦", blumenkohl: "🥦", spinat: "🥬", spinat_tk: "🥬", karotten: "🥕", tomaten: "🍅",
  kirschtomaten: "🍅", gurke: "🥒", salat: "🥬", feldsalat: "🥬", rucola: "🥬", champignons: "🍄", aubergine: "🍆",
  lauch: "🥬", kuerbis: "🎃", gruene_bohnen: "🫛", rote_bete: "🟣", avocado: "🥑", ingwer: "🫚",
  fruehlingszwiebeln: "🧅", petersilie: "🌿", mais: "🌽", sauerkraut: "🥬", rotkohl: "🥬", weisskohl: "🥬",
  linsen: "🫘", berglinsen: "🫘", kichererbsen: "🫘", kidneybohnen: "🫘", weisse_bohnen: "🫘", schwarze_bohnen: "🫘",
  tofu: "🧊", raeuchertofu: "🧊", tempeh: "🟫", sojadrink: "🥛", haferdrink: "🥛",
  milch: "🥛", joghurt: "🥣", skyr: "🥣", quark: "🥣", huettenkaese: "🧀", sahne: "🥛", creme_fraiche: "🥣",
  butter: "🧈", feta: "🧀", mozzarella: "🧀", gouda: "🧀", parmesan: "🧀", halloumi: "🧀", eier: "🥚",
  bergkaese: "🧀", ricotta: "🧀", saure_sahne: "🥣",
  haehnchen: "🍗", putenbrust: "🍗", hackfleisch: "🥩", schweinefilet: "🥩", schinken: "🥓", speck: "🥓",
  rindergulasch: "🥩", hackfleisch_gemischt: "🥩", schweineschnitzel: "🥩", kalbfleisch: "🥩", bratwurst: "🌭",
  lachs: "🐟", thunfisch: "🐟", kabeljau: "🐟", garnelen: "🦐",
  zitrone: "🍋", banane: "🍌", apfel: "🍎", birne: "🍐", orange: "🍊", beeren: "🍓", heidelbeeren: "🫐", erdbeeren: "🍓",
  tomaten_dose: "🥫", passata: "🥫", tomatenmark: "🥫", olivenoel: "🫒", rapsoel: "🛢️", kokosmilch: "🥥",
  gemuesebruehe: "🍲", sojasauce: "🍶", currypaste: "🌶️", pesto: "🌿", honig: "🍯", zucker: "🍬", rosinen: "🍇",
  apfelmus: "🍏", marmelade: "🍓", hefe: "🍞",
  erdnussbutter: "🥜", mandeln: "🌰", walnuesse: "🌰", cashews: "🥜", chiasamen: "🌱", sonnenblumenkerne: "🌻", sesam: "🌱",
};

export function ingredientEmoji(ingredient: Ingredient | undefined): string {
  if (!ingredient) return "🛒";
  return INGREDIENT_EMOJI[ingredient.id] ?? CATEGORY_STYLE[ingredient.category].emoji;
}
