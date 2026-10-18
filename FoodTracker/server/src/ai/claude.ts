import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { INGREDIENTS } from "../data/catalog.js";
import type { Recipe } from "../types.js";

const MODEL = "claude-opus-5-5";

// Liest ANTHROPIC_API_KEY aus der Umgebung. Der Schlüssel bleibt auf dem Server,
// die App spricht nur mit diesem Backend. Erst bei Bedarf erzeugen, damit Planung und
// Bestellung auch ohne Schlüssel laufen.
let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic());

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const ingredientIds = INGREDIENTS.map((i) => i.id) as [string, ...string[]];
const catalogText = INGREDIENTS.map((i) => `${i.id}: ${i.name} (Einheit ${i.unit})`).join("\n");

const NutrientsSchema = z.object({
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const MealAnalysisSchema = z.object({
  description: z.string().describe("Kurze Beschreibung des Gerichts auf Deutsch"),
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
  items: z.array(
    z.object({
      rawText: z.string().describe("Zeile, wie sie auf dem Bon steht"),
      name: z.string().describe("Verständlicher Produktname"),
      isFood: z.boolean(),
      ingredientId: z.enum(ingredientIds).nullable().describe("Passende Katalog-Zutat oder null"),
      quantity: z.number().describe("Menge in der Einheit der Katalog-Zutat (g, ml oder Stück)"),
      price: z.number().nullable(),
    }),
  ),
  total: z.number().nullable(),
});
export type ReceiptAnalysis = z.infer<typeof ReceiptAnalysisSchema>;

const GeneratedRecipesSchema = z.object({
  recipes: z.array(
    z.object({
      id: z.string().describe("kurzer snake_case-Bezeichner"),
      name: z.string(),
      mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner"])),
      tags: z.array(z.string()),
      ingredients: z.array(z.object({ ingredientId: z.enum(ingredientIds), amount: z.number() })),
    }),
  ),
});

async function parse<T extends z.ZodType>(schema: T, system: string, content: Anthropic.Beta.BetaContentBlockParam[]) {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Lehnt das Modell eine Anfrage ab, übernimmt serverseitig ein passendes Ersatzmodell.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content }],
    output_config: { format: betaZodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") throw new AnalysisError("Die Anfrage wurde abgelehnt.");
  if (response.stop_reason === "max_tokens") throw new AnalysisError("Die Antwort war zu lang.");
  if (!response.parsed_output) throw new AnalysisError("Die Antwort konnte nicht gelesen werden.");
  return response.parsed_output as z.infer<T>;
}

export class AnalysisError extends Error {}

const image = (data: string, mediaType: ImageMediaType): Anthropic.Beta.BetaContentBlockParam => ({
  type: "image",
  source: { type: "base64", media_type: mediaType, data },
});

export function analyzeMealPhoto(data: string, mediaType: ImageMediaType): Promise<MealAnalysis> {
  return parse(
    MealAnalysisSchema,
    "Du bist Ernährungsberater:in. Schätze aus einem Foto, welche Lebensmittel in welcher Menge " +
      "zu sehen sind und welche Nährwerte sie haben. Nutze Teller, Besteck und Verpackungen als " +
      "Größenreferenz. Gib realistische Schätzungen, keine Spannen.",
    [image(data, mediaType), { type: "text", text: "Analysiere diese Mahlzeit." }],
  );
}

export function analyzeReceipt(data: string, mediaType: ImageMediaType): Promise<ReceiptAnalysis> {
  return parse(
    ReceiptAnalysisSchema,
    "Du liest Kassenbons deutscher Supermärkte und Lieferdienste. Erfasse jede Position. " +
      "Ordne Lebensmittel, wenn möglich, einer Zutat aus diesem Katalog zu und rechne die Menge " +
      `in deren Einheit um:\n${catalogText}`,
    [image(data, mediaType), { type: "text", text: "Lies diesen Kassenbon aus." }],
  );
}

/** Lässt Claude zusätzliche Rezepte aus den Katalog-Zutaten vorschlagen. */
export async function generateRecipes(preferences: string, count: number): Promise<Recipe[]> {
  const result = await parse(
    GeneratedRecipesSchema,
    "Du entwickelst alltagstaugliche, ausgewogene Rezepte. Verwende ausschließlich Zutaten aus " +
      "dem Katalog; Mengen gelten pro Portion in der Einheit der Zutat. Bevorzuge Rezepte, die " +
      "Zutaten mit anderen Rezepten teilen, damit Packungen vollständig aufgebraucht werden. " +
      `Erlaubte Tags: vegan, vegetarisch, fleisch, fisch.\n\nKatalog:\n${catalogText}`,
    [{ type: "text", text: `Schlage ${count} Rezepte vor. Wünsche: ${preferences || "keine"}` }],
  );
  return result.recipes.map((r) => ({ ...r, id: `ai_${r.id}` }));
}
