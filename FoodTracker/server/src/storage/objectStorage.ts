import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { DirectoryImageStore, imageTypeOfKey, isImageKey, newImageKey, type ImageStore, type StoredImage } from "./images.js";
import { EMPTY_SHA256, canonicalQuery, sha256Hex, signRequest, uriEncode, type S3Credentials } from "./sigv4.js";

// Objektspeicher mit S3-Schnittstelle für die Fotos (Vorrang 1, 9.3): Kostenlose Cloud-Dienste wie Render verlieren
// Dateien bei jedem Neustart, Fotos aus data/photos/ wären dort nach spätestens einem Tag weg. Dann liegen sie in einem
// Bucket (Cloudflare R2, Backblaze B2, Neon, Supabase …), eingestellt mit S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID und
// S3_SECRET_ACCESS_KEY (alles erklärt in .env.example). Dieselbe Schnittstelle wie der Ordner: Die Datenbank kennt nur
// den Schlüssel, die App holt jedes Bild weiter über GET /api/images/<Schlüssel> beim Server – so bleibt der Bucket
// privat, und „Nur ich“-Fotos bekommt nur, wer den Pfad hat.
// Ohne AWS-SDK (Dutzende Pakete): vier Anfragen mit Signatur nach AWS Signature Version 4 (sigv4.ts), Adressen immer im
// Pfad-Stil (https://<Endpoint>/<Bucket>/<Schlüssel>) – den können alle genannten Anbieter, Neon und Supabase nur ihn.

export interface ObjectStorageSettings {
  /** Adresse der S3-Schnittstelle des Anbieters, ohne Bucket (darf einen Pfad haben, z. B. bei Supabase /storage/v1/s3). */
  endpoint: URL;
  bucket: string;
  /** Region für die Signatur (R2: „auto“, sonst z. B. eu-central-1). */
  region: string;
  /** Ordner im Bucket, z. B. „fotos/“ – leer: direkt im Bucket. */
  prefix: string;
  credentials: S3Credentials;
}

export type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

export interface ObjectStorageOptions {
  /** Für Tests; sonst das fetch von Node.js. */
  fetch?: FetchLike;
  /** Zeitlimit pro Versuch (Standard 20 s – ein Foto hat höchstens 5 MB). */
  timeoutMs?: number;
  /** Wartezeit vor dem 2., 3. … Versuch bei Netzfehlern und HTTP 429/5xx (Standard 0,3 s und 1,2 s). */
  retryDelaysMs?: readonly number[];
}

/** Falsch oder unvollständig eingestellt – die Meldung sagt, welche Variable. */
export class ObjectStorageConfigError extends Error {
  override name = "ObjectStorageConfigError";
}

/** Der Objektspeicher hat abgelehnt (status, code aus seiner Antwort) oder war nicht erreichbar (ohne status). */
export class ObjectStorageError extends Error {
  override name = "ObjectStorageError";
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

/** Inhalt eines Elements aus der XML-Antwort von S3, z. B. <Code>NoSuchKey</Code>. */
function xmlValues(xml: string, tag: string): string[] {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map((m) =>
    m[1]!.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => entities[name]!),
  );
}
const xmlValue = (xml: string, tag: string) => xmlValues(xml, tag)[0];

/** Kurzer Grund für einen Netzfehler, ohne Adresse oder Zugangsdaten (z. B. ENOTFOUND, ECONNREFUSED, TimeoutError). */
function networkReason(e: unknown): string {
  const err = e as { name?: string; code?: string; cause?: { code?: string } };
  return err.cause?.code ?? err.code ?? err.name ?? "unbekannt";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function drain(res: Response) {
  await res.body?.cancel().catch(() => undefined);
}

function requireImageKey(key: string) {
  if (!isImageKey(key)) throw new Error("Ungültiger Schlüssel für ein Bild");
}

export class ObjectImageStore implements ImageStore {
  readonly description: string;
  private readonly fetch: FetchLike;
  private readonly timeoutMs: number;
  private readonly retryDelaysMs: readonly number[];

  constructor(
    private readonly settings: ObjectStorageSettings,
    options: ObjectStorageOptions = {},
  ) {
    const base = settings.endpoint.pathname.replace(/\/+$/, "");
    this.description = `Objektspeicher (S3) ${settings.bucket}${settings.prefix ? `/${settings.prefix}` : ""} bei ${settings.endpoint.host}${base}`;
    this.fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.retryDelaysMs = options.retryDelaysMs ?? [300, 1200];
  }

  /** https://<Endpoint>/<Bucket>[/<Ordner><Schlüssel>][?Abfrage] – genau so kodiert, wie es signiert wird. */
  private url(objectKey: string | null, query?: Record<string, string>): URL {
    const base = this.settings.endpoint.pathname.replace(/\/+$/, "");
    const url = new URL(this.settings.endpoint.origin);
    url.pathname = `${base}/${uriEncode(this.settings.bucket)}${objectKey === null ? "" : `/${objectKey.split("/").map(uriEncode).join("/")}`}`;
    if (query) url.search = canonicalQuery(Object.entries(query));
    return url;
  }

  /** Eine Anfrage mit Signatur; bei Netzfehlern und HTTP 429/5xx bis zu zweimal wiederholt (alle vier sind wiederholbar). */
  private async send(method: "GET" | "PUT" | "DELETE", objectKey: string | null, options: { query?: Record<string, string>; body?: Uint8Array<ArrayBuffer>; contentType?: string } = {}): Promise<Response> {
    const url = this.url(objectKey, options.query);
    const payloadHash = options.body ? sha256Hex(options.body) : EMPTY_SHA256;
    const extra: Record<string, string> = options.contentType ? { "content-type": options.contentType } : {};
    for (let attempt = 0; ; attempt++) {
      const signed = signRequest({ method, url, headers: extra, payloadHash, region: this.settings.region, credentials: this.settings.credentials, now: new Date() });
      const retryIn = this.retryDelaysMs[attempt];
      try {
        const res = await this.fetch(url, { method, headers: { ...extra, ...signed.headers }, body: options.body, signal: AbortSignal.timeout(this.timeoutMs) });
        if (!RETRY_STATUS.has(res.status) || retryIn === undefined) return res;
        await drain(res);
      } catch (e) {
        if (retryIn === undefined) throw new ObjectStorageError(`Objektspeicher nicht erreichbar (${networkReason(e)})`);
      }
      await sleep(retryIn);
    }
  }

  /** Fehler aus der Antwort: HTTP-Status, Code und Meldung des Anbieters (nie Zugangsdaten – die stehen dort nicht). */
  private async failure(res: Response, action: string): Promise<ObjectStorageError> {
    const text = (await res.text().catch(() => "")).slice(0, 4000);
    const code = xmlValue(text, "Code");
    const message = xmlValue(text, "Message");
    return new ObjectStorageError(`${action}: HTTP ${res.status}${code ? ` ${code}` : ""}${message ? ` – ${message.slice(0, 200)}` : ""}`, res.status, code);
  }

  /** Gibt es das Objekt nicht? S3 sagt 404 bzw. „NoSuchKey“ (manche Anbieter mit anderem Status). */
  private async missing(res: Response, action: string): Promise<boolean> {
    if (res.status === 404) {
      await drain(res);
      return true;
    }
    if (res.ok) return false;
    const error = await this.failure(res, action);
    if (error.code === "NoSuchKey") return true;
    throw error;
  }

  async put(key: string, image: StoredImage): Promise<void> {
    requireImageKey(key);
    const res = await this.send("PUT", this.settings.prefix + key, { body: image.bytes, contentType: image.type });
    if (!res.ok) throw await this.failure(res, "Foto speichern");
    await drain(res);
  }

  async get(key: string): Promise<StoredImage | undefined> {
    if (!isImageKey(key)) return undefined;
    const res = await this.send("GET", this.settings.prefix + key);
    if (await this.missing(res, "Foto lesen")) return undefined;
    return { type: imageTypeOfKey(key), bytes: new Uint8Array(await res.arrayBuffer()) };
  }

  async delete(key: string): Promise<void> {
    if (!isImageKey(key)) return;
    const res = await this.send("DELETE", this.settings.prefix + key);
    // Schon weg ist auch gut; alles andere wirft.
    if (!res.ok) await this.missing(res, "Foto löschen");
    await drain(res);
  }

  /** Alle Fotos im Bucket bzw. Ordner (ListObjectsV2, seitenweise); andere Objekte zählen nicht. */
  async list(): Promise<string[]> {
    const { prefix } = this.settings;
    const keys: string[] = [];
    const seen = new Set<string>();
    let token: string | undefined;
    do {
      const res = await this.send("GET", null, { query: { "list-type": "2", ...(prefix ? { prefix } : {}), ...(token ? { "continuation-token": token } : {}) } });
      if (!res.ok) throw await this.failure(res, "Fotos auflisten");
      const xml = await res.text();
      for (const key of xmlValues(xml, "Key")) {
        if (key.startsWith(prefix) && isImageKey(key.slice(prefix.length))) keys.push(key.slice(prefix.length));
      }
      const truncated = xmlValue(xml, "IsTruncated") === "true";
      token = truncated ? xmlValue(xml, "NextContinuationToken") : undefined;
      if (truncated && (!token || seen.has(token))) throw new ObjectStorageError("Fotos auflisten: Der Objektspeicher liefert keine nächste Seite (NextContinuationToken)");
      if (token) seen.add(token);
    } while (token);
    return keys.sort();
  }

  /**
   * Beim Start: eine kleine Probe speichern, lesen und löschen, dazu ein fehlendes Foto lesen. So fallen falsche
   * Zugangsdaten, Region oder Rechte sofort auf – nicht erst, wenn jemand ein Foto hochlädt.
   */
  async check(): Promise<void> {
    const probe = `${this.settings.prefix}foodtracker-probe-${randomUUID()}.txt`;
    const body = new Uint8Array(Buffer.from("FoodTracker: Probe beim Start des Servers, wird gleich wieder gelöscht.\n"));
    const put = await this.send("PUT", probe, { body, contentType: "text/plain; charset=utf-8" });
    if (!put.ok) throw await this.failure(put, "Probe speichern");
    await drain(put);
    let failure: unknown;
    try {
      const got = await this.send("GET", probe);
      if (!got.ok) throw await this.failure(got, "Probe lesen");
      if (!Buffer.from(await got.arrayBuffer()).equals(Buffer.from(body))) throw new ObjectStorageError("Probe lesen: Der Objektspeicher liefert etwas anderes zurück, als gespeichert wurde");
      // Ein fehlendes Foto muss als „gibt es nicht“ ankommen (die App zeigt dann einen Platzhalter), nicht als Fehler.
      // AWS antwortet ohne das Recht, den Bucket aufzulisten, mit 403 statt 404.
      const absent = await this.send("GET", this.settings.prefix + newImageKey("image/jpeg"));
      if (absent.status === 403) {
        await drain(absent);
        throw new ObjectStorageError("Fehlendes Foto lesen: HTTP 403 statt 404 – der Schlüssel darf den Bucket vermutlich nicht auflisten", 403, "AccessDenied");
      }
      if (!(await this.missing(absent, "Fehlendes Foto lesen"))) {
        await drain(absent);
        throw new ObjectStorageError("Fehlendes Foto lesen: Der Objektspeicher liefert ein Foto, das es nicht geben dürfte");
      }
    } catch (e) {
      failure = e;
    }
    const removed = await this.send("DELETE", probe).catch((e: unknown) => e as Error);
    if (failure) throw failure;
    if (removed instanceof Error) throw removed;
    if (!removed.ok) await this.missing(removed, "Probe löschen");
    await drain(removed);
  }
}

// ----------------------------------------------------------------------------------------------------------------
// Einstellungen aus der Umgebung (server/.env bzw. beim Hoster)
// ----------------------------------------------------------------------------------------------------------------

const VARIABLES = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;

/** Region aus der Adresse bekannter Anbieter – dann muss S3_REGION nicht gesetzt sein. */
export function regionFromEndpoint(host: string): string | undefined {
  if (/(^|\.)r2\.cloudflarestorage\.com$/.test(host)) return "auto";
  const match =
    /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/.exec(host) ?? // Backblaze B2: s3.eu-central-003.backblazeb2.com
    /\.([a-z]{2}-[a-z]+-\d+)\.aws\.neon\.tech$/.exec(host) ?? // Neon: br-….storage.c-2.eu-central-1.aws.neon.tech
    /^s3[.-]([a-z]{2}-[a-z]+-\d+)\.amazonaws\.com$/.exec(host); // AWS: s3.eu-central-1.amazonaws.com
  if (match) return match[1];
  if (host === "s3.amazonaws.com") return "us-east-1";
  return undefined;
}

/** http:// nur zum eigenen Rechner und ins eigene Netz (z. B. MinIO zum Testen) – ins Internet immer https://. */
function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split(".").map(Number) as [number, number];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * Einstellungen des Objektspeichers – null, wenn keine S3_*-Variable gesetzt ist (dann der Ordner PHOTOS_DIR). Fehlt
 * nur ein Teil oder stimmt etwas nicht, eine Meldung mit der Variable, statt Fotos stillschweigend im Ordner abzulegen,
 * der beim nächsten Neustart verschwindet.
 */
export function objectStorageFromEnv(env: NodeJS.ProcessEnv): ObjectStorageSettings | null {
  const value = (name: string) => env[name]?.trim() || undefined;
  const given = VARIABLES.filter((name) => value(name));
  if (given.length === 0 && !value("S3_REGION") && !value("S3_PREFIX")) return null;
  const missing = VARIABLES.filter((name) => !value(name));
  if (missing.length > 0) {
    throw new ObjectStorageConfigError(`Für den Objektspeicher fehlt ${missing.join(", ")} (gesetzt: ${[...given, ...["S3_REGION", "S3_PREFIX"].filter((n) => value(n))].join(", ")}). Entweder alle vier setzen oder keine – ohne liegen die Fotos im Ordner PHOTOS_DIR.`);
  }
  let endpoint: URL;
  try {
    endpoint = new URL(value("S3_ENDPOINT")!.includes("://") ? value("S3_ENDPOINT")! : `https://${value("S3_ENDPOINT")}`);
  } catch {
    throw new ObjectStorageConfigError("S3_ENDPOINT ist keine gültige Adresse (Beispiel: https://<Konto-ID>.r2.cloudflarestorage.com).");
  }
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && isLocalHost(endpoint.hostname))) {
    throw new ObjectStorageConfigError("S3_ENDPOINT muss mit https:// beginnen (http:// nur zum eigenen Rechner oder ins eigene Netz).");
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new ObjectStorageConfigError("S3_ENDPOINT nur als Adresse, ohne Zugangsdaten, „?“ oder „#“ – Schlüssel gehören in S3_ACCESS_KEY_ID und S3_SECRET_ACCESS_KEY.");
  }
  const bucket = value("S3_BUCKET")!;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,61}[A-Za-z0-9]$/.test(bucket) || bucket.includes("..")) {
    throw new ObjectStorageConfigError("S3_BUCKET ist kein gültiger Bucket-Name (3–63 Zeichen: Buchstaben, Ziffern, Punkt, Bindestrich).");
  }
  const region = value("S3_REGION") ?? regionFromEndpoint(endpoint.hostname);
  if (!region) {
    throw new ObjectStorageConfigError(`S3_REGION fehlt – bei ${endpoint.hostname} steht sie beim Anbieter neben der Adresse (z. B. eu-central-1).`);
  }
  if (!/^[a-z0-9-]{2,40}$/.test(region)) throw new ObjectStorageConfigError("S3_REGION sieht nicht wie eine Region aus (z. B. auto oder eu-central-1).");
  let prefix = (value("S3_PREFIX") ?? "").replace(/^\/+/, "");
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  if (!/^[A-Za-z0-9._\-/]*$/.test(prefix) || prefix.split("/").some((part) => part === "." || part === "..") || prefix.includes("//")) {
    throw new ObjectStorageConfigError("S3_PREFIX darf nur Buchstaben, Ziffern, „.“, „_“, „-“ und „/“ enthalten (z. B. fotos/).");
  }
  return {
    endpoint,
    bucket,
    region,
    prefix,
    credentials: { accessKeyId: value("S3_ACCESS_KEY_ID")!, secretAccessKey: value("S3_SECRET_ACCESS_KEY")! },
  };
}

/** Bildspeicher nach den Einstellungen: Objektspeicher mit S3_*, sonst der Ordner PHOTOS_DIR (Standard data/photos). */
export function imageStoreFromEnv(env: NodeJS.ProcessEnv, options: ObjectStorageOptions = {}): ImageStore {
  const settings = objectStorageFromEnv(env);
  return settings ? new ObjectImageStore(settings, options) : new DirectoryImageStore(env.PHOTOS_DIR?.trim() || "data/photos");
}

/** Nächster Schritt zu einem Fehler beim Start – passend zur Antwort des Anbieters. */
export function objectStorageHint(error: unknown): string | null {
  if (!(error instanceof ObjectStorageError)) return null;
  const { status, code } = error;
  if (status === undefined) return "Stimmt S3_ENDPOINT? Ist der Anbieter gerade erreichbar?";
  if (code === "AuthorizationHeaderMalformed" || /region/i.test(error.message)) return "Stimmt S3_REGION? Sie steht beim Anbieter neben der Adresse (Cloudflare R2: auto).";
  if (code === "NoSuchBucket") return "Gibt es den Bucket aus S3_BUCKET beim Anbieter, genau so geschrieben?";
  if (code === "SignatureDoesNotMatch" || code === "InvalidAccessKeyId" || status === 401 || status === 403) {
    return "Stimmen S3_ACCESS_KEY_ID und S3_SECRET_ACCESS_KEY (ohne Leerzeichen)? Der Schlüssel muss in diesem Bucket lesen, schreiben, löschen und auflisten dürfen.";
  }
  return null;
}
