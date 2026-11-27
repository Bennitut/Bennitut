// Health-Check für Docker (HEALTHCHECK im Dockerfile, Aufruf über src/healthcheck.ts): fragt den laufenden Server im
// selben Container unter /api/health/live. Der Pfad fragt weder KI noch Datenbank (siehe app.ts).

export const LIVE_PATH = "/api/health/live";

/** Adresse des Lebenszeichens im selben Container; der Port kommt wie beim Server aus PORT (Standard 3000). */
export function healthUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = Number(env.PORT);
  return `http://127.0.0.1:${Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000}${LIVE_PATH}`;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Gesund, wenn der Server innerhalb des Zeitlimits mit 200 und {"ok":true} antwortet. */
export async function checkHealth(url: string, fetchFn: FetchLike = (input, init) => fetch(input, init), timeoutMs = 4000): Promise<boolean> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: unknown } | null;
    return body?.ok === true;
  } catch {
    return false;
  }
}
