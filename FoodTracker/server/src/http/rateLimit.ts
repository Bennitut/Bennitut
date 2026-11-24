import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

/**
 * Einfaches Rate-Limit im Speicher: höchstens `limit` Versuche je Schlüssel innerhalb von `windowMs` (gleitendes
 * Fenster). Reicht für einen Server; nach einem Neustart beginnt die Zählung von vorn.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Sekunden bis zum nächsten erlaubten Versuch; 0 = jetzt erlaubt. Zählt nichts. */
  wait(key: string): number {
    const recent = this.recent(key);
    if (recent.length < this.limit) return 0;
    return Math.max(1, Math.ceil((recent[recent.length - this.limit]! + this.windowMs - this.now()) / 1000));
  }

  /** Zählt einen Versuch und gibt wie `wait` die Wartezeit zurück (bei Überschreitung wird nicht gezählt). */
  hit(key: string): number {
    const wait = this.wait(key);
    if (wait > 0) return wait;
    const recent = this.recent(key);
    recent.push(this.now());
    this.hits.set(key, recent.slice(-this.limit));
    if (this.hits.size > 50_000) this.prune();
    return 0;
  }

  /** Nach erfolgreicher Anmeldung: die Fehlversuche zählen nicht weiter. */
  reset(key: string) {
    this.hits.delete(key);
  }

  private recent(key: string): number[] {
    const from = this.now() - this.windowMs;
    return (this.hits.get(key) ?? []).filter((t) => t > from);
  }

  private prune() {
    for (const key of [...this.hits.keys()]) {
      if (this.recent(key).length === 0) this.hits.delete(key);
    }
  }
}

/**
 * IP-Adresse der Anfrage für das Rate-Limit. Hinter einem Proxy (Cloudflare Tunnel, Render …) steht die echte Adresse
 * in einem Header – dem nur mit TRUST_PROXY=1 trauen, sonst könnte jede:r eine beliebige Adresse vorgeben.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const cloudflare = c.req.header("CF-Connecting-IP")?.trim();
    if (cloudflare) return cloudflare;
    // Der vorderste Proxy hängt die Adresse, die er sieht, hinten an; weiter vorn kann alles Mögliche stehen.
    const forwarded = c.req.header("X-Forwarded-For")?.split(",").map((s) => s.trim()).filter(Boolean).pop();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "unbekannt";
  } catch {
    // Ohne Node-Server (Tests mit app.request) gibt es keine Verbindung.
    return "unbekannt";
  }
}
