// Rauchtest der Web-Version im Browser (headless Chromium über Playwright).
//
//   npm run web:export                # baut die statische Web-Version nach dist/
//   npm run web:smoke                 # öffnet jede Seite und spielt Fragebogen → Monatsplan → Einkauf (zwei Zeilen
//                                     # abhaken, „Abgehaktes in den Vorrat“, „Liefern lassen“ zeigt „Bald verfügbar“)
//                                     # → Vorrat durch, danach „Entdecken“ (Community „Bald verfügbar“) und Tauschen
//                                     # (zuerst 30 Rezepte, nicht alle Fotos auf einmal), zuletzt „Bald verfügbar“
//                                     # im Rezept, im Profil, bei der Anmeldung und beim Übersetzen (Französisch),
//                                     # Videos je Sprache (Deutsch, Englisch, sonst die YouTube-Suche),
//                                     # dann die Ernährungshistorie: Umzug aus dem alten Speicherort, „Alles“,
//                                     # Export (JSON, CSV), Import nach gelöschten Browserdaten ohne Duplikate und
//                                     # der Hinweis bei vollem Speicher
//   npm run web:pages && npm run web:smoke -- dist-pages   # dasselbe für GitHub Pages (Unterpfad /Bennitut)
//
// Den Unterpfad erkennt der Test selbst an den Skript-Pfaden in index.html. Gibt es eine 404.html, verhält sich
// der Testserver wie GitHub Pages: unbekannte Adressen bekommen 404.html mit Status 404, alles außerhalb des
// Unterpfads ist nicht erreichbar. Zusätzlich prüft er dann Web-App-Manifest und Symbole unter dem Unterpfad.
//
// Playwright ist keine Abhängigkeit der App (in der Cloud-Sitzung ist es vorinstalliert). Lokal im App-Ordner:
//   npm install --no-save playwright && npx playwright install chromium
// Schlägt fehl (Exit-Code 1), sobald eine Seite einen JavaScript-Fehler wirft oder der Ablauf hängt.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// npm-Skripte laufen im App-Ordner; dort legt `expo export` den Ordner dist/ an.
const DIST = path.resolve(process.argv[2] ?? "dist");
const ROUTES = ["/", "/scan", "/plan", "/recipes", "/pantry", "/shopping", "/profile", "/onboarding", "/settings", "/login", "/recipe/edit", "/recipe/import", "/admin", "/users"];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".ttf": "font/ttf", ".svg": "image/svg+xml" };

/** Unterpfad aus den Skript-Pfaden von index.html, z. B. "/Bennitut" – oder "" für die Wurzel. */
function detectBase(root) {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  return html.match(/src="([^"]*)\/_expo\/static\/js\/web\//)?.[1] ?? "";
}

/** Katalogvideos einer Sprache aus server/src/data/videos/<sprache>.ts: Rezept-ID → { youtubeId, channel }. */
function videoTable(language) {
  const file = path.resolve(__dirname, "../../server/src/data/videos", `${language}.ts`);
  const table = new Map();
  for (const m of fs.readFileSync(file, "utf8").matchAll(/^ {2}(\w+): \{ youtubeId: "([\w-]+)", title: "(?:[^"\\]|\\.)*", channel: ("(?:[^"\\]|\\.)*") \},$/gm)) {
    table.set(m[1], { youtubeId: m[2], channel: JSON.parse(m[3]) });
  }
  return table;
}

/** Ein Rezept mit Video in der einen Sprache und ohne in der anderen (als Liste, leer wenn es keins gibt). */
function pickRecipe(has, lacks) {
  const id = [...has.keys()].find((recipeId) => !lacks.has(recipeId));
  return id ? [id] : [];
}

/**
 * Statischer Server. Ohne 404.html: Fallback auf index.html, wie bei einer Single-Page-App üblich.
 * Mit 404.html: wie GitHub Pages – unbekannte Adressen bekommen 404.html mit Status 404
 * (aufgerufene Seiten landen in `served404`).
 */
function serve(root, base, served404) {
  const notFound = path.join(root, "404.html");
  const pagesMode = fs.existsSync(notFound);
  const server = http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (base) {
      if (pathname === base) {
        res.writeHead(301, { Location: `${base}/` });
        return res.end();
      }
      if (!pathname.startsWith(`${base}/`)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(`Außerhalb von ${base}/ gibt es nichts.`);
      }
      pathname = pathname.slice(base.length);
    }
    let file = path.join(root, pathname);
    let status = 200;
    if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      if (pagesMode) {
        file = notFound;
        status = 404;
        // Nur Seitenaufrufe (Direktlinks) sind erwartet; fehlende Bilder oder Skripte bleiben Fehler.
        if (req.headers["sec-fetch-dest"] === "document") served404.add(new URL(req.url, "http://localhost").pathname);
      } else {
        file = path.join(root, "index.html");
      }
    }
    res.writeHead(status, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, pagesMode })));
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.error("Playwright fehlt: npm install --no-save playwright && npx playwright install chromium");
    process.exit(2);
  }
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error(`Kein Web-Export in ${DIST} – zuerst npm run web:export`);
    process.exit(2);
  }

  const base = detectBase(DIST);
  const served404 = new Set();
  const { server, pagesMode } = await serve(DIST, base, served404);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const site = origin + base;
  console.log(`Teste ${path.relative(process.cwd(), DIST) || "."}/ unter ${base || ""}/${pagesMode ? " wie auf GitHub Pages (404.html)" : ""}.`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-AT" });
  const failures = [];

  // Bei GitHub Pages kommen Direktlinks wie /plan absichtlich als 404.html mit Status 404 – das meldet Chromium
  // als „Failed to load resource“. Nur diese Meldung für genau diese Adressen ist erwartet.
  const expected404 = (m) => /status of 404/.test(m.text()) && served404.has(new URL(m.location().url || origin, origin).pathname);
  const watch = (page, route) => {
    page.on("pageerror", (e) => failures.push(`${route}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !expected404(m) && failures.push(`${route}: ${m.text()}`));
  };
  const open = async (route) => {
    const page = await context.newPage();
    watch(page, route);
    await page.goto(site + route, { waitUntil: "networkidle" });
    return page;
  };

  // Jede Seite muss die eigene Ansicht zeigen, nicht „Unmatched Route“ (z. B. wenn der Unterpfad nicht passt).
  const unmatched = (page) => page.locator('[data-testid="expo-router-unmatched"]').count();
  for (const route of ROUTES) {
    const page = await open(route);
    await page.waitForTimeout(500);
    if (await unmatched(page)) failures.push(`${route}: „Unmatched Route“ statt der Seite`);
    await page.close();
  }
  const missing = await open("/gibt-es-nicht");
  if (!(await unmatched(missing))) failures.push("/gibt-es-nicht: keine „Unmatched Route“ – die Prüfung oben greift nicht");
  await missing.close();
  console.log(`${ROUTES.length} Seiten geöffnet.`);

  if (pagesMode) {
    // Web-App-Manifest, Symbole und Startadresse müssen unter dem Unterpfad liegen und erreichbar sein.
    const page = await open("/");
    try {
      const links = await page.evaluate(() => ({
        manifest: document.querySelector('link[rel="manifest"]')?.href,
        touchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.href,
      }));
      const fetchOk = async (url, type) => {
        const res = await page.request.get(url);
        if (res.status() !== 200 || !(res.headers()["content-type"] ?? "").startsWith(type)) throw new Error(`${url}: Status ${res.status()}, ${res.headers()["content-type"]}`);
        return res;
      };
      const manifest = await (await fetchOk(links.manifest, "application/json")).json();
      for (const key of ["start_url", "scope"]) if (!manifest[key]?.startsWith(`${base}/`)) throw new Error(`manifest.json: ${key} = ${manifest[key]}`);
      for (const icon of manifest.icons) await fetchOk(new URL(icon.src, links.manifest).href, "image/png");
      await fetchOk(links.touchIcon, "image/png");
      await fetchOk(new URL(manifest.start_url, origin).href, "text/html");
      console.log(`Manifest, ${manifest.icons.length + 1} Symbole und Startadresse ${manifest.start_url} erreichbar.`);
    } catch (e) {
      failures.push(`Manifest: ${e.message.split("\n")[0]}`);
    }
    await page.close();
  }

  // Hauptablauf ohne Server: Fragebogen → Monatsplan → Einkaufsliste → Vorrat → Neuladen.
  const page = await open("/plan");
  const tap = async (text) => {
    await page.getByText(text, { exact: true }).last().click();
    await page.waitForTimeout(300);
  };
  try {
    await tap("Fragen beantworten");
    for (let i = 0; i < 5; i++) await tap("Weiter");
    const started = Date.now();
    await tap("Monatsplan erstellen");
    await page.getByText(/^Woche 1/).first().waitFor({ timeout: 60_000 });
    console.log(`Monatsplan in ${((Date.now() - started) / 1000).toFixed(1)} s erstellt.`);
    await tap("Einkauf");
    await page.getByText(/Einkauf Woche 1/).first().waitFor({ timeout: 10_000 });
    const shoppingPath = new URL(page.url()).pathname;
    if (shoppingPath !== `${base}/shopping`) throw new Error(`Tab „Einkauf“ führt zu ${shoppingPath} statt ${base}/shopping`);
    // Zwei Zeilen abhaken und mit „Abgehaktes in den Vorrat“ buchen; danach ist nichts mehr zu buchen (nichts doppelt).
    const rows = page.getByRole("checkbox");
    await rows.nth(0).click();
    await rows.nth(1).click();
    await tap("🧺 Abgehaktes in den Vorrat (2)");
    await page.getByText("✓ 2 Lebensmittel in den Vorrat gebucht.", { exact: true }).waitFor({ timeout: 5_000 });
    await page.getByText("🧺 Abgehaktes in den Vorrat (0)", { exact: true }).waitFor({ timeout: 5_000 });
    // Ohne Server: „Liefern lassen“ zeigt „Bald verfügbar“ statt „Keine Verbindung zum Server.“
    await page.getByText("🚧 Bald verfügbar", { exact: true }).waitFor({ timeout: 5_000 });
    if (await page.getByText("Keine Verbindung zum Server.", { exact: true }).count()) throw new Error("„Liefern lassen“ zeigt „Keine Verbindung zum Server.“");
    await tap("Vorrat");
    const stocked = () => page.getByText("2 Lebensmittel", { exact: true }).first().waitFor({ timeout: 10_000 });
    await stocked();
    await page.reload({ waitUntil: "networkidle" });
    await stocked();
    await page.goto(site + "/plan", { waitUntil: "networkidle" });
    await page.getByText(/^Woche 1/).first().waitFor({ timeout: 10_000 });
    console.log("Ablauf Fragebogen → Plan → Einkauf → Vorrat ok: 2 abgehakte Zeilen gebucht, „Liefern lassen“ zeigt „Bald verfügbar“, Plan und Vorrat bleiben nach dem Neuladen.");
  } catch (e) {
    failures.push(`Ablauf: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: path.join(DIST, "web-smoke-fehler.png") }).catch(() => {});
  }

  // Lange Listen („Entdecken“, Tauschen im Plan) zeigen zuerst 30 Rezepte – jede Zeile lädt ein Foto.
  try {
    const photos = new Set();
    page.on("request", (r) => r.resourceType() === "image" && r.url().startsWith("https://") && photos.add(r.url()));
    const more = (shown) => page.getByText(new RegExp(`^Mehr anzeigen \\(${shown} von \\d+\\)$`));
    await tap("Rezepte");
    photos.clear();
    await tap("Entdecken");
    await page.getByText("FoodTracker-Rezepte", { exact: true }).waitFor({ timeout: 10_000 });
    // Ohne Server: „Aus der Community“ zeigt „Bald verfügbar“ statt „… konnten nicht geladen werden.“
    await page.getByText(/^Rezepte anderer entdecken und eigene teilen kommt bald\./).waitFor({ timeout: 5_000 });
    await page.waitForTimeout(1500);
    if (await page.getByText(/konnten nicht geladen werden/).count()) throw new Error("„Entdecken“ meldet, dass Community-Rezepte nicht geladen werden konnten");
    if (photos.size > 30) throw new Error(`„Entdecken“ lädt ${photos.size} Fotos auf einmal`);
    const first = photos.size;
    await more(30).waitFor({ timeout: 5_000 });
    await more(30).click();
    await more(60).waitFor({ timeout: 5_000 });
    await tap("Plan");
    await tap("⇄ Tauschen");
    // Der Tab „Rezepte“ bleibt geladen; der Dialog liegt im Dokument dahinter.
    await more(30).last().waitFor({ timeout: 5_000 });
    await tap("Schließen");
    console.log(`„Entdecken“ zeigt für die Community „Bald verfügbar“, lädt zuerst ${first} Fotos, „Mehr anzeigen“ zeigt weitere; Tauschen ebenso.`);
  } catch (e) {
    failures.push(`Lange Listen: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: path.join(DIST, "web-smoke-fehler.png") }).catch(() => {});
  }

  // Ohne Server: Rezept (Bewerten, Melden, KI-Text), Plan (KI-Wünsche), Profil und Anmeldung zeigen „Bald verfügbar“
  // bzw. blenden das Eingabefeld aus, statt „Keine Verbindung zum Server.“ zu melden.
  try {
    const absent = async (target, text, what) => {
      if (await target.getByText(text, typeof text === "string" ? { exact: true } : undefined).count()) throw new Error(what);
    };
    await page.goto(site + "/recipe/linsen_bolognese", { waitUntil: "networkidle" });
    await page.getByText(/^Rezepte bewerten, Probleme melden und Texte mit KI verbessern – das kommt bald\./).waitFor({ timeout: 10_000 });
    await absent(page, "Wie gefällt dir das Rezept?", "Rezept zeigt ohne Server die Sterne zum Bewerten");
    await absent(page, "⚠️ Problem melden", "Rezept zeigt ohne Server „Problem melden“");
    await absent(page, "Keine Verbindung zum Server.", "Rezept zeigt „Keine Verbindung zum Server.“");
    await page.goto(site + "/plan", { waitUntil: "networkidle" });
    await page.getByText(/^Woche 1/).first().waitFor({ timeout: 10_000 });
    if (await page.getByPlaceholder(/Wünsche für neue KI-Rezepte/).count()) throw new Error("Plan zeigt ohne Server das Feld für KI-Wünsche");
    await page.goto(site + "/profile", { waitUntil: "networkidle" });
    await page.getByText(/^Die Anmeldung kommt bald\./).waitFor({ timeout: 10_000 });
    await absent(page, "Anmelden", "Profil zeigt ohne Server den Knopf „Anmelden“");
    for (const route of ["/login", "/users"]) {
      await page.goto(site + route, { waitUntil: "networkidle" });
      await page.getByText(/^Diese Funktion braucht den FoodTracker-Server und kommt bald\./).waitFor({ timeout: 10_000 });
      await absent(page, /keine Anmeldung möglich|Bitte melde dich an/, `${route} meldet ohne Server, dass man sich nicht anmelden kann`);
    }
    // Auf Französisch fehlt Katalogrezepten die Zubereitung: Hinweis „Übersetzen kommt bald“ statt eines Knopfs ohne Wirkung.
    const french = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" });
    const frPage = await french.newPage();
    watch(frPage, "/recipe/linsen_bolognese (fr)");
    await frPage.goto(site + "/recipe/linsen_bolognese", { waitUntil: "networkidle" });
    await frPage.getByText(/^La traduction des recettes arrive bientôt\./).waitFor({ timeout: 10_000 });
    await absent(frPage, "🌐 Traduire", "Rezept auf Französisch zeigt ohne Server den Knopf „Traduire“");
    await french.close();
    console.log("Ohne Server: Rezept, Plan, Profil, Anmeldung und Übersetzen (fr) zeigen „Bald verfügbar“ statt Fehlermeldungen.");
  } catch (e) {
    failures.push(`Bald verfügbar: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: path.join(DIST, "web-smoke-fehler.png") }).catch(() => {});
  }

  // Videos in der gewählten Sprache: Deutsch (hier de-AT) zeigt nur deutsche Videos, Englisch nur englische; fehlt
  // eines, sucht derselbe Knopf auf YouTube in dieser Sprache (Hinweis darunter). Die Rezepte sucht der Test in den
  // Videodateien des Servers aus, weil dort nach und nach Videos dazukommen (Daueraufgabe in BACKLOG.md).
  try {
    const de = videoTable("de");
    const en = videoTable("en");
    const english = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB" });
    const enPage = await english.newPage();
    watch(enPage, "/recipe/… (en)");
    const pages = { de: page, en: enPage };
    // [Rezept, Sprache, Text des Video-Knopfs – oder null: kein Video in dieser Sprache, also die Suche]
    const checks = [
      ...pickRecipe(de, en).flatMap((id) => [
        [id, "de", `▶ Video ansehen · YouTube · ${de.get(id).channel}`],
        [id, "en", null],
      ]),
      ...pickRecipe(en, de).flatMap((id) => [
        [id, "en", `▶ Watch video · YouTube · ${en.get(id).channel}`],
        [id, "de", null],
      ]),
    ];
    if (checks.length === 0) throw new Error("kein Rezept mit Video nur auf Deutsch oder nur auf Englisch gefunden");
    for (const [id, language, button] of checks) {
      const target = pages[language];
      const search = language === "de" ? "🔎 Video suchen · YouTube" : "🔎 Find a video · YouTube";
      await target.goto(site + "/recipe/" + id, { waitUntil: "networkidle" });
      if (button) {
        await target.getByText(button, { exact: true }).waitFor({ timeout: 10_000 });
        if (await target.getByText(search, { exact: true }).count()) throw new Error(`${id} (${language}) zeigt trotz Video die Suche`);
      } else {
        await target.getByText(search, { exact: true }).waitFor({ timeout: 10_000 });
        const hint = language === "de" ? /^Zu diesem Rezept gibt es noch kein Video auf Deutsch/ : /^There’s no video in English for this recipe yet/;
        await target.getByText(hint).waitFor({ timeout: 10_000 });
        if (await target.getByText(/^▶ /).count()) throw new Error(`${id} (${language}) zeigt ein Video in einer anderen Sprache`);
      }
    }
    await english.close();
    console.log(`Videos je Sprache: ${checks.map(([id, l]) => `${id} (${l})`).join(", ")} zeigen nur Videos ihrer Sprache, sonst die YouTube-Suche.`);
  } catch (e) {
    failures.push(`Videos je Sprache: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: path.join(DIST, "web-smoke-fehler.png") }).catch(() => {});
  }

  // Ernährungshistorie: Das Tagebuch zieht aus dem alten Zustand in den eigenen Speicher, bleibt nach gelöschten
  // Browserdaten per Sicherung erhalten (ohne Duplikate) und meldet einen vollen Speicher.
  try {
    const history = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-AT", acceptDownloads: true });
    await history.addInitScript(() => {
      if (localStorage.getItem("smoke/seeded")) return;
      localStorage.setItem("smoke/seeded", "1");
      const day = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() - offset);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const nutrients = { kcal: 650, protein: 25, carbs: 70, fat: 20 };
      // So speicherte die App das Tagebuch bis November 2026: im übrigen Zustand, ohne `updatedAt`.
      localStorage.setItem(
        "foodtracker/state/v2",
        JSON.stringify({
          deviceId: "smoke-device-0001",
          settings: { onboarded: true, language: "de", region: "AT" },
          diary: [
            { id: "alt1", date: day(400), time: "12:00", title: "Kaspressknödel", nutrients, source: "manuell" },
            { id: "alt2", date: day(2), time: "19:00", title: "Linsen-Bolognese", nutrients, source: "plan" },
          ],
        }),
      );
    });
    const hp = await history.newPage();
    watch(hp, "/profile (Historie)");
    await hp.goto(site + "/profile", { waitUntil: "networkidle" });
    await hp.getByText("1 von 7 Tagen erfasst", { exact: true }).waitFor({ timeout: 10_000 });
    const stored = await hp.evaluate(() => ({ keys: Object.keys(localStorage), main: JSON.parse(localStorage.getItem("foodtracker/state/v2") ?? "{}") }));
    if (!stored.keys.includes("foodtracker/diary/v1") || stored.keys.filter((k) => /^foodtracker\/diary\/v1\/\d{4}$/.test(k)).length !== 2) {
      throw new Error(`Tagebuch nicht im eigenen Speicher (ein Teil pro Jahr): ${stored.keys.join(", ")}`);
    }
    if ("diary" in stored.main) throw new Error("Der übrige Zustand enthält nach dem Umzug noch das Tagebuch");
    await hp.getByRole("button", { name: "Alles", exact: true }).click();
    await hp.getByText("2 von 401 Tagen erfasst", { exact: true }).waitFor({ timeout: 5_000 });
    await hp.getByText(/^Ein Balken pro Monat/).waitFor({ timeout: 5_000 });

    const download = async (label) => {
      const [file] = await Promise.all([hp.waitForEvent("download", { timeout: 10_000 }), hp.getByText(label, { exact: true }).click()]);
      return { name: file.suggestedFilename(), path: await file.path() };
    };
    const backup = await download("📤 Als Sicherung (JSON)");
    const exported = JSON.parse(fs.readFileSync(backup.path, "utf8"));
    if (!/^FoodTracker-Historie-\d{4}-\d{2}-\d{2}\.json$/.test(backup.name) || exported.entries.length !== 2) {
      throw new Error(`Sicherung ${backup.name} mit ${exported.entries?.length} Einträgen statt 2`);
    }
    const csv = fs.readFileSync((await download("📤 Als Tabelle (CSV)")).path, "utf8");
    if (!csv.startsWith("\uFEFFDatum;Uhrzeit;Gericht;kcal;") || !csv.includes(";Kaspressknödel;650;")) throw new Error(`CSV: ${csv.slice(0, 120)}`);

    // Browserdaten gelöscht: leer – nach dem Import ist alles wieder da, ein zweiter Import bringt nichts doppelt.
    await hp.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("smoke/seeded", "1");
    });
    await hp.reload({ waitUntil: "networkidle" });
    await hp.getByText(/^Noch keine Einträge\./).waitFor({ timeout: 10_000 });
    const importFile = async (file, message) => {
      const [chooser] = await Promise.all([hp.waitForEvent("filechooser", { timeout: 10_000 }), hp.getByText("📥 Sicherung importieren", { exact: true }).click()]);
      await chooser.setFiles(file);
      await hp.getByText(message, { exact: true }).waitFor({ timeout: 10_000 });
    };
    await importFile(backup.path, "✓ Importiert: 2 neu, 0 aktualisiert, 0 schon vorhanden.");
    await importFile(backup.path, "✓ Importiert: 0 neu, 0 aktualisiert, 2 schon vorhanden.");
    await hp.reload({ waitUntil: "networkidle" });
    await hp.getByText("1 von 7 Tagen erfasst", { exact: true }).waitFor({ timeout: 10_000 });

    // Speicher voll: Hinweis statt stillem Verlust.
    await hp.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (String(key).startsWith("foodtracker/diary")) throw new DOMException("Speicher voll", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    const extra = path.join(path.dirname(backup.path), "smoke-extra.json");
    fs.writeFileSync(extra, JSON.stringify([{ ...exported.entries[1], id: "neu1", title: "Rösti" }]));
    await importFile(extra, "✓ Importiert: 1 neu, 0 aktualisiert, 0 schon vorhanden.");
    await hp.getByText(/^⚠️ Dein Tagebuch konnte nicht gespeichert werden/).first().waitFor({ timeout: 10_000 });
    await history.close();
    console.log("Ernährungshistorie ok: Umzug in den eigenen Speicher, „Alles“ mit Monatsbalken, Export (JSON, CSV), Import ohne Duplikate, Hinweis bei vollem Speicher.");
  } catch (e) {
    failures.push(`Ernährungshistorie: ${e.message.split("\n")[0]}`);
  }

  await browser.close();
  server.close();
  if (failures.length) {
    console.error(`\n${failures.length} Problem(e):\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("Web-Rauchtest bestanden.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
