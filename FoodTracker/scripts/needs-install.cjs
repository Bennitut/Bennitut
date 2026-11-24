// Für start-test.cmd: Ist in einem Ordner (server oder app) `npm install` nötig?
//
//   node scripts/needs-install.cjs server          # Exit-Code 1 = installieren, 0 = aktuell
//   node scripts/needs-install.cjs server --done   # nach erfolgreichem npm install: Stand merken
//
// Nötig, wenn node_modules fehlt oder package.json bzw. package-lock.json seit der letzten Installation geändert
// wurden (z. B. durch git pull). Der Stand steht in node_modules/.foodtracker-installed.
const fs = require("node:fs");
const path = require("node:path");

const dir = path.resolve(__dirname, "..", process.argv[2] ?? ".");
const marker = path.join(dir, "node_modules", ".foodtracker-installed");
const mtime = (file) => {
  try {
    return fs.statSync(path.join(dir, file)).mtimeMs;
  } catch {
    return null;
  }
};

if (process.argv.includes("--done")) {
  fs.writeFileSync(marker, `${new Date().toISOString()}\n`);
  process.exit(0);
}
const installed = fs.existsSync(path.join(dir, "node_modules")) ? mtime(path.join("node_modules", ".foodtracker-installed")) : null;
const changed = ["package.json", "package-lock.json"].some((file) => {
  const m = mtime(file);
  return m !== null && installed !== null && m > installed;
});
process.exit(installed === null || changed ? 1 : 0);
