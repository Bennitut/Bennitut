import { afterEach, describe, expect, it, vi } from "vitest";
import { Ai } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { isAllowedOrigin, normalizeOrigins } from "../src/http/cors.js";

// CORS: Expo im Browser (Port 8081) und Adressen im eigenen Netz dürfen den Server nutzen, fremde Websites nicht.

const noAi = new Ai({ hasAnthropicKey: false, ollama: { url: "http://ollama.test", model: "gemma4:e4b", numCtx: 1024, timeoutMs: 1000 } }, async () => {
  throw new TypeError("offline");
});
const app = createApp({ communityFile: null, ai: noAi, corsOrigins: ["https://bennitut.github.io/Bennitut/"] });

const preflight = (origin: string, path = "/api/plan") =>
  app.request(path, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-device-id,authorization" },
  });

afterEach(() => vi.restoreAllMocks());

describe("Erlaubte Ursprünge", () => {
  it("erlaubt den eigenen Rechner und private Netze mit beliebigem Port", () => {
    for (const origin of [
      "http://localhost:8081",
      "http://localhost",
      "http://127.0.0.1:19006",
      "http://[::1]:8081",
      "http://192.168.1.20:8081",
      "http://10.0.0.7:8081",
      "http://172.16.5.4:3000",
      "http://172.31.255.1:8090",
      "https://192.168.178.2",
    ]) {
      expect(isAllowedOrigin(origin), origin).toBe(true);
    }
  });

  it("lehnt fremde Websites und Unsinn ab", () => {
    for (const origin of [
      "https://evil.example",
      "http://localhost.evil.example",
      "http://192.168.1.20.evil.example",
      "http://172.32.0.1:8081",
      "http://172.15.0.1",
      "http://11.0.0.1",
      "http://8.8.8.8",
      "null",
      "",
      "kein url",
      "file:///C:/index.html",
      "https://bennitut.github.io",
    ]) {
      expect(isAllowedOrigin(origin), origin).toBe(false);
    }
  });

  it("erlaubt zusätzlich die Ursprünge aus CORS_ORIGINS", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const extra = normalizeOrigins(["https://bennitut.github.io/Bennitut/", "kaputt", " https://Tester.Example:8443 "]);
    expect(extra).toEqual(["https://bennitut.github.io", "https://tester.example:8443"]);
    expect(warn).toHaveBeenCalledOnce();
    expect(isAllowedOrigin("https://bennitut.github.io", extra)).toBe(true);
    expect(isAllowedOrigin("https://tester.example:8443", extra)).toBe(true);
    expect(isAllowedOrigin("https://tester.example", extra)).toBe(false);
  });
});

describe("CORS-Header", () => {
  it("beantwortet die Vorab-Anfrage des Browsers", async () => {
    const res = await preflight("http://192.168.1.20:8081");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://192.168.1.20:8081");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toBe("content-type,authorization,x-device-id");
  });

  it("gibt fremden Websites keine Erlaubnis", async () => {
    expect((await preflight("https://evil.example")).headers.get("Access-Control-Allow-Origin")).toBeNull();
    const res = await app.request("/api/health", { headers: { Origin: "https://evil.example" } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("setzt die Header auch bei Fehlern, damit die App den Fehlercode lesen kann", async () => {
    const headers = { Origin: "http://localhost:8081", "Content-Type": "application/json", "X-Device-Id": "device-aaaaaaaa" };
    const invalid = await app.request("/api/plan", { method: "POST", headers, body: JSON.stringify({ startDate: "morgen" }) });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8081");
    const noKi = await app.request("/api/recipes/translate", { method: "POST", headers, body: JSON.stringify({ text: { name: "Suppe" }, targetLanguage: "en" }) });
    expect(noKi.status).toBe(503);
    expect(noKi.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8081");
    expect(await noKi.json()).toEqual({ error: "ai_not_configured" });
  });

  it("erlaubt die Web-Version aus CORS_ORIGINS", async () => {
    const res = await app.request("/api/health", { headers: { Origin: "https://bennitut.github.io" } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://bennitut.github.io");
  });
});
