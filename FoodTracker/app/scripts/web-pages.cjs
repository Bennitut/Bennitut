// Baut die Web-Version für GitHub Pages: https://bennitut.github.io/Bennitut/ (Unterpfad /Bennitut).
//
//   npm run web:pages                   # Unterpfad /Bennitut, Ergebnis in dist-pages/
//   npm run web:pages -- /anderer-pfad  # anderer Unterpfad; "/" für eine eigene Domain ohne Unterpfad
//   npm run web:smoke -- dist-pages     # Rauchtest wie auf GitHub Pages (Unterpfad und 404.html)
//
// Der Workflow .github/workflows/foodtracker-pages.yml übergibt den Unterpfad über WEB_BASE_PATH.
// Was passiert:
// 1. `expo export --platform web` mit WEB_BASE_PATH: app.config.js setzt daraus experiments.baseUrl, damit Expo
//    Skripte, Bilder und Schriften unter /Bennitut/… lädt und expo-router den Unterpfad in den Adressen beachtet.
// 2. Die Dateien aus public/ kopiert Expo unverändert. Ihre absoluten Pfade (/manifest.json, /icons/…, start_url,
//    scope) bekommen hier den Unterpfad davor.
// 3. 404.html = Kopie von index.html: GitHub Pages liefert sie für jede unbekannte Adresse aus. So funktionieren
//    Direktlinks wie /Bennitut/plan und das Neuladen auf jeder Seite der Single-Page-App.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const APP = path.resolve(__dirname, "..");
const OUT_DIR = "dist-pages";
const OUT = path.join(APP, OUT_DIR);

/** "/Bennitut/" → "/Bennitut", "Bennitut" → "/Bennitut", "" oder "/" → "" (kein Unterpfad). */
function normalizeBase(value) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

const base = normalizeBase(process.argv[2] ?? process.env.WEB_BASE_PATH ?? "/Bennitut");
const withBase = (p) => (typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.startsWith(`${base}/`) ? `${base}${p}` : p);

console.log(`Web-Version für ${base ? `den Unterpfad ${base}/` : "die Wurzel /"} bauen …`);
execFileSync(process.execPath, [require.resolve("expo/bin/cli"), "export", "--platform", "web", "--output-dir", OUT_DIR], {
  cwd: APP,
  stdio: "inherit",
  env: { ...process.env, WEB_BASE_PATH: base },
});

const indexFile = path.join(OUT, "index.html");
let html = fs.readFileSync(indexFile, "utf8");
if (base) {
  if (!html.includes(`src="${base}/_expo/`)) {
    throw new Error(`Expo hat den Unterpfad ${base} nicht übernommen (app.config.js / experiments.baseUrl prüfen).`);
  }
  // Nur Pfade aus public/index.html anpassen; die von Expo eingefügten Pfade haben den Unterpfad schon.
  html = html.replace(/\b(href|src)="(\/[^"]*)"/g, (match, attr, value) => `${attr}="${withBase(value)}"`);
  fs.writeFileSync(indexFile, html);

  const manifestFile = path.join(OUT, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.start_url = withBase(manifest.start_url ?? "/");
  manifest.scope = withBase(manifest.scope ?? "/");
  manifest.icons = (manifest.icons ?? []).map((icon) => ({ ...icon, src: withBase(icon.src) }));
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  const leftover = [...html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]).filter((p) => !p.startsWith(`${base}/`));
  if (leftover.length) throw new Error(`Pfade ohne Unterpfad in index.html: ${leftover.join(", ")}`);
}
fs.copyFileSync(indexFile, path.join(OUT, "404.html"));

console.log(`Fertig: ${OUT_DIR}/ mit index.html, 404.html und manifest.json für ${base || "/"}.`);
console.log("Prüfen: npm run web:smoke -- dist-pages");
