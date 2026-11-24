import { z } from "zod";
import { INGREDIENTS } from "../data/catalog.js";
import type { FetchedImage, SocialPost } from "../social/fetchPost.js";
import type { Recipe, RecipeText } from "../types.js";
import type { Ai } from "./provider.js";
import { AnalysisError } from "./types.js";

// Die KI-Funktionen des Servers: Anweisungen und Antwortformate. Welche KI antwortet (Claude oder Ollama),
// entscheidet `Ai` in provider.ts.

export type ImageMediaType = FetchedImage["mediaType"];

const LANGUAGE_NAMES: Record<string, string> = {
  de: "Deutsch",
  "de-AT": "österreichisches Deutsch (z. B. Erdäpfel, Paradeiser, Topfen, Schlagobers)",
  "de-CH": "Schweizer Hochdeutsch (ss statt ß; z. B. Rüebli, Poulet, Rahm, Peperoni)",
  en: "English",
  fr: "Français",
  it: "Italiano",
  es: "Español",
};
const languageName = (code: string) => LANGUAGE_NAMES[code] ?? code;

const ingredientIds = INGREDIENTS.map((i) => i.id) as [string, ...string[]];
const catalogText = INGREDIENTS.map((i) => `${i.id}: ${i.name.de} (Einheit ${i.unit})`).join("\n");

const NutrientsSchema = z.object({
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const MealAnalysisSchema = z.object({
  description: z.string().describe("Kurze Beschreibung des Gerichts in der Zielsprache"),
  items: z.array(
    z.object({
      name: z.string(),
      estimatedGrams: z.number(),
      nutrients: NutrientsSchema,
    }),
  ),
  total: NutrientsSchema,
  confidence: z.enum(["hoch", "mittel", "niedrig"]),
  notes: z.string().describe("Annahmen, z. B. zu versteckten Fetten oder Portionsgröße"),
});
export type MealAnalysis = z.infer<typeof MealAnalysisSchema>;

export const ReceiptAnalysisSchema = z.object({
  store: z.string().nullable(),
  date: z.string().nullable().describe("Kaufdatum als YYYY-MM-DD, falls lesbar"),
  currency: z.string().nullable().describe("ISO-Währungscode, z. B. EUR oder CHF"),
  items: z.array(
    z.object({
      rawText: z.string().describe("Zeile, wie sie auf dem Bon steht"),
      name: z.string().describe("Verständlicher Produktname in der Zielsprache"),
      isFood: z.boolean(),
      ingredientId: z.enum(ingredientIds).nullable().describe("Passende Katalog-Zutat oder null"),
      quantity: z.number().describe("Menge in der Einheit der Katalog-Zutat (g, ml oder Stück)"),
      price: z.number().nullable(),
    }),
  ),
  total: z.number().nullable(),
});
export type ReceiptAnalysis = z.infer<typeof ReceiptAnalysisSchema>;

const RecipeDraftSchema = z.object({
  name: z.string(),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner"])).min(1),
  cookMinutes: z.number(),
  servings: z.number().describe("Für wie viele Portionen die Mengen gelten"),
  ingredients: z.array(
    z.object({
      ingredientId: z.enum(ingredientIds),
      amount: z.number().describe("Menge für ALLE Portionen in der Einheit der Katalog-Zutat"),
    }),
  ),
  otherIngredients: z.array(z.string()).describe("Gewürze und Zutaten, die nicht im Katalog sind, mit Menge"),
  steps: z.array(z.string()),
  tags: z.array(z.string()),
});
type RecipeDraft = z.infer<typeof RecipeDraftSchema>;

const ImportSchema = z.object({
  isRecipe: z.boolean().describe("false, wenn der Beitrag kein nachkochbares Rezept enthält"),
  recipe: RecipeDraftSchema.nullable(),
});

const RecipeTextSchema = z.object({
  name: z.string(),
  steps: z.array(z.string()),
  otherIngredients: z.array(z.string()),
});

export { AnalysisError };

/** Wandelt den Rezeptentwurf der KI (Mengen für alle Portionen) in ein Rezept pro Portion um. */
function toRecipe(draft: RecipeDraft, id: string, language: string, source: Recipe["source"]): Recipe {
  const servings = Math.max(1, draft.servings);
  return {
    id,
    language,
    name: draft.name,
    steps: draft.steps,
    otherIngredients: draft.otherIngredients,
    mealTypes: draft.mealTypes,
    cookMinutes: Math.round(draft.cookMinutes),
    tags: draft.tags,
    ingredients: draft.ingredients.map((i) => ({
      ingredientId: i.ingredientId,
      amount: Math.round((i.amount / servings) * 100) / 100,
    })),
    source,
  };
}

const RECIPE_RULES =
  "Ordne jede Hauptzutat der passendsten Zutat aus dem Katalog zu und rechne die Menge in deren " +
  "Einheit um. Gewürze, Salz, Wasser und Zutaten ohne passende Entsprechung kommen mit Mengenangabe " +
  "in otherIngredients. Schritte kurz und nachvollziehbar.\n\n" +
  `Katalog:\n${catalogText}`;

export function analyzeMealPhoto(ai: Ai, photo: FetchedImage, language: string): Promise<MealAnalysis> {
  return ai.generate({
    task: "Foto-Erkennung",
    schema: MealAnalysisSchema,
    system:
      "Du bist Ernährungsberater:in. Schätze aus einem Foto, welche Lebensmittel in welcher Menge " +
      "zu sehen sind und welche Nährwerte sie haben. Nutze Teller, Besteck und Verpackungen als " +
      `Größenreferenz. Gib realistische Schätzungen, keine Spannen. Antworte auf ${languageName(language)}.`,
    images: [photo],
    text: "Analysiere diese Mahlzeit.",
  });
}

export function analyzeReceipt(ai: Ai, photo: FetchedImage, language: string): Promise<ReceiptAnalysis> {
  return ai.generate({
    task: "Kassenbon",
    schema: ReceiptAnalysisSchema,
    system:
      "Du liest Kassenbons von Supermärkten und Lieferdiensten, besonders aus Deutschland, Österreich " +
      "und der Schweiz (z. B. REWE, EDEKA, Aldi, Lidl, BILLA, SPAR, Hofer, Migros, Coop). Erfasse jede " +
      "Position. Ordne Lebensmittel, wenn möglich, einer Zutat aus diesem Katalog zu und rechne die " +
      `Menge in deren Einheit um. Produktnamen auf ${languageName(language)}.\n${catalogText}`,
    images: [photo],
    text: "Lies diesen Kassenbon aus.",
  });
}

/** Lässt die KI zusätzliche Rezepte aus den Katalog-Zutaten vorschlagen (KI-Wünsche im Plan). */
export async function generateRecipes(ai: Ai, preferences: string, count: number, language: string): Promise<Recipe[]> {
  const result = await ai.generate({
    task: "KI-Wünsche im Plan",
    schema: z.object({ recipes: z.array(RecipeDraftSchema) }),
    system:
      "Du entwickelst alltagstaugliche, ausgewogene Rezepte. Bevorzuge Rezepte, die Zutaten mit " +
      "anderen Rezepten teilen, damit Packungen vollständig aufgebraucht werden. Schreibe auf " +
      `${languageName(language)}. ${RECIPE_RULES}`,
    text: `Schlage ${count} Rezepte vor. Wünsche: ${preferences || "keine"}`,
  });
  return result.recipes.map((draft, i) => toRecipe(draft, `ki_${Date.now().toString(36)}_${i}`, language, { kind: "ki" }));
}

/**
 * Macht aus einem Instagram-/TikTok-Beitrag (Caption + Vorschaubild) und optional
 * Einzelbildern aus dem Video ein Rezept.
 */
export async function importRecipe(
  ai: Ai,
  input: {
    post: SocialPost | null;
    caption: string | null;
    frames: FetchedImage[];
    language: string;
  },
): Promise<Recipe> {
  const caption = [input.post?.caption, input.caption].filter(Boolean).join("\n\n");
  const images = [...(input.post?.thumbnail ? [input.post.thumbnail] : []), ...input.frames].slice(0, 12);
  const result = await ai.generate({
    task: "Rezept-Import",
    schema: ImportSchema,
    system:
      "Du liest Kochvideos von Instagram und TikTok aus. Rekonstruiere das Rezept aus Beschreibung, " +
      "Texteinblendungen und Bildern. Fehlende Mengen schätzt du realistisch. " +
      `Schreibe das Rezept auf ${languageName(input.language)}. ${RECIPE_RULES}`,
    images,
    text:
      `Plattform: ${input.post?.platform ?? "Video"}\n` +
      `Autor:in: ${input.post?.author ?? "unbekannt"}\n` +
      `Beschreibung:\n${caption || "(keine)"}\n\n` +
      "Die Bilder sind das Vorschaubild bzw. Einzelbilder aus dem Video in zeitlicher Reihenfolge.",
  });
  if (!result.isRecipe || !result.recipe) throw new AnalysisError("not_a_recipe");
  const recipe = toRecipe(result.recipe, `import_${Date.now().toString(36)}`, input.language, {
    kind: "import",
    ...(input.post ? { url: input.post.url, platform: input.post.platform } : { platform: "video" as const }),
  });
  const thumbnail = input.post?.thumbnail ?? input.frames[Math.floor(input.frames.length / 2)];
  recipe.media = {
    // Vorschaubild bzw. ein Videobild als Foto; der Link führt zum Originalbeitrag.
    ...(thumbnail && thumbnail.data.length < 600_000 ? { image: { uri: `data:${thumbnail.mediaType};base64,${thumbnail.data}` } } : {}),
    ...(input.post ? { videos: [{ platform: input.post.platform, url: input.post.url, ...(input.post.author ? { author: input.post.author } : {}) }] } : {}),
  };
  return recipe;
}

const ImprovedRecipeSchema = z.object({
  name: z.string(),
  steps: z.array(z.string()),
  otherIngredients: z.array(z.string()),
  changes: z.array(z.string()).describe("Kurze Liste, was geändert wurde, in der Zielsprache"),
  remainingIssues: z.array(z.string()).describe("Probleme, die sich nur über die Zutatenmengen beheben lassen; leer, wenn keine"),
});
export type ImprovedRecipe = z.infer<typeof ImprovedRecipeSchema>;

/**
 * Überarbeitet Name, Schritte und Sonstiges so, dass sie zu Zutaten und Mengen passen.
 * Die Zutatenliste selbst bleibt unverändert, damit Planung und Einkauf stimmen.
 */
export function improveRecipe(
  ai: Ai,
  input: {
    text: RecipeText;
    ingredients: { name: string; amount: string }[];
    cookMinutes: number;
    problem: string;
    language: string;
  },
): Promise<ImprovedRecipe> {
  return ai.generate({
    task: "Rezepttext verbessern",
    schema: ImprovedRecipeSchema,
    system:
      "Du bist Rezeptredakteur:in. Überarbeite das Rezept so, dass Name, Schritte und sonstige Zutaten " +
      "genau zu den angegebenen Zutaten und Mengen (pro Portion) passen: jede Zutat wird verwendet, keine " +
      "fehlende Hauptzutat wird erwähnt, Reihenfolge und Garzeiten sind realistisch, Schritte kurz und klar. " +
      "Ändere die Zutatenliste nicht; wenn Mengen unpassend sind, nenne das unter remainingIssues. " +
      `Schreibe auf ${languageName(input.language)}.`,
    text: JSON.stringify({
      name: input.text.name,
      steps: input.text.steps ?? [],
      otherIngredients: input.text.otherIngredients ?? [],
      ingredientsPerServing: input.ingredients,
      cookMinutes: input.cookMinutes,
      reportedProblem: input.problem || "keins angegeben – allgemein prüfen",
    }),
  });
}

export function translateRecipe(ai: Ai, text: RecipeText, targetLanguage: string): Promise<RecipeText> {
  return ai.generate({
    task: "Übersetzen",
    schema: RecipeTextSchema,
    system:
      `Übersetze Rezepte natürlich und kulinarisch korrekt auf ${languageName(targetLanguage)}. ` +
      "Behalte Mengen und Einheiten bei, rechne nichts um.",
    text: JSON.stringify({ name: text.name, steps: text.steps ?? [], otherIngredients: text.otherIngredients ?? [] }),
  });
}
