// Adresse des Servers (Vorrang 1, 9.2 Teil 7): woher sie kommt, wie eine im Profil eingetragene geprüft wird und welche
// Geräte-ID die App dort nutzt. Ohne native Module, damit alles in test/ läuft (lib/api.ts nutzt es mit den Werten von
// Expo und vom Browser).
//
// Reihenfolge: im Profil eingetragen → EXPO_PUBLIC_API_URL beim Start bzw. Bauen (z. B. in app/.env.local) → beim
// Entwickeln der Rechner, auf dem Expo läuft (Port 3000; der Laptop im WLAN) → in der exportierten Web-Version ohne
// feste Adresse kein Server. `EXPO_PUBLIC_API_URL=off` heißt ausdrücklich „ohne Server“ (Offline-Modus in Expo Go).

/** Woher die Adresse kommt: eingetragen, beim Start/Bauen fest vorgegeben, der Rechner mit Expo, gar keine. */
export type ServerSource = "custom" | "env" | "dev" | "none";

export interface ServerAddress {
  /** Ohne „/“ am Ende, z. B. „https://foodtracker.onrender.com“; null = kein Server. */
  url: string | null;
  source: ServerSource;
}

export interface DefaultServerInput {
  /** EXPO_PUBLIC_API_URL */
  env: string | undefined;
  /** Rechner, von dem Expo die App lädt (`Constants.expoConfig.hostUri` ohne Port), z. B. „192.168.1.20“. */
  devHost: string | undefined;
  web: boolean;
  /** `__DEV__` – nur beim Entwickeln gibt es einen Rechner mit Expo. */
  dev: boolean;
  /** Im Browser: Rechner, von dem die Seite kommt (`window.location.hostname`). */
  pageHost: string | undefined;
}

/** Standard-Adresse ohne Eintrag im Profil (bisher die einzige, siehe Kopf der Datei). */
export function defaultServer({ env, devHost, web, dev, pageHost }: DefaultServerInput): ServerAddress {
  const fixed = env?.trim();
  if (fixed) {
    if (fixed.toLowerCase() === "off") return { url: null, source: "none" };
    const parsed = parseServerUrl(fixed);
    // Unbrauchbar: so lassen, wie angegeben – dann fällt „Keine Verbindung zum Server“ auf, statt still keinen zu nehmen.
    return { url: parsed.ok ? parsed.url : fixed.replace(/\/+$/, ""), source: "env" };
  }
  if (devHost) return { url: `http://${devHost}:3000`, source: "dev" };
  if (web) {
    // `npx expo start --web`: Server auf dem Rechner, von dem die Seite kommt. Die exportierte Web-Version läuft ohne
    // Server und fragt nicht bei „localhost“ der Besucher:innen an.
    return dev && pageHost ? { url: `http://${pageHost}:3000`, source: "dev" } : { url: null, source: "none" };
  }
  return { url: "http://localhost:3000", source: "dev" };
}

export type ServerUrlError = "empty" | "invalid" | "scheme" | "credentials" | "insecure" | "https";
export type ParsedServerUrl = { ok: true; url: string } | { ok: false; error: ServerUrlError };

/**
 * Rechner im eigenen Netz bzw. auf dem eigenen Gerät – dort läuft der Server meist ohne https: localhost, private
 * IPv4- und IPv6-Adressen, Namen ohne Punkt (z. B. der Name des Laptops) und die Endungen fürs eigene Netz.
 */
function isLocalHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h === "::1" || /\.(localhost|local|lan|internal|home\.arpa|fritz\.box)$/.test(h)) return true;
  if (h.includes(":")) return /^(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(h);
  if (!h.includes(".")) return true;
  const ip = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/** Nur der eigene Rechner: Browser erlauben ihn auch aus einer https-Seite ohne https. */
const isLoopback = (host: string) => /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(host);

/**
 * Prüft eine im Profil eingetragene Adresse und bringt sie in eine einheitliche Form (ohne „/“ am Ende). Ohne
 * „http://“ bzw. „https://“ nimmt sie für Rechner im eigenen Netz http, sonst https; „http://“ zu einem Rechner im
 * Internet lehnt sie ab (`https`). Eine kopierte Test-Adresse wie
 * „…/api/health“ wird auf den Server gekürzt. `pageProtocol`: in der Web-Version das Protokoll der Seite – eine Seite
 * über https (GitHub Pages) darf keinen Server ohne https fragen (außer dem eigenen Rechner).
 */
export function parseServerUrl(input: string, { pageProtocol }: { pageProtocol?: string } = {}): ParsedServerUrl {
  const text = input.trim();
  if (!text) return { ok: false, error: "empty" };
  if (/\s/.test(text) || text.length > 300) return { ok: false, error: "invalid" };
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  if (!hasScheme && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return { ok: false, error: "scheme" };
  let url: URL;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
    if (!hasScheme && !isLocalHost(url.hostname)) url = new URL(`https://${text}`);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "scheme" };
  if (!url.hostname || url.hostname.includes("..")) return { ok: false, error: "invalid" };
  if (url.username || url.password) return { ok: false, error: "credentials" };
  if (url.search || url.hash) return { ok: false, error: "invalid" };
  // Server im Internet nur über https (Vorrang 1, 9.3 „Sicherheit“) – sonst gingen Passwort, Sitzung und Daten
  // unverschlüsselt durchs Netz. Ohne https nur der eigene Rechner und das eigene Netz (der Laptop zum Testen).
  if (url.protocol === "http:" && !isLocalHost(url.hostname)) return { ok: false, error: "https" };
  if (pageProtocol === "https:" && url.protocol === "http:" && !isLoopback(url.hostname)) return { ok: false, error: "insecure" };
  const path = url.pathname.replace(/\/+$/, "").replace(/\/api(?:\/health)?$/i, "");
  return { ok: true, url: `${url.protocol}//${url.host}${path}` };
}

// --------------------------------------------------------------------------------------------------------------
// Einstellung im Profil (eigener Speicherschlüssel, nicht im übrigen Zustand – und nie im Abgleich mit dem Konto)
// --------------------------------------------------------------------------------------------------------------

export const SERVER_KEY = "foodtracker/server/v1";
/** So viele Geräte-IDs für eingetragene Adressen merkt sich die App höchstens (die ältesten fallen weg). */
export const MAX_DEVICE_IDS = 20;

export interface ServerSetting {
  /** Im Profil eingetragene Adresse; null = die Standard-Adresse (defaultServer). */
  custom: string | null;
  /**
   * Geräte-ID je eingetragener Adresse. Die Geräte-ID verwaltet ohne Konto die Daten des Geräts auf dem Server
   * (Sicherung des Tagebuchs, Fotos, Sterne) – ein anderer Server soll die für den Standard-Server nie erfahren.
   */
  deviceIds: Record<string, string>;
}

export const emptyServerSetting = (): ServerSetting => ({ custom: null, deviceIds: {} });

/** Einstellung aus dem Speicher; Unbrauchbares fällt weg (dann gilt die Standard-Adresse). */
export function readServerSetting(raw: string | null): ServerSetting {
  let value: unknown;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    return emptyServerSetting();
  }
  if (!value || typeof value !== "object") return emptyServerSetting();
  const v = value as Record<string, unknown>;
  const custom = typeof v.custom === "string" ? parseServerUrl(v.custom) : null;
  const deviceIds: Record<string, string> = {};
  if (v.deviceIds && typeof v.deviceIds === "object") {
    for (const [url, id] of Object.entries(v.deviceIds as Record<string, unknown>)) {
      if (typeof id === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(id)) deviceIds[url] = id;
    }
  }
  return { custom: custom?.ok ? custom.url : null, deviceIds };
}

/** Die Adresse, mit der die App spricht. */
export function effectiveServer(setting: ServerSetting, fallback: ServerAddress): ServerAddress {
  return setting.custom ? { url: setting.custom, source: "custom" } : fallback;
}

/**
 * Für welchen Server eine Anmeldung gilt (lib/session.ts): die eingetragene Adresse bzw. „default“ für die
 * Standard-Adresse – auch wenn sich die beim Entwickeln ändert (der Laptop bekommt im WLAN eine neue Adresse).
 */
export const serverKey = (setting: ServerSetting) => setting.custom ?? "default";

/** Neue Einstellung mit dieser Adresse (null = Standard); eine eingetragene, die der Standard-Adresse gleicht, ist keine. */
export function withCustom(setting: ServerSetting, custom: string | null, fallback: ServerAddress): ServerSetting {
  const next = custom && custom !== fallback.url ? custom : null;
  return next === setting.custom ? setting : { ...setting, custom: next };
}

/** Geräte-ID für die aktuelle Adresse, ohne eine neue anzulegen (dafür deviceIdFor). */
export const knownDeviceId = (setting: ServerSetting, defaultId: string) => (setting.custom ? (setting.deviceIds[setting.custom] ?? defaultId) : defaultId);

/**
 * Geräte-ID für diesen Server: für die Standard-Adresse die bisherige (`defaultId`), für eine eingetragene eine eigene,
 * die beim ersten Mal entsteht (`newId`) und beim Zurückwechseln wieder gilt. Liefert auch die Einstellung, in der sie
 * steht (unverändert dasselbe Objekt).
 */
export function deviceIdFor(setting: ServerSetting, defaultId: string, newId: () => string): { id: string; setting: ServerSetting } {
  const url = setting.custom;
  if (!url) return { id: defaultId, setting };
  const known = setting.deviceIds[url];
  if (known) return { id: known, setting };
  const id = newId();
  const entries = [...Object.entries(setting.deviceIds), [url, id] as const].slice(-MAX_DEVICE_IDS);
  return { id, setting: { ...setting, deviceIds: Object.fromEntries(entries) } };
}
