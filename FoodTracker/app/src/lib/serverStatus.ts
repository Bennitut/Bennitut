// Die Zeile zum Server im Profil: verbunden mit Claude, mit lokaler KI (Ollama), ohne KI oder nicht erreichbar.
// Ohne native Module, damit sie in test/ läuft.

/** Antwort von GET /api/health (siehe server/src/ai/provider.ts, AiStatus). */
export interface ServerHealth {
  ok: boolean;
  ai?: {
    provider: "claude" | "ollama" | null;
    model: string | null;
    state: "ready" | "not_configured" | "unreachable" | "model_missing";
  };
}

export type ServerLineKey =
  | "profile.serverChecking"
  | "profile.serverClaude"
  | "profile.serverLocalAi"
  | "profile.serverModelMissing"
  | "profile.serverNoAi"
  | "profile.serverConnected"
  | "profile.serverOffline";

/**
 * Welcher Text im Profil steht. `health`: undefined = wird noch geprüft, null = keine Antwort.
 * Ein älterer Server ohne `ai` in der Antwort gilt nur als verbunden.
 */
export function serverLine(health: ServerHealth | null | undefined): { key: ServerLineKey; model: string } {
  if (health === undefined) return { key: "profile.serverChecking", model: "" };
  if (!health?.ok) return { key: "profile.serverOffline", model: "" };
  const ai = health.ai;
  const model = ai?.model ?? "";
  if (!ai) return { key: "profile.serverConnected", model };
  if (ai.state === "ready") return { key: ai.provider === "claude" ? "profile.serverClaude" : "profile.serverLocalAi", model };
  if (ai.state === "model_missing") return { key: "profile.serverModelMissing", model };
  return { key: "profile.serverNoAi", model };
}
