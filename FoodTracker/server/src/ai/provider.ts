import type { z } from "zod";
import { displayUrl } from "../urls.js";
import { redact } from "../log.js";
import { CLAUDE_MODEL, claudeGenerate } from "./claude.js";
import { ollamaConfigProblem, ollamaGenerate, probeOllama, type FetchLike, type OllamaSettings } from "./ollama.js";
import { AiError, type AiRequest, type AiResult } from "./types.js";

// Die eine Stelle, über die alle KI-Funktionen laufen (Foto, Kassenbon, Import, Übersetzen, Verbessern, KI-Wünsche):
// Claude (ANTHROPIC_API_KEY, kostet API-Guthaben) oder Ollama (kostenlos, lokal). Auswahl über AI_PROVIDER;
// ohne Angabe Claude, wenn ein Schlüssel gesetzt ist, sonst Ollama, wenn es unter OLLAMA_URL antwortet.

export type AiProviderName = "claude" | "ollama";

export interface AiSettings {
  /** Fest gewählter Anbieter; undefined = automatisch. */
  provider?: AiProviderName;
  hasAnthropicKey: boolean;
  ollama: OllamaSettings;
}

export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "gemma4:e4b";

const positiveInt = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Einstellungen aus der Umgebung bzw. server/.env (siehe .env.example). */
export function aiSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): AiSettings {
  const provider = env.AI_PROVIDER?.trim().toLowerCase() || undefined;
  if (provider && provider !== "claude" && provider !== "ollama") {
    console.warn(`AI_PROVIDER="${env.AI_PROVIDER}" ist unbekannt (erlaubt: claude oder ollama) – wähle automatisch.`);
  }
  return {
    provider: provider === "claude" || provider === "ollama" ? provider : undefined,
    hasAnthropicKey: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    ollama: {
      url: (env.OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL).replace(/\/+$/, ""),
      model: env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
      numCtx: positiveInt(env.OLLAMA_NUM_CTX, 16384),
      timeoutMs: positiveInt(env.OLLAMA_TIMEOUT_SECONDS, 240) * 1000,
      apiKey: env.OLLAMA_API_KEY?.trim() || undefined,
    },
  };
}

/** Ob der Server Ollama fragt: fest gewählt oder automatisch ohne Claude-Schlüssel. */
export const usesOllama = (settings: AiSettings) => settings.provider === "ollama" || (!settings.provider && !settings.hasAnthropicKey);

/**
 * Was an den KI-Einstellungen so falsch ist, dass der Server lieber nicht startet (z. B. ein Schlüssel für Ollama, der
 * unverschlüsselt durchs Internet ginge) – sonst null. Nur, wenn Ollama überhaupt gefragt wird.
 */
export function aiConfigProblem(settings: AiSettings): string | null {
  return usesOllama(settings) ? ollamaConfigProblem(settings.ollama) : null;
}

/**
 * Zustand für /api/health und die Profilzeile der App: ready – nutzbar; not_configured – keine KI eingerichtet;
 * unreachable – Ollama fest gewählt, antwortet aber nicht; model_missing – Ollama läuft, das Modell fehlt.
 * `reason: "unauthorized"` (bei unreachable): Die Weiterleitung vor Ollama lehnt OLLAMA_API_KEY ab.
 */
export interface AiStatus {
  provider: AiProviderName | null;
  model: string | null;
  state: "ready" | "not_configured" | "unreachable" | "model_missing";
  reason?: "unauthorized";
}

type ClaudeGenerate = <T extends z.ZodType>(req: AiRequest<T>) => Promise<AiResult<z.infer<T>>>;

export class Ai {
  constructor(
    readonly settings: AiSettings,
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly claude: ClaudeGenerate = claudeGenerate,
  ) {}

  /** Welche KI gerade nutzbar ist. Fragt Ollama jedes Mal kurz an – wer es später startet, muss nichts neu starten. */
  async status(): Promise<AiStatus> {
    const { provider, hasAnthropicKey, ollama } = this.settings;
    if (provider === "claude" || (!provider && hasAnthropicKey)) {
      return { provider: "claude", model: CLAUDE_MODEL, state: hasAnthropicKey ? "ready" : "not_configured" };
    }
    const state = await probeOllama(ollama, this.fetchFn);
    // Ein abgelehnter Schlüssel heißt: Da ist eine Weiterleitung eingerichtet, sie passt nur nicht – nicht „keine KI“.
    if (state === "unauthorized") return { provider: "ollama", model: ollama.model, state: "unreachable", reason: "unauthorized" };
    if (!provider && state === "unreachable") return { provider: null, model: null, state: "not_configured" };
    return { provider: "ollama", model: ollama.model, state };
  }

  /** Wirft AiError, wenn keine KI nutzbar ist – damit KI-Endpunkte früh und verständlich abbrechen. */
  async require(): Promise<AiStatus & { provider: AiProviderName }> {
    const status = await this.status();
    if (status.state === "ready" && status.provider) return { ...status, provider: status.provider };
    if (status.state === "model_missing") throw new AiError("model_missing", `${status.model} fehlt – „ollama pull ${status.model}“`);
    const where = displayUrl(this.settings.ollama.url);
    if (status.reason === "unauthorized") throw new AiError("unavailable", `Ollama unter ${where} lehnt den Schlüssel ab – stimmt OLLAMA_API_KEY?`);
    if (status.state === "unreachable") throw new AiError("unavailable", `Ollama unter ${where} antwortet nicht`);
    throw new AiError("not_configured");
  }

  /** Strukturierte Antwort von der gerade nutzbaren KI; protokolliert Dauer und Tokens im Serverfenster. */
  async generate<T extends z.ZodType>(req: AiRequest<T>): Promise<z.infer<T>> {
    const { provider, model } = await this.require();
    const started = Date.now();
    const label = `KI ${provider === "claude" ? "Claude" : "Ollama"} (${model}), ${req.task}`;
    const seconds = () => ((Date.now() - started) / 1000).toFixed(1);
    try {
      const { data, usage } = provider === "claude" ? await this.claude(req) : await ollamaGenerate(this.settings.ollama, req, this.fetchFn);
      console.log(`${label}: ${seconds()} s, ${usage.inputTokens ?? "?"} Tokens rein, ${usage.outputTokens ?? "?"} raus`);
      return data;
    } catch (err) {
      console.warn(`${label}: fehlgeschlagen nach ${seconds()} s – ${redact(err instanceof Error ? err.message : String(err))}`);
      throw err;
    }
  }
}
