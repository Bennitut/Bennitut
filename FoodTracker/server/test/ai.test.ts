import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AI_CONSENT_HEADER, AI_CONSENT_VERSION, hasAiConsent } from "../src/ai/consent.js";
import { jsonSchemaFor, sameModel, type FetchLike } from "../src/ai/ollama.js";
import { Ai, aiConfigProblem, aiSettingsFromEnv, type AiSettings } from "../src/ai/provider.js";
import { analyzeMealPhoto, translateRecipe } from "../src/ai/tasks.js";
import { AiError, AnalysisError } from "../src/ai/types.js";
import { createApp } from "../src/app.js";

// KI ohne echtes Ollama und ohne Claude: `fetch` und Claude werden nachgebaut.

const OLLAMA = { url: "http://ollama.test:11434", model: "gemma4:e4b", numCtx: 16384, timeoutMs: 5000 };
const settings = (over: Partial<AiSettings> = {}): AiSettings => ({ hasAnthropicKey: false, ollama: OLLAMA, ...over });

interface Call {
  url: string;
  body: Record<string, any> | undefined;
}

/** Nachgebautes Ollama: /api/tags listet `models` (null = Ollama läuft nicht), /api/chat antwortet mit `chat`. */
function fakeOllama({ models = ["gemma4:e4b"], chat }: { models?: string[] | null; chat?: (body: any, init: RequestInit | undefined) => Response | Promise<Response> } = {}) {
  const calls: Call[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (models === null) throw new TypeError("fetch failed");
    if (url.endsWith("/api/tags")) return Response.json({ models: models.map((name) => ({ name, model: name })) });
    if (url.endsWith("/api/chat") && chat) return chat(calls.at(-1)!.body, init);
    return new Response("404 page not found", { status: 404 });
  };
  return { fetchFn, calls, chats: () => calls.filter((c) => c.url.endsWith("/api/chat")) };
}

const reply = (content: unknown, extra: object = {}) =>
  Response.json({
    model: "gemma4:e4b",
    message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 120,
    eval_count: 40,
    ...extra,
  });

const TEXT = { name: "Linsensuppe", steps: ["Linsen kochen"], otherIngredients: ["Salz"] };
const TRANSLATED = { name: "Lentil soup", steps: ["Cook the lentils"], otherIngredients: ["Salt"] };

afterEach(() => vi.restoreAllMocks());
const quiet = () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
};

describe("KI-Einstellungen aus der Umgebung", () => {
  it("nimmt sinnvolle Standardwerte", () => {
    expect(aiSettingsFromEnv({})).toEqual({
      provider: undefined,
      hasAnthropicKey: false,
      ollama: { url: "http://127.0.0.1:11434", model: "gemma4:e4b", numCtx: 16384, timeoutMs: 240_000 },
    });
  });

  it("liest Anbieter, Schlüssel, Adresse, Modell und Zeitlimit", () => {
    const s = aiSettingsFromEnv({
      AI_PROVIDER: " Ollama ",
      ANTHROPIC_API_KEY: "sk-test",
      OLLAMA_URL: "http://192.168.1.5:11434/",
      OLLAMA_MODEL: "qwen3-vl:8b",
      OLLAMA_NUM_CTX: "8192",
      OLLAMA_TIMEOUT_SECONDS: "90",
    });
    expect(s).toEqual({ provider: "ollama", hasAnthropicKey: true, ollama: { url: "http://192.168.1.5:11434", model: "qwen3-vl:8b", numCtx: 8192, timeoutMs: 90_000 } });
  });

  it("ignoriert unbekannte Anbieter und unsinnige Zahlen", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = aiSettingsFromEnv({ AI_PROVIDER: "gpt", ANTHROPIC_API_KEY: "  ", OLLAMA_TIMEOUT_SECONDS: "-5", OLLAMA_NUM_CTX: "viel" });
    expect(s.provider).toBeUndefined();
    expect(s.hasAnthropicKey).toBe(false);
    expect(s.ollama.timeoutMs).toBe(240_000);
    expect(s.ollama.numCtx).toBe(16384);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("liest den Schlüssel für Ollama auf einem anderen Rechner (OLLAMA_API_KEY)", () => {
    expect(aiSettingsFromEnv({ OLLAMA_URL: "https://ki.example.org", OLLAMA_API_KEY: "  geheim-123  " }).ollama.apiKey).toBe("geheim-123");
    expect(aiSettingsFromEnv({ OLLAMA_API_KEY: "   " }).ollama.apiKey).toBeUndefined();
  });

  it("startet lieber nicht, als einen Schlüssel unverschlüsselt durchs Internet zu schicken", () => {
    const problem = (env: NodeJS.ProcessEnv) => aiConfigProblem(aiSettingsFromEnv(env));
    expect(problem({})).toBeNull();
    expect(problem({ OLLAMA_URL: "https://beispiel.trycloudflare.com", OLLAMA_API_KEY: "geheim" })).toBeNull();
    // Im eigenen Netz bzw. in Docker Compose darf es http sein.
    expect(problem({ OLLAMA_URL: "http://192.168.1.5:11434", OLLAMA_API_KEY: "geheim" })).toBeNull();
    expect(problem({ OLLAMA_URL: "http://ollama:11434", OLLAMA_API_KEY: "geheim" })).toBeNull();
    expect(problem({ OLLAMA_URL: "http://ki.example.org", OLLAMA_API_KEY: "geheim" })).toMatch(/unverschlüsselt über http an http:\/\/ki\.example\.org/);
    // Ohne Schlüssel gibt es nichts zu verraten.
    expect(problem({ OLLAMA_URL: "http://ki.example.org" })).toBeNull();
    const withCredentials = problem({ OLLAMA_URL: "https://ben:geheim@ki.example.org" });
    expect(withCredentials).toMatch(/Zugangsdaten.*OLLAMA_API_KEY/);
    expect(withCredentials).not.toContain("geheim");
    expect(problem({ OLLAMA_URL: "ki.example.org" })).toMatch(/keine gültige Adresse/);
    expect(problem({ OLLAMA_URL: "ftp://ki.example.org" })).toMatch(/http:\/\/ oder https:\/\//);
    // Mit Claude fragt der Server Ollama gar nicht – dann stört OLLAMA_URL nicht, außer Ollama ist fest gewählt.
    expect(problem({ ANTHROPIC_API_KEY: "sk-test", OLLAMA_URL: "http://ki.example.org", OLLAMA_API_KEY: "geheim" })).toBeNull();
    expect(problem({ AI_PROVIDER: "ollama", ANTHROPIC_API_KEY: "sk-test", OLLAMA_URL: "http://ki.example.org", OLLAMA_API_KEY: "geheim" })).not.toBeNull();
  });

  it("erkennt dasselbe Modell mit und ohne :latest", () => {
    expect(sameModel("gemma4", "gemma4:latest")).toBe(true);
    expect(sameModel("gemma4:e4b", "gemma4:e4b")).toBe(true);
    expect(sameModel("gemma4:e4b", "gemma4:latest")).toBe(false);
    expect(sameModel("hf.co/nutzer/modell", "hf.co/nutzer/modell:latest")).toBe(true);
  });
});

describe("Welche KI aktiv ist", () => {
  it("nimmt Claude, wenn ein Schlüssel gesetzt ist, ohne Ollama zu fragen", async () => {
    const ollama = fakeOllama();
    expect(await new Ai(settings({ hasAnthropicKey: true }), ollama.fetchFn).status()).toEqual({ provider: "claude", model: "claude-opus-5-5", state: "ready" });
    expect(ollama.calls).toHaveLength(0);
  });

  it("nimmt sonst Ollama, wenn es antwortet", async () => {
    const ollama = fakeOllama({ models: ["llama3.2:latest", "gemma4:e4b"] });
    expect(await new Ai(settings(), ollama.fetchFn).status()).toEqual({ provider: "ollama", model: "gemma4:e4b", state: "ready" });
    expect(ollama.calls[0]?.url).toBe("http://ollama.test:11434/api/tags");
  });

  it("meldet ein fehlendes Modell", async () => {
    const ai = new Ai(settings(), fakeOllama({ models: ["llama3.2:latest"] }).fetchFn);
    expect((await ai.status()).state).toBe("model_missing");
    await expect(ai.require()).rejects.toMatchObject({ code: "model_missing" });
  });

  it("meldet „keine KI“, wenn weder Schlüssel noch Ollama da sind", async () => {
    const ai = new Ai(settings(), fakeOllama({ models: null }).fetchFn);
    expect(await ai.status()).toEqual({ provider: null, model: null, state: "not_configured" });
    await expect(ai.require()).rejects.toMatchObject({ code: "not_configured" });
  });

  it("hält sich an AI_PROVIDER", async () => {
    const offline = fakeOllama({ models: null }).fetchFn;
    expect(await new Ai(settings({ provider: "ollama", hasAnthropicKey: true }), offline).status()).toEqual({ provider: "ollama", model: "gemma4:e4b", state: "unreachable" });
    await expect(new Ai(settings({ provider: "ollama" }), offline).require()).rejects.toMatchObject({ code: "unavailable" });
    expect(await new Ai(settings({ provider: "claude" }), offline).status()).toEqual({ provider: "claude", model: "claude-opus-5-5", state: "not_configured" });
  });

  it("schickt Anfragen an Claude, wenn Claude aktiv ist", async () => {
    quiet();
    const ollama = fakeOllama();
    const claude = vi.fn(async () => ({ data: TRANSLATED, usage: { inputTokens: 10, outputTokens: 5 } }));
    const ai = new Ai(settings({ hasAnthropicKey: true }), ollama.fetchFn, claude as never);
    expect(await translateRecipe(ai, TEXT, "en")).toEqual(TRANSLATED);
    expect(claude).toHaveBeenCalledOnce();
    expect(ollama.calls).toHaveLength(0);
  });
});

describe("Ollama", () => {
  it("fragt ohne Streaming, mit Temperatur 0, JSON-Schema und ohne Denken", async () => {
    quiet();
    const ollama = fakeOllama({ chat: () => reply(TRANSLATED) });
    expect(await translateRecipe(new Ai(settings(), ollama.fetchFn), TEXT, "en")).toEqual(TRANSLATED);
    const [chat] = ollama.chats();
    expect(chat?.url).toBe("http://ollama.test:11434/api/chat");
    const body = chat!.body!;
    expect(body).toMatchObject({ model: "gemma4:e4b", stream: false, think: false, options: { temperature: 0, num_ctx: 16384 } });
    expect(body.format).toMatchObject({ type: "object", required: ["name", "steps", "otherIngredients"] });
    expect(body.format.$schema).toBeUndefined();
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(body.messages[0].content).toContain("English");
    expect(body.messages[0].content).toContain(JSON.stringify(body.format));
    expect(body.messages[1]).toEqual({ role: "user", content: JSON.stringify(TEXT) });
  });

  it("schickt Bilder als reines Base64", async () => {
    quiet();
    const meal = { description: "Suppe", items: [], total: { kcal: 300, protein: 12, carbs: 40, fat: 8 }, confidence: "mittel", notes: "" };
    const ollama = fakeOllama({ chat: () => reply(meal) });
    const result = await analyzeMealPhoto(new Ai(settings(), ollama.fetchFn), { data: "iVBORw0KGgo=", mediaType: "image/png" }, "de");
    expect(result).toEqual(meal);
    expect(ollama.chats()[0]!.body!.messages[1].images).toEqual(["iVBORw0KGgo="]);
  });

  it("macht aus dem Zod-Schema ein JSON-Schema ohne $schema", () => {
    expect(jsonSchemaFor(z.object({ a: z.string().nullable() }))).toEqual({ type: "object", properties: { a: { type: ["string", "null"] } }, required: ["a"], additionalProperties: false });
  });

  it("bildet unbrauchbare Antworten auf AnalysisError ab", async () => {
    quiet();
    const run = (response: () => Response) => translateRecipe(new Ai(settings(), fakeOllama({ chat: response }).fetchFn), TEXT, "en");
    await expect(run(() => reply("kein JSON"))).rejects.toEqual(new AnalysisError("unreadable"));
    await expect(run(() => reply({ name: 42 }))).rejects.toEqual(new AnalysisError("unreadable"));
    await expect(run(() => reply(TRANSLATED, { done_reason: "length" }))).rejects.toEqual(new AnalysisError("too_long"));
    await expect(run(() => new Response("<html>", { status: 200 }))).rejects.toEqual(new AnalysisError("unreadable"));
  });

  it("meldet fehlende Modelle, Ausfälle und Zeitüberschreitung", async () => {
    quiet();
    const run = (chat: NonNullable<Parameters<typeof fakeOllama>[0]>["chat"], timeoutMs = 5000) =>
      translateRecipe(new Ai(settings({ ollama: { ...OLLAMA, timeoutMs } }), fakeOllama({ chat }).fetchFn), TEXT, "en");
    await expect(run(() => Response.json({ error: "model 'gemma4:e4b' not found" }, { status: 404 }))).rejects.toMatchObject({ code: "model_missing" });
    await expect(run(() => Response.json({ error: "model requires more system memory" }, { status: 500 }))).rejects.toMatchObject({ code: "unavailable" });
    await expect(run(() => Promise.reject(new TypeError("fetch failed")))).rejects.toMatchObject({ code: "unavailable" });
    const hang = (_body: unknown, init: RequestInit | undefined) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    const err = await run(hang, 30).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err).toMatchObject({ code: "timeout" });
  });

  it("schickt OLLAMA_API_KEY als Bearer-Token mit – ohne Schlüssel keinen", async () => {
    quiet();
    const seen: (string | null)[] = [];
    const fetchFn: FetchLike = async (url, init) => {
      seen.push(new Headers(init?.headers).get("Authorization"));
      return url.endsWith("/api/tags") ? Response.json({ models: [{ name: "gemma4:e4b" }] }) : reply(TRANSLATED);
    };
    await translateRecipe(new Ai(settings({ ollama: { ...OLLAMA, url: "https://ki.example.org", apiKey: "geheim-123" } }), fetchFn), TEXT, "en");
    expect(seen).toEqual(["Bearer geheim-123", "Bearer geheim-123"]);
    seen.length = 0;
    await translateRecipe(new Ai(settings(), fetchFn), TEXT, "en");
    expect(seen).toEqual([null, null]);
  });

  it("erkennt einen abgelehnten Schlüssel und den Abbruch durch den Tunnel (524)", async () => {
    quiet();
    const run = (chat: NonNullable<Parameters<typeof fakeOllama>[0]>["chat"]) =>
      translateRecipe(new Ai(settings(), fakeOllama({ chat }).fetchFn), TEXT, "en");
    const denied = await run(() => Response.json({ error: "unauthorized" }, { status: 401 })).catch((e: unknown) => e);
    expect(denied).toMatchObject({ code: "unavailable" });
    expect((denied as AiError).message).toContain("lehnt den Schlüssel ab");
    await expect(run(() => new Response("<html>A timeout occurred</html>", { status: 524 }))).rejects.toMatchObject({ code: "timeout" });
  });

  it("schreibt Pfad und Parameter der Adresse nie in Meldungen (dort könnte ein Schlüssel stehen)", async () => {
    const ai = new Ai(settings({ provider: "ollama", ollama: { ...OLLAMA, url: "https://ki.example.org/geheimer-pfad?token=abc" } }), fakeOllama({ models: null }).fetchFn);
    const err = await ai.require().catch((e: unknown) => e);
    expect((err as AiError).message).toContain("https://ki.example.org");
    expect((err as AiError).message).not.toMatch(/geheimer-pfad|token=abc/);
  });

  it("fragt noch einmal ohne `think`, wenn das Modell keinen Denk-Modus hat", async () => {
    quiet();
    const ollama = fakeOllama({
      chat: (body) => ("think" in body ? Response.json({ error: '"llama3.2" does not support thinking' }, { status: 400 }) : reply(TRANSLATED)),
    });
    expect(await translateRecipe(new Ai(settings(), ollama.fetchFn), TEXT, "en")).toEqual(TRANSLATED);
    expect(ollama.chats().map((c) => "think" in c.body!)).toEqual([true, false]);
  });
});

describe("KI-Endpunkte", () => {
  const offline = () => createApp({ ai: new Ai(settings(), fakeOllama({ models: null }).fetchFn) });
  /** Wie die App: mit Einwilligung (`consent: null` = ohne Header, wie eine ältere App oder nach dem Widerruf). */
  const post = (app: ReturnType<typeof createApp>, path: string, body: unknown, consent: string | null = String(AI_CONSENT_VERSION)) =>
    app.request(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "X-Device-Id": "device-aaaaaaaa", ...(consent === null ? {} : { [AI_CONSENT_HEADER]: consent }) },
    });
  const image = { imageBase64: "AAAA", mediaType: "image/jpeg", language: "de" };
  /** Jede KI-Funktion der App mit einer gültigen Anfrage. */
  const AI_REQUESTS = [
    ["/api/analyze/meal", image],
    ["/api/analyze/receipt", image],
    ["/api/recipes/import", { caption: "Linsensuppe mit Karotten" }],
    ["/api/recipes/import", { url: "https://www.instagram.com/p/abc/" }],
    ["/api/recipes/translate", { text: TEXT, targetLanguage: "en" }],
    ["/api/recipes/improve", { text: TEXT, ingredients: [{ name: "Linsen", amount: "80 g" }], cookMinutes: 30 }],
    ["/api/plan", { startDate: "2026-11-01", people: 1, kcalPerPersonPerDay: 2000, mealTypes: ["lunch"], preferences: "viel Gemüse" }],
  ] as const;

  it("antworten ohne KI mit 503 ai_not_configured statt „internal“", async () => {
    const app = offline();
    for (const [path, body] of AI_REQUESTS) {
      const res = await post(app, path, body);
      expect(res.status, path).toBe(503);
      expect(await res.json(), path).toEqual({ error: "ai_not_configured" });
    }
  });

  it("geben ohne Einwilligung nichts an die KI weiter (403 ai_consent_required)", async () => {
    quiet();
    // Die KI wäre bereit und würde antworten – ohne Einwilligung darf sie keine Anfrage sehen.
    const ollama = fakeOllama({ chat: () => reply(TRANSLATED) });
    const app = createApp({ ai: new Ai(settings(), ollama.fetchFn) });
    for (const consent of [null, "", "0", "abc", "1.5", "-1", " "]) {
      for (const [path, body] of AI_REQUESTS) {
        const res = await post(app, path, body, consent);
        expect(res.status, `${path} mit ${JSON.stringify(consent)}`).toBe(403);
        expect(await res.json(), path).toEqual({ error: "ai_consent_required" });
      }
    }
    expect(ollama.chats()).toEqual([]);
    // Mit Einwilligung geht dieselbe Anfrage durch.
    const res = await post(app, "/api/recipes/translate", { text: TEXT, targetLanguage: "en" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(TRANSLATED);
    expect(ollama.chats()).toHaveLength(1);
  });

  it("prüfen die Eingaben vor der Einwilligung", async () => {
    const app = offline();
    expect((await post(app, "/api/recipes/import", {}, null)).status).toBe(400);
    const unsupported = await post(app, "/api/recipes/import", { url: "https://example.com/rezept" }, null);
    expect(unsupported.status).toBe(422);
    expect(await unsupported.json()).toEqual({ error: "social_unsupported_url" });
    expect((await post(app, "/api/recipes/translate", { text: {}, targetLanguage: "en" }, null)).status).toBe(400);
  });

  it("planen ohne KI-Wünsche weiter ohne KI und ohne Einwilligung", async () => {
    const plan = { startDate: "2026-11-01", people: 1, kcalPerPersonPerDay: 2000, mealTypes: ["lunch"] };
    expect((await post(offline(), "/api/plan", plan)).status).toBe(200);
    expect((await post(offline(), "/api/plan", plan, null)).status).toBe(200);
    expect((await post(offline(), "/api/plan", { ...plan, preferences: "" }, null)).status).toBe(200);
  });

  it("erkennen die Fassung der Einwilligung im Header", () => {
    expect(hasAiConsent(String(AI_CONSENT_VERSION))).toBe(true);
    expect(hasAiConsent(String(AI_CONSENT_VERSION + 1))).toBe(true);
    expect(hasAiConsent(` ${AI_CONSENT_VERSION} `)).toBe(true);
    for (const header of [undefined, "", "0", "abc", "1e3", "0x1", "1.0", "9999999"]) expect(hasAiConsent(header), String(header)).toBe(false);
  });

  it("melden in /api/health, welche KI aktiv ist", async () => {
    expect(await (await offline().request("/api/health")).json()).toEqual({ ok: true, ai: { provider: null, model: null, state: "not_configured" } });
    const app = createApp({ ai: new Ai(settings(), fakeOllama().fetchFn) });
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true, ai: { provider: "ollama", model: "gemma4:e4b", state: "ready" } });
  });

  it("importieren ein Rezept aus der Beschreibung mit lokaler KI", async () => {
    quiet();
    const draft = {
      isRecipe: true,
      recipe: {
        name: "Kartoffelsalat",
        mealTypes: ["lunch"],
        cookMinutes: 30,
        servings: 2,
        ingredients: [{ ingredientId: "kartoffeln", amount: 600 }],
        otherIngredients: ["Essig"],
        steps: ["Kartoffeln kochen"],
        tags: [],
      },
    };
    const ollama = fakeOllama({ chat: () => reply(draft) });
    const app = createApp({ ai: new Ai(settings(), ollama.fetchFn) });
    const res = await post(app, "/api/recipes/import", { caption: "Kartoffelsalat: 600 g Kartoffeln …", language: "de" });
    expect(res.status).toBe(200);
    const { recipe } = await res.json();
    expect(recipe).toMatchObject({ name: "Kartoffelsalat", ingredients: [{ ingredientId: "kartoffeln", amount: 300 }], source: { kind: "import", platform: "video" } });
    expect(ollama.chats()[0]!.body!.messages[1].content).toContain("600 g Kartoffeln");
  });
});

