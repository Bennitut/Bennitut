// Zuerst server/.env lesen, damit alle anderen Module die Einstellungen schon sehen.
import { ENV_FILE, envFileLoaded } from "./env.js";
import { serve } from "@hono/node-server";
import { Ai, aiSettingsFromEnv } from "./ai/provider.js";
import { createApp } from "./app.js";
import { mailerFromEnv } from "./mail/mailer.js";
import { lanAddresses, startupMessage } from "./startInfo.js";
import { openDatabase, type Db } from "./storage/db.js";
import { importLegacyDiary, importLegacyUsers } from "./storage/legacy.js";
import { migrate } from "./storage/migrations.js";

/** Kommagetrennte Liste aus einer Umgebungsvariable. */
const list = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const port = Number(process.env.PORT ?? 3000);

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

// Einmaliger Umzug aus den JSON-Dateien älterer Fassungen (storage/legacy.ts): Konten, Sicherung der Ernährungshistorie.
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

const ai = new Ai(aiSettingsFromEnv());
const mailer = mailerFromEnv();
const app = createApp({
  communityFile: process.env.COMMUNITY_FILE ?? "data/community.json",
  feedbackFile: process.env.FEEDBACK_FILE ?? "data/feedback.json",
  db,
  overridesFile: process.env.OVERRIDES_FILE ?? "data/recipe-overrides.json",
  auth: {
    appleAudiences: list(process.env.APPLE_BUNDLE_IDS ?? "host.exp.Exponent"),
    googleAudiences: list(process.env.GOOGLE_CLIENT_IDS),
    adminEmails: list(process.env.ADMIN_EMAILS),
    allowDevLogin: process.env.ALLOW_DEV_LOGIN === "1",
  },
  ai,
  corsOrigins: list(process.env.CORS_ORIGINS),
  mailer,
  trustProxy: process.env.TRUST_PROXY === "1",
});
const server = serve({ fetch: app.fetch, port }, async () => {
  const status = await ai.status();
  console.log(
    startupMessage({
      port,
      addresses: lanAddresses(),
      ai: status,
      ollama: ai.settings.ollama,
      envFile: envFileLoaded ? ENV_FILE : null,
      platform: process.platform,
      mail: mailer !== null,
      storage: db.description,
    }),
  );
  if (process.env.ALLOW_DEV_LOGIN === "1") console.log("\n  Achtung: ALLOW_DEV_LOGIN=1 – Anmeldung nur mit Namen, nur zum Testen im eigenen WLAN.");
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
