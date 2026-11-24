// Rauchtest der Web-Version im Browser (headless Chromium über Playwright).
//
//   npm run web:export                # baut die statische Web-Version nach dist/
//   npm run web:smoke                 # öffnet jede Seite und spielt Fragebogen → Monatsplan → Einkauf (zwei Zeilen
//                                     # abhaken, „Abgehaktes in den Vorrat“, „Liefern lassen“ zeigt „Bald verfügbar“)
//                                     # → Vorrat durch, danach „Entdecken“ (Community „Bald verfügbar“) und Tauschen
//                                     # (zuerst 30 Rezepte, nicht alle Fotos auf einmal)
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
  const open = async (route) => {
    const page = await context.newPage();
    page.on("pageerror", (e) => failures.push(`${route}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !expected404(m) && failures.push(`${route}: ${m.text()}`));
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
