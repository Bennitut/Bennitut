// Zuerst server/.env lesen, damit alle anderen Module die Einstellungen schon sehen.
import { ENV_FILE, envFileLoaded } from "./env.js";
import { serve } from "@hono/node-server";
import { Ai, aiSettingsFromEnv } from "./ai/provider.js";
import { createApp } from "./app.js";
import { mailerFromEnv } from "./mail/mailer.js";
import { lanAddresses, startupMessage } from "./startInfo.js";

/** Kommagetrennte Liste aus einer Umgebungsvariable. */
const list = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const port = Number(process.env.PORT ?? 3000);
const ai = new Ai(aiSettingsFromEnv());
const mailer = mailerFromEnv();
const app = createApp({
  communityFile: process.env.COMMUNITY_FILE ?? "data/community.json",
  feedbackFile: process.env.FEEDBACK_FILE ?? "data/feedback.json",
  usersFile: process.env.USERS_FILE ?? "data/users.json",
  overridesFile: process.env.OVERRIDES_FILE ?? "data/recipe-overrides.json",
  diaryDir: process.env.DIARY_DIR ?? "data/diary",
  auth: {
    appleAudiences: list(process.env.APPLE_BUNDLE_IDS ?? "host.exp.Exponent"),
    googleAudiences: list(process.env.GOOGLE_CLIENT_IDS),
    adminEmails: list(process.env.ADMIN_EMAILS),
    allowDevLogin: process.env.ALLOW_DEV_LOGIN === "1",
  },
  ai,
  corsOrigins: list(process.env.CORS_ORIGINS),
  mailer,
  trustProxy: process.env.TRUST_PROXY === "1",
});
const server = serve({ fetch: app.fetch, port }, async () => {
  const status = await ai.status();
  console.log(
    startupMessage({
      port,
      addresses: lanAddresses(),
      ai: status,
      ollama: ai.settings.ollama,
      envFile: envFileLoaded ? ENV_FILE : null,
      platform: process.platform,
      mail: mailer !== null,
    }),
  );
  if (process.env.ALLOW_DEV_LOGIN === "1") console.log("\n  Achtung: ALLOW_DEV_LOGIN=1 – Anmeldung nur mit Namen, nur zum Testen im eigenen WLAN.");
  console.log("");
});
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code !== "EADDRINUSE") throw err;
  console.error(`\nPort ${port} ist schon belegt – läuft der FoodTracker-Server schon in einem anderen Fenster? Das andere Fenster schließen und neu starten.\n`);
  process.exit(1);
});
