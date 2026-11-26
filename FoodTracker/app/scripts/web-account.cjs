// Ende-zu-Ende-Test der Konten mit E-Mail und Passwort im Browser (headless Chromium über Playwright), mit echtem
// Server auf einem eigenen Port und leeren Daten in einem Temp-Ordner:
//
//   npm run web:account               # baut die Web-Version für diesen Server (dist-account/), startet ihn und
//                                     # spielt durch: Umzug der Anmeldung aus einer älteren Version (Token danach
//                                     # nicht mehr im übrigen Zustand), Fehler vor dem Absenden (Adresse, kurzes Passwort), Hinweis zur
//                                     # Zustimmung eines Elternteils, Registrieren, Anmeldung bleibt nach dem Neuladen
//                                     # (eigener Schlüssel, nicht im übrigen Zustand), Passwort ändern (falsch/richtig),
//                                     # Abmelden, Anmelden mit altem und neuem Passwort, „Passwort vergessen?“ bis zum
//                                     # falschen Code, „Meine Daten exportieren“, Konto löschen (falsch/richtig)
//   npm run web:account -- --no-build # mit dem vorhandenen dist-account/
//
// Der Server bekommt SMTP_HOST auf einen Port, an dem niemand lauscht: So erscheint „Passwort vergessen?“, die Mail
// selbst geht ins Leere (der Server meldet das nur im eigenen Protokoll). Playwright wie bei web-smoke.cjs.
// Schlägt fehl (Exit-Code 1), sobald ein Schritt nicht klappt oder eine Seite einen JavaScript-Fehler wirft.
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const APP = path.resolve(__dirname, "..");
const SERVER = path.resolve(APP, "../server");
const DIST = path.join(APP, "dist-account");
const PORT = Number(process.env.E2E_SERVER_PORT ?? 3917);
const API = `http://127.0.0.1:${PORT}`;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".ttf": "font/ttf", ".svg": "image/svg+xml" };

function build() {
  console.log(`Baue die Web-Version für ${API} …`);
  // --clear: sonst übernimmt Metro EXPO_PUBLIC_API_URL aus dem Zwischenspeicher nicht (siehe BACKLOG.md).
  const result = spawnSync("npx", ["expo", "export", "--platform", "web", "--clear", "--output-dir", "dist-account"], {
    cwd: APP,
    env: { ...process.env, EXPO_PUBLIC_API_URL: API },
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error("expo export ist fehlgeschlagen");
}

/** Statische Auslieferung von dist-account/ wie `npx expo serve`: unbekannte Pfade bekommen index.html. */
function serveDist() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = path.join(DIST, decodeURIComponent(url.pathname));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function startServer(dataDir) {
  const child = spawn(process.execPath, [path.join(SERVER, "node_modules/tsx/dist/cli.mjs"), "src/index.ts"], {
    cwd: SERVER,
    env: {
      ...process.env,
      PORT: String(PORT),
      USERS_FILE: path.join(dataDir, "users.json"),
      COMMUNITY_FILE: path.join(dataDir, "community.json"),
      FEEDBACK_FILE: path.join(dataDir, "feedback.json"),
      OVERRIDES_FILE: path.join(dataDir, "overrides.json"),
      DIARY_DIR: path.join(dataDir, "diary"),
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "9",
      SMTP_FROM: "foodtracker@example.org",
      ALLOW_DEV_LOGIN: "",
      ANTHROPIC_API_KEY: "",
      OLLAMA_URL: "http://127.0.0.1:9",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server beendet:\n${log}`);
    try {
      const res = await fetch(`${API}/api/auth/config`);
      if (res.ok) return { child, log: () => log };
    } catch {
      // startet noch
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`Server antwortet nicht:\n${log}`);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.error("Playwright fehlt: npm install --no-save playwright && npx playwright install chromium");
    process.exit(2);
  }
  if (!process.argv.includes("--no-build")) build();
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error("Kein dist-account/ – ohne --no-build starten");
    process.exit(2);
  }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodtracker-account-"));
  const api = await startServer(dataDir);
  const web = await serveDist();
  const site = `http://127.0.0.1:${web.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-AT", acceptDownloads: true });
  const page = await context.newPage();
  const failures = [];
  page.on("pageerror", (e) => failures.push(`JavaScript-Fehler: ${e.message}`));
  // Erwartete Fehlerantworten (falsches Passwort usw.) meldet Chromium als „Failed to load resource“.
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && failures.push(`Konsole: ${m.text()}`));

  const email = "nachtschicht@example.org";
  const first = "erstes Passwort mit Sätzen";
  const second = "zweites Passwort 🥕 lang";
  const button = (name) => page.getByRole("button", { name, exact: true });
  const field = (label) => page.getByLabel(label, { exact: true });
  const see = async (text, what) => {
    try {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10_000 });
    } catch {
      throw new Error(`${what}: „${text}“ nicht gefunden`);
    }
  };
  const step = (text) => console.log(`✓ ${text}`);

  try {
    // Umzug: Eine ältere Version speicherte die Anmeldung im übrigen Zustand – sie muss erhalten bleiben und in den
    // eigenen Speicher wandern, ohne dass das Token im übrigen Zustand bleibt.
    const legacy = await (
      await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "aeltere-version@example.org", password: "Passwort aus älterer Version", name: "Ältere Version" }),
      })
    ).json();
    await page.addInitScript((auth) => {
      if (sessionStorage.getItem("e2e-legacy")) return;
      sessionStorage.setItem("e2e-legacy", "1");
      localStorage.setItem("foodtracker/state/v2", JSON.stringify({ deviceId: "e2e-geraet-0000", auth }));
    }, { token: legacy.token, user: legacy.user });
    await page.goto(`${site}/profile`, { waitUntil: "networkidle" });
    await see("Angemeldet als Ältere Version", "Anmeldung aus einer älteren Version");
    await page.waitForTimeout(500);
    const moved = await page.evaluate(() => ({ session: localStorage.getItem("foodtracker.session.v1"), state: localStorage.getItem("foodtracker/state/v2") }));
    if (JSON.parse(moved.session ?? "{}").token !== legacy.token) failures.push("Anmeldung aus einer älteren Version nicht übernommen");
    if (moved.state?.includes(legacy.token)) failures.push("Token steht nach dem Umzug noch im übrigen Zustand");
    await button("Abmelden").click();
    await see("Nicht angemeldet", "Abmelden nach dem Umzug");
    step("Anmeldung aus einer älteren Version übernommen, Token nicht mehr im übrigen Zustand");

    await button("Anmelden oder registrieren").click();
    await page.waitForURL(/\/login$/);
    await button("Registrieren").click();
    await see("Ein Mindestalter gibt es nicht", "Hinweis zur Zustimmung eines Elternteils");
    await field("Name (optional)").fill("Nachtschicht");
    await field("E-Mail").fill("keine-adresse");
    await field("Passwort").fill(first);
    await button("Konto anlegen").click();
    await see("Bitte eine gültige E-Mail-Adresse eingeben.", "Adresse vor dem Absenden");
    await field("E-Mail").fill(email);
    await field("Passwort").fill("zu kurz");
    await button("Konto anlegen").click();
    await see("Das Passwort braucht mindestens 10 Zeichen.", "Passwortlänge vor dem Absenden");
    step("Fehler vor dem Absenden und Hinweis zur Zustimmung eines Elternteils");

    await field("Passwort").fill(first);
    await button("Konto anlegen").click();
    await see("Angemeldet als Nachtschicht", "nach der Registrierung");
    await see("über E-Mail", "Anmeldeart");
    await page.reload({ waitUntil: "networkidle" });
    await see("Angemeldet als Nachtschicht", "nach dem Neuladen");
    const storage = await page.evaluate(() => ({ session: localStorage.getItem("foodtracker.session.v1"), state: localStorage.getItem("foodtracker/state/v2") }));
    if (!storage.session || !JSON.parse(storage.session).token) failures.push("Sitzung fehlt unter foodtracker.session.v1");
    if (storage.state && JSON.parse(storage.state).auth !== undefined) failures.push("Sitzung steht noch im übrigen Zustand");
    step("Registrieren, Anmeldung bleibt nach dem Neuladen (eigener Schlüssel)");

    await button("🔑 Passwort ändern").click();
    await field("Aktuelles Passwort").fill("falsches Passwort 123");
    await field("Neues Passwort").fill(second);
    await button("Neues Passwort speichern").click();
    await see("Das Passwort stimmt nicht.", "falsches aktuelles Passwort");
    await field("Aktuelles Passwort").fill(first);
    await button("Neues Passwort speichern").click();
    await see("Passwort geändert", "Passwort ändern");
    step("Passwort ändern (falsch, dann richtig)");

    await button("Abmelden").click();
    await see("Nicht angemeldet", "nach dem Abmelden");
    if (await page.evaluate(() => localStorage.getItem("foodtracker.session.v1"))) failures.push("Sitzung nach dem Abmelden noch gespeichert");
    await button("Anmelden oder registrieren").click();
    await field("E-Mail").fill(email);
    await field("Passwort").fill(first);
    await button("Anmelden").last().click();
    await see("E-Mail-Adresse oder Passwort stimmt nicht.", "altes Passwort");
    step("Abmelden, altes Passwort gilt nicht mehr");

    await button("Passwort vergessen?").click();
    await see("Wir schicken dir einen Code", "Passwort vergessen");
    await button("Code senden").click();
    await see("Falls es zu dieser Adresse ein Konto gibt", "Code angefordert");
    await field("Code aus der E-Mail").fill("12345678");
    await field("Neues Passwort").fill("drittes Passwort, nie gesetzt");
    await button("Passwort ändern und anmelden").click();
    await see("Der Code stimmt nicht oder ist abgelaufen.", "falscher Code");
    await button("‹ Zurück zur Anmeldung").click();
    step("„Passwort vergessen?“ bis zum falschen Code");

    await field("Passwort").fill(second);
    await button("Anmelden").last().click();
    await see("Angemeldet als Nachtschicht", "neues Passwort");
    step("Anmelden mit dem neuen Passwort");

    const [download] = await Promise.all([page.waitForEvent("download"), button("📦 Meine Daten exportieren").click()]);
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    if (!/^foodtracker-konto-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename())) failures.push(`Dateiname ${download.suggestedFilename()}`);
    if (exported.format !== "foodtracker-account-export" || exported.account?.email !== email) failures.push("Export ohne Konto");
    if (JSON.stringify(exported).includes("scrypt$")) failures.push("Export enthält den Passwort-Hash");
    await see("gespeichert (Downloads)", "Export");
    step("„Meine Daten exportieren“ als JSON ohne Passwort-Hash");

    await button("🗑️ Konto löschen").click();
    await see("Das lässt sich nicht rückgängig machen.", "Rückfrage");
    await field("Zum Bestätigen: dein Passwort").fill(first);
    await button("Konto endgültig löschen").click();
    await see("Das Passwort stimmt nicht.", "falsches Passwort beim Löschen");
    await field("Zum Bestätigen: dein Passwort").fill(second);
    await button("Konto endgültig löschen").click();
    await see("Dein Konto ist gelöscht.", "Konto löschen");
    const users = JSON.parse(fs.readFileSync(path.join(dataDir, "users.json"), "utf8"));
    if (JSON.stringify(users).includes(email)) failures.push("Konto steht nach dem Löschen noch auf dem Server");
    await button("Anmelden oder registrieren").click();
    await field("E-Mail").fill(email);
    await field("Passwort").fill(second);
    await button("Anmelden").last().click();
    await see("E-Mail-Adresse oder Passwort stimmt nicht.", "Anmelden nach dem Löschen");
    step("Konto löschen (falsch, dann richtig), danach keine Anmeldung mehr");
  } catch (e) {
    failures.push(e.message);
    await page.screenshot({ path: path.join(os.tmpdir(), "foodtracker-account-fehler.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    web.close();
    api.child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`\nFehlgeschlagen:\n- ${failures.join("\n- ")}`);
    console.error(`Bildschirmfoto: ${path.join(os.tmpdir(), "foodtracker-account-fehler.png")}`);
    process.exit(1);
  }
  console.log("Konto-Test bestanden.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
