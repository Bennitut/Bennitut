import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FetchLike } from "../src/ai/ollama.js";
import { Ai, type AiSettings } from "../src/ai/provider.js";
import { createRelayApp, keyMatches, newRelayKey, RELAY_MIN_KEY_LENGTH } from "../src/ai/relay.js";
import { AiError } from "../src/ai/types.js";

// Weiterleitung zu Ollama (`npm run ollama:relay`) für den Server im Internet: nur mit Schlüssel, nur die Pfade, die
// der FoodTracker-Server braucht. Ollama ist nachgebaut, die Weiterleitung läuft über app.request (ohne Netz).

const KEY = newRelayKey();
const TARGET = "http://127.0.0.1:11434";

interface Upstream {
  url: string;
  init?: RequestInit;
  body?: string;
}

/** Nachgebautes Ollama hinter der Weiterleitung: merkt sich jede Anfrage. */
function fakeOllama(handler?: (url: string) => Response | Promise<Response>) {
  const calls: Upstream[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, init, body: init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : undefined });
    if (handler) return handler(url);
    if (url.endsWith("/api/tags")) return Response.json({ models: [{ name: "gemma4:e4b", model: "gemma4:e4b" }] });
    if (url.endsWith("/api/version")) return Response.json({ version: "0.13.0" });
    return Response.json({ message: { role: "assistant", content: JSON.stringify({ name: "Linsensuppe" }) }, done: true, done_reason: "stop" });
  };
  return { fetchFn, calls };
}

function relay(fetchFn: FetchLike, over: { maxBodyBytes?: number; timeoutMs?: number } = {}) {
  const lines: string[] = [];
  const app = createRelayApp({ key: KEY, target: TARGET, fetchFn, log: (line) => lines.push(line), ...over });
  return { app, lines };
}

const withKey = (key = KEY) => ({ Authorization: `Bearer ${key}` });

afterEach(() => vi.restoreAllMocks());

describe("Weiterleitung zu Ollama", () => {
  it("lässt ohne gültigen Schlüssel nichts durch und schreibt den Schlüssel nie ins Fenster", async () => {
    const ollama = fakeOllama();
    const { app, lines } = relay(ollama.fetchFn);
    for (const headers of [{}, withKey("falsch"), withKey(`${KEY}x`), { Authorization: KEY }, { Authorization: "Bearer " }]) {
      const res = await app.request("/api/tags", { headers });
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    const chat = await app.request("/api/chat", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
    expect(chat.status).toBe(401);
    expect(ollama.calls).toHaveLength(0);
    expect(lines.join("\n")).toContain("abgelehnt");
    expect(lines.join("\n")).not.toContain(KEY);
  });

  it("leitet mit Schlüssel genau das weiter, was ankommt – ohne den Schlüssel", async () => {
    const ollama = fakeOllama();
    const { app, lines } = relay(ollama.fetchFn);
    const body = JSON.stringify({ model: "gemma4:e4b", stream: false, messages: [{ role: "user", content: "Hallo" }] });
    const res = await app.request("/api/chat", { method: "POST", body, headers: { ...withKey(), "Content-Type": "application/json", "X-Device-Id": "geraet-1" } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { message: { content: string } }).message.content).toContain("Linsensuppe");
    expect(ollama.calls).toHaveLength(1);
    expect(ollama.calls[0]!.url).toBe(`${TARGET}/api/chat`);
    expect(ollama.calls[0]!.init?.method).toBe("POST");
    expect(ollama.calls[0]!.body).toBe(body);
    // Weder der Schlüssel noch andere Header von außen gehen an Ollama.
    expect(ollama.calls[0]!.init?.headers).toEqual({ "Content-Type": "application/json" });

    const tags = await app.request("/api/tags", { headers: withKey() });
    expect(tags.status).toBe(200);
    expect(await tags.json()).toEqual({ models: [{ name: "gemma4:e4b", model: "gemma4:e4b" }] });
    expect((await app.request("/api/version", { headers: withKey() })).status).toBe(200);
    expect(lines.some((l) => /POST \/api\/chat: 200 nach \d+\.\d s/.test(l))).toBe(true);
    expect(lines.join("\n")).not.toContain(KEY);
  });

  it("gibt Antworten von Ollama mit ihrem Status weiter (z. B. Modell fehlt)", async () => {
    const { app } = relay(fakeOllama(() => Response.json({ error: "model 'gemma4:e4b' not found" }, { status: 404 })).fetchFn);
    const res = await app.request("/api/chat", { method: "POST", body: "{}", headers: withKey() });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "model 'gemma4:e4b' not found" });
  });

  it("öffnet nur die Pfade, die der Server braucht – kein Herunterladen, Anlegen oder Löschen von Modellen", async () => {
    const ollama = fakeOllama();
    const { app } = relay(ollama.fetchFn);
    const blocked: [string, string][] = [
      ["POST", "/api/pull"],
      ["POST", "/api/create"],
      ["DELETE", "/api/delete"],
      ["POST", "/api/generate"],
      ["POST", "/api/copy"],
      ["GET", "/api/ps"],
      ["GET", "/api/chat"],
      ["POST", "/api/tags"],
    ];
    for (const [method, path] of blocked) {
      const res = await app.request(path, { method, body: method === "GET" ? undefined : "{}", headers: withKey() });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    expect(ollama.calls).toHaveLength(0);
  });

  it("zeigt unter / ohne Schlüssel nur einen Satz – zum Prüfen des Tunnels im Browser", async () => {
    const ollama = fakeOllama();
    const { app } = relay(ollama.fetchFn);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Weiterleitung zu Ollama");
    expect(ollama.calls).toHaveLength(0);
  });

  it("lehnt zu große Anfragen ab, bevor etwas an Ollama geht", async () => {
    const ollama = fakeOllama();
    const { app } = relay(ollama.fetchFn, { maxBodyBytes: 100 });
    const res = await app.request("/api/chat", { method: "POST", body: "x".repeat(101), headers: { ...withKey(), "Content-Type": "application/json" } });
    expect(res.status).toBe(413);
    expect(ollama.calls).toHaveLength(0);
    expect((await app.request("/api/chat", { method: "POST", body: "x".repeat(100), headers: withKey() })).status).toBe(200);
  });

  it("meldet ein ausgeschaltetes oder zu langsames Ollama verständlich", async () => {
    const off = relay(async () => {
      throw new TypeError("fetch failed");
    });
    const down = await off.app.request("/api/chat", { method: "POST", body: "{}", headers: withKey() });
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: "ollama_unreachable" });
    expect(off.lines.join("\n")).toContain("antwortet nicht unter http://127.0.0.1:11434");

    const slow = relay(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const late = await slow.app.request("/api/chat", { method: "POST", body: "{}", headers: withKey() });
    expect(late.status).toBe(504);
    expect(await late.json()).toEqual({ error: "ollama_timeout" });
  });

  it("erklärt die Variablen in .env.example – ohne Werte", () => {
    const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    for (const name of ["OLLAMA_API_KEY", "OLLAMA_RELAY_KEY"]) expect(example).toMatch(new RegExp(`^# ${name}=$`, "m"));
    expect(example).toMatch(/^# OLLAMA_RELAY_PORT=11435$/m);
  });

  it("verlangt einen langen Schlüssel und erzeugt sichere", () => {
    expect(() => createRelayApp({ key: "kurz", target: TARGET })).toThrow(/zu kurz/);
    const a = newRelayKey();
    const b = newRelayKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.length).toBeGreaterThanOrEqual(RELAY_MIN_KEY_LENGTH);
    expect(a).not.toBe(b);
    expect(keyMatches(a, a)).toBe(true);
    expect(keyMatches(b, a)).toBe(false);
    expect(keyMatches(undefined, a)).toBe(false);
    expect(keyMatches("", a)).toBe(false);
  });
});

describe("Server im Internet mit KI über die Weiterleitung", () => {
  const settings = (apiKey?: string): AiSettings => ({
    provider: "ollama",
    hasAnthropicKey: false,
    ollama: { url: "https://beispiel.trycloudflare.com", model: "gemma4:e4b", numCtx: 16384, timeoutMs: 5000, apiKey },
  });
  /** Der Tunnel: Anfragen an die https-Adresse kommen bei der Weiterleitung an. */
  const tunnel = (app: ReturnType<typeof relay>["app"]): FetchLike => async (url, init) =>
    app.request(url.replace("https://beispiel.trycloudflare.com", ""), init);

  it("nutzt Ollama auf dem Laptop mit OLLAMA_API_KEY", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ollama = fakeOllama();
    const { app } = relay(ollama.fetchFn);
    const ai = new Ai(settings(KEY), tunnel(app));
    expect(await ai.status()).toEqual({ provider: "ollama", model: "gemma4:e4b", state: "ready" });
    const data = await ai.generate({ task: "Test", system: "Antworte als JSON.", text: "Suppe?", schema: z.object({ name: z.string() }) });
    expect(data).toEqual({ name: "Linsensuppe" });
    expect(ollama.calls.map((c) => c.url)).toEqual([`${TARGET}/api/tags`, `${TARGET}/api/tags`, `${TARGET}/api/chat`]);
  });

  it("sagt bei falschem oder fehlendem Schlüssel, woran es liegt", async () => {
    const ollama = fakeOllama();
    for (const key of ["falscher-schluessel-mit-genug-zeichen", undefined]) {
      const { app } = relay(ollama.fetchFn);
      const ai = new Ai(settings(key), tunnel(app));
      expect(await ai.status()).toEqual({ provider: "ollama", model: "gemma4:e4b", state: "unreachable", reason: "unauthorized" });
      const err = await ai.require().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AiError);
      expect((err as AiError).code).toBe("unavailable");
      expect((err as AiError).message).toContain("lehnt den Schlüssel ab");
      expect((err as AiError).message).not.toContain(KEY);
    }
    expect(ollama.calls).toHaveLength(0);
  });
});
