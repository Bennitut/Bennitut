import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

/** Kommagetrennte Liste aus einer Umgebungsvariable. */
const list = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const port = Number(process.env.PORT ?? 3000);
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
});
serve({ fetch: app.fetch, port }, () => console.log(`FoodTracker-Server läuft auf http://localhost:${port}`));
