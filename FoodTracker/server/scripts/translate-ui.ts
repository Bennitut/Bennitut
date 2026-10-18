/**
 * Erzeugt eine neue Sprache für die App-Oberfläche mit Claude.
 *
 *   npm run translate-ui -- pt "Português"
 *
 * Grundlage ist die englische Datei app/src/i18n/en.ts. Das Ergebnis wird geprüft (gleiche
 * Schlüssel, gleiche Platzhalter wie {n}) und als app/src/i18n/<code>.ts gespeichert.
 * Danach die Sprache in app/src/i18n/index.ts eintragen (DICTIONARIES und LANGUAGE_NAMES).
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Tree = { [key: string]: string | Tree };

const [code, languageName] = process.argv.slice(2);
if (!code || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(code) || !languageName) {
  console.error('Aufruf: npm run translate-ui -- <Sprachcode> "<Name der Sprache>"   z. B. pt "Português"');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const i18nDir = join(here, "../../app/src/i18n");
const target = join(i18nDir, `${code}.ts`);
// Zur Laufzeit laden (tsx versteht TypeScript), damit das Server-Projekt die App-Dateien nicht mitkompiliert.
const { en } = (await import(pathToFileURL(join(i18nDir, "en.ts")).href)) as { en: Tree };
if (existsSync(target)) {
  console.error(`${target} gibt es schon.`);
  process.exit(1);
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

/** Prüft, ob die Übersetzung dieselbe Struktur und dieselben Platzhalter hat. */
function validate(source: Tree, translated: unknown, path = ""): string[] {
  if (typeof translated !== "object" || translated === null) return [`${path || "root"}: kein Objekt`];
  const problems: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    const other = (translated as Record<string, unknown>)[key];
    const here = path ? `${path}.${key}` : key;
    if (typeof value === "string") {
      if (typeof other !== "string" || !other.trim()) problems.push(`${here}: fehlt`);
      else if (placeholders(value) !== placeholders(other)) problems.push(`${here}: Platzhalter stimmen nicht`);
    } else {
      problems.push(...validate(value, other, here));
    }
  }
  return problems;
}

const client = new Anthropic();

async function translateOnce(feedback: string[]): Promise<unknown> {
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      `Du übersetzt die Oberfläche einer Ernährungs-App (Essen tracken, Zero-Waste-Essenspläne, Rezepte) ins ${languageName} (${code}). ` +
      "Kurz, freundlich, wie in einer gut gemachten App. Platzhalter in geschweiften Klammern wie {n} unverändert lassen, " +
      "Emojis behalten. Antworte ausschließlich mit dem übersetzten JSON-Objekt mit exakt denselben Schlüsseln.",
    messages: [
      {
        role: "user",
        content:
          JSON.stringify(en, null, 2) + (feedback.length ? `\n\nKorrigiere diese Fehler aus dem letzten Versuch:\n${feedback.join("\n")}` : ""),
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Anfrage abgelehnt");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

let feedback: string[] = [];
for (let attempt = 1; attempt <= 3; attempt++) {
  const translated = await translateOnce(feedback);
  feedback = validate(en, translated);
  if (feedback.length === 0) {
    const ident = code.replace("-", "_");
    writeFileSync(
      target,
      `import type { Dictionary } from "./types";\n\n// Mit Claude erzeugt (npm run translate-ui). Bitte von Muttersprachler:innen gegenlesen lassen.\nexport const ${ident}: Dictionary = ${JSON.stringify(translated, null, 2)};\n`,
    );
    console.log(`Gespeichert: ${target}`);
    console.log(`Jetzt in app/src/i18n/index.ts eintragen:\n  import { ${ident} } from "./${code}";\n  DICTIONARIES: ${ident}\n  LANGUAGE_NAMES: ${code === ident ? code : `"${code}"`}: "${languageName}"`);
    process.exit(0);
  }
  console.warn(`Versuch ${attempt}: ${feedback.length} Probleme, versuche erneut …`);
}
console.error("Übersetzung fehlgeschlagen:\n" + feedback.join("\n"));
process.exit(1);
