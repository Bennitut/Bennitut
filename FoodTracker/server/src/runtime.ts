// Wie der Server läuft: zum Testen auf dem eigenen Rechner (npm start, start-test.cmd) oder als Server für andere –
// im Container setzt das Dockerfile NODE_ENV=production und FOODTRACKER_CONTAINER=1. Davon hängen die Startmeldung
// und der Dev-Login ab.

export interface Runtime {
  /** NODE_ENV=production: ein Server für andere (im Container immer, außer man setzt NODE_ENV selbst anders). */
  production: boolean;
  /** Im Container (FOODTRACKER_CONTAINER=1): keine WLAN-Adressen, Einstellungen kommen als Umgebungsvariablen. */
  container: boolean;
}

export function runtimeFromEnv(env: NodeJS.ProcessEnv = process.env): Runtime {
  return { production: env.NODE_ENV?.trim() === "production", container: env.FOODTRACKER_CONTAINER?.trim() === "1" };
}

/**
 * Dev-Login (Anmeldung nur mit einem Namen) gibt es nur zum Testen. Im Betrieb (NODE_ENV=production) könnte sich damit
 * jede:r unter jedem Namen anmelden, mit einer Adresse aus ADMIN_EMAILS sogar als Admin – dort gilt ALLOW_DEV_LOGIN=1
 * nicht (`ignored`: der Server sagt es beim Start).
 */
export function devLoginSetting(env: NodeJS.ProcessEnv, runtime: Runtime): { allowed: boolean; ignored: boolean } {
  const requested = env.ALLOW_DEV_LOGIN?.trim() === "1";
  return { allowed: requested && !runtime.production, ignored: requested && runtime.production };
}
