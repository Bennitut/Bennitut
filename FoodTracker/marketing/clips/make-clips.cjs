// Nimmt die Promo-Clips aus der Web-Version auf und schneidet sie mit ffmpeg zu Hochkant-Videos.
//
//   cd FoodTracker/app && npm run web:export      # Web-Version bauen
//   cd ../marketing/clips && node make-clips.cjs  # Clips neu aufnehmen (überschreibt die MP4-Dateien)
//
// Braucht Playwright mit Chromium, ffmpeg und die Schrift Inter (in der Cloud-Sitzung vorhanden;
// andere Schrift mit FONT=/pfad/zur/schrift.otf). Aufgenommen wird ein 360×640-Handyfenster mit dreifacher
// Pixeldichte über den Chromium-Screencast, damit die Videos scharf in 1080×1920 vorliegen.
// Alle Inhalte stammen aus der App selbst (Rezeptfotos frei lizenziert, siehe README), keine Musik.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const DIST = path.resolve(process.env.DIST ?? path.join(__dirname, "..", "..", "app", "dist"));
const FONT = process.env.FONT ?? "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf";
const OUT = __dirname;
const MAX_BYTES = 5 * 1024 * 1024;
const GREEN = "0x1E9E5A";
const END_CARD_SECONDS = 2.8;

function serve(root) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".ttf": "font/ttf" };
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, "http://localhost").pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/** Zeigt Tipps als kurz aufleuchtenden Kreis, damit man im Video sieht, wo getippt wird. */
const TAP_MARKER = `
  addEventListener("pointerdown", (e) => {
    const dot = document.createElement("div");
    dot.style.cssText = "position:fixed;z-index:99999;pointer-events:none;width:44px;height:44px;border-radius:50%;" +
      "background:rgba(30,158,90,.35);border:3px solid rgba(30,158,90,.9);transform:translate(-50%,-50%) scale(.6);" +
      "transition:transform .35s ease-out,opacity .45s ease-out;left:" + e.clientX + "px;top:" + e.clientY + "px";
    document.body.appendChild(dot);
    requestAnimationFrame(() => { dot.style.transform = "translate(-50%,-50%) scale(1.4)"; dot.style.opacity = "0"; });
    setTimeout(() => dot.remove(), 600);
  }, true);`;

async function tap(page, locator, pause = 700) {
  await locator.click();
  await page.waitForTimeout(pause);
}

async function scroll(page, pixels, steps = 10) {
  await page.mouse.move(180, 380);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, pixels / steps);
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(500);
}

/** Scrollt sichtbar, bis `locator` etwa bei Höhe `y` im Fenster steht (lange Strecken mit mehr Schritten). */
async function scrollTo(page, locator, y = 360) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element nicht sichtbar");
  const distance = box.y - y;
  await scroll(page, distance, Math.max(10, Math.round(Math.abs(distance) / 90)));
}

/** Fragebogen durchklicken und den ersten Monatsplan erstellen (vegetarisch, sonst Standardantworten). */
async function createPlan(page, base, pace = 120) {
  await page.goto(base + "/plan", { waitUntil: "networkidle" });
  await tap(page, page.getByText("Fragen beantworten", { exact: true }), pace);
  await tap(page, page.getByText("Vegetarisch", { exact: true }), pace);
  for (let i = 0; i < 5; i++) await tap(page, page.getByText("Weiter", { exact: true }).last(), pace);
  await tap(page, page.getByText("Monatsplan erstellen", { exact: true }).last(), pace);
  await page.getByText(/^Woche 1/).first().waitFor({ timeout: 60_000 });
}

const CLIPS = [
  {
    name: "01-monatsplan",
    async scenes(page, base, caption) {
      caption("Was koche ich\ndiese Woche?");
      await page.waitForTimeout(1800);
      await tap(page, page.getByText("Fragen beantworten", { exact: true }), 900);
      caption("6 kurze Fragen –\npassend zu dir");
      await tap(page, page.getByText("Vegetarisch", { exact: true }), 1100);
      for (let i = 0; i < 5; i++) await tap(page, page.getByText("Weiter", { exact: true }).last(), 950);
      caption("30 Tage geplant –\nin einer Sekunde");
      await tap(page, page.getByText("Monatsplan erstellen", { exact: true }).last(), 0);
      await page.getByText(/^Woche 1/).first().waitFor({ timeout: 60_000 });
      await page.waitForTimeout(2200);
      caption("Reste werden\ngleich mitverplant");
      await scroll(page, 520);
      await page.waitForTimeout(1200);
      await scroll(page, 420);
      await page.waitForTimeout(1600);
    },
    setup: async (page, base) => page.goto(base + "/plan", { waitUntil: "networkidle" }),
  },
  {
    name: "02-einkaufsliste",
    async scenes(page, base, caption) {
      caption("Die Einkaufsliste\nschreibt sich selbst");
      await page.waitForTimeout(2000);
      await scroll(page, 260);
      caption("Abhaken, was im\nWagen liegt");
      // Preise je nach Region „2,84 €“ (DE) oder „€ 2,84“ (AT).
      const prices = page.getByText(/^(€\s?\d+,\d\d|\d+,\d\d\s?€)$/);
      for (let i = 0; i < 3; i++) await tap(page, prices.nth(i), 650);
      await page.waitForTimeout(800);
      caption("Passende Packungen –\nkaum Reste");
      await scroll(page, 420);
      await page.waitForTimeout(1500);
      // Abgehaktes mit einem Tipp in den Vorrat buchen (geht ohne Server) und den Vorrat zeigen.
      caption("Gekauft? Ein Tipp –\nab in den Vorrat");
      const book = page.getByText(/^🧺 Abgehaktes in den Vorrat \(\d+\)$/);
      await scrollTo(page, book);
      await tap(page, book, 1300);
      await tap(page, page.getByRole("tab", { name: /Vorrat/ }), 2600);
      // Zurück zur Liste: Gebuchtes trägt dort „🧺 im Vorrat“ – passt noch zur Einblendung.
      await tap(page, page.getByRole("tab", { name: /Einkauf/ }), 500);
      await scroll(page, -4000, 16);
      caption("Jede Woche eine eigene\nListe mit Richtpreisen");
      await tap(page, page.getByText(/^Woche 2/).first(), 1600);
      await scroll(page, 360);
      await page.waitForTimeout(1500);
    },
    setup: async (page, base) => {
      await createPlan(page, base);
      await page.goto(base + "/shopping", { waitUntil: "networkidle" });
      await page.getByText(/Einkauf Woche 1/).first().waitFor();
    },
  },
  {
    name: "03-kochen-und-abhaken",
    async scenes(page, base, caption) {
      caption("Jeden Tag weißt du,\nwas es gibt");
      await page.waitForTimeout(1800);
      await scroll(page, 640);
      await page.waitForTimeout(1000);
      caption("Rezept mit Foto,\nZutaten und Schritten");
      await tap(page, page.getByText("Frühstück", { exact: true }).first(), 2000);
      await scroll(page, 520);
      await page.waitForTimeout(1200);
      await scroll(page, 420);
      await page.waitForTimeout(1200);
      caption("Abhaken – landet im\nErnährungstagebuch");
      await page.goBack();
      await page.getByText("Gegessen", { exact: true }).first().waitFor();
      await page.waitForTimeout(700);
      await tap(page, page.getByText("Gegessen", { exact: true }).first(), 1400);
      caption("Kalorien und Makros\nimmer im Blick");
      await tap(page, page.getByText("Heute", { exact: true }).last(), 3000);
    },
    setup: async (page, base) => {
      await createPlan(page, base);
      await page.goto(base + "/plan", { waitUntil: "networkidle" });
      await page.getByText(/^Woche 1/).first().waitFor();
    },
  },
];

/** Nimmt einen Clip als Einzelbilder mit Zeitstempeln auf; liefert Bilder, Gesamtdauer und Untertitel. */
async function record(browser, base, clip, workDir) {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, locale: "de-DE", colorScheme: "light" });
  await context.addInitScript(TAP_MARKER);
  const page = await context.newPage();
  // Alle geladenen Fotos merken: daraus entstehen die Bildnachweise (CC BY / CC BY-SA verlangen Namensnennung).
  const images = new Set();
  page.on("request", (r) => r.resourceType() === "image" && r.url().startsWith("https://") && images.add(r.url()));
  await clip.setup(page, base);
  await page.waitForTimeout(800);

  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  const started = Date.now() / 1000;
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1080, maxHeight: 1920 });
  const captions = [];
  const caption = (text) => {
    const now = Date.now() / 1000 - started;
    if (captions.length) captions[captions.length - 1].end = now;
    captions.push({ text, start: now, end: null });
  };
  await clip.scenes(page, base, caption);
  const stopped = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await context.close();

  const t0 = Math.min(started, frames[0]?.t ?? started);
  const duration = stopped - t0;
  const shift = started - t0;
  for (const c of captions) {
    c.start += shift;
    c.end = (c.end ?? duration - shift) + shift;
  }
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const file = path.join(workDir, `${clip.name}-${String(i).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    const next = i + 1 < frames.length ? frames[i + 1].t : stopped + END_CARD_SECONDS;
    lines.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(3)}`);
  });
  lines.push(`file '${path.join(workDir, `${clip.name}-${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`);
  const list = path.join(workDir, `${clip.name}.ffconcat`);
  fs.writeFileSync(list, lines.join("\n") + "\n");
  return { list, duration, captions, frames: frames.length, images: [...images] };
}

/** Bildnachweise aus dem Rezeptkatalog (server/src/data/recipeImages.ts) für die Fotos in den Clips. */
function writeCredits(imagesByClip) {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "server", "src", "data", "recipeImages.ts"), "utf8");
  const byUri = new Map();
  for (const m of source.matchAll(/(\w+): \{ uri: "([^"]+)", credit: "([^"]+)", source: "([^"]+)" \}/g)) byUri.set(m[2], { id: m[1], credit: m[3], source: m[4] });
  const lines = [
    "# Bildnachweise der Promo-Clips",
    "",
    "Automatisch erzeugt von `make-clips.cjs`: alle Rezeptfotos, die beim Aufnehmen geladen wurden (eher zu viele",
    "als zu wenige). Sie stehen unter freien Lizenzen; bei CC BY und CC BY-SA gehört die Namensnennung zum Beitrag,",
    "z. B. als Link auf diese Seite in der Beschreibung.",
  ];
  for (const [clip, urls] of Object.entries(imagesByClip)) {
    lines.push("", `## ${clip}.mp4`, "");
    const credits = urls.map((u) => byUri.get(u)).filter(Boolean);
    if (!credits.length) lines.push("Keine Rezeptfotos.");
    for (const c of credits) lines.push(`- ${c.id}: ${c.credit} – ${c.source}`);
  }
  fs.writeFileSync(path.join(OUT, "bildnachweise.md"), lines.join("\n") + "\n");
}

function drawText(workDir, id, text, { size, y, color = "white", enable }) {
  const file = path.join(workDir, `${id}.txt`);
  fs.writeFileSync(file, text);
  return `drawtext=fontfile=${FONT}:textfile=${file}:fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}:enable='${enable}'`;
}

/** Grüner Hintergrund, oben die Texteinblendung, darunter die App (80 %) mit weißem Rand; am Ende eine Abschlusskarte. */
function encode(workDir, clip, rec) {
  const filters = [
    `color=c=${GREEN}:s=1080x1920:r=30[bg]`,
    "[0:v]fps=30,scale=864:1536:flags=lanczos,pad=876:1548:6:6:white[app]",
    "[bg][app]overlay=x=102:y=330:shortest=1,format=yuv420p",
  ];
  const chain = [];
  rec.captions.forEach((c, i) => {
    c.text.split("\n").forEach((line, k) => {
      chain.push(drawText(workDir, `${clip.name}-c${i}-${k}`, line, { size: 66, y: 70 + k * 100, enable: `between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})` }));
    });
  });
  const card = `gte(t,${rec.duration.toFixed(2)})`;
  chain.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${GREEN}@1:t=fill:enable='${card}'`);
  chain.push(drawText(workDir, `${clip.name}-e0`, "FoodTracker", { size: 124, y: "h/2-260", enable: card }));
  chain.push(drawText(workDir, `${clip.name}-e1`, "Essen planen ohne Reste", { size: 64, y: "h/2-60", enable: card }));
  chain.push(drawText(workDir, `${clip.name}-e2`, "Kostenlos im Browser testen", { size: 54, y: "h/2+70", enable: card }));
  chain.push(drawText(workDir, `${clip.name}-e3`, "Link in der Bio", { size: 46, y: "h/2+170", color: "white@0.85", enable: card }));
  const graph = `${filters[0]};${filters[1]};${filters[2]},${chain.join(",")}`;
  const out = path.join(OUT, `${clip.name}.mp4`);
  for (const crf of [24, 27, 30, 33]) {
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", rec.list, "-filter_complex", graph,
      "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-crf", String(crf), "-maxrate", "1600k", "-bufsize", "3200k",
      "-movflags", "+faststart", "-an", out]);
    if (fs.statSync(out).size < MAX_BYTES) break;
  }
  return out;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.error("Playwright fehlt (npm install --no-save playwright && npx playwright install chromium)");
    process.exit(2);
  }
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error(`Kein Web-Export in ${DIST} – zuerst in FoodTracker/app: npm run web:export`);
    process.exit(2);
  }
  const only = process.argv.slice(2);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodtracker-clips-"));
  const server = await serve(DIST);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const imagesByClip = {};
    for (const clip of CLIPS.filter((c) => !only.length || only.includes(c.name))) {
      const rec = await record(browser, base, clip, workDir);
      const out = encode(workDir, clip, rec);
      imagesByClip[clip.name] = rec.images;
      const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
      console.log(`${path.basename(out)}: ${(rec.duration + END_CARD_SECONDS).toFixed(1)} s, ${rec.frames} Einzelbilder, ${size} MB`);
    }
    // Nur bei einem vollständigen Durchlauf, damit die Liste zu allen Clips passt.
    if (!only.length) writeCredits(imagesByClip);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
