import { randomUUID } from "node:crypto";
import type { Queryable } from "./db.js";

// Kennung der Datenbank (Vorrang 1, 9.2 Teil 7): eine zufällige UUID, beim ersten Abgleich einmal in storage_meta
// angelegt. Der Server nennt sie bei jedem Abgleich (Tagebuch und POST /api/sync), die App merkt sie sich zusammen mit
// ihrer Abgleich-Marke und schickt sie mit. Zieht der Server auf eine neue, leere Datenbank um (z. B. vom Laptop zu
// Render mit Neon) oder bekommt die App eine andere Server-Adresse, passt die Kennung nicht mehr: Der Server übernimmt
// dann nichts und antwortet mit `reset`, die App gleicht von vorn ab (alles hoch, alles zurück). Ohne die Kennung
// schickten Geräte, die schon abgeglichen hatten, nur noch ihre neuen Änderungen – die neue Datenbank hätte nur einen
// Teil der Historie.
// Eine kopierte Datenbank (Sicherung, Umzug mit pg_dump) behält die Kennung – richtig so, die Revisionen stimmen dann
// auch. Die Kennung verrät nur „dieselbe Datenbank oder nicht“ und ist kein Geheimnis.

const KEY = "database_id";

/** Liefert die Kennung der Datenbank und legt sie beim ersten Mal an (auch bei gleichzeitigen Aufrufen nur eine). */
export async function databaseId(db: Queryable): Promise<string> {
  await db.run("INSERT INTO storage_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING", [KEY, randomUUID()]);
  const row = await db.get<{ value: string }>("SELECT value FROM storage_meta WHERE key = ?", [KEY]);
  if (!row?.value) throw new Error("Die Datenbank hat keine Kennung (storage_meta).");
  return row.value;
}
