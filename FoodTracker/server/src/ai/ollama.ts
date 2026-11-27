import { z } from "zod";
import { displayUrl, isLocalNetworkHost } from "../urls.js";
import { AiError, AnalysisError, type AiRequest, type AiResult } from "./types.js";

// Ollama (https://ollama.com) lässt Open-Source-Modelle kostenlos auf dem eigenen Rechner laufen.
// API: https://docs.ollama.com/api/chat, strukturierte Antworten: https://docs.ollama.com/capabilities/structured-outputs

export interface OllamaSettings {
  /** z. B. http://127.0.0.1:11434 (ohne / am Ende) */
  url: string;
  /** z. B. gemma4:e4b – muss Bilder verstehen, sonst klappen Foto, Kassenbon und Video-Import nicht. */
  model: string;
  /** Kontextlänge in Tokens: Platz für Anweisungen, Zutatenkatalog, Bilder und Antwort. */
  numCtx: number;
  /** Zeitlimit pro Anfrage; lokal dauern Antworten oft 20–90 Sekunden, das erste Mal länger (Modell laden). */
  timeoutMs: number;
  /**
   * Schlüssel für Ollama auf einem anderen Rechner (OLLAMA_API_KEY), z. B. hinter der Weiterleitung `npm run
   * ollama:relay` und einem Tunnel (docs/SERVER-HOSTING.md): geht als „Authorization: Bearer …“ mit. Ollama selbst
   * kennt keine Schlüssel – deshalb darf es nie ohne die Weiterleitung ins Internet.
   */
  apiKey?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Obergrenze für die Länge der Antwort – sonst kann ein Modell in einer Endlos-Liste hängen bleiben. */
const MAX_OUTPUT_TOKENS = 8192;

/** „gemma4“ und „gemma4:latest“ sind dasselbe Modell. */
const withTag = (name: string) => (/:[^/]+$/.test(name) ? name : `${name}:latest`);
export const sameModel = (a: string, b: string) => withTag(a) === withTag(b);

/**
 * Was an den Einstellungen nicht stimmt, bevor etwas an Ollama geht – sonst null. Zugangsdaten in der Adresse schickt
 * `fetch` gar nicht (und sie landeten in Meldungen), und ein Schlüssel darf nicht unverschlüsselt durchs Internet.
 */
export function ollamaConfigProblem(settings: Pick<OllamaSettings, "url" | "apiKey">): string | null {
  let url: URL;
  try {
    url = new URL(settings.url);
  } catch {
    return "OLLAMA_URL ist keine gültige Adresse – z. B. http://127.0.0.1:11434 oder https://<Adresse des Tunnels>.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "OLLAMA_URL muss mit http:// oder https:// beginnen.";
  if (url.username || url.password) {
    return "OLLAMA_URL enthält Zugangsdaten – die gehören in OLLAMA_API_KEY (geht als „Authorization: Bearer …“ mit), nicht in die Adresse.";
  }
  if (settings.apiKey && url.protocol === "http:" && !isLocalNetworkHost(url.hostname)) {
    return `OLLAMA_API_KEY ginge unverschlüsselt über http an ${displayUrl(settings.url)} – für Adressen im Internet https:// nehmen (z. B. die Adresse des Tunnels).`;
  }
  return null;
}

const authHeaders = (settings: OllamaSettings): Record<string, string> => (settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {});

/** Zeitlimit für die kurze Anfrage, ob Ollama läuft – über einen Tunnel ins Internet etwas großzügiger. */
const probeTimeoutMs = (settings: OllamaSettings) => {
  try {
    return isLocalNetworkHost(new URL(settings.url).hostname) ? 2000 : 5000;
  } catch {
    return 2000;
  }
};

/** unauthorized: Die Weiterleitung vor Ollama lehnt den Schlüssel ab (OLLAMA_API_KEY fehlt oder passt nicht). */
export type OllamaState = "ready" | "unreachable" | "model_missing" | "unauthorized";

/** Ob Ollama antwortet und das Modell heruntergeladen ist (GET /api/tags, kurzes Zeitlimit). */
export async function probeOllama(settings: OllamaSettings, fetchFn: FetchLike): Promise<OllamaState> {
  try {
    const res = await fetchFn(`${settings.url}/api/tags`, { headers: authHeaders(settings), signal: AbortSignal.timeout(probeTimeoutMs(settings)) });
    if (res.status === 401 || res.status === 403) return "unauthorized";
    if (!res.ok) return "unreachable";
    const body = (await res.json()) as { models?: { name?: string; model?: string }[] };
    const names = (body.models ?? []).flatMap((m) => [m.name, m.model]).filter((n): n is string => typeof n === "string");
    return names.some((n) => sameModel(n, settings.model)) ? "ready" : "model_missing";
  } catch {
    return "unreachable";
  }
}

/** JSON-Schema für Ollamas `format` aus dem Zod-Schema (ohne `$schema`, das braucht Ollama nicht). */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

interface ChatResponse {
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

const isTimeout = (err: unknown) =>
  err instanceof Error &&
  (err.name === "TimeoutError" || err.name === "AbortError" || /HEADERS_TIMEOUT|BODY_TIMEOUT/.test(String((err.cause as { code?: string })?.code)));

/** POST /api/chat; liefert Status und Antworttext, übersetzt Verbindungsfehler und Zeitüberschreitung. */
async function postChat(settings: OllamaSettings, body: object, fetchFn: FetchLike): Promise<{ status: number; text: string }> {
  try {
    const res = await fetchFn(`${settings.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(settings) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(settings.timeoutMs),
    });
    return { status: res.status, text: await res.text() };
  } catch (err) {
    if (isTimeout(err)) throw new AiError("timeout", `Ollama nach ${Math.round(settings.timeoutMs / 1000)} s`);
    throw new AiError("unavailable", `Ollama unter ${displayUrl(settings.url)} nicht erreichbar`);
  }
}

const errorOf = (text: string) => {
  try {
    const error = (JSON.parse(text) as { error?: unknown }).error;
    return typeof error === "string" ? error : text;
  } catch {
    return text;
  }
};

/**
 * Strukturierte Antwort von Ollama: ohne Streaming, Temperatur 0, Bilder als Base64, `format` = JSON-Schema,
 * Denken aus. Die Antwort wird mit demselben Zod-Schema geprüft wie bei Claude.
 */
export async function ollamaGenerate<T extends z.ZodType>(
  settings: OllamaSettings,
  req: AiRequest<T>,
  fetchFn: FetchLike,
): Promise<AiResult<z.infer<T>>> {
  const format = jsonSchemaFor(req.schema);
  const images = (req.images ?? []).map((i) => i.data);
  const body: Record<string, unknown> = {
    model: settings.model,
    stream: false,
    // Antworten ohne vorheriges „Nachdenken“: schneller, und die Antwort ist reines JSON.
    think: false,
    format,
    // Modell nach der Anfrage noch eine Weile im Speicher lassen, damit die nächste schneller geht.
    keep_alive: "30m",
    options: { temperature: 0, num_ctx: settings.numCtx, num_predict: MAX_OUTPUT_TOKENS },
    messages: [
      // Laut Ollama-Doku hilft es, das Schema zusätzlich in den Text zu schreiben.
      { role: "system", content: `${req.system}\n\nAntworte ausschließlich mit JSON nach diesem JSON-Schema:\n${JSON.stringify(format)}` },
      { role: "user", content: req.text, ...(images.length > 0 ? { images } : {}) },
    ],
  };
  let res = await postChat(settings, body, fetchFn);
  if (res.status === 400 && /think/i.test(errorOf(res.text))) {
    // Modelle ohne Denk-Modus lehnen `think` womöglich ab – dann ohne.
    delete body.think;
    res = await postChat(settings, body, fetchFn);
  }
  if (res.status === 404) throw new AiError("model_missing", `${settings.model} fehlt – „ollama pull ${settings.model}“`);
  if (res.status === 401 || res.status === 403) {
    throw new AiError("unavailable", `Ollama unter ${displayUrl(settings.url)} lehnt den Schlüssel ab – stimmt OLLAMA_API_KEY?`);
  }
  // Cloudflare (Tunnel) bricht Anfragen ab, auf die nach rund zwei Minuten noch keine Antwort kam.
  if (res.status === 524) throw new AiError("timeout", "Ollama: Der Tunnel hat nach rund zwei Minuten ohne Antwort abgebrochen (524)");
  if (res.status < 200 || res.status >= 300) throw new AiError("unavailable", `Ollama ${res.status}: ${errorOf(res.text).slice(0, 300)}`);

  let chat: ChatResponse;
  try {
    chat = JSON.parse(res.text) as ChatResponse;
  } catch {
    throw new AnalysisError("unreadable");
  }
  if (chat.done_reason === "length") throw new AnalysisError("too_long");
  let raw: unknown;
  try {
    raw = JSON.parse(chat.message?.content ?? "");
  } catch {
    throw new AnalysisError("unreadable");
  }
  const parsed = req.schema.safeParse(raw);
  if (!parsed.success) throw new AnalysisError("unreadable");
  return { data: parsed.data as z.infer<T>, usage: { inputTokens: chat.prompt_eval_count, outputTokens: chat.eval_count } };
}
