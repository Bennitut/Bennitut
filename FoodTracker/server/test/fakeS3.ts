import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { sha256Hex, signRequest, type S3Credentials } from "../src/storage/sigv4.js";

// Nachgebauter Objektspeicher mit S3-Schnittstelle für die Tests (kein echter Dienst): echtes HTTP auf 127.0.0.1, prüft
// jede Signatur wie S3 – aus dem, was wirklich ankommt (Host-Kopfzeile, Pfad, Abfrage, Inhalt) –, speichert im Speicher
// und antwortet mit denselben Fehlern als XML (NoSuchKey, SignatureDoesNotMatch …). Pfad-Stil:
// <basePath>/<Bucket>/<Schlüssel>.

export interface FakeS3Options {
  bucket?: string;
  region?: string;
  credentials?: S3Credentials;
  /** Pfad vor dem Bucket, z. B. „/storage/v1/s3“ wie bei Supabase. */
  basePath?: string;
  /** Höchstens so viele Schlüssel pro Seite beim Auflisten (S3: 1000). */
  pageSize?: number;
  /** Antwort auf ein fehlendes Objekt: 404 (S3 mit Recht zum Auflisten) oder 403 (ohne dieses Recht). */
  missingStatus?: 404 | 403;
}

export interface FakeS3 {
  url: string;
  objects: Map<string, { bytes: Buffer; contentType: string }>;
  requests: { method: string; path: string }[];
  /** Die nächsten n Anfragen scheitern mit 503 SlowDown. */
  failNext(n: number): void;
  close(): Promise<void>;
}

const xml = (tag: string, fields: Record<string, string>) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<${tag}>${Object.entries(fields)
    .map(([k, v]) => `<${k}>${v.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</${k}>`)
    .join("")}</${tag}>`;

function reply(res: ServerResponse, status: number, body = "", type = "application/xml") {
  res.writeHead(status, body ? { "Content-Type": type, "Content-Length": Buffer.byteLength(body) } : {});
  res.end(body);
}
const error = (res: ServerResponse, status: number, code: string, message: string) => reply(res, status, xml("Error", { Code: code, Message: message, RequestId: "fake" }));

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function startFakeS3(options: FakeS3Options = {}): Promise<FakeS3> {
  const bucket = options.bucket ?? "fotos";
  const region = options.region ?? "eu-central-1";
  const credentials = options.credentials ?? { accessKeyId: "AKIAFAKE", secretAccessKey: "geheim/Schl+ssel=" };
  const basePath = options.basePath ?? "";
  const pageSize = options.pageSize ?? 1000;
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const requests: { method: string; path: string }[] = [];
  let failures = 0;

  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const url = new URL(`http://${req.headers.host}${req.url}`);
    requests.push({ method: req.method!, path: `${url.pathname}${url.search}` });
    if (failures > 0) {
      failures--;
      return error(res, 503, "SlowDown", "Please reduce your request rate.");
    }
    // Signatur prüfen – wie S3: Schlüssel, Region, Inhalt, dann die Signatur aus dem, was angekommen ist.
    const auth = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request,SignedHeaders=([^,]+),Signature=([0-9a-f]{64})$/.exec(req.headers.authorization ?? "");
    if (!auth) return error(res, 400, "AuthorizationHeaderMalformed", "The authorization header is malformed.");
    const [, accessKeyId, day, scopeRegion, signedHeaders, signature] = auth as unknown as string[];
    if (accessKeyId !== credentials.accessKeyId) return error(res, 403, "InvalidAccessKeyId", "The Access Key Id you provided does not exist in our records.");
    if (scopeRegion !== region) return error(res, 400, "AuthorizationHeaderMalformed", `The authorization header is malformed; the region '${scopeRegion}' is wrong; expecting '${region}'`);
    const payloadHash = String(req.headers["x-amz-content-sha256"] ?? "");
    if (payloadHash !== sha256Hex(body)) return error(res, 400, "XAmzContentSHA256Mismatch", "The provided 'x-amz-content-sha256' header does not match what was computed.");
    const date = String(req.headers["x-amz-date"] ?? "");
    if (!date.startsWith(day!)) return error(res, 403, "SignatureDoesNotMatch", "Date does not match the credential scope.");
    const names = signedHeaders!.split(";");
    if (!names.includes("host") || !names.includes("x-amz-date") || !names.includes("x-amz-content-sha256")) return error(res, 403, "AccessDenied", "Host, x-amz-date and x-amz-content-sha256 must be signed.");
    const headers = Object.fromEntries(names.filter((n) => !["host", "x-amz-date", "x-amz-content-sha256"].includes(n)).map((n) => [n, String(req.headers[n] ?? "")]));
    const now = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`);
    const expected = signRequest({ method: req.method!, url, headers, payloadHash, region, credentials, now });
    if (expected.signature !== signature) return error(res, 403, "SignatureDoesNotMatch", "The request signature we calculated does not match the signature you provided. Check your key and signing method.");

    const prefix = `${basePath}/${bucket}`;
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return error(res, 404, "NoSuchBucket", "The specified bucket does not exist");
    const key = decodeURIComponent(url.pathname.slice(prefix.length + 1));
    if (!key) {
      if (req.method !== "GET" || url.searchParams.get("list-type") !== "2") return error(res, 501, "NotImplemented", "Only ListObjectsV2 is implemented.");
      const wanted = url.searchParams.get("prefix") ?? "";
      const all = [...objects.keys()].filter((k) => k.startsWith(wanted)).sort();
      // Absichtlich ein Token mit „/“, „+“, „&“ und „=“ (im XML als &amp;): Es muss richtig kodiert zurückkommen.
      const given = url.searchParams.get("continuation-token");
      const start = given === null ? 0 : Number(/^seite\/(\d+)\+&=$/.exec(given)?.[1] ?? NaN);
      if (Number.isNaN(start)) return error(res, 400, "InvalidArgument", "The continuation token provided is incorrect");
      const page = all.slice(start, start + pageSize);
      const truncated = start + pageSize < all.length;
      const contents = page.map((k) => `<Contents><Key>${k}</Key><Size>${objects.get(k)!.bytes.length}</Size></Contents>`).join("");
      const token = truncated ? `<NextContinuationToken>seite/${start + pageSize}+&amp;=</NextContinuationToken>` : "";
      return reply(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<ListBucketResult><Name>${bucket}</Name><Prefix>${wanted}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${pageSize}</MaxKeys><IsTruncated>${truncated}</IsTruncated>${contents}${token}</ListBucketResult>`);
    }
    if (req.method === "PUT") {
      objects.set(key, { bytes: body, contentType: String(req.headers["content-type"] ?? "application/octet-stream") });
      res.writeHead(200, { ETag: `"${sha256Hex(body).slice(0, 32)}"` });
      return res.end();
    }
    if (req.method === "GET") {
      const object = objects.get(key);
      if (!object) return options.missingStatus === 403 ? error(res, 403, "AccessDenied", "Access Denied") : error(res, 404, "NoSuchKey", "The specified key does not exist.");
      res.writeHead(200, { "Content-Type": object.contentType, "Content-Length": object.bytes.length });
      return res.end(object.bytes);
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      return reply(res, 204);
    }
    return error(res, 405, "MethodNotAllowed", "The specified method is not allowed against this resource.");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}${basePath}`,
    objects,
    requests,
    failNext: (n) => {
      failures = n;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
