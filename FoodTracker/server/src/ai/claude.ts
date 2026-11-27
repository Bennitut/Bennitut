import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { AiError, AnalysisError, type AiRequest, type AiResult } from "./types.js";

export const CLAUDE_MODEL = "claude-opus-5-5";

// Liest ANTHROPIC_API_KEY aus der Umgebung (oder aus server/.env). Der Schlüssel bleibt auf dem Server,
// die App spricht nur mit diesem Backend. Erst bei Bedarf erzeugen, damit alles andere ohne Schlüssel läuft.
let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic());

/** Strukturierte Antwort von Claude (kostet API-Guthaben bei Anthropic). */
export async function claudeGenerate<T extends z.ZodType>(req: AiRequest<T>): Promise<AiResult<z.infer<T>>> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(req.images ?? []).map(
      ({ data, mediaType }): Anthropic.Beta.BetaContentBlockParam => ({ type: "image", source: { type: "base64", media_type: mediaType, data } }),
    ),
    { type: "text", text: req.text },
  ];
  let response;
  try {
    response = await getClient().beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // Lehnt das Modell eine Anfrage ab, übernimmt serverseitig ein passendes Ersatzmodell.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: req.system,
      messages: [{ role: "user", content }],
      output_config: { format: betaZodOutputFormat(req.schema) },
    });
  } catch (err) {
    throw toAiError(err);
  }
  if (response.stop_reason === "refusal") throw new AnalysisError("refused");
  if (response.stop_reason === "max_tokens") throw new AnalysisError("too_long");
  if (!response.parsed_output) throw new AnalysisError("unreadable");
  return {
    data: response.parsed_output as z.infer<T>,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}

/** Fehler der Claude-API in verständliche Codes für die App übersetzen; Unbekanntes bleibt „internal“. */
function toAiError(err: unknown): unknown {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError("not_configured", "Claude lehnt ANTHROPIC_API_KEY ab");
  }
  if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message)) {
    return new AiError("not_configured", "kein API-Guthaben bei Anthropic");
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AiError("timeout", "Claude");
  if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
    return new AiError("unavailable", `Claude: ${err.message}`);
  }
  return err;
}
