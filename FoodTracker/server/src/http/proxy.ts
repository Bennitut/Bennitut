import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { isIP, isIPv6 } from "node:net";

// Hinter einem Proxy oder Tunnel (Cloudflare Tunnel, Render, Tailscale Funnel, nginx …) kommen alle Anfragen von dessen
// Adresse; die der Besucher:innen steht in einem Header, den der Proxy setzt. Welchem Header der Server dafür traut,
// sagt TRUST_PROXY – nie einfach dem erstbesten: Was kein Proxy selbst setzt, kann jede:r mitschicken und sich so vor
// dem Rate-Limit als jemand anderes ausgeben (Vorrang 1, 9.3 „Sicherheit“).

/**
 * Welchem Header die Adresse für das Rate-Limit entnommen wird:
 * - false: keinem – die Adresse der Verbindung zählt (Standard, ohne Proxy davor).
 * - "cloudflare": nur CF-Connecting-IP. Cloudflare setzt ihn bei jeder Anfrage selbst und ersetzt, was mitkam
 *   (Cloudflare Tunnel; Render läuft laut Berichten ebenfalls hinter Cloudflare).
 * - n (1–10): der n-te Eintrag von hinten in X-Forwarded-For. Jeder Proxy hängt die Adresse an, von der er die
 *   Anfrage bekam; weiter vorn kann alles Mögliche stehen. 1 = ein Proxy davor (nginx, Caddy …).
 */
export type TrustProxy = false | "cloudflare" | number;

export const MAX_PROXY_HOPS = 10;

export type TrustProxySetting = { ok: true; trust: TrustProxy } | { ok: false; problem: string };

/** TRUST_PROXY aus der Umgebung; Unbekanntes lässt den Server nicht starten (lieber gar nicht als falsch geschützt). */
export function parseTrustProxy(value: string | undefined): TrustProxySetting {
  const v = value?.trim().toLowerCase() ?? "";
  if (v === "" || v === "0" || v === "false" || v === "off") return { ok: true, trust: false };
  if (v === "cloudflare") return { ok: true, trust: "cloudflare" };
  if (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= MAX_PROXY_HOPS) return { ok: true, trust: Number(v) };
  return {
    ok: false,
    problem:
      `TRUST_PROXY="${value?.trim()}" kennt der Server nicht. Erlaubt: cloudflare (hinter Cloudflare Tunnel oder Render), ` +
      `eine Zahl von 1 bis ${MAX_PROXY_HOPS} (so viele Proxys davor, die X-Forwarded-For ergänzen) oder weglassen (kein Proxy).`,
  };
}

/** Wie TRUST_PROXY wirkt – für die Startmeldung. */
export function trustProxyLine(trust: TrustProxy): string {
  if (trust === false) return "Adresse der Verbindung (kein Proxy; hinter Cloudflare Tunnel oder Render: TRUST_PROXY=cloudflare)";
  if (trust === "cloudflare") return "Adresse aus CF-Connecting-IP (TRUST_PROXY=cloudflare)";
  return `${trust === 1 ? "letzter" : `${trust}.-letzter`} Eintrag in X-Forwarded-For (TRUST_PROXY=${trust})`;
}

/** Header, die ein Proxy oder Tunnel selbst setzt (Cloudflare Tunnel, Render, Tailscale Funnel, nginx …). */
const PROXY_HEADERS = ["cf-connecting-ip", "cf-ray", "x-forwarded-for", "forwarded", "x-real-ip", "true-client-ip", "tailscale-funnel-request"];

/**
 * Kam die Anfrage über einen Proxy oder Tunnel, also womöglich aus dem Internet? Dann gibt es z. B. keinen Dev-Login,
 * auch wenn ALLOW_DEV_LOGIN=1 in server/.env steht – etwa auf dem Laptop, den ein Tunnel erreichbar macht (Weg a in
 * docs/SERVER-HOSTING.md). Cloudflare setzt seine Header bei jeder Anfrage selbst, wegnehmen kann sie niemand.
 */
export const viaProxy = (c: Context) => PROXY_HEADERS.some((name) => c.req.header(name) !== undefined);

/** Über Cloudflare (Tunnel oder Proxy) – an den Headern, die Cloudflare immer setzt. */
export const viaCloudflare = (c: Context) => c.req.header("CF-Ray") !== undefined || c.req.header("CF-Connecting-IP") !== undefined;

/** Adresse ohne Klammern, Port und Zone; IPv4 in IPv6 („::ffff:1.2.3.4“) als IPv4. null = keine IP-Adresse. */
export function normalizeIp(value: string | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(v);
  if (bracketed) v = bracketed[1]!;
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(":"));
  v = v.replace(/%.*$/, "").toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v);
  if (mapped) v = mapped[1]!;
  return isIP(v) ? v : null;
}

/**
 * Schlüssel fürs Rate-Limit: IPv4 wie sie ist, IPv6 nach den ersten 64 Bit – ein Anschluss bekommt meist ein ganzes
 * /64-Netz und könnte sonst für jeden Versuch eine neue Adresse nehmen.
 */
export function addressKey(ip: string): string {
  if (!isIPv6(ip)) return ip;
  const [head = "", tail = ""] = ip.split("::");
  const front = head ? head.split(":") : [];
  const back = ip.includes("::") && tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...front, ...Array<string>(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back] : front;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/**
 * Ermittelt die Adresse der Besucher:innen für die Rate-Limits und sagt einmal im Fenster bzw. Protokoll Bescheid, wenn
 * TRUST_PROXY offenbar nicht zum Weg passt, auf dem die Anfragen kommen – ohne Adressen zu nennen.
 */
export class ClientAddresses {
  private readonly said = new Set<string>();

  constructor(
    readonly trust: TrustProxy,
    private readonly warn: (message: string) => void = console.warn,
  ) {}

  /** Adresse der Anfrage (bzw. „unbekannt“ ohne Verbindung, etwa in Tests mit app.request). */
  of(c: Context): string {
    return this.fromHeaders(c) ?? this.socket(c);
  }

  /** Schlüssel fürs Rate-Limit (siehe addressKey). */
  key(c: Context): string {
    const ip = this.of(c);
    return ip === "unbekannt" ? ip : addressKey(ip);
  }

  private fromHeaders(c: Context): string | null {
    const cloudflare = normalizeIp(c.req.header("CF-Connecting-IP"));
    if (this.trust === false) {
      if (viaProxy(c)) {
        this.once(
          "untrusted",
          "Anfragen kommen über einen Proxy oder Tunnel, TRUST_PROXY ist aber nicht gesetzt: Für das Rate-Limit sehen dann alle gleich aus – " +
            "wer sich ein paarmal vertippt, bremst alle. Hinter Cloudflare Tunnel oder Render TRUST_PROXY=cloudflare setzen, hinter einem anderen Proxy TRUST_PROXY=1.",
        );
      }
      return null;
    }
    if (this.trust === "cloudflare") {
      if (cloudflare) return cloudflare;
      if (viaProxy(c)) {
        this.once(
          "no-cloudflare",
          "TRUST_PROXY=cloudflare, aber eine Anfrage über einen Proxy kam ohne CF-Connecting-IP – steht kein Cloudflare davor? Dann TRUST_PROXY=1 " +
            "(bzw. die Zahl der Proxys davor).",
        );
      }
      return null;
    }
    const forwarded = (c.req.header("X-Forwarded-For") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (forwarded.length === 0) return null;
    if (forwarded.length < this.trust) {
      this.once("short", `TRUST_PROXY=${this.trust}, aber X-Forwarded-For hat weniger Einträge – stehen weniger Proxys davor? Dann TRUST_PROXY kleiner wählen.`);
      return null;
    }
    const picked = normalizeIp(forwarded[forwarded.length - this.trust]);
    if (cloudflare && picked && cloudflare !== picked) {
      this.once(
        "cloudflare-differs",
        "Cloudflare (CF-Connecting-IP) meldet eine andere Adresse als X-Forwarded-For – hinter Cloudflare Tunnel oder Render TRUST_PROXY=cloudflare nehmen.",
      );
    }
    return picked;
  }

  private socket(c: Context): string {
    try {
      return normalizeIp(getConnInfo(c).remote.address) ?? "unbekannt";
    } catch {
      // Ohne Node-Server (Tests mit app.request) gibt es keine Verbindung.
      return "unbekannt";
    }
  }

  private once(key: string, message: string) {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.warn(`\n  Hinweis: ${message}\n`);
  }
}

/**
 * Wie die Besucher:innen den Proxy erreicht haben, laut X-Forwarded-Proto, Forwarded („proto=“) oder CF-Visitor –
 * „http“, sobald einer das sagt; null ohne solche Angabe (direkt verbunden, z. B. im eigenen Netz).
 */
export function visitorScheme(c: Context): "http" | "https" | null {
  const reported: string[] = [];
  const proto = c.req.header("X-Forwarded-Proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) reported.push(proto);
  for (const match of (c.req.header("Forwarded") ?? "").matchAll(/(?:^|[;,\s])proto="?([a-z]+)"?/gi)) reported.push(match[1]!.toLowerCase());
  const visitor = c.req.header("CF-Visitor");
  if (visitor) {
    try {
      const scheme = (JSON.parse(visitor) as { scheme?: unknown }).scheme;
      if (typeof scheme === "string") reported.push(scheme.toLowerCase());
    } catch {
      // Unlesbar: zählt nicht.
    }
  }
  if (reported.includes("http")) return "http";
  return reported.includes("https") ? "https" : null;
}
