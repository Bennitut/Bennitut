import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const app = createApp({
  communityFile: process.env.COMMUNITY_FILE ?? "data/community.json",
  feedbackFile: process.env.FEEDBACK_FILE ?? "data/feedback.json",
});
serve({ fetch: app.fetch, port }, () => console.log(`FoodTracker-Server läuft auf http://localhost:${port}`));
