import { networkInterfaces } from "node:os";
import type { AiStatus } from "./ai/provider.js";
import { displayUrl } from "./urls.js";

export { displayUrl };

// Was der Server beim Start ins Fenster schreibt: Adressen, aktive KI und die Firewall-Regel fürs iPhone.

const isPrivate = (address: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);

/** IPv4-Adressen dieses Rechners im lokalen Netz (WLAN/LAN), private zuerst; ohne 169.254.x.x (kein Netz). */
export function lanAddresses(interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): string[] {
  const all = Object.values(interfaces)
    .flatMap((list) => list ?? [])
    .filter((i) => (i.family === "IPv4" || (i.family as unknown) === 4) && !i.internal && !i.address.startsWith("169.254."))
    .map((i) => i.address);
  return [...new Set([...all.filter(isPrivate), ...all.filter((a) => !isPrivate(a))])];
}

/**
 * Eine Zeile zur KI – mit dem nächsten Schritt, falls noch etwas fehlt. Im Container (`container`) läuft Ollama nicht
 * mit, sondern höchstens auf einem anderen Rechner (OLLAMA_URL); die Einstellungen sind Umgebungsvariablen.
 */
export function aiLine(status: AiStatus, ollama: { url: string; model: string }, container = false): string {
  if (status.provider === "claude") {
    if (status.state === "ready") return `KI: Claude (${status.model}) – kostet API-Guthaben bei Anthropic.`;
    return container
      ? "KI: Claude gewählt (AI_PROVIDER=claude), aber die Umgebungsvariable ANTHROPIC_API_KEY fehlt."
      : "KI: Claude gewählt (AI_PROVIDER=claude), aber ANTHROPIC_API_KEY fehlt in server/.env.";
  }
  if (status.provider === "ollama") {
    if (status.state === "ready") return container ? `KI: Ollama mit ${status.model} unter ${displayUrl(ollama.url)} – kostenlos.` : `KI: Ollama mit ${status.model} – kostenlos auf diesem Rechner.`;
    if (status.state === "model_missing") {
      return `KI: Ollama läuft, aber das Modell fehlt. Einmal ${container ? "auf dem Rechner mit Ollama " : ""}ausführen: ollama pull ${status.model}`;
    }
    if (status.reason === "unauthorized") {
      return `KI: Ollama unter ${displayUrl(ollama.url)} lehnt den Schlüssel ab – OLLAMA_API_KEY muss gleich OLLAMA_RELAY_KEY der Weiterleitung sein.`;
    }
    return `KI: Ollama gewählt, antwortet aber nicht unter ${displayUrl(ollama.url)}. Läuft Ollama${container ? " (bzw. die Weiterleitung und der Tunnel auf dem Rechner mit Ollama)" : ""}?`;
  }
  return (
    "KI: keine – Foto, Kassenbon, Import, Übersetzen und KI-Wünsche melden „KI nicht eingerichtet“.\n" +
    (container
      ? "    Im Container: ANTHROPIC_API_KEY setzen (kostet API-Guthaben) oder OLLAMA_URL und OLLAMA_API_KEY auf die Weiterleitung\n" +
        "    zu Ollama auf einem anderen Rechner (docs/SERVER-HOSTING.md)."
      : `    Kostenlos: winget install Ollama.Ollama, dann ollama pull ${ollama.model} – der Server merkt es ohne Neustart.`)
  );
}

/** Welche Websites den Server aus dem Browser nutzen dürfen (CORS, http/cors.ts); `extra` aus CORS_ORIGINS. */
export function corsLine(extra: readonly string[]): string {
  return extra.length > 0
    ? `localhost und eigenes Netz, dazu ${extra.join(", ")}`
    : "localhost und eigenes Netz (weitere Websites mit CORS_ORIGINS, z. B. https://bennitut.github.io)";
}

export function startupMessage(input: {
  port: number;
  addresses: string[];
  ai: AiStatus;
  ollama: { url: string; model: string };
  envFile: string | null;
  platform: NodeJS.Platform;
  /** Ob ein Mail-Dienst (SMTP_*) eingerichtet ist – nur dann gibt es „Passwort vergessen?“. */
  mail?: boolean;
  /** Wo Konten und Sitzungen liegen (Db.description), z. B. „SQLite-Datei data/foodtracker.db“. */
  storage?: string;
  /** Wo die Fotos liegen (ImageStore.description), z. B. „Ordner data/photos“. */
  photos?: string;
  /** Weitere Websites aus CORS_ORIGINS (schon vereinheitlicht); ohne Angabe keine Zeile dazu. */
  corsOrigins?: readonly string[];
  /** Im Container (Dockerfile): Port statt WLAN-Adressen, Einstellungen als Umgebungsvariablen, kein Test am iPhone. */
  container?: boolean;
}): string {
  const { port, addresses, container = false } = input;
  const lines = [
    "",
    "FoodTracker-Server läuft.",
    ...(container
      ? [`  Im Container:        Port ${port} – von außen über die Adresse des Hosters (bzw. docker run -p ${port}:${port})`]
      : [
          `  Auf diesem Rechner:  http://localhost:${port}`,
          addresses.length > 0
            ? `  Im WLAN:             ${addresses.map((a) => `http://${a}:${port}`).join("  ")}`
            : "  Im WLAN:             keine Netzwerkadresse gefunden – ist der Rechner mit dem WLAN verbunden?",
        ]),
    `  ${aiLine(input.ai, input.ollama, container)}`,
    ...(input.mail === undefined
      ? []
      : [
          input.mail
            ? "  E-Mail:              eingerichtet – „Passwort vergessen?“ schickt einen Code."
            : `  E-Mail:              nicht eingerichtet – „Passwort vergessen?“ ist ausgeblendet (SMTP_* ${container ? "als Umgebungsvariablen" : "in server/.env"}).`,
        ]),
    ...(input.storage ? [`  Daten:               ${input.storage}`] : []),
    ...(input.photos ? [`  Fotos:               ${input.photos}`] : []),
    ...(input.corsOrigins ? [`  Browser (CORS):      ${corsLine(input.corsOrigins)}`] : []),
    `  Einstellungen:       ${input.envFile ?? (container ? "Umgebungsvariablen (alle erklärt in .env.example)" : "keine server/.env (Vorlage: server/.env.example)")}`,
  ];
  if (container) return lines.join("\n");
  if (input.platform === "win32") {
    lines.push(
      "",
      "  Fürs iPhone muss die Windows-Firewall die Ports 3000 (Server) und 8081 (Expo) im privaten Netz erlauben.",
      "  Einmalig in PowerShell als Administrator:",
      '    New-NetFirewallRule -DisplayName "FoodTracker Test" -Direction Inbound -Protocol TCP -LocalPort 3000,8081 -Profile Private -Action Allow',
      "  Das WLAN muss in Windows als „Privates Netzwerk“ eingestellt sein.",
    );
  }
  if (addresses[0]) lines.push("", `  Test am iPhone: in Safari http://${addresses[0]}:${port}/api/health öffnen – erscheint {"ok":true,…}, passt alles.`);
  return lines.join("\n");
}
