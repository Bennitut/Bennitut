// Rate-Limits im Speicher (Vorrang 1, 9.1 und 9.3 „Sicherheit“). Reicht für einen Server; nach einem Neustart beginnt
// die Zählung von vorn. Die Adresse der Anfrage kommt aus http/proxy.ts (TRUST_PROXY).

/** So viele Schlüssel merkt sich ein Limit höchstens; darüber fallen zuerst die abgelaufenen, dann die ältesten weg. */
const MAX_KEYS = 50_000;
/**
 * Spätestens so oft fällt Abgelaufenes aus dem Speicher: Adressen und Konten bleiben damit höchstens ihr Zeitfenster
 * (längstens eine Stunde) plus eine Minute im Arbeitsspeicher – so steht es in der Datenschutzerklärung (B1).
 */
const SWEEP_MS = 60_000;

/** Zu viele Anfragen: 429 mit `error` und `retryAfter` (Sekunden), dazu der Header Retry-After (app.ts, onError). */
export class TooManyRequestsError extends Error {
  constructor(
    readonly code: "rate_limited" | "ai_rate_limited" | "auth_rate_limited",
    readonly retryAfter: number,
  ) {
    super(code);
  }
}

/**
 * Räumt auf: einmal pro Minute (und sobald es zu viele werden) alles Abgelaufene weg; sind es danach noch mehr als
 * MAX_KEYS, die am längsten unbenutzten (die beginnen dann von vorn).
 */
function sweep<V>(map: Map<string, V>, expired: (value: V) => boolean, state: { last: number }, now: number) {
  if (now - state.last >= SWEEP_MS || map.size > MAX_KEYS) {
    state.last = now;
    for (const [key, value] of map) if (expired(value)) map.delete(key);
  }
  if (map.size <= MAX_KEYS) return;
  for (const key of map.keys()) {
    if (map.size <= MAX_KEYS * 0.9) break;
    map.delete(key);
  }
}

/**
 * Höchstens `limit` Versuche je Schlüssel innerhalb von `windowMs` (gleitendes Fenster) – für kleine Grenzen wie
 * Anmeldeversuche oder KI-Anfragen (merkt sich bis zu `limit` Zeitpunkte je Schlüssel).
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly swept = { last: 0 };

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
    // Neu einsortieren, damit beim Aufräumen die am längsten unbenutzten zuerst wegfallen.
    this.hits.delete(key);
    this.hits.set(key, recent.slice(-this.limit));
    const now = this.now();
    sweep(this.hits, (times) => times.every((t) => t <= now - this.windowMs), this.swept, now);
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
}

/**
 * Token-Eimer: je Schlüssel bis zu `capacity` Marken, die mit `perSecond` nachwachsen. Kurze Spitzen sind erlaubt
 * (die App lädt beim Start einiges auf einmal), auf Dauer nur `perSecond`. Eine Anfrage kann mehrere Marken kosten,
 * z. B. eine je Eintrag der Tagebuch-Sicherung. Braucht je Schlüssel nur zwei Zahlen – auch für große Grenzen.
 */
export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private readonly swept = { last: 0 };

  constructor(
    readonly capacity: number,
    readonly perSecond: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Nimmt `cost` Marken (höchstens `capacity`) und gibt 0 zurück – oder die Sekunden, bis genug da sind (nimmt dann nichts). */
  take(key: string, cost = 1): number {
    const now = this.now();
    const need = Math.min(Math.max(cost, 0), this.capacity);
    const tokens = this.level(key, now);
    if (tokens < need) return Math.max(1, Math.ceil((need - tokens) / this.perSecond));
    this.buckets.delete(key);
    this.buckets.set(key, { tokens: tokens - need, at: now });
    // Ein wieder voller Eimer ist wie keiner: weg damit.
    sweep(this.buckets, (b) => b.tokens + ((now - b.at) / 1000) * this.perSecond >= this.capacity, this.swept, now);
    return 0;
  }

  private level(key: string, now: number): number {
    const bucket = this.buckets.get(key);
    return bucket ? Math.min(this.capacity, bucket.tokens + ((now - bucket.at) / 1000) * this.perSecond) : this.capacity;
  }
}

/** KI-Anfragen pro Stunde je Adresse bzw. Konto, wenn AI_REQUESTS_PER_HOUR nichts anderes sagt. */
export const DEFAULT_AI_REQUESTS_PER_HOUR = 40;

/** Grenzen für alle Anfragen (pro Server, im Speicher); Anmelden und Registrieren haben eigene (app.ts, AuthLimits). */
export interface RequestLimits {
  /** Alle Anfragen unter /api je Adresse (außer dem Lebenszeichen): Spitzen bis 600, auf Dauer 2 pro Sekunde. */
  requests: TokenBucket;
  /** KI-Anfragen (Foto, Kassenbon, Import, Übersetzen, Text verbessern, Plan) je Adresse und je Konto; null = keine Grenze. */
  ai: RateLimiter | null;
  /** Neues für alle sichtbar oder gespeichert (Fotos, geteilte Rezepte, Meldungen) je Adresse. */
  uploads: RateLimiter;
  /** Einträge der Tagebuch-Sicherung ohne Konto je Adresse – Geräte-IDs kann sich jede:r ausdenken. */
  diary: TokenBucket;
}

export function defaultRequestLimits(aiPerHour = DEFAULT_AI_REQUESTS_PER_HOUR): RequestLimits {
  return {
    requests: new TokenBucket(600, 2),
    ai: aiPerHour > 0 ? new RateLimiter(aiPerHour, 60 * 60_000) : null,
    uploads: new RateLimiter(60, 60 * 60_000),
    diary: new TokenBucket(20_000, 20_000 / 3600),
  };
}

/** AI_REQUESTS_PER_HOUR aus der Umgebung: ganze Zahl ab 0 (0 = keine Grenze); ohne Angabe der Standard. */
export function parseAiPerHour(value: string | undefined): { ok: true; perHour: number } | { ok: false; problem: string } {
  const v = value?.trim() ?? "";
  if (v === "") return { ok: true, perHour: DEFAULT_AI_REQUESTS_PER_HOUR };
  if (/^\d{1,6}$/.test(v)) return { ok: true, perHour: Number(v) };
  return { ok: false, problem: `AI_REQUESTS_PER_HOUR="${v}" ist keine ganze Zahl (z. B. 40; 0 = keine Grenze).` };
}
