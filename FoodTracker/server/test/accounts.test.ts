import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { Ai } from "../src/ai/provider.js";
import { createApp, defaultAuthLimits, type AuthLimits } from "../src/app.js";
import { hashPassword, needsRehash, passwordProblem, verifyPassword } from "../src/auth/password.js";
import { UserStore } from "../src/auth/users.js";
import { RateLimiter } from "../src/http/rateLimit.js";
import { openSqlite, type Db } from "../src/storage/db.js";
import type { Mailer } from "../src/mail/mailer.js";
import { resetMail } from "../src/mail/mailer.js";

// Konten mit E-Mail und Passwort (Vorrang 1, 9.1): Registrierung, Anmeldung, Rate-Limit, Passwort ändern und
// zurücksetzen, Konto löschen und Daten exportieren. Mit wenig Rechenaufwand für scrypt, damit die Tests schnell sind.

const FAST = { N: 1024, r: 8, p: 1 };
const noAi = new Ai({ hasAnthropicKey: false, ollama: { url: "http://ollama.test", model: "gemma4:e4b", numCtx: 1024, timeoutMs: 1000 } }, async () => {
  throw new TypeError("offline");
});
const tmp = mkdtempSync(join(tmpdir(), "foodtracker-konten-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

interface Sent {
  to: string;
  subject: string;
  text: string;
}

function setup(options: { mailer?: Mailer | null; limits?: Partial<AuthLimits>; db?: Db } = {}) {
  const app = createApp({
    db: options.db,
    auth: { appleAudiences: [], googleAudiences: [], adminEmails: ["chefin@example.com"], allowDevLogin: true },
    ai: noAi,
    mailer: options.mailer ?? null,
    passwordCost: FAST,
    authLimits: { ...defaultAuthLimits(), ...options.limits },
    trustProxy: true,
  });
  // Wie hinter einem Proxy (TRUST_PROXY): die Adresse fürs Rate-Limit im Header – außer `direct` (eigenes Netz, Dev-Login).
  const call = (method: string, path: string, body?: unknown, extra: { token?: string; ip?: string; direct?: boolean } = {}) =>
    app.request(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": "device-konten-1",
        ...(extra.direct ? {} : { "X-Forwarded-For": extra.ip ?? "203.0.113.1" }),
        ...(extra.token ? { Authorization: `Bearer ${extra.token}` } : {}),
      },
    });
  const register = async (email: string, password: string, name?: string, ip?: string) => call("POST", "/api/auth/register", { email, password, name }, { ip });
  const login = async (email: string, password: string, ip?: string) => call("POST", "/api/auth/login", { email, password }, { ip });
  const tokenOf = async (res: Response) => ((await res.json()) as { token: string }).token;
  return { app, call, register, login, tokenOf };
}

function fakeMailer() {
  const sent: Sent[] = [];
  const mailer: Mailer = {
    send: async (m) => {
      sent.push(m);
    },
  };
  return { sent, mailer, codeIn: (m: Sent) => m.text.match(/\b(\d{8})\b/)?.[1] ?? "" };
}

describe("Passwörter (scrypt)", () => {
  it("prüft richtige und falsche Passwörter, gleich normalisiert", async () => {
    const stored = await hashPassword("Kaiserschmarrn mit Äpfeln", FAST);
    expect(stored).toMatch(/^scrypt\$1024\$8\$1\$/);
    expect(stored).not.toContain("Kaiserschmarrn");
    expect(await verifyPassword("Kaiserschmarrn mit Äpfeln", stored)).toBe(true);
    expect(await verifyPassword("kaiserschmarrn mit Äpfeln", stored)).toBe(false);
    // „Ä“ als ein Zeichen oder als A + Umlautpunkte ist dasselbe Passwort.
    expect(await verifyPassword("Kaiserschmarrn mit Äpfeln", stored)).toBe(true);
    expect(await verifyPassword("egal", "kein$gültiger$eintrag")).toBe(false);
    expect(await verifyPassword("egal", "scrypt$1048577$8$1$AAAA$AAAA")).toBe(false);
  });

  it("verlangt mindestens 10 Zeichen und zählt Zeichen statt Bytes", () => {
    expect(passwordProblem("123456789")).toBe("too_short");
    expect(passwordProblem("1234567890")).toBeNull();
    expect(passwordProblem("🍝🍝🍝🍝🍝🍝🍝🍝🍝")).toBe("too_short");
    expect(passwordProblem("x".repeat(201))).toBe("too_long");
  });

  it("erkennt Hashes mit alten Einstellungen", async () => {
    const stored = await hashPassword("Spinatknödel123", FAST);
    expect(needsRehash(stored, FAST)).toBe(false);
    expect(needsRehash(stored, { N: 2048, r: 8, p: 1 })).toBe(true);
  });
});

describe("Rate-Limit", () => {
  it("erlaubt höchstens limit Versuche im Fenster und nennt die Wartezeit", () => {
    let now = 1_000_000;
    const limiter = new RateLimiter(3, 60_000, () => now);
    expect([limiter.hit("a"), limiter.hit("a"), limiter.hit("a")]).toEqual([0, 0, 0]);
    expect(limiter.hit("a")).toBe(60);
    expect(limiter.hit("b")).toBe(0);
    now += 30_000;
    expect(limiter.wait("a")).toBe(30);
    now += 30_001;
    expect(limiter.hit("a")).toBe(0);
    limiter.reset("a");
    expect(limiter.wait("a")).toBe(0);
  });
});

describe("Registrieren und anmelden mit E-Mail und Passwort", () => {
  it("legt ein Konto an, meldet damit an und zeigt keinen Teil der Adresse als Namen", async () => {
    const { call, register, login, tokenOf } = setup();
    const res = await register("  Mia.Muster@Example.COM ", "Linsen-Dal 2026");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; created: boolean; user: Record<string, unknown> };
    expect(body.created).toBe(true);
    expect(body.user).toMatchObject({ email: "mia.muster@example.com", provider: "password", role: "user", name: "Nutzer:in" });
    expect(JSON.stringify(body)).not.toContain("scrypt");
    expect((await call("GET", "/api/auth/me", undefined, { token: body.token })).status).toBe(200);

    const again = await login("mia.muster@example.com", "Linsen-Dal 2026");
    expect(again.status).toBe(200);
    const token = await tokenOf(again);
    expect(token).not.toBe(body.token);
    expect((await call("POST", "/api/auth/logout", {}, { token })).status).toBe(204);
    expect((await call("GET", "/api/auth/me", undefined, { token })).status).toBe(401);
    expect((await call("GET", "/api/auth/config")).status).toBe(200);
    expect(await (await call("GET", "/api/auth/config")).json()).toMatchObject({ password: true, passwordReset: false, passwordMinLength: 10 });
  });

  it("lehnt zu kurze Passwörter und ungültige Adressen ab", async () => {
    const { register } = setup();
    const short = await register("kurz@example.com", "123456789");
    expect(short.status).toBe(400);
    expect(await short.json()).toEqual({ error: "auth_weak_password", minLength: 10, maxLength: 200 });
    expect((await register("keine-adresse", "Linsen-Dal 2026")).status).toBe(400);
  });

  it("verrät nicht, ob es eine Adresse gibt: gleicher Fehler für falsches Passwort und unbekannte Adresse", async () => {
    const { register, login } = setup();
    await register("lena@example.com", "Shakshuka am Sonntag");
    const wrong = await login("lena@example.com", "falsches Passwort!");
    const unknown = await login("niemand@example.com", "falsches Passwort!");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    // Registrieren mit vergebener Adresse: mit dem richtigen Passwort einfach angemeldet, sonst derselbe Fehler.
    const same = await register("LENA@example.com", "Shakshuka am Sonntag");
    expect(same.status).toBe(200);
    expect(((await same.json()) as { created: boolean }).created).toBe(false);
    const taken = await register("lena@example.com", "ganz anderes Passwort");
    expect(taken.status).toBe(401);
    expect(await taken.json()).toEqual({ error: "auth_invalid_credentials" });
  });

  it("bremst das Durchprobieren pro Adresse – auch für Adressen ohne Konto – und pro IP-Adresse", async () => {
    const { register, login } = setup({ limits: { failures: new RateLimiter(3, 60_000), login: new RateLimiter(6, 60_000) } });
    await register("tom@example.com", "Krautfleckerl 1x1");
    for (let i = 0; i < 3; i++) expect((await login("tom@example.com", `falsch-${i}-xxxxx`)).status).toBe(401);
    const blocked = await login("tom@example.com", "Krautfleckerl 1x1");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect(await blocked.json()).toMatchObject({ error: "auth_rate_limited" });
    for (let i = 0; i < 3; i++) expect((await login("gibtsnicht@example.com", `falsch-${i}-xxxxx`, "203.0.113.9")).status).toBe(401);
    expect((await login("gibtsnicht@example.com", "falsch-3-xxxxx", "203.0.113.9")).status).toBe(429);
    // Pro IP-Adresse: 6 Versuche (4 davon oben, auch der gebremste zählt), dann ist Schluss – von einer anderen
    // Adresse geht es weiter.
    for (let i = 0; i < 2; i++) expect((await login(`neu${i}@example.com`, "egal-egal-egal")).status).toBe(401);
    expect((await login("neu9@example.com", "egal-egal-egal")).status).toBe(429);
    expect((await login("neu9@example.com", "egal-egal-egal", "198.51.100.7")).status).toBe(401);
  });

  it("begrenzt Registrierungen pro IP-Adresse", async () => {
    const { register } = setup({ limits: { register: new RateLimiter(2, 3_600_000) } });
    expect((await register("a@example.com", "Gulasch-Suppe!")).status).toBe(201);
    expect((await register("b@example.com", "Gulasch-Suppe!")).status).toBe(201);
    expect((await register("c@example.com", "Gulasch-Suppe!")).status).toBe(429);
    expect((await register("c@example.com", "Gulasch-Suppe!", undefined, "198.51.100.8")).status).toBe(201);
  });

  it("speichert Konten dauerhaft in der Datenbank, Passwörter nur als Hash", async () => {
    const file = join(tmp, "konten.db");
    const first = setup({ db: openSqlite(file) });
    await first.register("datei@example.com", "Topfenstrudel 42", "Dora");
    const check = openSqlite(file);
    expect((await check.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE email = ?", ["datei@example.com"]))?.password_hash).toMatch(/^scrypt\$/);
    await check.close();
    for (const f of [file, `${file}-wal`]) if (existsSync(f)) expect(readFileSync(f).toString("latin1")).not.toContain("Topfenstrudel");
    // Ein neu gestarteter Server (neue Verbindung zur selben Datei) kennt das Konto.
    const second = setup({ db: openSqlite(file) });
    const res = await second.login("datei@example.com", "Topfenstrudel 42");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { name: string } }).user.name).toBe("Dora");
  });

  it("macht ein Passwort-Konto erst mit bestätigter Adresse zum Admin", async () => {
    const { sent, mailer, codeIn } = fakeMailer();
    const { call, register, login } = setup({ mailer });
    const res = await register("chefin@example.com", "Frittatensuppe!");
    expect(((await res.json()) as { user: { role: string } }).user.role).toBe("user");
    expect((await call("POST", "/api/auth/password/forgot", { email: "chefin@example.com" })).status).toBe(204);
    const code = codeIn(sent[0]!);
    expect((await call("POST", "/api/auth/password/reset", { email: "chefin@example.com", code, newPassword: "Frittatensuppe 2" })).status).toBe(200);
    const again = await login("chefin@example.com", "Frittatensuppe 2");
    expect(((await again.json()) as { user: { role: string } }).user.role).toBe("admin");
  });
});

describe("Passwort ändern und zurücksetzen", () => {
  it("ändert das Passwort und meldet andere Geräte ab", async () => {
    const { call, register, login, tokenOf } = setup();
    const here = await tokenOf(await register("ben@example.com", "Rösti mit Lauch"));
    const other = await tokenOf(await login("ben@example.com", "Rösti mit Lauch"));
    const change = (currentPassword: string, newPassword: string) => call("POST", "/api/auth/password", { currentPassword, newPassword }, { token: here });
    expect((await change("falsch-falsch", "Neues Passwort 1")).status).toBe(401);
    expect((await change("Rösti mit Lauch", "zu kurz")).status).toBe(400);
    expect((await change("Rösti mit Lauch", "Neues Passwort 1")).status).toBe(204);
    expect((await call("GET", "/api/auth/me", undefined, { token: here })).status).toBe(200);
    expect((await call("GET", "/api/auth/me", undefined, { token: other })).status).toBe(401);
    expect((await login("ben@example.com", "Rösti mit Lauch")).status).toBe(401);
    expect((await login("ben@example.com", "Neues Passwort 1")).status).toBe(200);
  });

  it("lässt den Dev-Login nur im eigenen Netz zu, nie über einen Proxy oder Tunnel", async () => {
    const { app, call } = setup();
    // Im eigenen Netz (ohne Header eines Proxys): wie bisher.
    expect((await call("POST", "/api/auth/dev", { name: "Nah" }, { direct: true })).status).toBe(200);
    expect(await (await call("GET", "/api/auth/config", undefined, { direct: true })).json()).toMatchObject({ dev: true });
    // Über einen Proxy (X-Forwarded-For) bzw. Cloudflare Tunnel (CF-Connecting-IP, CF-Ray): als gäbe es ihn nicht –
    // auch wenn ALLOW_DEV_LOGIN=1 in server/.env steht (Laptop mit Tunnel, Weg a in docs/SERVER-HOSTING.md).
    expect((await call("POST", "/api/auth/dev", { name: "Fern" })).status).toBe(404);
    expect(await (await call("GET", "/api/auth/config")).json()).toMatchObject({ dev: false });
    const proxied: Record<string, string>[] = [{ "CF-Connecting-IP": "198.51.100.7" }, { "CF-Ray": "8c1f2a3b4d5e6f70-FRA" }, { Forwarded: "for=198.51.100.7" }];
    for (const header of proxied) {
      const res = await app.request("/api/auth/dev", {
        method: "POST",
        body: JSON.stringify({ name: "Tunnel" }),
        headers: { "Content-Type": "application/json", "X-Device-Id": "device-konten-2", ...header },
      });
      expect(res.status).toBe(404);
    }
  });

  it("meldet Konten ohne Passwort (Apple, Google, Dev-Login)", async () => {
    const { call } = setup();
    const { token } = (await (await call("POST", "/api/auth/dev", { name: "Mia" }, { direct: true })).json()) as { token: string };
    const res = await call("POST", "/api/auth/password", { currentPassword: "irgendwas!!", newPassword: "Neues Passwort 1" }, { token });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "auth_no_password" });
  });

  it("gibt es ohne Mail-Dienst nicht", async () => {
    const { call } = setup();
    expect((await call("POST", "/api/auth/password/forgot", { email: "x@example.com" })).status).toBe(501);
    expect((await call("POST", "/api/auth/password/reset", { email: "x@example.com", code: "12345678", newPassword: "Neues Passwort 1" })).status).toBe(501);
  });

  it("schickt einen Code in der Sprache der App, gleiche Antwort für unbekannte Adressen", async () => {
    const { sent, mailer, codeIn } = fakeMailer();
    const { call, register, login, tokenOf } = setup({ mailer });
    const old = await tokenOf(await register("nora@example.com", "Mujaddara 2026"));
    expect(await (await call("GET", "/api/auth/config")).json()).toMatchObject({ passwordReset: true });
    expect((await call("POST", "/api/auth/password/forgot", { email: "unbekannt@example.com", language: "en" })).status).toBe(204);
    expect(sent).toHaveLength(0);
    expect((await call("POST", "/api/auth/password/forgot", { email: "Nora@example.com", language: "fr" })).status).toBe(204);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "nora@example.com", subject: resetMail("fr", "", 30).subject });
    const code = codeIn(sent[0]!);
    expect(code).toMatch(/^\d{8}$/);

    const reset = (c: string) => call("POST", "/api/auth/password/reset", { email: "nora@example.com", code: c, newPassword: "Mujaddara neu!" });
    const wrong = code === "00000000" ? "11111111" : "00000000";
    expect((await reset(wrong)).status).toBe(400);
    const ok = await reset(code);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { token: string }).token).toBeTruthy();
    // Einmal gültig; alte Sitzungen enden, das neue Passwort gilt.
    expect((await reset(code)).status).toBe(400);
    expect((await call("GET", "/api/auth/me", undefined, { token: old })).status).toBe(401);
    expect((await login("nora@example.com", "Mujaddara neu!")).status).toBe(200);
  });

  it("macht einen Code nach fünf Fehlversuchen ungültig", async () => {
    const { sent, mailer, codeIn } = fakeMailer();
    const { call, register } = setup({ mailer });
    await register("ida@example.com", "Gemüsecurry 77");
    await call("POST", "/api/auth/password/forgot", { email: "ida@example.com" });
    const code = codeIn(sent[0]!);
    const wrong = code === "00000000" ? "11111111" : "00000000";
    for (let i = 0; i < 5; i++) {
      await call("POST", "/api/auth/password/reset", { email: "ida@example.com", code: wrong, newPassword: "Gemüsecurry 78" });
    }
    const res = await call("POST", "/api/auth/password/reset", { email: "ida@example.com", code, newPassword: "Gemüsecurry 78" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "auth_invalid_code" });
  });

  it("schreibt keine E-Mail-Adresse ins Protokoll, wenn der Versand scheitert", async () => {
    const failing: Mailer = {
      send: async () => {
        throw Object.assign(new Error("550 <eva@example.com> rejected"), { code: "EENVELOPE", responseCode: 550 });
      },
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { call, register } = setup({ mailer: failing });
    await register("eva@example.com", "Kürbissuppe!!");
    expect((await call("POST", "/api/auth/password/forgot", { email: "eva@example.com" })).status).toBe(204);
    await new Promise((r) => setTimeout(r, 10));
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("eva@example.com");
    log.mockRestore();
  });
});

describe("Konto löschen und Daten exportieren", () => {
  const entry = { date: "2026-11-24", time: "12:30", title: "Linsen-Dal", nutrients: { kcal: 520, protein: 24, carbs: 70, fat: 12 }, source: "plan" };
  const ownRecipe = {
    id: "eigen_1",
    language: "de",
    name: "Omas Kartoffelsalat",
    steps: ["Kartoffeln kochen"],
    otherIngredients: [],
    mealTypes: ["lunch"],
    ingredients: [{ ingredientId: "kartoffeln", amount: 300 }],
    cookMinutes: 30,
    tags: [],
    source: { kind: "eigen" },
  };

  it("exportiert alles, was der Server zum Konto hat – ohne Passwort-Hash", async () => {
    const { call, register, tokenOf } = setup();
    const token = await tokenOf(await register("export@example.com", "Spätzle mit Käse", "Eli"));
    await call("POST", "/api/diary/sync", { since: 0, changes: [{ id: "e1", updatedAt: "2026-11-24T03:30:00.000Z", entry }] }, { token });
    const shared = (await (await call("POST", "/api/community/recipes", { authorName: "Eli", recipe: ownRecipe }, { token })).json()) as { id: string };
    await call("POST", `/api/community/recipes/${shared.id}/like`, {}, { token });
    await call("POST", "/api/recipes/shakshuka/rating", { stars: 4 }, { token });
    await call("POST", "/api/recipes/shakshuka/photos", { uri: "data:image/jpeg;base64,/9j/4AAQ" }, { token });
    await call("POST", "/api/recipes/linsen_dal/flags", { reason: "text", note: "Tippfehler" }, { token });

    const res = await call("GET", "/api/auth/export", undefined, { token });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="foodtracker-konto-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = (await res.json()) as Record<string, any>;
    expect(data.format).toBe("foodtracker-account-export");
    expect(data.account).toMatchObject({ email: "export@example.com", name: "Eli", provider: "password", emailVerified: false });
    expect(data.diary).toEqual([expect.objectContaining({ id: "e1", title: "Linsen-Dal" })]);
    expect(data.community.shared).toHaveLength(1);
    expect(data.community.liked).toEqual([shared.id]);
    expect(data.recipeRatings).toEqual({ shakshuka: 4 });
    expect(data.photos).toHaveLength(1);
    expect(data.flags).toEqual([expect.objectContaining({ recipeId: "linsen_dal", note: "Tippfehler" })]);
    expect(JSON.stringify(data)).not.toMatch(/scrypt|passwordHash|tokenHash/);
    expect((await call("GET", "/api/auth/export")).status).toBe(401);
  });

  it("löscht das Konto mit allen Daten erst nach Bestätigung mit dem Passwort", async () => {
    const { call, register, login, tokenOf } = setup();
    const token = await tokenOf(await register("weg@example.com", "Kaiserschmarrn!", "Weg"));
    await call("POST", "/api/diary/sync", { since: 0, changes: [{ id: "e1", updatedAt: "2026-11-24T03:30:00.000Z", entry }] }, { token });
    await call("POST", "/api/community/recipes", { authorName: "Weg", recipe: ownRecipe }, { token });
    await call("POST", "/api/recipes/shakshuka/rating", { stars: 5 }, { token });
    await call("POST", "/api/recipes/shakshuka/photos", { uri: "data:image/jpeg;base64,/9j/4AAQ" }, { token });

    expect((await call("DELETE", "/api/auth/me", {}, { token })).status).toBe(401);
    expect((await call("DELETE", "/api/auth/me", { password: "falsches Passwort" }, { token })).status).toBe(401);
    expect((await call("DELETE", "/api/auth/me", { password: "Kaiserschmarrn!" }, { token })).status).toBe(204);

    expect((await call("GET", "/api/auth/me", undefined, { token })).status).toBe(401);
    expect((await login("weg@example.com", "Kaiserschmarrn!")).status).toBe(401);
    const community = (await (await call("GET", "/api/community/recipes")).json()) as { authorName: string }[];
    expect(community.some((r) => r.authorName === "Weg")).toBe(false);
    const ratings = (await (await call("GET", "/api/recipes/ratings")).json()) as Record<string, { count: number }>;
    expect(ratings.shakshuka?.count ?? 0).toBe(0);
    const photos = (await (await call("GET", "/api/recipes/shakshuka/photos")).json()) as unknown[];
    expect(photos).toHaveLength(0);

    // Dieselbe Adresse ist danach frei, das neue Konto beginnt ohne die alte Historie.
    const fresh = await tokenOf(await register("weg@example.com", "Kaiserschmarrn!"));
    const synced = (await (await call("POST", "/api/diary/sync", { since: 0, changes: [] }, { token: fresh })).json()) as { changes: unknown[] };
    expect(synced.changes).toHaveLength(0);
  });

  it("löscht Konten ohne Passwort (Apple, Google, Dev-Login) ohne Rückfrage", async () => {
    const { call } = setup();
    const { token } = (await (await call("POST", "/api/auth/dev", { name: "Kurz" }, { direct: true })).json()) as { token: string };
    expect((await call("DELETE", "/api/auth/me", undefined, { token })).status).toBe(204);
    expect((await call("GET", "/api/auth/me", undefined, { token })).status).toBe(401);
  });

  it("löscht das Konto samt Sitzungen und Tagebuch-Sicherung auch aus der Datenbank", async () => {
    const db = openSqlite(join(tmp, "konten-loeschen.db"));
    const { call, register, tokenOf } = setup({ db });
    const token = await tokenOf(await register("raus@example.com", "Palatschinken!"));
    await call("POST", "/api/diary/sync", { since: 0, changes: [{ id: "e1", updatedAt: "2026-11-24T03:30:00.000Z", entry }, { id: "e2", updatedAt: "2026-11-24T04:30:00.000Z", entry: null }] }, { token });
    const [user] = await new UserStore(db).list();
    expect(await db.all("SELECT id FROM sync_records WHERE owner = ? ORDER BY id", [`user:${user!.id}`])).toEqual([{ id: "e1" }, { id: "e2" }]);
    await call("DELETE", "/api/auth/me", { password: "Palatschinken!" }, { token });
    expect(await new UserStore(db).list()).toHaveLength(0);
    expect(await db.all("SELECT * FROM sessions")).toEqual([]);
    expect(await db.all("SELECT * FROM users WHERE email = ?", ["raus@example.com"])).toEqual([]);
    // Auch Löschmarken und der Zähler der Revisionen sind weg.
    expect(await db.all("SELECT * FROM sync_records")).toEqual([]);
    expect(await db.all("SELECT * FROM sync_revisions")).toEqual([]);
  });
});
