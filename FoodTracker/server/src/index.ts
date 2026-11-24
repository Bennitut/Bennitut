// Zuerst server/.env lesen, damit alle anderen Module die Einstellungen schon sehen.
import { ENV_FILE, envFileLoaded } from "./env.js";
import { serve } from "@hono/node-server";
import { Ai, aiSettingsFromEnv } from "./ai/provider.js";
import { createApp } from "./app.js";
import { lanAddresses, startupMessage } from "./startInfo.js";

/** Kommagetrennte Liste aus einer Umgebungsvariable. */
const list = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const port = Number(process.env.PORT ?? 3000);
const ai = new Ai(aiSettingsFromEnv());
const app = createApp({
  communityFile: process.env.COMMUNITY_FILE ?? "data/community.json",
  feedbackFile: process.env.FEEDBACK_FILE ?? "data/feedback.json",
  usersFile: process.env.USERS_FILE ?? "data/users.json",
  overridesFile: process.env.OVERRIDES_FILE ?? "data/recipe-overrides.json",
  auth: {
    appleAudiences: list(process.env.APPLE_BUNDLE_IDS ?? "host.exp.Exponent"),
    googleAudiences: list(process.env.GOOGLE_CLIENT_IDS),
    adminEmails: list(process.env.ADMIN_EMAILS),
    allowDevLogin: process.env.ALLOW_DEV_LOGIN === "1",
  },
  ai,
  corsOrigins: list(process.env.CORS_ORIGINS),
});
serve({ fetch: app.fetch, port }, async () => {
  const status = await ai.status();
  console.log(
    startupMessage({
      port,
      addresses: lanAddresses(),
      ai: status,
      ollama: ai.settings.ollama,
      envFile: envFileLoaded ? ENV_FILE : null,
      platform: process.platform,
    }),
  );
  if (process.env.ALLOW_DEV_LOGIN === "1") console.log("\n  Achtung: ALLOW_DEV_LOGIN=1 – Anmeldung nur mit Namen, nur zum Testen im eigenen WLAN.");
  console.log("");
});
