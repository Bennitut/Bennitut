import type { z } from "zod";
import type { FetchedImage } from "../social/fetchPost.js";

/** Eine KI-Anfrage mit strukturierter Antwort – gleich für Claude und Ollama (siehe provider.ts). */
export interface AiRequest<T extends z.ZodType> {
  /** Kurzname fürs Protokoll im Serverfenster, z. B. „Rezept-Import“. */
  task: string;
  /** Form der Antwort: Beide Anbieter bekommen daraus ein JSON-Schema, die Antwort wird damit geprüft. */
  schema: T;
  system: string;
  text: string;
  /** Bilder vor dem Text, z. B. ein Foto oder Einzelbilder aus einem Video. */
  images?: FetchedImage[];
}

/** Verbrauch einer Anfrage fürs Protokoll. */
export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiResult<T> {
  data: T;
  usage: AiUsage;
}

/** Die KI hat geantwortet, aber nicht brauchbar (HTTP 422, in der App errors.analysis_<code>). */
export class AnalysisError extends Error {
  constructor(readonly code: "refused" | "too_long" | "unreadable" | "not_a_recipe") {
    super(code);
  }
}

/**
 * Keine KI nutzbar (in der App errors.ai_<code>):
 * not_configured – weder Claude-Schlüssel noch erreichbares Ollama; model_missing – Ollama läuft, das Modell fehlt;
 * unavailable – die KI ist ausgefallen oder lehnt ab; timeout – die Antwort hat zu lange gedauert.
 */
export type AiErrorCode = "not_configured" | "model_missing" | "unavailable" | "timeout";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    /** Nur fürs Serverprotokoll, geht nicht an die App. */
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export const AI_ERROR_STATUS = { not_configured: 503, model_missing: 503, unavailable: 503, timeout: 504 } as const satisfies Record<
  AiErrorCode,
  number
>;
