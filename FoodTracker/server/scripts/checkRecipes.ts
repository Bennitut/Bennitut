// Prüft eine Rezeptdatei: npx tsx scripts/checkRecipes.ts src/data/recipesVegan.ts
// Mit --audit werden bestehende Katalogdateien geprüft (IDs dürfen schon existieren, Küche/Bildsuche optional).
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { ingredientById } from "../src/data/ingredients.js";
import { RECIPES } from "../src/data/recipes.js";
import { CUISINES, type Recipe } from "../src/types.js";

const file = process.argv[2];
const audit = process.argv.includes("--audit");
if (!file) throw new Error("Pfad zur Rezeptdatei angeben");
const mod = (await import(pathToFileURL(resolve(file)).href)) as Record<string, unknown>;
const recipes = Object.entries(mod).find(([k, v]) => Array.isArray(v) && k !== "RECIPES")?.[1] as Recipe[] ?? [];
const cuisines = Object.entries(mod).find(([k]) => k.endsWith("CUISINES"))?.[1] as Record<string, string> | undefined;
const queries = Object.entries(mod).find(([k]) => k.endsWith("IMAGE_QUERIES"))?.[1] as Record<string, string> | undefined;
const existing = new Set(RECIPES.map((r) => r.id));
const seen = new Set<string>();
const errors: string[] = [];
for (const r of recipes) {
  const e = (m: string) => errors.push(`${r.id}: ${m}`);
  if (!audit && existing.has(r.id)) e("ID gibt es schon im Katalog");
  if (seen.has(r.id)) e("ID doppelt");
  seen.add(r.id);
  if (r.steps.length === 0 || r.translations?.en?.steps?.length !== r.steps.length) e("Schritte de/en fehlen oder ungleich lang");
  if ((r.translations?.en?.otherIngredients?.length ?? 0) !== r.otherIngredients.length) e("otherIngredients de/en ungleich lang");
  for (const l of ["en", "fr", "it", "es"]) if (!r.translations?.[l]?.name) e(`Name ${l} fehlt`);
  let kcal = 0;
  for (const ri of r.ingredients) {
    const ing = ingredientById.get(ri.ingredientId);
    if (!ing) { e(`unbekannte Zutat ${ri.ingredientId}`); continue; }
    if (!(ri.amount > 0) || ri.amount > (ing.unit === "stk" ? 6 : 500)) e(`unplausible Menge ${ri.ingredientId}=${ri.amount}`);
    kcal += ing.nutrients.kcal * ri.amount / (ing.unit === "stk" ? 1 : 100);
  }
  const main = r.mealTypes.includes("lunch") || r.mealTypes.includes("dinner");
  const [min, max] = main ? [380, 1100] : [220, 800];
  if (kcal < min || kcal > max) e(`kcal pro Portion ${Math.round(kcal)} außerhalb ${min}–${max}`);
  if (!audit && (!cuisines?.[r.id] || !CUISINES.includes(cuisines[r.id] as never))) e("Küche fehlt/ungültig");
  if (!audit && !queries?.[r.id]) e("Bild-Suchbegriff fehlt");
}
console.log(`${recipes.length} Rezepte geprüft`);
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("OK");
