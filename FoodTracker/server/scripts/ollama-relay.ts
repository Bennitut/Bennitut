// Weiterleitung zu Ollama auf diesem Rechner für den FoodTracker-Server im Internet (docs/SERVER-HOSTING.md, „KI vom
// Laptop“): Der Server bei Render & Co. hat keine Grafikkarte; mit der Weiterleitung und einem Tunnel nutzt er die KI
// auf dem Laptop – kostenlos, aber nur, solange der Laptop läuft.
//
//   npm run ollama:relay                                     (im Ordner server/, Ollama muss laufen)
//   cloudflared tunnel --url http://127.0.0.1:11435          (zweites Fenster: macht die Weiterleitung erreichbar)
//
// Beim Server im Internet dann OLLAMA_URL = Adresse des Tunnels und OLLAMA_API_KEY = OLLAMA_RELAY_KEY aus server/.env
// eintragen. Fehlt der Schlüssel, legt die Weiterleitung beim ersten Start einen an und schreibt ihn in server/.env.
import { ENV_FILE, envFileLoaded } from "../src/env.js";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { probeOllama } from "../src/ai/ollama.js";
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL } from "../src/ai/provider.js";
import { createRelayApp, newRelayKey, RELAY_DEFAULT_PORT, RELAY_MIN_KEY_LENGTH, RELAY_TIMEOUT_MS } from "../src/ai/relay.js";
import { displayUrl } from "../src/urls.js";

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const port = Number(process.env.OLLAMA_RELAY_PORT ?? RELAY_DEFAULT_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`OLLAMA_RELAY_PORT="${process.env.OLLAMA_RELAY_PORT}" ist kein Port.`);
// Wohin weitergeleitet wird: Ollama auf diesem Rechner – dieselbe Einstellung wie für den Server zum Testen.
const target = (process.env.OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
const model = process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;

let key = process.env.OLLAMA_RELAY_KEY?.trim();
let created = false;
if (!key) {
  key = newRelayKey();
  const before = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  appendFileSync(
    ENV_FILE,
    (before ? (before.endsWith("\n") ? "\n" : "\n\n") : "") +
      "# Schlüssel der Weiterleitung zu Ollama (npm run ollama:relay, docs/SERVER-HOSTING.md) – beim Server im Internet\n" +
      "# als OLLAMA_API_KEY eintragen. Geheim halten; wer ihn kennt, kann die KI auf diesem Rechner nutzen.\n" +
      `OLLAMA_RELAY_KEY=${key}\n`,
  );
  created = true;
}
if (key.length < RELAY_MIN_KEY_LENGTH) {
  fail(`OLLAMA_RELAY_KEY ist zu kurz (mindestens ${RELAY_MIN_KEY_LENGTH} Zeichen). Die Zeile in server/.env löschen – beim nächsten Start legt die Weiterleitung einen sicheren Schlüssel an.`);
}

const app = createRelayApp({ key, target, timeoutMs: RELAY_TIMEOUT_MS });
// Nur auf diesem Rechner erreichbar: Von außen kommt man allein über den Tunnel herein (und nur mit Schlüssel).
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, async () => {
  const state = await probeOllama({ url: target, model, numCtx: 0, timeoutMs: 0 }, (input, init) => fetch(input, init));
  const ollama =
    state === "ready"
      ? `bereit, Modell ${model}`
      : state === "model_missing"
        ? `läuft, aber ${model} fehlt – einmal ausführen: ollama pull ${model}`
        : "antwortet nicht – läuft Ollama? (Die Weiterleitung wartet und merkt es ohne Neustart.)";
  console.log(
    [
      "",
      "FoodTracker: Weiterleitung zu Ollama läuft.",
      `  Weiterleitung:  http://127.0.0.1:${port}  →  Ollama unter ${displayUrl(target)} (${ollama})`,
      created
        ? `  Schlüssel:      neu angelegt und in ${ENV_FILE} gespeichert (OLLAMA_RELAY_KEY, geheim halten):\n                  ${key}`
        : `  Schlüssel:      OLLAMA_RELAY_KEY${envFileLoaded ? ` (in ${ENV_FILE})` : ""}`,
      "",
      "  Nächster Schritt in einem zweiten Fenster (macht die Weiterleitung über https erreichbar):",
      `    cloudflared tunnel --url http://127.0.0.1:${port}`,
      "  Beim Server im Internet (z. B. Render → Environment) eintragen:",
      "    OLLAMA_URL      = die https-Adresse, die cloudflared anzeigt",
      "    OLLAMA_API_KEY  = der Schlüssel (OLLAMA_RELAY_KEY)",
      "  Beenden mit Strg+C – dann meldet die App bei KI-Funktionen „Die KI ist gerade nicht erreichbar“, alles andere geht.",
      "",
    ].join("\n"),
  );
});
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code !== "EADDRINUSE") throw err;
  fail(`Port ${port} ist schon belegt – läuft die Weiterleitung schon in einem anderen Fenster? (Anderer Port: OLLAMA_RELAY_PORT in server/.env.)`);
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    server.close();
    process.exit(0);
  });
}
