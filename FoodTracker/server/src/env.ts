import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Einstellungen ohne Umgebungsbefehle: server/.env (Vorlage mit allen Variablen: server/.env.example).
// Wird als Erstes importiert (src/index.ts), damit alle anderen Module die Werte schon sehen.
// Schon gesetzte Umgebungsvariablen gewinnen gegenüber der Datei.

export const ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));
export const envFileLoaded = existsSync(ENV_FILE);
if (envFileLoaded) process.loadEnvFile(ENV_FILE);
