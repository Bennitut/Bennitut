// Aufruf durch HEALTHCHECK im Dockerfile: endet mit 0, wenn der Server im Container antwortet, sonst mit 1.
// Bewusst ohne src/env.ts – der Health-Check braucht keine Einstellungen außer PORT.
import { checkHealth, healthUrl } from "./http/health.js";

const url = healthUrl();
const healthy = await checkHealth(url);
if (!healthy) console.error(`FoodTracker-Server antwortet nicht unter ${url}`);
process.exit(healthy ? 0 : 1);
