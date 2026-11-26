import { networkInterfaces } from "node:os";
import type { AiStatus } from "./ai/provider.js";

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

/** Eine Zeile zur KI – mit dem nächsten Schritt, falls noch etwas fehlt. */
export function aiLine(status: AiStatus, ollama: { url: string; model: string }): string {
  if (status.provider === "claude") {
    return status.state === "ready"
      ? `KI: Claude (${status.model}) – kostet API-Guthaben bei Anthropic.`
      : "KI: Claude gewählt (AI_PROVIDER=claude), aber ANTHROPIC_API_KEY fehlt in server/.env.";
  }
  if (status.provider === "ollama") {
    if (status.state === "ready") return `KI: Ollama mit ${status.model} – kostenlos auf diesem Rechner.`;
    if (status.state === "model_missing") return `KI: Ollama läuft, aber das Modell fehlt. Einmal ausführen: ollama pull ${status.model}`;
    return `KI: Ollama gewählt, antwortet aber nicht unter ${ollama.url}. Läuft Ollama?`;
  }
  return (
    "KI: keine – Foto, Kassenbon, Import, Übersetzen und KI-Wünsche melden „KI nicht eingerichtet“.\n" +
    `    Kostenlos: winget install Ollama.Ollama, dann ollama pull ${ollama.model} – der Server merkt es ohne Neustart.`
  );
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
}): string {
  const { port, addresses } = input;
  const lines = [
    "",
    "FoodTracker-Server läuft.",
    `  Auf diesem Rechner:  http://localhost:${port}`,
    ...(addresses.length > 0
      ? [`  Im WLAN:             ${addresses.map((a) => `http://${a}:${port}`).join("  ")}`]
      : ["  Im WLAN:             keine Netzwerkadresse gefunden – ist der Rechner mit dem WLAN verbunden?"]),
    `  ${aiLine(input.ai, input.ollama)}`,
    ...(input.mail === undefined
      ? []
      : [
          input.mail
            ? "  E-Mail:              eingerichtet – „Passwort vergessen?“ schickt einen Code."
            : "  E-Mail:              nicht eingerichtet – „Passwort vergessen?“ ist ausgeblendet (SMTP_* in server/.env).",
        ]),
    ...(input.storage ? [`  Daten:               ${input.storage}`] : []),
    ...(input.photos ? [`  Fotos:               ${input.photos}`] : []),
    `  Einstellungen:       ${input.envFile ?? "keine server/.env (Vorlage: server/.env.example)"}`,
  ];
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
