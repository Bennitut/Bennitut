import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { describe, expect, it } from "vitest";
import { Ai } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { LIVE_PATH, checkHealth, healthUrl } from "../src/http/health.js";
import { devLoginSetting, runtimeFromEnv } from "../src/runtime.js";

// Betrieb als Server für andere (Dockerfile): Lebenszeichen für den Health-Check, Dev-Login nur zum Testen.

/** KI, die mitzählt, wie oft sie gefragt wird (Ollama hinter einem Tunnel soll vom Health-Check nichts merken). */
function countingAi() {
  const calls: string[] = [];
  const ai = new Ai({ hasAnthropicKey: false, ollama: { url: "http://ollama.test", model: "gemma4:e4b", numCtx: 1024, timeoutMs: 1000 } }, async (input) => {
    calls.push(String(input));
    throw new TypeError("offline");
  });
  return { ai, calls };
}

describe("Lebenszeichen /api/health/live", () => {
  it("antwortet mit {ok:true}, ohne die KI zu fragen", async () => {
    const { ai, calls } = countingAi();
    const app = createApp({ ai });
    const res = await app.request(LIVE_PATH);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toEqual([]);
    // Zum Vergleich: /api/health fragt Ollama, ob es läuft (Profilzeile der App).
    await app.request("/api/health");
    expect(calls).toEqual(["http://ollama.test/api/tags"]);
  });

  it("bekommt CORS-Header für die Web-Version aus CORS_ORIGINS", async () => {
    const app = createApp({ ai: countingAi().ai, corsOrigins: ["https://bennitut.github.io"] });
    const res = await app.request(LIVE_PATH, { headers: { Origin: "https://bennitut.github.io" } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://bennitut.github.io");
  });
});

describe("Health-Check im Container", () => {
  it("fragt den Port aus PORT, sonst 3000", () => {
    expect(healthUrl({})).toBe("http://127.0.0.1:3000/api/health/live");
    expect(healthUrl({ PORT: "10000" })).toBe("http://127.0.0.1:10000/api/health/live");
    for (const PORT of ["", "abc", "0", "70000", "3000.5"]) expect(healthUrl({ PORT })).toBe("http://127.0.0.1:3000/api/health/live");
  });

  it("ist nur bei 200 mit {ok:true} gesund", async () => {
    const answer = (ok: boolean, body: unknown) => async () => ({ ok, json: async () => body });
    expect(await checkHealth("http://x", answer(true, { ok: true }))).toBe(true);
    expect(await checkHealth("http://x", answer(false, { ok: true }))).toBe(false);
    expect(await checkHealth("http://x", answer(true, { ok: false }))).toBe(false);
    expect(await checkHealth("http://x", answer(true, null))).toBe(false);
    expect(
      await checkHealth("http://x", async () => {
        throw new TypeError("fetch failed");
      }),
    ).toBe(false);
    expect(
      await checkHealth("http://x", async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("kein JSON");
        },
      })),
    ).toBe(false);
  });

  it("gibt nach dem Zeitlimit auf, wenn der Server hängt", async () => {
    const hanging = (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<never>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    const started = Date.now();
    expect(await checkHealth("http://x", hanging, 50)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("klappt gegen den echten Server und schlägt fehl, sobald er weg ist", async () => {
    const app = createApp({ ai: countingAi().ai });
    const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(s));
    });
    const { port } = server.address() as AddressInfo;
    const url = healthUrl({ PORT: String(port) });
    expect(await checkHealth(url)).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await checkHealth(url, undefined, 1000)).toBe(false);
  });
});

describe("Betrieb oder Test", () => {
  it("erkennt NODE_ENV=production und den Container", () => {
    expect(runtimeFromEnv({})).toEqual({ production: false, container: false });
    expect(runtimeFromEnv({ NODE_ENV: "production", FOODTRACKER_CONTAINER: "1" })).toEqual({ production: true, container: true });
    expect(runtimeFromEnv({ NODE_ENV: "development", FOODTRACKER_CONTAINER: "0" })).toEqual({ production: false, container: false });
  });

  it("lässt den Dev-Login nur zum Testen zu", () => {
    const test = runtimeFromEnv({});
    const production = runtimeFromEnv({ NODE_ENV: "production" });
    expect(devLoginSetting({ ALLOW_DEV_LOGIN: "1" }, test)).toEqual({ allowed: true, ignored: false });
    expect(devLoginSetting({}, test)).toEqual({ allowed: false, ignored: false });
    expect(devLoginSetting({ ALLOW_DEV_LOGIN: "0" }, test)).toEqual({ allowed: false, ignored: false });
    expect(devLoginSetting({ ALLOW_DEV_LOGIN: "1" }, production)).toEqual({ allowed: false, ignored: true });
    expect(devLoginSetting({}, production)).toEqual({ allowed: false, ignored: false });
  });
});

describe("Dockerfile", () => {
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  const instructions = dockerfile.split("\n").filter((line) => line.trim() && !line.trimStart().startsWith("#"));

  it("startet das gebaute JavaScript als Betrieb im Container, nicht als root", () => {
    const env = instructions.join("\n");
    expect(env).toMatch(/NODE_ENV=production/);
    expect(env).toMatch(/FOODTRACKER_CONTAINER=1/);
    expect(env).toMatch(/CORS_ORIGINS=https:\/\/bennitut\.github\.io/);
    expect(instructions).toContain("USER node");
    expect(instructions.at(-1)).toBe('CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]');
    // Kein Dev-Login und keine Schlüssel im Image.
    expect(env).not.toMatch(/ALLOW_DEV_LOGIN|ANTHROPIC_API_KEY|DATABASE_URL|SMTP_PASS/);
  });

  it("prüft die Gesundheit mit dem Skript, das /api/health/live fragt", () => {
    expect(instructions.find((line) => line.startsWith("HEALTHCHECK"))).toMatch(/CMD \["node", "dist\/healthcheck\.js"\]$/);
    const ignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
    // Nur ausdrücklich Erlaubtes kommt ins Image – nie .env oder data/.
    expect(ignore[0]).toBe("*");
    expect(ignore.filter((l) => l.startsWith("!")).sort()).toEqual(["!package-lock.json", "!package.json", "!src/", "!tsconfig.build.json", "!tsconfig.json"]);
  });
});
