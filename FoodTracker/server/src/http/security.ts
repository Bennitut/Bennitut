import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { isLocalNetworkHost } from "../urls.js";
import { viaCloudflare, visitorScheme } from "./proxy.js";

// Schutz für den Server im Internet (Vorrang 1, 9.3 „Sicherheit“): nur über https, Header gegen das Einbetten und
// Erraten von Inhalten, Größengrenzen je Schnittstelle. Im eigenen Netz (Laptop, Test am iPhone) ändert sich nichts.

/** Rechnername aus dem Host-Header („example.com:443“, „[::1]:3000“ → „[::1]“) bzw. null. */
function hostname(host: string | undefined): string | null {
  if (!host) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Nur über https: Kam eine Anfrage laut Proxy unverschlüsselt aus dem Internet (X-Forwarded-Proto bzw. CF-Visitor
 * „http“, über Cloudflare oder an eine öffentliche Adresse), leitet GET bzw. HEAD auf https um; alles andere lehnt der
 * Server mit 403 `https_required` ab – Passwort und Daten kamen dann schon unverschlüsselt, aber er nimmt sie nicht an,
 * und die App sagt, was zu tun ist. Über https gibt es dazu HSTS: Der Browser fragt diese Adresse ein Jahr lang nur noch
 * über https. Anfragen ohne solche Angabe (direkt, im eigenen Netz) bleiben, wie sie sind.
 */
export function httpsOnly(): MiddlewareHandler {
  return async (c, next) => {
    const scheme = visitorScheme(c);
    if (scheme === null) return next();
    const host = c.req.header("Host");
    const name = hostname(host);
    const publicHost = name !== null && !isLocalNetworkHost(name);
    const fromInternet = publicHost || viaCloudflare(c);
    if (!fromInternet) return next();
    if (scheme === "http") {
      if ((c.req.method === "GET" || c.req.method === "HEAD") && publicHost) {
        const url = new URL(c.req.url);
        return c.redirect(`https://${host}${url.pathname}${url.search}`, 308);
      }
      return c.json({ error: "https_required" }, 403);
    }
    await next();
    c.header("Strict-Transport-Security", "max-age=31536000");
  };
}

/**
 * Header für jede Antwort: Der Server liefert nur JSON und Fotos – nichts davon soll ein Browser als etwas anderes
 * deuten (nosniff), in eine fremde Seite einbetten (frame-ancestors, X-Frame-Options) oder mit einem Referrer
 * weiterverraten. Fotos dürfen andere Seiten (die Web-Version auf GitHub Pages) weiter mit <img> zeigen.
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  };
}

const KB = 1024;
const MB = 1024 * KB;

/** Ohne eigenen Eintrag in BODY_LIMITS: reicht für Anmelden, Übersetzen (bis 50 Schritte), Sterne, Meldungen … */
export const DEFAULT_BODY_LIMIT = 512 * KB;

/**
 * Größte erlaubte Anfrage je Schnittstelle, mit Luft nach oben gegenüber dem, was die App schickt. Vorher galten 30 MB
 * für alles – so viel liest der Server jetzt nur noch beim Abgleich mit dem Konto (erst nach der Anmeldung).
 */
export const BODY_LIMITS: readonly (readonly [method: string, path: RegExp, bytes: number])[] = [
  // Abgleich mit dem Konto: je Art bis 4 Mio. Zeichen (app/src/lib/dataSync.ts, UPLOAD_CHARS), sieben Arten.
  ["POST", /^\/api\/sync$/, 32 * MB],
  // Rezept-Import: Beschreibung und bis zu zehn Einzelbilder aus einem Video (die App schickt sechs).
  ["POST", /^\/api\/recipes\/import$/, 24 * MB],
  // Foto einer Mahlzeit bzw. eines Kassenbons (die App verkleinert nicht, Qualität 0,5).
  ["POST", /^\/api\/analyze\/(?:meal|receipt)$/, 12 * MB],
  // Plan mit Wünschen: eigene Rezepte ohne Fotos (bis 500).
  ["POST", /^\/api\/(?:plan|recipes\/matching)$/, 8 * MB],
  // Sicherung des Tagebuchs: bis 5000 Einträge pro Anfrage (die App schickt 2000).
  ["POST", /^\/api\/diary\/sync$/, 4 * MB],
  // Rezept mit eigenem Foto (data-URI bis 700 000 Zeichen).
  ["POST", /^\/api\/community\/recipes$/, 2 * MB],
  ["PUT", /^\/api\/admin\/recipes\/[^/]+$/, 2 * MB],
  ["POST", /^\/api\/recipes\/[^/]+\/photos$/, 1 * MB],
];

export function bodyLimitFor(method: string, path: string): number {
  return BODY_LIMITS.find(([m, p]) => m === method && p.test(path))?.[2] ?? DEFAULT_BODY_LIMIT;
}

/** Größengrenze je Schnittstelle (BODY_LIMITS); darüber 413 `payload_too_large`, ohne den Rest zu lesen. */
export function bodyLimits(): MiddlewareHandler {
  const bySize = new Map<number, MiddlewareHandler>();
  const tooLarge = (c: Context, maxBytes: number) => c.json({ error: "payload_too_large", maxBytes }, 413);
  return (c, next) => {
    const maxSize = bodyLimitFor(c.req.method, c.req.path);
    let limit = bySize.get(maxSize);
    if (!limit) {
      limit = bodyLimit({ maxSize, onError: (ctx) => tooLarge(ctx, maxSize) });
      bySize.set(maxSize, limit);
    }
    return limit(c, next);
  };
}
