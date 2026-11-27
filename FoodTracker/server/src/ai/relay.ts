import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { FetchLike } from "./ollama.js";

// Weiterleitung zu Ollama für einen Server im Internet (docs/SERVER-HOSTING.md, Weg b mit KI vom Laptop): läuft auf
// dem Rechner mit Ollama (`npm run ollama:relay`), ein Tunnel macht sie von außen erreichbar, der Server im Internet
// schickt OLLAMA_API_KEY mit. Ollama selbst kennt keine Schlüssel und darf nie direkt ins Internet. Hier kommt nur
// durch, wer den Schlüssel kennt, und nur zu den Pfaden, die der FoodTracker-Server braucht – Modelle herunterladen,
// anlegen oder löschen (/api/pull, /api/create, /api/delete …) geht von außen nicht.

/** Port der Weiterleitung auf dem Rechner mit Ollama (Ollama selbst: 11434). */
export const RELAY_DEFAULT_PORT = 11435;
/** Größte Anfrage: Fotos, Kassenbons und Einzelbilder aus Videos gehen als Base64 mit. */
export const RELAY_MAX_BODY_BYTES = 32 * 1024 * 1024;
/** Kürzere Schlüssel lehnt die Weiterleitung ab – `newRelayKey` erzeugt 43 Zeichen. */
export const RELAY_MIN_KEY_LENGTH = 24;
/** Etwas länger als das längste Zeitlimit des Servers (OLLAMA_TIMEOUT_SECONDS, höchstens 300 s). */
export const RELAY_TIMEOUT_MS = 330_000;

/** Zufälliger Schlüssel (256 Bit, Base64url ohne Sonderzeichen, die in .env oder beim Hoster stören). */
export function newRelayKey(): string {
  return randomBytes(32).toString("base64url");
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** Vergleich in gleichbleibender Zeit – über die Prüfsummen, damit auch die Länge des Schlüssels nichts verrät. */
export function keyMatches(given: string | undefined, expected: string): boolean {
  return given !== undefined && given.length > 0 && timingSafeEqual(digest(given), digest(expected));
}

const bearerToken = (c: Context) => /^Bearer\s+(\S+)\s*$/i.exec(c.req.header("Authorization") ?? "")?.[1];

export interface RelayOptions {
  /** Der Schlüssel (OLLAMA_RELAY_KEY), den der Server im Internet als OLLAMA_API_KEY mitschickt. */
  key: string;
  /** Adresse von Ollama auf diesem Rechner, z. B. http://127.0.0.1:11434 (ohne / am Ende). */
  target: string;
  timeoutMs?: number;
  fetchFn?: FetchLike;
  maxBodyBytes?: number;
  /** Eine Zeile pro Anfrage fürs Fenster – nie mit Schlüssel oder Inhalt. */
  log?: (line: string) => void;
}

const isTimeout = (err: unknown) => err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");

/** Die Weiterleitung als Hono-App: GET /api/tags, GET /api/version und POST /api/chat, alles andere 404. */
export function createRelayApp(options: RelayOptions): Hono {
  const { key, target, timeoutMs = RELAY_TIMEOUT_MS, maxBodyBytes = RELAY_MAX_BODY_BYTES, log = console.log } = options;
  const fetchFn: FetchLike = options.fetchFn ?? ((input, init) => fetch(input, init));
  if (key.length < RELAY_MIN_KEY_LENGTH) throw new Error(`Der Schlüssel der Weiterleitung ist zu kurz (mindestens ${RELAY_MIN_KEY_LENGTH} Zeichen).`);

  const app = new Hono();
  // Zum Ausprobieren im Browser: Kommt diese Zeile über die Adresse des Tunnels, steht der Tunnel.
  app.get("/", (c) => c.text("FoodTracker: Weiterleitung zu Ollama. Anfragen nur mit Schlüssel.\n"));

  // Zuerst der Schlüssel – ohne ihn liest die Weiterleitung nicht einmal den Inhalt der Anfrage.
  app.use("/api/*", async (c, next) => {
    if (keyMatches(bearerToken(c), key)) return next();
    log(`${c.req.method} ${c.req.path}: abgelehnt – ohne gültigen Schlüssel`);
    c.header("WWW-Authenticate", 'Bearer realm="foodtracker-ollama"');
    return c.json({ error: "unauthorized" }, 401);
  });

  const forward = async (c: Context) => {
    const started = Date.now();
    const post = c.req.method === "POST";
    let res: Response;
    try {
      res = await fetchFn(`${target}${c.req.path}`, {
        method: c.req.method,
        // Nur der Inhalt geht weiter – weder der Schlüssel noch sonst ein Header von außen.
        headers: post ? { "Content-Type": "application/json" } : {},
        body: post ? await c.req.arrayBuffer() : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timeout = isTimeout(err);
      log(`${c.req.method} ${c.req.path}: Ollama ${timeout ? `hat nach ${Math.round(timeoutMs / 1000)} s nicht geantwortet` : `antwortet nicht unter ${target}`}`);
      return c.json({ error: timeout ? "ollama_timeout" : "ollama_unreachable" }, timeout ? 504 : 502);
    }
    const body = await res.arrayBuffer();
    log(`${c.req.method} ${c.req.path}: ${res.status} nach ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return new Response(body, { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" } });
  };

  app.get("/api/tags", forward);
  app.get("/api/version", forward);
  app.post(
    "/api/chat",
    bodyLimit({ maxSize: maxBodyBytes, onError: (c) => c.json({ error: "too_large", maxBytes: maxBodyBytes }, 413) }),
    forward,
  );
  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}
