import { describe, expect, it, vi } from "vitest";
import { AI_CONSENT_HEADER } from "../src/ai/consent.js";
import { Ai } from "../src/ai/provider.js";
import { createApp, defaultAuthLimits } from "../src/app.js";
import { ClientAddresses, addressKey, normalizeIp, parseTrustProxy, trustProxyLine, type TrustProxy } from "../src/http/proxy.js";
import { RateLimiter, TokenBucket, defaultRequestLimits, parseAiPerHour } from "../src/http/rateLimit.js";
import { BODY_LIMITS, DEFAULT_BODY_LIMIT, bodyLimitFor } from "../src/http/security.js";
import { describeError, redact } from "../src/log.js";
import { limitsLine } from "../src/startInfo.js";
import { MemoryImageStore } from "../src/storage/images.js";
import type { Context } from "hono";

// Sicherheit für den Server im Internet (Vorrang 1, 9.3): nur über https, Rate-Limits für alles, KI und Uploads,
// Größengrenzen je Schnittstelle, Protokolle ohne Passwörter, Tokens und E-Mail-Adressen, TRUST_PROXY ohne
// fälschbare Header.

const FAST = { N: 1024, r: 8, p: 1 };
const noAi = new Ai({ hasAnthropicKey: false, ollama: { url: "http://ollama.test", model: "gemma4:e4b", numCtx: 1024, timeoutMs: 1000 } }, async () => {
  throw new TypeError("offline");
});
const json = { "Content-Type": "application/json", "X-Device-Id": "device-sicher-1" };
const quiet = () => undefined;

/** Kleinster Kontext für ClientAddresses: nur Header (ohne Verbindung, wie in Tests mit app.request). */
const ctx = (headers: Record<string, string>) => {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { req: { header: (name: string) => lower[name.toLowerCase()] }, env: {} } as unknown as Context;
};

describe("TRUST_PROXY", () => {
  it("kennt aus, cloudflare und die Zahl der Proxys – sonst startet der Server nicht", () => {
    for (const off of [undefined, "", " ", "0", "false", "off"]) expect(parseTrustProxy(off)).toEqual({ ok: true, trust: false });
    expect(parseTrustProxy(" Cloudflare ")).toEqual({ ok: true, trust: "cloudflare" });
    expect(parseTrustProxy("1")).toEqual({ ok: true, trust: 1 });
    expect(parseTrustProxy("2")).toEqual({ ok: true, trust: 2 });
    for (const bad of ["true", "yes", "11", "-1", "1.5", "cloudflare,1"]) {
      const parsed = parseTrustProxy(bad);
      expect(parsed.ok, bad).toBe(false);
      if (!parsed.ok) expect(parsed.problem).toContain("cloudflare");
    }
    expect(trustProxyLine(false)).toContain("TRUST_PROXY=cloudflare");
    expect(trustProxyLine("cloudflare")).toContain("CF-Connecting-IP");
    expect(trustProxyLine(1)).toContain("letzter Eintrag in X-Forwarded-For");
    expect(trustProxyLine(2)).toContain("2.-letzter");
  });

  it("vereinheitlicht Adressen und fasst IPv6 nach /64 zusammen", () => {
    expect(normalizeIp(" 203.0.113.5 ")).toBe("203.0.113.5");
    expect(normalizeIp("203.0.113.5:8080")).toBe("203.0.113.5");
    expect(normalizeIp("[2001:DB8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("::ffff:198.51.100.7")).toBe("198.51.100.7");
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80::1");
    for (const junk of ["unknown", "", "999.1.1.1", "203.0.113.5, 198.51.100.7", "<script>"]) expect(normalizeIp(junk), junk).toBeNull();
    expect(addressKey("203.0.113.5")).toBe("203.0.113.5");
    expect(addressKey("2001:db8:aaaa:bbbb:1:2:3:4")).toBe("2001:db8:aaaa:bbbb::/64");
    expect(addressKey("2001:db8:aaaa:bbbb::99")).toBe("2001:db8:aaaa:bbbb::/64");
    expect(addressKey("2001:0db8::1")).toBe("2001:db8:0:0::/64");
  });

  it("ohne TRUST_PROXY: kein Header zählt, einmal ein Hinweis bei Anfragen über einen Proxy", () => {
    const warn = vi.fn();
    const clients = new ClientAddresses(false, warn);
    expect(clients.of(ctx({}))).toBe("unbekannt");
    expect(warn).not.toHaveBeenCalled();
    expect(clients.of(ctx({ "CF-Connecting-IP": "198.51.100.7", "X-Forwarded-For": "198.51.100.7" }))).toBe("unbekannt");
    clients.of(ctx({ "X-Forwarded-For": "198.51.100.8" }));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain("TRUST_PROXY=cloudflare");
    // Der Hinweis nennt keine Adressen.
    expect(warn.mock.calls[0]![0]).not.toMatch(/198\.51/);
  });

  it("cloudflare: nur CF-Connecting-IP – X-Forwarded-For kann jede:r mitschicken", () => {
    const warn = vi.fn();
    const clients = new ClientAddresses("cloudflare", warn);
    expect(clients.of(ctx({ "CF-Connecting-IP": "198.51.100.7", "X-Forwarded-For": "1.2.3.4, 198.51.100.7" }))).toBe("198.51.100.7");
    expect(clients.of(ctx({ "X-Forwarded-For": "1.2.3.4" }))).toBe("unbekannt");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain("ohne CF-Connecting-IP");
    expect(clients.of(ctx({ "CF-Connecting-IP": "kaputt" }))).toBe("unbekannt");
  });

  it("Zahl: der n-te Eintrag von hinten in X-Forwarded-For – ein mitgeschicktes CF-Connecting-IP zählt nicht", () => {
    const warn = vi.fn();
    const one = new ClientAddresses(1, warn);
    expect(one.of(ctx({ "X-Forwarded-For": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(one.of(ctx({ "X-Forwarded-For": "203.0.113.9", "CF-Connecting-IP": "1.2.3.4" }))).toBe("203.0.113.9");
    // Cloudflare meldet eine andere Adresse: einmal der Hinweis auf TRUST_PROXY=cloudflare.
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain("TRUST_PROXY=cloudflare");
    one.of(ctx({ "X-Forwarded-For": "203.0.113.10", "CF-Connecting-IP": "1.2.3.5" }));
    expect(warn).toHaveBeenCalledOnce();

    const two = new ClientAddresses(2, warn);
    expect(two.of(ctx({ "X-Forwarded-For": "1.2.3.4, 203.0.113.9, 104.16.0.1" }))).toBe("203.0.113.9");
    // Weniger Einträge als Proxys: lieber die Verbindung als einen Eintrag, den der Besucher selbst geschrieben hat.
    expect(two.of(ctx({ "X-Forwarded-For": "203.0.113.9" }))).toBe("unbekannt");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]![0]).toContain("weniger Einträge");
  });

  const trustCases: [TrustProxy, (ip: string, spoof: string) => Record<string, string>][] = [
    ["cloudflare", (ip, spoof) => ({ "CF-Connecting-IP": ip, "CF-Ray": "8c1f2a3b4d5e6f70-FRA", "X-Forwarded-For": `${spoof}, ${ip}` })],
    [1, (ip, spoof) => ({ "X-Forwarded-For": `${spoof}, ${ip}`, "CF-Connecting-IP": spoof })],
  ];
  for (const [trust, headers] of trustCases) {
    it(`gefälschte Header helfen nicht am Rate-Limit der Anmeldung vorbei (TRUST_PROXY=${trust})`, async () => {
      const app = createApp({ ai: noAi, passwordCost: FAST, authLimits: { ...defaultAuthLimits(), login: new RateLimiter(3, 60_000) }, trustProxy: trust, warn: quiet });
      const login = (spoof: string, ip = "203.0.113.1") =>
        app.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "x@example.com", password: "falsch-falsch" }), headers: { ...json, ...headers(ip, spoof) } });
      for (let i = 0; i < 3; i++) expect((await login(`10.9.9.${i}`)).status).toBe(401);
      // Jede Anfrage mit einer anderen erfundenen Adresse – trotzdem gebremst.
      expect((await login("10.9.9.99")).status).toBe(429);
      // Von einer wirklich anderen Adresse geht es weiter.
      expect((await login("10.9.9.98", "198.51.100.2")).status).toBe(401);
    });
  }
});

describe("Nur über https", () => {
  const app = createApp({ ai: noAi, warn: quiet });
  const viaCloudflare = (proto: string, host = "abc.trycloudflare.com") => ({ Host: host, "CF-Ray": "8c1f2a3b4d5e6f70-FRA", "CF-Connecting-IP": "198.51.100.7", "X-Forwarded-Proto": proto });

  it("lehnt Anfragen ab, die unverschlüsselt aus dem Internet kamen, und leitet GET auf https um", async () => {
    const post = await app.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@example.com", password: "geheim-geheim" }), headers: { ...json, ...viaCloudflare("http") } });
    expect(post.status).toBe(403);
    expect(await post.json()).toEqual({ error: "https_required" });
    const get = await app.request("/api/catalog?x=1", { headers: viaCloudflare("http") });
    expect(get.status).toBe(308);
    expect(get.headers.get("Location")).toBe("https://abc.trycloudflare.com/api/catalog?x=1");
    // Auch CF-Visitor bzw. Forwarded zählen, und ein „https“ daneben hebt ein „http“ nicht auf.
    const visitor = await app.request("/api/health", { headers: { Host: "foodtracker.onrender.com", "CF-Visitor": '{"scheme":"http"}', "X-Forwarded-Proto": "https" } });
    expect(visitor.status).toBe(308);
    const forwarded = await app.request("/api/auth/logout", { method: "POST", headers: { Host: "foodtracker.example", Forwarded: "for=198.51.100.7;proto=http" } });
    expect(forwarded.status).toBe(403);
  });

  it("über Cloudflare mit lokalem Host-Header: ablehnen statt auf eine falsche Adresse umleiten", async () => {
    const res = await app.request("/api/health", { headers: viaCloudflare("http", "localhost:3000") });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "https_required" });
  });

  it("schickt über https HSTS mit, im eigenen Netz nicht", async () => {
    const secure = await app.request("/api/health", { headers: viaCloudflare("https") });
    expect(secure.status).toBe(200);
    expect(secure.headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
    const lan = await app.request("/api/health", { headers: { Host: "192.168.1.20:3000" } });
    expect(lan.status).toBe(200);
    expect(lan.headers.get("Strict-Transport-Security")).toBeNull();
    // Ein Proxy im eigenen Netz ohne https (z. B. Docker auf dem Laptop): bleibt erlaubt.
    const local = await app.request("/api/health", { headers: { Host: "192.168.1.20:8080", "X-Forwarded-Proto": "http", "X-Forwarded-For": "192.168.1.30" } });
    expect(local.status).toBe(200);
  });
});

describe("Header jeder Antwort", () => {
  it("verbieten Einbetten, Umdeuten und Referrer – auch bei Fehlern und Fotos; CORS bleibt", async () => {
    const images = new MemoryImageStore();
    const key = "0f8fad5b-d9cb-469f-a165-70867728950e.png";
    await images.put(key, { type: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
    const app = createApp({ ai: noAi, images, warn: quiet });
    for (const res of [
      await app.request("/api/health"),
      await app.request("/api/gibtsnicht"),
      await app.request(`/api/images/${key}`, { headers: { Origin: "http://localhost:8081" } }),
    ]) {
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'");
      expect(res.headers.get("Cross-Origin-Resource-Policy")).toBeNull();
    }
    const image = await app.request(`/api/images/${key}`, { headers: { Origin: "http://localhost:8081" } });
    expect(image.status).toBe(200);
    expect(image.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8081");
  });
});

describe("Größengrenzen je Schnittstelle", () => {
  const app = createApp({ ai: noAi, warn: quiet });

  it("gibt jeder Schnittstelle so viel, wie die App schickt – den Rest klein", () => {
    expect(bodyLimitFor("POST", "/api/sync")).toBe(32 * 1024 * 1024);
    expect(bodyLimitFor("POST", "/api/recipes/import")).toBe(24 * 1024 * 1024);
    expect(bodyLimitFor("POST", "/api/analyze/meal")).toBe(12 * 1024 * 1024);
    expect(bodyLimitFor("POST", "/api/diary/sync")).toBe(4 * 1024 * 1024);
    expect(bodyLimitFor("POST", "/api/recipes/rezept_1/photos")).toBe(1024 * 1024);
    expect(bodyLimitFor("POST", "/api/auth/login")).toBe(DEFAULT_BODY_LIMIT);
    expect(bodyLimitFor("GET", "/api/sync")).toBe(DEFAULT_BODY_LIMIT);
    expect(bodyLimitFor("POST", "/api/recipes/a/b/photos")).toBe(DEFAULT_BODY_LIMIT);
    expect(Math.max(...BODY_LIMITS.map(([, , bytes]) => bytes))).toBeLessThanOrEqual(32 * 1024 * 1024);
  });

  it("lehnt Zu-Großes mit 413 ab – mit und ohne Content-Length", async () => {
    const big = JSON.stringify({ email: "a@example.com", password: "x".repeat(DEFAULT_BODY_LIMIT) });
    const res = await app.request("/api/auth/login", { method: "POST", body: big, headers: { ...json, "Content-Length": String(Buffer.byteLength(big)) } });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large", maxBytes: DEFAULT_BODY_LIMIT });
    // Ohne Content-Length (stückweise geschickt) zählt der Server mit.
    const chunks = new TextEncoder().encode(big);
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < chunks.length; i += 64 * 1024) controller.enqueue(chunks.slice(i, i + 64 * 1024));
        controller.close();
      },
    });
    const streamed = await app.request("/api/auth/login", { method: "POST", body: stream, headers: json, duplex: "half" } as RequestInit);
    expect(streamed.status).toBe(413);
  });

  it("nimmt große Sicherungen des Tagebuchs weiter an (3000 Einträge, über 512 KB)", async () => {
    const changes = Array.from({ length: 3000 }, (_, i) => ({
      id: `eintrag-${i}`,
      updatedAt: "2026-11-27T08:00:00.000Z",
      entry: { date: "2026-11-27", time: "12:30", title: "Linsen-Bolognese mit extra viel Gemüse und Parmesan", nutrients: { kcal: 612, protein: 28, carbs: 80, fat: 15 }, source: "plan" },
    }));
    const body = JSON.stringify({ since: 0, changes });
    expect(body.length).toBeGreaterThan(DEFAULT_BODY_LIMIT);
    const res = await app.request("/api/diary/sync", { method: "POST", body, headers: json });
    expect(res.status).toBe(200);
  });
});

describe("Protokolle ohne Passwörter, Tokens und E-Mail-Adressen", () => {
  it("schwärzt Adressen, Tokens, Schlüssel und Zugangsdaten", () => {
    const text = redact(
      'Fehler für lena.huber+test@example.co.at: Authorization: Bearer abc.DEF-123_xyz, {"password":"Topfenstrudel 42","newPassword":"x y"} ' +
        "postgresql://neondb_owner:npg_GeHeim123@ep-cool.eu-central-1.aws.neon.tech/neondb sk-ant-api03-AbCdEf_123 " +
        "Sitzung q7Xk2v9LmN4pR8sT1wY6zB3cD5fG0hJ2kL4mN6pQ8rS passwort=hunter2 token: 0123456789abcdef0123456789abcdef",
    );
    for (const secret of ["lena.huber", "example.co.at", "abc.DEF-123_xyz", "Topfenstrudel", "x y", "npg_GeHeim123", "neondb_owner", "AbCdEf_123", "q7Xk2v9", "hunter2", "0123456789abcdef"]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(text).toContain("<E-Mail>");
    expect(text).toContain("Bearer <Token>");
    expect(text).toContain("postgresql://<Zugangsdaten>@ep-cool.eu-central-1.aws.neon.tech/neondb");
    // Normale Meldungen bleiben lesbar.
    expect(redact("connect ECONNREFUSED 127.0.0.1:11434")).toBe("connect ECONNREFUSED 127.0.0.1:11434");
  });

  it("beschreibt Fehler mit Code, Stack und Ursache – geschwärzt", () => {
    const err = Object.assign(new Error("Konto lena@example.com nicht gefunden", { cause: new Error("Bearer geheimes-token") }), { code: "E_TEST" });
    const text = describeError(err);
    expect(text).toContain("Error (E_TEST): Konto <E-Mail> nicht gefunden");
    expect(text).toContain("Ursache: Error: Bearer <Token>");
    expect(text).toContain("security.test.ts");
    expect(text).not.toContain("lena@");
  });

  it("schreibt kaputtes JSON nicht ins Protokoll und antwortet mit 400 statt 500", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({ ai: noAi, warn: quiet });
    const res = await app.request("/api/auth/login", { method: "POST", body: '{"email":"lena@example.com","password":"Topfenstrudel 42"', headers: json });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe('{"error":"invalid_request"}');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("protokolliert unerwartete Fehler geschwärzt und nur mit dem Muster der Route", async () => {
    const lines: string[] = [];
    const error = vi.spyOn(console, "error").mockImplementation((line: string) => void lines.push(line));
    const images = new MemoryImageStore();
    images.get = async () => {
      throw new Error("Objektspeicher: Zugriff für lena@example.com mit Bearer sehr-geheimes-token verweigert");
    };
    const app = createApp({ ai: noAi, images, warn: quiet });
    const res = await app.request("/api/images/0f8fad5b-d9cb-469f-a165-70867728950e.jpg");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
    error.mockRestore();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Fehler bei GET /api/images/:key");
    expect(lines[0]).toContain("<E-Mail>");
    expect(lines[0]).not.toContain("lena@");
    expect(lines[0]).not.toContain("sehr-geheimes-token");
    expect(lines[0]).not.toContain("0f8fad5b");
  });
});

describe("Rate-Limits", () => {
  it("Token-Eimer: Spitzen bis zur Größe, dann nachwachsend; Kosten über der Größe zählen als volle Größe", () => {
    let now = 0;
    const bucket = new TokenBucket(3, 1, () => now);
    expect([bucket.take("a"), bucket.take("a"), bucket.take("a")]).toEqual([0, 0, 0]);
    expect(bucket.take("a")).toBe(1);
    expect(bucket.take("b")).toBe(0);
    now = 2000;
    expect([bucket.take("a"), bucket.take("a")]).toEqual([0, 0]);
    expect(bucket.take("a")).toBe(1);
    now = 10_000;
    expect(bucket.take("a", 50)).toBe(0); // so groß wie der Eimer
    expect(bucket.take("a", 2)).toBe(2);
  });

  it("vergisst Adressen, sobald ihr Zeitfenster vorbei ist (spätestens eine Minute danach)", () => {
    let now = 0;
    const size = (limiter: object) => (limiter as { hits?: Map<string, unknown>; buckets?: Map<string, unknown> }).hits?.size ?? (limiter as { buckets: Map<string, unknown> }).buckets.size;
    const limiter = new RateLimiter(5, 60 * 60_000, () => now);
    limiter.hit("203.0.113.1");
    now = 60 * 60_000 + 60_000;
    limiter.hit("198.51.100.2");
    expect(size(limiter)).toBe(1);
    now = 0;
    const bucket = new TokenBucket(600, 2, () => now);
    bucket.take("203.0.113.1", 10);
    now = 5 * 1000 + 61_000; // 10 Marken wachsen in 5 s nach
    bucket.take("198.51.100.2");
    expect(size(bucket)).toBe(1);
  });

  it("merkt sich nicht unbegrenzt viele Adressen", () => {
    const limiter = new RateLimiter(1, 60_000, () => 0);
    for (let i = 0; i < 60_000; i++) limiter.hit(`k${i}`);
    expect((limiter as unknown as { hits: Map<string, unknown> }).hits.size).toBeLessThanOrEqual(50_000);
    // Die zuletzt Gezählten sind noch da.
    expect(limiter.wait("k59999")).toBeGreaterThan(0);
  });

  it("bremst alle Anfragen je Adresse, das Lebenszeichen nie", async () => {
    let now = 0;
    const app = createApp({ ai: noAi, trustProxy: 1, warn: quiet, limits: { requests: new TokenBucket(3, 1, () => now) } });
    const get = (path: string, ip = "203.0.113.1") => app.request(path, { headers: { "X-Forwarded-For": ip } });
    for (let i = 0; i < 3; i++) expect((await get("/api/delivery/providers")).status).toBe(200);
    const blocked = await get("/api/delivery/providers");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("1");
    expect(await blocked.json()).toEqual({ error: "rate_limited", retryAfter: 1 });
    expect((await get("/api/health/live")).status).toBe(200);
    expect((await get("/api/delivery/providers", "198.51.100.2")).status).toBe(200);
    now = 1500;
    expect((await get("/api/delivery/providers")).status).toBe(200);
  });

  it("begrenzt KI-Anfragen je Adresse und je Konto", async () => {
    const app = createApp({
      ai: noAi,
      auth: { appleAudiences: [], googleAudiences: [], adminEmails: [], allowDevLogin: true },
      trustProxy: 1,
      warn: quiet,
      limits: { ai: new RateLimiter(2, 60 * 60_000) },
    });
    const translate = (ip: string, token?: string) =>
      app.request("/api/recipes/translate", {
        method: "POST",
        body: JSON.stringify({ text: { name: "Gulasch" }, targetLanguage: "en" }),
        headers: { ...json, [AI_CONSENT_HEADER]: "1", "X-Forwarded-For": ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    // Ohne KI auf dem Server zählt der Versuch trotzdem (die Anfrage hätte die KI erreicht).
    expect((await translate("203.0.113.1")).status).toBe(503);
    expect((await translate("203.0.113.1")).status).toBe(503);
    const blocked = await translate("203.0.113.1");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: "ai_rate_limited" });
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(3000);
    // Ohne Einwilligung zählt nichts (die Anfrage geht gar nicht erst an die KI).
    const noConsent = await app.request("/api/recipes/translate", {
      method: "POST",
      body: JSON.stringify({ text: { name: "Gulasch" }, targetLanguage: "en" }),
      headers: { ...json, "X-Forwarded-For": "203.0.113.50" },
    });
    expect(noConsent.status).toBe(403);
    // Ein Konto wechselt nicht einfach die Adresse.
    const { token } = (await (await app.request("/api/auth/dev", { method: "POST", body: JSON.stringify({ name: "Mia" }), headers: json })).json()) as { token: string };
    expect((await translate("198.51.100.1", token)).status).toBe(503);
    expect((await translate("198.51.100.2", token)).status).toBe(503);
    expect((await translate("198.51.100.3", token)).status).toBe(429);
    expect((await translate("198.51.100.3")).status).toBe(503);
  });

  it("begrenzt Fotos, geteilte Rezepte und Meldungen je Adresse", async () => {
    const app = createApp({ ai: noAi, trustProxy: 1, warn: quiet, limits: { uploads: new RateLimiter(2, 60 * 60_000) } });
    const flag = (ip: string) =>
      app.request("/api/recipes/linsen_bolognese/flags", { method: "POST", body: JSON.stringify({ reason: "text", note: "" }), headers: { ...json, "X-Forwarded-For": ip } });
    expect((await flag("203.0.113.1")).status).toBe(204);
    expect((await flag("203.0.113.1")).status).toBe(204);
    expect((await flag("203.0.113.1")).status).toBe(429);
    expect((await flag("198.51.100.9")).status).toBe(204);
  });

  it("begrenzt die Sicherung des Tagebuchs ohne Konto nach Einträgen je Adresse, mit Konto nicht", async () => {
    const app = createApp({
      ai: noAi,
      auth: { appleAudiences: [], googleAudiences: [], adminEmails: [], allowDevLogin: true },
      trustProxy: 1,
      warn: quiet,
      limits: { diary: new TokenBucket(5, 5 / 3600) },
    });
    const entries = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `e${from + i}`,
        updatedAt: "2026-11-27T08:00:00.000Z",
        entry: { date: "2026-11-27", time: "12:30", title: "Porridge", nutrients: { kcal: 400, protein: 12, carbs: 60, fat: 9 }, source: "manuell" },
      }));
    const sync = (device: string, changes: unknown[], token?: string) =>
      app.request("/api/diary/sync", {
        method: "POST",
        body: JSON.stringify({ since: 0, changes }),
        headers: { ...json, "X-Device-Id": device, "X-Forwarded-For": "203.0.113.1", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    expect((await sync("geraet-aaaaaaaa", entries(0, 3))).status).toBe(200);
    // Eine neue, erfundene Geräte-ID hilft nicht: Es zählt die Adresse.
    expect((await sync("geraet-bbbbbbbb", entries(3, 3))).status).toBe(429);
    expect((await sync("geraet-bbbbbbbb", [])).status).toBe(200);
    const { token } = (await (await app.request("/api/auth/dev", { method: "POST", body: JSON.stringify({ name: "Ben" }), headers: json })).json()) as { token: string };
    expect((await sync("geraet-aaaaaaaa", entries(10, 20), token)).status).toBe(200);
  });

  it("liest AI_REQUESTS_PER_HOUR (0 = ohne Grenze) und nennt alles in der Startmeldung", () => {
    expect(parseAiPerHour(undefined)).toEqual({ ok: true, perHour: 40 });
    expect(parseAiPerHour(" 15 ")).toEqual({ ok: true, perHour: 15 });
    expect(parseAiPerHour("0")).toEqual({ ok: true, perHour: 0 });
    expect(parseAiPerHour("viele").ok).toBe(false);
    expect(defaultRequestLimits(0).ai).toBeNull();
    expect(defaultRequestLimits().ai?.limit).toBe(40);
    expect(limitsLine({ trustProxy: "cloudflare", aiPerHour: 40 })).toBe(
      "Adresse aus CF-Connecting-IP (TRUST_PROXY=cloudflare); KI höchstens 40 Anfragen pro Stunde je Adresse bzw. Konto",
    );
    expect(limitsLine({ trustProxy: false, aiPerHour: 0 })).toContain("KI ohne Grenze");
  });
});
