import { createHash, createHmac } from "node:crypto";

// AWS Signature Version 4 für die S3-Schnittstelle eines Objektspeichers (Fotos, Vorrang 1, 9.3) – ohne AWS-SDK: Das
// SDK brächte Dutzende Pakete mit, gebraucht werden nur vier Anfragen (Speichern, Lesen, Löschen, Auflisten). Alle
// Anbieter mit S3-Schnittstelle (Cloudflare R2, Backblaze B2, Neon, Supabase, MinIO …) prüfen Anfragen so.
// Geprüft mit den Beispielen aus der AWS-Doku „Signature Calculations for the Authorization Header“
// (test/objectStorage.test.ts). Ablauf: kanonische Anfrage → Text zum Signieren → Schlüssel aus Geheimnis, Tag,
// Region und Dienst → HMAC-SHA256.

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SignInput {
  method: string;
  url: URL;
  /** Weitere Kopfzeilen, die mitsigniert werden (z. B. Content-Type); Host, x-amz-date und x-amz-content-sha256 kommen dazu. */
  headers?: Record<string, string>;
  /** SHA-256 des Inhalts als Hex (ohne Inhalt: EMPTY_SHA256). */
  payloadHash: string;
  region: string;
  service?: string;
  credentials: S3Credentials;
  now: Date;
}

export interface Signed {
  /** Kopfzeilen für die Anfrage (Host setzt fetch selbst, aus derselben Adresse). */
  headers: { authorization: string; "x-amz-date": string; "x-amz-content-sha256": string };
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
}

/** SHA-256 von „nichts“ – für Anfragen ohne Inhalt (GET, DELETE). */
export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** RFC 3986: alles außer A–Z, a–z, 0–9, „-“, „.“, „_“ und „~“ als %XX (encodeURIComponent lässt „!'()*“ stehen). */
export function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Pfad für die Signatur: jedes Segment genau einmal kodiert (S3 kodiert nicht doppelt), „/“ bleibt stehen. */
export function canonicalPath(pathname: string): string {
  return pathname.split("/").map((segment) => uriEncode(decodeSegment(segment))).join("/") || "/";
}

/**
 * Abfrage für die Signatur und zugleich für die Adresse: Namen und Werte nach RFC 3986 kodiert, nach Namen sortiert,
 * „name=“ für leere Werte. Wer die Adresse damit baut, schickt genau das, was signiert ist (URLSearchParams würde
 * Leerzeichen als „+“ schreiben, das manche Anbieter anders lesen).
 */
export function canonicalQuery(params: Iterable<readonly [string, string]>): string {
  return [...params]
    .map(([name, value]) => [uriEncode(name), uriEncode(value)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

/** 2013-05-24T00:00:00.000Z → 20130524T000000Z */
export const amzDate = (now: Date) => now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function signRequest(input: SignInput): Signed {
  const { method, url, payloadHash, region, credentials } = input;
  const service = input.service ?? "s3";
  const date = amzDate(input.now);
  const day = date.slice(0, 8);
  const headers = new Map<string, string>();
  for (const [name, value] of Object.entries(input.headers ?? {})) headers.set(name.toLowerCase(), value);
  headers.set("host", url.host);
  headers.set("x-amz-date", date);
  headers.set("x-amz-content-sha256", payloadHash);
  const names = [...headers.keys()].sort();
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalPath(url.pathname),
    canonicalQuery(url.searchParams),
    ...names.map((name) => `${name}:${headers.get(name)!.trim().replace(/\s+/g, " ")}`),
    "",
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256Hex(canonicalRequest)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), region), service), "aws4_request");
  const signature = createHmac("sha256", key).update(stringToSign).digest("hex");
  return {
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
      "x-amz-date": date,
      "x-amz-content-sha256": payloadHash,
    },
    canonicalRequest,
    stringToSign,
    signature,
  };
}
