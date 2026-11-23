// Ergänzt app.json nur beim Bauen der Web-Version für einen Unterpfad, z. B. GitHub Pages
// (https://bennitut.github.io/Bennitut/, gebaut mit `npm run web:pages`, siehe scripts/web-pages.cjs).
// Ohne die Umgebungsvariable WEB_BASE_PATH bleibt alles wie in app.json: npx expo start, Expo Go und
// `npm run web:export` laufen unverändert unter "/".
module.exports = ({ config }) => {
  const raw = (process.env.WEB_BASE_PATH ?? "").trim().replace(/\/+$/, "");
  if (!raw) return config;
  const baseUrl = raw.startsWith("/") ? raw : `/${raw}`;
  // experiments.baseUrl: Expo lädt Skripte, Bilder und Schriften unter <Unterpfad>/…, expo-router
  // entfernt den Unterpfad aus den Adressen und setzt ihn bei Links wieder davor.
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
