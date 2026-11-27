// Fotos zwischen dem Ordner (PHOTOS_DIR, Standard data/photos) und dem Objektspeicher (S3_* in server/.env) kopieren –
// beim Umzug des Servers (Vorrang 1, 9.3; Anleitung im README unter „Fotos im Objektspeicher“):
//
//   npm run photos:copy -- in-objektspeicher   Ordner → Objektspeicher (vom Laptop zum Server im Internet)
//   npm run photos:copy -- in-ordner           Objektspeicher → Ordner (zurück auf den Laptop, Sicherung)
//
// Kopiert nur, was im Ziel fehlt, löscht nichts und kann beliebig oft laufen. Vorher den Server beenden, damit keine
// neuen Fotos dazukommen (sonst danach einfach noch einmal laufen lassen).
import { ENV_FILE, envFileLoaded } from "../src/env.js";
import { copyImages } from "../src/storage/copyImages.js";
import { DirectoryImageStore } from "../src/storage/images.js";
import { ObjectImageStore, objectStorageFromEnv, objectStorageHint, type ObjectStorageSettings } from "../src/storage/objectStorage.js";

const DIRECTIONS = ["in-objektspeicher", "in-ordner"] as const;
const direction = process.argv[2];

function fail(message: string, hint?: string | null): never {
  console.error(`\n${message}${hint ? `\n${hint}` : ""}\n`);
  process.exit(1);
}

if (!DIRECTIONS.includes(direction as (typeof DIRECTIONS)[number])) {
  fail(`Wohin? npm run photos:copy -- in-objektspeicher (Ordner → Objektspeicher) oder npm run photos:copy -- in-ordner (zurück).`);
}

let settings: ObjectStorageSettings | null = null;
try {
  settings = objectStorageFromEnv(process.env);
} catch (e) {
  fail((e as Error).message);
}
if (!settings) fail(`Kein Objektspeicher eingestellt: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID und S3_SECRET_ACCESS_KEY in ${envFileLoaded ? ENV_FILE : "server/.env"} eintragen (erklärt in .env.example).`);

const folder = new DirectoryImageStore(process.env.PHOTOS_DIR?.trim() || "data/photos");
const bucket = new ObjectImageStore(settings);
try {
  await bucket.check();
} catch (e) {
  fail(`Der Objektspeicher ist nicht bereit: ${(e as Error).message}`, objectStorageHint(e));
}

const [from, to] = direction === "in-objektspeicher" ? [folder, bucket] : [bucket, folder];
console.log(`Kopiere Fotos aus ${from.description}\n           nach ${to.description} …`);
const result = await copyImages(from, to, {
  onProgress: (done, todo) => {
    if (done % 25 === 0 || done === todo) console.log(`  ${done}/${todo}`);
  },
});
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
console.log(
  `\nFertig: ${n(result.total, "Foto", "Fotos")} in der Quelle – ${result.copied} kopiert, ${result.present} waren schon da` +
    `${result.vanished ? `, ${result.vanished} inzwischen gelöscht` : ""}.`,
);
if (result.failed.length > 0) {
  for (const { key, error } of result.failed.slice(0, 20)) console.error(`  ${key}: ${error}`);
  if (result.failed.length > 20) console.error(`  … und ${result.failed.length - 20} weitere`);
  fail(`${n(result.failed.length, "Foto ließ", "Fotos ließen")} sich nicht kopieren – noch einmal laufen lassen, es kopiert nur, was fehlt.`);
}
