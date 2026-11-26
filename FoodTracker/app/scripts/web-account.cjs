// Ende-zu-Ende-Test der Konten mit E-Mail und Passwort im Browser (headless Chromium über Playwright), mit echtem
// Server auf einem eigenen Port und leeren Daten in einem Temp-Ordner:
//
//   npm run web:account               # baut die Web-Version für diesen Server (dist-account/), startet ihn und
//                                     # spielt durch: Umzug der Anmeldung aus einer älteren Version (Token danach
//                                     # nicht mehr im übrigen Zustand), Fehler vor dem Absenden (Adresse, kurzes Passwort), Hinweis zur
//                                     # Zustimmung eines Elternteils, Registrieren (Sterne, die das Gerät ohne Konto
//                                     # vergeben hat, gehören danach dem Konto), Anmeldung bleibt nach dem Neuladen
//                                     # (eigener Schlüssel, nicht im übrigen Zustand), Passwort ändern (falsch/richtig),
//                                     # Abmelden, Anmelden mit altem und neuem Passwort, „Passwort vergessen?“ bis zum
//                                     # falschen Code, „Meine Daten exportieren“, Konto löschen (falsch/richtig);
//                                     # dabei die Sicherung des Tagebuchs in der Datenbank (Umzug einer Datei aus
//                                     # data/diary/ beim Start, Eintrag vom Gerät landet im Konto, im Export und ist
//                                     # nach dem Löschen weg); vorher der Umzug von Community-Rezepten, Fotos mit
//                                     # Sternen und Admin-Änderungen aus den JSON-Dateien älterer Fassungen: Fotos
//                                     # liegen danach als Dateien im Bildspeicher, die App zeigt sie vom Server
//                                     # (Galerie, Rezeptbild, „Aus der Community“) und die geänderten Katalogrezepte;
//                                     # danach die Einwilligung vor den KI-Funktionen: „Nicht jetzt“ schickt nichts,
//                                     # „Einverstanden“ schickt mit Header (der Server ohne KI meldet das), danach
//                                     # keine Frage mehr, ohne Header lehnt der Server ab, Widerruf im Profil, dann
//                                     # fragt die App wieder; „Mindestalter“ in der Datenschutzerklärung
//   npm run web:account -- --no-build # mit dem vorhandenen dist-account/
//
// Der Server bekommt SMTP_HOST auf einen Port, an dem niemand lauscht: So erscheint „Passwort vergessen?“, die Mail
// selbst geht ins Leere (der Server meldet das nur im eigenen Protokoll). Playwright wie bei web-smoke.cjs.
// Schlägt fehl (Exit-Code 1), sobald ein Schritt nicht klappt oder eine Seite einen JavaScript-Fehler wirft.
const { Buffer } = require("node:buffer");
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

/** Wie viele Datensätze des Abgleichs (z. B. Tagebuch) ein Besitzer in der Datenbank des Test-Servers hat. */
function syncRecordsOf(file, owner) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return Number(db.prepare("SELECT COUNT(*) AS n FROM sync_records WHERE owner = ?").get(owner).n);
  } finally {
    db.close();
  }
}

/** Sicherung eines Tagebuchs, wie sie Server bis 27.11.2026 unter data/diary/ ablegten (eine Datei pro Besitzer). */
function writeLegacyDiary(dir, owner, entry) {
  fs.mkdirSync(dir, { recursive: true });
  const name = `${require("node:crypto").createHash("sha256").update(owner).digest("hex").slice(0, 40)}.json`;
  const record = { id: entry.id, updatedAt: entry.updatedAt, entry, rev: 1 };
  fs.writeFileSync(path.join(dir, name), JSON.stringify({ owner, rev: 1, records: { [entry.id]: record } }));
}

/**
 * Community-Rezepte, Fotos mit Sternen und Admin-Änderungen, wie sie Server bis 27.11.2026 in JSON-Dateien ablegten –
 * die Fotos als data-URI mittendrin. `jpeg` ist ein echtes kleines JPEG (im Browser gezeichnet), damit es sich anzeigen lässt.
 */
function writeLegacyCommunityFiles(dir, jpeg) {
  const recipe = {
    id: "community_e2e-geteilt-1",
    language: "de",
    name: "Bärlauch-Spätzle aus der alten Datei",
    steps: ["Spätzle kochen", "Mit Bärlauch schwenken"],
    otherIngredients: [],
    mealTypes: ["dinner"],
    ingredients: [{ ingredientId: "kartoffeln", amount: 300 }],
    cookMinutes: 25,
    tags: [],
    source: { kind: "community", communityId: "e2e-geteilt-1", author: "Alte Fassung" },
    media: { image: { uri: jpeg } },
  };
  const at = "2026-11-20T18:00:00.000Z";
  fs.writeFileSync(path.join(dir, "community.json"), JSON.stringify([{ id: "e2e-geteilt-1", recipe, authorId: "e2e-autorin-0001", authorName: "Alte Fassung", createdAt: at, likedBy: ["e2e-fan-00000001"] }]));
  fs.writeFileSync(
    path.join(dir, "feedback.json"),
    JSON.stringify({
      photos: [{ id: "e2e-foto-1", recipeId: "shakshuka", authorId: "e2e-autorin-0001", authorName: "Alte Fassung", uri: jpeg, createdAt: at, ratings: { "e2e-fan-00000001": 5 } }],
      recipeRatings: { shakshuka: { "e2e-fan-00000001": 5 } },
      flags: [{ id: "e2e-meldung-1", recipeId: "linsen_dal", authorId: "e2e-fan-00000001", reason: "text", note: "aus der alten Datei", createdAt: at }],
    }),
  );
  fs.writeFileSync(path.join(dir, "overrides.json"), JSON.stringify({ kaiserschmarrn: { patch: { name: "Kaiserschmarrn vom Admin" }, updatedBy: "Chefin", updatedAt: at } }));
}

/** Wie viele Konten mit dieser Adresse in der Datenbank des Test-Servers stehen (zweite Verbindung, nur lesend). */
function accountsWith(file, email) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return Number(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?").get(email).n);
  } finally {
    db.close();
  }
}

async function startServer(dataDir) {
  const child = spawn(process.execPath, [path.join(SERVER, "node_modules/tsx/dist/cli.mjs"), "src/index.ts"], {
    cwd: SERVER,
    env: {
      ...process.env,
      PORT: String(PORT),
      // Eigene, leere Datenbank – nie die echte (server/data/foodtracker.db oder DATABASE_URL aus server/.env).
      DATABASE_FILE: path.join(dataDir, "foodtracker.db"),
      DATABASE_URL: "",
      // Auch die Datei für den Umzug alter Konten im Temp-Ordner – sonst übernähme (und löschte) der Test-Server eine
      // echte server/data/users.json.
      USERS_FILE: path.join(dataDir, "users.json"),
      COMMUNITY_FILE: path.join(dataDir, "community.json"),
      FEEDBACK_FILE: path.join(dataDir, "feedback.json"),
      OVERRIDES_FILE: path.join(dataDir, "overrides.json"),
      DIARY_DIR: path.join(dataDir, "diary"),
      PHOTOS_DIR: path.join(dataDir, "photos"),
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
  // Ein Gerät, das seine Historie noch bei einer älteren Fassung gesichert hat (Datei statt Datenbank).
  const nutrients = { kcal: 640, protein: 24, carbs: 72, fat: 22 };
  const oldDevice = "e2e-alt-geraet-0001";
  writeLegacyDiary(path.join(dataDir, "diary"), `device:${oldDevice}`, {
    id: "alt-datei-1",
    date: "2026-11-19",
    time: "18:30",
    title: "Krautfleckerl",
    nutrients,
    source: "plan",
    updatedAt: "2026-11-19T17:30:00.000Z",
  });
  // Ein echtes kleines JPEG, im Browser gezeichnet – für die Fotos in den JSON-Dateien älterer Fassungen.
  const browser = await chromium.launch();
  const painter = await browser.newPage();
  const jpeg = await painter.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const g = canvas.getContext("2d");
    g.fillStyle = "#E07A2F";
    g.fillRect(0, 0, 160, 90);
    g.fillStyle = "#2E7D32";
    g.fillRect(40, 20, 80, 50);
    return canvas.toDataURL("image/jpeg", 0.8);
  });
  await painter.close();
  writeLegacyCommunityFiles(dataDir, jpeg);
  const api = await startServer(dataDir);
  const web = await serveDist();
  const site = `http://127.0.0.1:${web.address().port}`;
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

  // Jeder Abgleich des Tagebuchs muss klappen (401 nur, wenn eine Sitzung gerade endet).
  page.on("response", (r) => r.url().includes("/api/diary/sync") && r.status() !== 200 && r.status() !== 401 && failures.push(`Abgleich des Tagebuchs: HTTP ${r.status()}`));
  const diaryOf = async (headers) => {
    const res = await fetch(`${API}/api/diary/sync`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ since: 0, changes: [] }) });
    return res.ok ? (await res.json()).changes : [];
  };

  try {
    // Umzug beim Start: Die Datei der älteren Fassung ist in der Datenbank und danach gelöscht.
    if (!/Sicherung der Ernährungshistorie aus .* übernommen: 1 Konto bzw\. Gerät mit 1 Eintrag/.test(api.log())) failures.push(`Umzug aus data/diary/ nicht gemeldet:\n${api.log()}`);
    if (fs.existsSync(path.join(dataDir, "diary"))) failures.push("data/diary/ liegt nach dem Umzug noch da");
    const fromFile = await diaryOf({ "X-Device-Id": oldDevice });
    if (fromFile.length !== 1 || fromFile[0].entry?.title !== "Krautfleckerl" || fromFile[0].updatedAt !== "2026-11-19T17:30:00.000Z") failures.push(`Tagebuch aus der Datei: ${JSON.stringify(fromFile)}`);
    step("Sicherung des Tagebuchs beim Start aus data/diary/ in die Datenbank übernommen");

    // Umzug beim Start: Community-Rezepte, Fotos mit Sternen und Admin-Änderungen aus den JSON-Dateien, Fotos als Dateien.
    const log = api.log();
    if (!/Community-Rezepte aus .* übernommen: 1 Rezept mit 1 Favorit, 1 Foto jetzt als Datei/.test(log)) failures.push(`Umzug aus community.json nicht gemeldet:\n${log}`);
    if (!/Fotos, Sterne und Meldungen aus .* übernommen: 1 Foto .*, 2 Bewertungen, 1 Meldung\./.test(log)) failures.push(`Umzug aus feedback.json nicht gemeldet:\n${log}`);
    if (!/Admin-Änderungen an Katalogrezepten aus .* übernommen: 1 Rezept\./.test(log)) failures.push(`Umzug aus overrides.json nicht gemeldet:\n${log}`);
    for (const name of ["community.json", "feedback.json", "overrides.json"]) if (fs.existsSync(path.join(dataDir, name))) failures.push(`${name} liegt nach dem Umzug noch da`);
    const photoFiles = fs.existsSync(path.join(dataDir, "photos")) ? fs.readdirSync(path.join(dataDir, "photos")) : [];
    if (photoFiles.length !== 2 || !photoFiles.every((f) => f.endsWith(".jpg"))) failures.push(`Fotos im Bildspeicher: ${JSON.stringify(photoFiles)}`);
    const headers = { "X-Device-Id": "e2e-fan-00000001" };
    const [gallery] = await (await fetch(`${API}/api/recipes/shakshuka/photos`, { headers })).json();
    const [shared] = await (await fetch(`${API}/api/community/recipes`, { headers })).json();
    const sharedImage = shared?.recipe?.media?.image?.uri ?? "";
    if (gallery?.id !== "e2e-foto-1" || !gallery.uri?.startsWith("/api/images/") || gallery.myRating !== 5) failures.push(`Foto aus feedback.json: ${JSON.stringify(gallery)}`);
    if (shared?.id !== "e2e-geteilt-1" || !sharedImage.startsWith("/api/images/") || shared.likes !== 1) failures.push(`Rezept aus community.json: ${JSON.stringify(shared)?.slice(0, 300)}`);
    const served = await fetch(`${API}${gallery?.uri}`);
    if (!served.ok || served.headers.get("content-type") !== "image/jpeg" || Buffer.from(await served.arrayBuffer()).toString("base64") !== jpeg.split(",")[1]) {
      failures.push(`Foto vom Server: HTTP ${served.status} ${served.headers.get("content-type")}`);
    }
    step("Community-Rezepte, Fotos mit Sternen und Admin-Änderungen beim Start aus den JSON-Dateien übernommen, Fotos als Dateien");

    // Die App zeigt die Fotos vom Server: Galerie und Rezeptbild (bestbewertetes Foto), Foto des geteilten Rezepts.
    // Eigener Browser-Kontext, damit der Umzug der Anmeldung unten mit einem frischen Speicher beginnt.
    const photoContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-AT" });
    const photoPage = await photoContext.newPage();
    photoPage.on("pageerror", (e) => failures.push(`JavaScript-Fehler (Fotos): ${e.message}`));
    const loadedImages = new Set();
    photoPage.on("response", (r) => r.url().startsWith(`${API}/api/images/`) && r.status() === 200 && loadedImages.add(r.url().slice(API.length)));
    const waitForImage = async (uri, what) => {
      for (let i = 0; i < 50 && !loadedImages.has(uri); i++) await photoPage.waitForTimeout(200);
      if (!loadedImages.has(uri)) failures.push(`${what}: ${uri} nicht vom Server geladen (geladen: ${JSON.stringify([...loadedImages])})`);
    };
    const shownImage = (uri) =>
      photoPage.evaluate((src) => [...document.querySelectorAll("img")].some((img) => img.src === src && img.complete && img.naturalWidth === 160), `${API}${uri}`);
    await photoPage.goto(`${site}/recipe/shakshuka`, { waitUntil: "networkidle" });
    await photoPage.getByText("von Alte Fassung", { exact: false }).first().waitFor({ timeout: 10_000 }).catch(() => failures.push("Foto in der Galerie ohne Namen"));
    await waitForImage(gallery?.uri, "Foto in der Galerie");
    if (!(await shownImage(gallery?.uri))) failures.push("Foto in der Galerie nicht angezeigt");
    await photoPage.goto(`${site}/recipes`, { waitUntil: "networkidle" });
    await photoPage.getByText("Entdecken", { exact: true }).click();
    await photoPage.getByText("Bärlauch-Spätzle aus der alten Datei", { exact: true }).waitFor({ timeout: 10_000 }).catch(() => failures.push("Geteiltes Rezept fehlt unter „Aus der Community“"));
    await waitForImage(sharedImage, "Foto des geteilten Rezepts");
    await photoPage.getByPlaceholder("Rezepte suchen", { exact: true }).fill("vom Admin").catch(() => undefined);
    await photoPage.getByText("Kaiserschmarrn vom Admin", { exact: true }).first().waitFor({ timeout: 10_000 }).catch(() => failures.push("Admin-Änderung am Katalogrezept nicht in der App"));
    await photoContext.close();
    step("App zeigt die Fotos vom Server (Galerie, Foto des geteilten Rezepts) und die Admin-Änderung am Katalog");

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
      // Dazu ein Eintrag im Tagebuch, wie es die App bis November 2026 im übrigen Zustand speicherte.
      const diary = [{ id: "e2e-tagebuch-1", date: "2026-11-20", time: "12:15", title: "Kaspressknödel", nutrients: { kcal: 640, protein: 24, carbs: 72, fat: 22 }, source: "manuell" }];
      localStorage.setItem("foodtracker/state/v2", JSON.stringify({ deviceId: "e2e-geraet-0000", auth, diary }));
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

    // Vor der Registrierung hat das Gerät ohne Konto ein Rezept bewertet – danach gehören die Sterne dem neuen Konto.
    const { deviceId } = await page.evaluate(() => JSON.parse(localStorage.getItem("foodtracker/state/v2") ?? "{}"));
    const rated = await fetch(`${API}/api/recipes/shakshuka/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId ?? "" },
      body: JSON.stringify({ stars: 4 }),
    });
    if (!rated.ok) failures.push(`Bewerten ohne Konto: HTTP ${rated.status}`);

    await field("Passwort").fill(first);
    await button("Konto anlegen").click();
    await see("Angemeldet als Nachtschicht", "nach der Registrierung");
    await see("über E-Mail", "Anmeldeart");
    await see("gehört jetzt zu deinem Konto", "Hinweis nach der Übernahme der Gerätedaten");
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem("foodtracker.session.v1") ?? "{}").token);
    const ratings = await (await fetch(`${API}/api/recipes/ratings`, { headers: { "X-Device-Id": deviceId ?? "", Authorization: `Bearer ${token}` } })).json();
    if (ratings.shakshuka?.mine !== 4) failures.push(`Sterne ohne Konto nicht im Konto: ${JSON.stringify(ratings.shakshuka)}`);
    step("Gerätedaten beim Registrieren ins Konto übernommen (Sterne ohne Konto gehören dem Konto, Hinweis im Profil)");
    // Das Tagebuch des Geräts kommt im Hintergrund ins Konto (Übernahme bzw. erster Abgleich mit dem Konto).
    const account = await (await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (!account.id) failures.push(`Konto nicht abrufbar: ${JSON.stringify(account)}`);
    let inAccount = [];
    for (let i = 0; i < 50 && !inAccount.some((r) => r.id === "e2e-tagebuch-1"); i++) {
      await page.waitForTimeout(200);
      inAccount = await diaryOf({ "X-Device-Id": "e2e-geraet-0001", Authorization: `Bearer ${token}` });
    }
    if (inAccount.find((r) => r.id === "e2e-tagebuch-1")?.entry?.title !== "Kaspressknödel") failures.push(`Tagebuch nicht im Konto: ${JSON.stringify(inAccount)}`);
    step("Tagebuch vom Gerät in der Datenbank beim Konto");
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
    if (!exported.diary?.some((e) => e.id === "e2e-tagebuch-1" && e.title === "Kaspressknödel")) failures.push(`Export ohne Tagebuch: ${JSON.stringify(exported.diary)}`);
    await see("gespeichert (Downloads)", "Export");
    step("„Meine Daten exportieren“ als JSON ohne Passwort-Hash, mit Tagebuch");

    await button("🗑️ Konto löschen").click();
    await see("Das lässt sich nicht rückgängig machen.", "Rückfrage");
    await field("Zum Bestätigen: dein Passwort").fill(first);
    await button("Konto endgültig löschen").click();
    await see("Das Passwort stimmt nicht.", "falsches Passwort beim Löschen");
    await field("Zum Bestätigen: dein Passwort").fill(second);
    await button("Konto endgültig löschen").click();
    await see("Dein Konto ist gelöscht.", "Konto löschen");
    if (accountsWith(path.join(dataDir, "foodtracker.db"), email) !== 0) failures.push("Konto steht nach dem Löschen noch auf dem Server");
    if (syncRecordsOf(path.join(dataDir, "foodtracker.db"), `user:${account.id}`) !== 0) failures.push("Tagebuch des Kontos steht nach dem Löschen noch auf dem Server");
    await button("Anmelden oder registrieren").click();
    await field("E-Mail").fill(email);
    await field("Passwort").fill(second);
    await button("Anmelden").last().click();
    await see("E-Mail-Adresse oder Passwort stimmt nicht.", "Anmelden nach dem Löschen");
    step("Konto löschen (falsch, dann richtig), danach keine Anmeldung und kein Tagebuch des Kontos mehr");

    // Einwilligung vor den KI-Funktionen: Ohne „Einverstanden“ geht keine KI-Anfrage an den Server.
    const improveRequests = [];
    page.on("request", (r) => r.url().includes("/api/recipes/improve") && improveRequests.push(r.headers()["x-ai-consent"] ?? null));
    const dialogTitle = () => page.getByText("KI-Funktionen erlauben?", { exact: true });
    const improveButton = () => button("✨ Text mit KI verbessern");
    await page.goto(`${site}/recipe/shakshuka`, { waitUntil: "networkidle" });
    await improveButton().click();
    await see("KI-Funktionen erlauben?", "Frage vor der ersten KI-Funktion");
    await see("Zum Verbessern schickt FoodTracker", "was an die KI geht");
    await see("Bist du unter 14, brauchst du dafür die Zustimmung eines Elternteils", "Hinweis zur Zustimmung eines Elternteils vor der KI");
    await see("willigst du ausdrücklich ein", "ausdrückliche Einwilligung für Gesundheitsangaben");
    await button("Nicht jetzt").click();
    await dialogTitle().waitFor({ state: "hidden", timeout: 5_000 });
    await page.waitForTimeout(300);
    if (improveRequests.length > 0) failures.push(`„Nicht jetzt“ hat trotzdem ${improveRequests.length} KI-Anfrage(n) geschickt`);
    step("„Nicht jetzt“: Dialog zu, keine KI-Anfrage");

    await improveButton().click();
    await see("KI-Funktionen erlauben?", "Frage nach „Nicht jetzt“ erneut");
    await button("Einverstanden").click();
    // Der Testserver hat keine KI: Die Anfrage kommt an (mit Einwilligung) und meldet das.
    await see("Auf dem Server ist keine KI eingerichtet", "KI-Anfrage nach der Einwilligung");
    if (improveRequests.length !== 1 || improveRequests[0] !== "1") failures.push(`Nach „Einverstanden“: ${JSON.stringify(improveRequests)}`);
    const consent = await page.evaluate(() => JSON.parse(localStorage.getItem("foodtracker/state/v2") ?? "{}").aiConsent);
    if (consent?.version !== 1 || Number.isNaN(Date.parse(consent?.at))) failures.push(`Einwilligung nicht gespeichert: ${JSON.stringify(consent)}`);
    await improveButton().click();
    await page.waitForTimeout(500);
    if (await dialogTitle().isVisible()) failures.push("Nach der Einwilligung wird trotzdem wieder gefragt");
    if (improveRequests.length !== 2) failures.push(`Zweite KI-Anfrage fehlt: ${JSON.stringify(improveRequests)}`);
    const withoutHeader = await fetch(`${API}/api/recipes/improve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": "e2e-geraet-0001" },
      body: JSON.stringify({ text: { name: "Shakshuka" }, ingredients: [{ name: "Eier", amount: "4" }], cookMinutes: 20 }),
    });
    if (withoutHeader.status !== 403 || (await withoutHeader.json()).error !== "ai_consent_required") failures.push(`Server ohne Einwilligung: HTTP ${withoutHeader.status}`);
    step("„Einverstanden“: Anfrage mit Einwilligung (Server ohne KI meldet das), danach keine Frage mehr; ohne Header lehnt der Server ab");

    await page.goto(`${site}/profile`, { waitUntil: "networkidle" });
    await see("Erlaubt seit", "Einwilligung im Profil");
    await button("Erlaubnis widerrufen").click();
    await see("Widerrufen. Vor der nächsten KI-Funktion fragt FoodTracker wieder.", "Widerruf im Profil");
    await page.waitForTimeout(300);
    if (await page.evaluate(() => JSON.parse(localStorage.getItem("foodtracker/state/v2") ?? "{}").aiConsent)) failures.push("Einwilligung nach dem Widerruf noch gespeichert");
    await page.goto(`${site}/recipe/shakshuka`, { waitUntil: "networkidle" });
    await improveButton().click();
    await see("KI-Funktionen erlauben?", "Frage nach dem Widerruf");
    await button("§ Datenschutzerklärung").click();
    await page.waitForURL(/\/legal$/);
    await see("FoodTracker hat kein Mindestalter", "Abschnitt Mindestalter (mit Server)");
    if (improveRequests.length !== 2) failures.push(`Nach dem Widerruf trotzdem gesendet: ${JSON.stringify(improveRequests)}`);
    step("Widerruf im Profil, danach fragt die App wieder; „Mindestalter“ in der Datenschutzerklärung");
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
