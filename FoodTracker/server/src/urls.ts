import { isLocalHost } from "./http/cors.js";

// Adressen aus den Einstellungen (OLLAMA_URL u. a.) prüfen und so zeigen, dass nie ein Schlüssel im Fenster oder im
// Protokoll des Hosters landet.

/** Adresse fürs Fenster bzw. Protokoll ohne Zugangsdaten, Pfad und Parameter (dort könnten Schlüssel stehen). */
export function displayUrl(url: string): string {
  try {
    const { protocol, host } = new URL(url);
    return `${protocol}//${host}`;
  } catch {
    return "(keine gültige Adresse)";
  }
}

/**
 * Ob ein Rechner hinter der Adresse im eigenen Netz liegt: localhost, 127.0.0.1, ::1, private IPv4-Adressen, Namen ohne
 * Punkt (z. B. ein Dienst in Docker Compose) und die für private Netze reservierten Endungen .internal, .local, .lan.
 */
export function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return isLocalHost(host) || !host.includes(".") || /\.(internal|local|lan)$/.test(host);
}
