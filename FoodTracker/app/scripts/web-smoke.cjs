// Rauchtest der Web-Version im Browser (headless Chromium über Playwright).
//
//   npm run web:export   # baut die statische Web-Version nach dist/
//   npm run web:smoke    # öffnet jede Seite und spielt Fragebogen → Monatsplan → Einkauf → Vorrat durch
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
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".ttf": "font/ttf" };

/** Statischer Server mit Fallback auf index.html, wie bei einer Single-Page-App üblich. */
function serve(root) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = path.join(root, pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
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

  const server = await serve(DIST);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-AT" });
  const failures = [];

  const open = async (route) => {
    const page = await context.newPage();
    page.on("pageerror", (e) => failures.push(`${route}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && failures.push(`${route}: ${m.text()}`));
    await page.goto(base + route, { waitUntil: "networkidle" });
    return page;
  };

  for (const route of ROUTES) {
    const page = await open(route);
    await page.waitForTimeout(500);
    await page.close();
  }
  console.log(`${ROUTES.length} Seiten geöffnet.`);

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
    await tap("Vorrat");
    await page.reload({ waitUntil: "networkidle" });
    await page.goto(base + "/plan", { waitUntil: "networkidle" });
    await page.getByText(/^Woche 1/).first().waitFor({ timeout: 10_000 });
    console.log("Ablauf Fragebogen → Plan → Einkauf → Vorrat ok, Plan bleibt nach dem Neuladen erhalten.");
  } catch (e) {
    failures.push(`Ablauf: ${e.message.split("\n")[0]}`);
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
