// Zuerst server/.env lesen, damit alle anderen Module die Einstellungen schon sehen.
import { ENV_FILE, envFileLoaded } from "./env.js";
import { serve } from "@hono/node-server";
import { Ai, aiConfigProblem, aiSettingsFromEnv } from "./ai/provider.js";
import { createApp } from "./app.js";
import { normalizeOrigins } from "./http/cors.js";
import { mailerFromEnv } from "./mail/mailer.js";
import { devLoginSetting, runtimeFromEnv } from "./runtime.js";
import { lanAddresses, startupMessage } from "./startInfo.js";
import { openDatabase, type Db } from "./storage/db.js";
import type { ImageStore } from "./storage/images.js";
import { importLegacyCommunity, importLegacyDiary, importLegacyFeedback, importLegacyOverrides, importLegacyUsers } from "./storage/legacy.js";
import { migrate } from "./storage/migrations.js";
import { imageStoreFromEnv, objectStorageHint } from "./storage/objectStorage.js";

/** Kommagetrennte Liste aus einer Umgebungsvariable. */
const list = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const port = Number(process.env.PORT ?? 3000);
// Zum Testen auf dem eigenen Rechner oder als Server für andere (im Container: NODE_ENV=production, siehe runtime.ts).
const runtime = runtimeFromEnv();
const devLogin = devLoginSetting(process.env, runtime);
// Websites, die den Server aus dem Browser nutzen dürfen (CORS) – im Container standardmäßig die Web-Version auf
// GitHub Pages (Dockerfile). Einmal vereinheitlichen, damit Warnungen zu ungültigen Einträgen nur einmal kommen.
const corsOrigins = normalizeOrigins(list(process.env.CORS_ORIGINS));
// KI (ai/provider.ts): Lieber nicht starten, als einen Schlüssel für Ollama unverschlüsselt durchs Internet zu schicken.
const aiSettings = aiSettingsFromEnv();
const aiProblem = aiConfigProblem(aiSettings);
if (aiProblem) {
  console.error(`\nDie Einstellungen für die KI stimmen nicht: ${aiProblem}\n`);
  process.exit(1);
}

// Datenbank (storage/db.ts): mit DATABASE_URL Postgres, sonst die SQLite-Datei. Lieber gar nicht starten als ohne
// Konten – die Meldung sagt, was zu tun ist (die Adresse selbst nie ausgeben, sie enthält das Passwort).
const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
let db: Db;
try {
  db = await openDatabase({ url: databaseUrl, file: process.env.DATABASE_FILE?.trim() || "data/foodtracker.db" });
  await migrate(db);
} catch (e) {
  const reason = (e as { code?: string }).code ? `${(e as Error).message} (${(e as { code?: string }).code})` : (e as Error).message;
  console.error(`\nDie Datenbank lässt sich nicht öffnen: ${reason}`);
  if (databaseUrl) console.error("Stimmt DATABASE_URL in server/.env? Ohne DATABASE_URL nimmt der Server eine Datei auf diesem Rechner.");
  console.error("");
  process.exit(1);
}

// Fotos (Galerie der Rezepte, Fotos geteilter und eigener Rezepte) als Dateien, in der Datenbank nur ihr Schlüssel: im
// Ordner PHOTOS_DIR oder – mit S3_* für Hoster ohne dauerhafte Dateien – in einem Objektspeicher (storage/objectStorage.ts).
// Beim Start einmal speichern, lesen und löschen: Falsche Schlüssel fallen sofort auf, nicht erst beim ersten Foto.
let images: ImageStore;
try {
  images = imageStoreFromEnv(process.env);
  await images.check?.();
} catch (e) {
  console.error(`\nDer Speicher für Fotos ist nicht bereit: ${(e as Error).message}`);
  const hint = objectStorageHint(e) ?? ((e as NodeJS.ErrnoException).code ? "Darf der Server in den Ordner für Fotos (PHOTOS_DIR, Standard data/photos) schreiben?" : null);
  if (hint) console.error(hint);
  console.error("");
  await db.close();
  process.exit(1);
}
const photosAt = images.description.replace(/^Ordner /, "");

// Einmaliger Umzug aus den JSON-Dateien älterer Fassungen (storage/legacy.ts): Konten, Sicherung der
// Ernährungshistorie, Community-Rezepte, Fotos mit Sternen und Meldungen, Admin-Änderungen an Katalogrezepten.
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const usersFile = process.env.USERS_FILE?.trim() || "data/users.json";
try {
  const moved = await importLegacyUsers(db, usersFile);
  if (moved) {
    console.log(
      `Konten aus ${usersFile} in die Datenbank übernommen: ${n(moved.users, "Konto", "Konten")}, ` +
        `${n(moved.sessions, "Anmeldung bleibt", "Anmeldungen bleiben")} gültig` +
        `${moved.skipped ? ` (${n(moved.skipped, "Eintrag", "Einträge")} gab es schon oder war unlesbar)` : ""}. Die alte Datei ist gelöscht.`,
    );
  }
} catch (e) {
  console.error(`Konten aus ${usersFile} konnten nicht übernommen werden (${(e as Error).message}). Die Datei bleibt liegen.`);
}
const diaryDir = process.env.DIARY_DIR?.trim() || "data/diary";
try {
  const moved = await importLegacyDiary(db, diaryDir);
  if (moved?.owners) {
    console.log(
      `Sicherung der Ernährungshistorie aus ${diaryDir} in die Datenbank übernommen: ${n(moved.owners, "Konto bzw. Gerät", "Konten bzw. Geräte")} ` +
        `mit ${n(moved.records, "Eintrag", "Einträgen")} (samt Löschmarken). Die alten Dateien sind gelöscht.`,
    );
  }
  if (moved?.unreadable) console.error(`${n(moved.unreadable, "Datei", "Dateien")} in ${diaryDir} unlesbar – bleiben liegen und werden nicht übernommen.`);
} catch (e) {
  console.error(`Sicherung der Ernährungshistorie aus ${diaryDir} konnte nicht übernommen werden (${(e as Error).message}). Die Dateien bleiben liegen.`);
}
const skipped = (count: number) => (count ? ` (${n(count, "Eintrag", "Einträge")} gab es schon oder war unlesbar)` : "");
const communityFile = process.env.COMMUNITY_FILE?.trim() || "data/community.json";
try {
  const moved = await importLegacyCommunity(db, images, communityFile);
  if (moved) {
    console.log(
      `Community-Rezepte aus ${communityFile} in die Datenbank übernommen: ${n(moved.recipes, "Rezept", "Rezepte")} mit ` +
        `${n(moved.likes, "Favorit", "Favoriten")}, ${n(moved.images, "Foto", "Fotos")} jetzt als Datei in ${photosAt}${skipped(moved.skipped)}. Die alte Datei ist gelöscht.`,
    );
  }
} catch (e) {
  console.error(`Community-Rezepte aus ${communityFile} konnten nicht übernommen werden (${(e as Error).message}). Die Datei bleibt liegen.`);
}
const feedbackFile = process.env.FEEDBACK_FILE?.trim() || "data/feedback.json";
try {
  const moved = await importLegacyFeedback(db, images, feedbackFile);
  if (moved) {
    console.log(
      `Fotos, Sterne und Meldungen aus ${feedbackFile} in die Datenbank übernommen: ${n(moved.photos, "Foto", "Fotos")} (jetzt als Datei in ` +
        `${photosAt}), ${n(moved.ratings, "Bewertung", "Bewertungen")}, ${n(moved.flags, "Meldung", "Meldungen")}${skipped(moved.skipped)}. Die alte Datei ist gelöscht.`,
    );
  }
} catch (e) {
  console.error(`Fotos, Sterne und Meldungen aus ${feedbackFile} konnten nicht übernommen werden (${(e as Error).message}). Die Datei bleibt liegen.`);
}
const overridesFile = process.env.OVERRIDES_FILE?.trim() || "data/recipe-overrides.json";
try {
  const moved = await importLegacyOverrides(db, overridesFile);
  if (moved) {
    console.log(
      `Admin-Änderungen an Katalogrezepten aus ${overridesFile} in die Datenbank übernommen: ${n(moved.recipes, "Rezept", "Rezepte")}${skipped(moved.skipped)}. Die alte Datei ist gelöscht.`,
    );
  }
} catch (e) {
  console.error(`Admin-Änderungen aus ${overridesFile} konnten nicht übernommen werden (${(e as Error).message}). Die Datei bleibt liegen.`);
}

const ai = new Ai(aiSettings);
const mailer = mailerFromEnv();
const app = createApp({
  db,
  images,
  auth: {
    appleAudiences: list(process.env.APPLE_BUNDLE_IDS ?? "host.exp.Exponent"),
    googleAudiences: list(process.env.GOOGLE_CLIENT_IDS),
    adminEmails: list(process.env.ADMIN_EMAILS),
    allowDevLogin: devLogin.allowed,
  },
  ai,
  corsOrigins,
  mailer,
  trustProxy: process.env.TRUST_PROXY === "1",
});
const server = serve({ fetch: app.fetch, port }, async () => {
  const status = await ai.status();
  console.log(
    startupMessage({
      port,
      addresses: runtime.container ? [] : lanAddresses(),
      ai: status,
      ollama: ai.settings.ollama,
      envFile: envFileLoaded ? ENV_FILE : null,
      platform: process.platform,
      mail: mailer !== null,
      storage: db.description,
      photos: images.description,
      corsOrigins,
      container: runtime.container,
    }),
  );
  if (devLogin.allowed) {
    console.log(
      "\n  Achtung: ALLOW_DEV_LOGIN=1 – Anmeldung nur mit Namen, nur zum Testen im eigenen WLAN. Über einen Tunnel oder Proxy\n" +
        "  (Anfragen aus dem Internet) lehnt der Server ihn ab; für einen Tunnel die Zeile in server/.env trotzdem löschen.",
    );
  }
  if (devLogin.ignored) {
    console.warn(
      "\n  ALLOW_DEV_LOGIN=1 gilt hier nicht: NODE_ENV=production heißt Server für andere, und dort könnte sich damit jede:r\n" +
        "  unter jedem Namen anmelden. Anmelden geht mit E-Mail und Passwort, Apple oder Google.",
    );
  }
  console.log("");
});
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code !== "EADDRINUSE") throw err;
  console.error(`\nPort ${port} ist schon belegt – läuft der FoodTracker-Server schon in einem anderen Fenster? Das andere Fenster schließen und neu starten.\n`);
  process.exit(1);
});

// Beim Beenden (Strg+C, Fenster schließen, Hoster stoppt den Dienst) die Datenbank sauber schließen – laufende
// Transaktionen werden noch fertig. Nach drei Sekunden auf jeden Fall beenden.
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  server.close();
  setTimeout(() => process.exit(0), 3000).unref();
  db.close().finally(() => process.exit(0));
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, stop);
