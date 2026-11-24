import { cors } from "hono/cors";

// Browser schicken Anfragen von einer anderen Adresse (z. B. Expo im Browser auf Port 8081) nur ab, wenn der Server
// sie per CORS erlaubt. Erlaubt sind der eigene Rechner und das eigene Netz – nicht jede beliebige Website.

/** Private IPv4-Adressen nach RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. */
function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false;
  const [a, b] = parts.map(Number) as [number, number, number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Einträge aus CORS_ORIGINS vereinheitlichen („https://example.com/pfad/“ → „https://example.com“), Ungültiges weglassen. */
export function normalizeOrigins(origins: readonly string[]): string[] {
  return origins.flatMap((entry) => {
    try {
      const { origin } = new URL(entry);
      return origin === "null" ? [] : [origin];
    } catch {
      console.warn(`CORS_ORIGINS: „${entry}“ ist keine Adresse wie https://example.com – ignoriert.`);
      return [];
    }
  });
}

/**
 * Ob eine Website (Origin-Header, z. B. „http://192.168.1.20:8081“) den Server aus dem Browser nutzen darf:
 * localhost, 127.0.0.1 und private Netzadressen mit beliebigem Port, dazu die Ursprünge aus `extra`.
 */
export function isAllowedOrigin(origin: string, extra: readonly string[] = []): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== "null" && extra.includes(url.origin)) return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || isPrivateIPv4(host);
}

/** CORS für /api/*; `extraOrigins` kommt aus CORS_ORIGINS (kommagetrennt). */
export function corsMiddleware(extraOrigins: readonly string[] = []) {
  const extra = normalizeOrigins(extraOrigins);
  return cors({
    origin: (origin) => (isAllowedOrigin(origin, extra) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Device-Id"],
    maxAge: 600,
  });
}
