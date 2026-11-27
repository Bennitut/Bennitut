import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { Ai } from "../src/ai/provider.js";
import { createApp } from "../src/app.js";
import { startupMessage } from "../src/startInfo.js";
import { copyImages } from "../src/storage/copyImages.js";
import { DirectoryImageStore, MemoryImageStore, decodeDataUri, newImageKey, toDataUri, type ImageStore } from "../src/storage/images.js";
import {
  ObjectImageStore,
  ObjectStorageConfigError,
  ObjectStorageError,
  imageStoreFromEnv,
  objectStorageFromEnv,
  objectStorageHint,
  regionFromEndpoint,
  type ObjectStorageSettings,
} from "../src/storage/objectStorage.js";
import { EMPTY_SHA256, canonicalPath, canonicalQuery, sha256Hex, signRequest, uriEncode } from "../src/storage/sigv4.js";
import { startFakeS3, type FakeS3, type FakeS3Options } from "./fakeS3.js";

// Vorrang 1, 9.3 Teil 2: Fotos in einem Objektspeicher mit S3-Schnittstelle für Hoster ohne dauerhafte Dateien
// (Render gratis …). Die Signatur gegen die Beispiele der AWS-Doku, der Bildspeicher gegen einen nachgebauten
// Objektspeicher über echtes HTTP (test/fakeS3.ts, prüft jede Signatur wie S3), dazu Einstellungen und Umzug.

const tmp = mkdtempSync(join(tmpdir(), "foodtracker-objekte-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const JPEG = (n = 1) => `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, n]).toString("base64")}`;
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString("base64")}`;
const image = (uri: string) => decodeDataUri(uri)!;

describe("Signatur nach AWS Signature Version 4 (Beispiele aus der AWS-Doku)", () => {
  // „Signature Calculations for the Authorization Header: Transferring Payload in a Single Chunk“, Amazon S3 API Reference.
  const credentials = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };
  const now = new Date("2013-05-24T00:00:00Z");
  const sign = (method: string, url: string, payloadHash: string, headers?: Record<string, string>) =>
    signRequest({ method, url: new URL(url), headers, payloadHash, region: "us-east-1", credentials, now });

  it("GET Object mit Range", () => {
    const signed = sign("GET", "https://examplebucket.s3.amazonaws.com/test.txt", EMPTY_SHA256, { Range: "bytes=0-9" });
    expect(signed.canonicalRequest).toBe(
      [
        "GET",
        "/test.txt",
        "",
        "host:examplebucket.s3.amazonaws.com",
        "range:bytes=0-9",
        `x-amz-content-sha256:${EMPTY_SHA256}`,
        "x-amz-date:20130524T000000Z",
        "",
        "host;range;x-amz-content-sha256;x-amz-date",
        EMPTY_SHA256,
      ].join("\n"),
    );
    expect(signed.stringToSign).toBe("AWS4-HMAC-SHA256\n20130524T000000Z\n20130524/us-east-1/s3/aws4_request\n7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972");
    expect(signed.headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date," +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
    expect(signed.headers["x-amz-date"]).toBe("20130524T000000Z");
  });

  it("PUT Object mit Inhalt, „$“ im Namen und weiteren Kopfzeilen", () => {
    const payload = sha256Hex("Welcome to Amazon S3.");
    expect(payload).toBe("44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072");
    const signed = sign("PUT", "https://examplebucket.s3.amazonaws.com/test$file.text", payload, {
      Date: "Fri, 24 May 2013 00:00:00 GMT",
      "x-amz-storage-class": "REDUCED_REDUNDANCY",
    });
    expect(signed.canonicalRequest.split("\n").slice(0, 2)).toEqual(["PUT", "/test%24file.text"]);
    expect(signed.stringToSign.endsWith("9e0e90d9c76de8fa5b200d8c849cd5b8dc7a3be3951ddb7f6a76b4158342019d")).toBe(true);
    expect(signed.signature).toBe("98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
  });

  it("GET Bucket Lifecycle und Get Bucket (List Objects) mit Abfrage", () => {
    const lifecycle = sign("GET", "https://examplebucket.s3.amazonaws.com/?lifecycle", EMPTY_SHA256);
    expect(lifecycle.canonicalRequest.split("\n").slice(0, 3)).toEqual(["GET", "/", "lifecycle="]);
    expect(lifecycle.signature).toBe("fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543");
    const list = sign("GET", "https://examplebucket.s3.amazonaws.com/?prefix=J&max-keys=2", EMPTY_SHA256);
    expect(list.canonicalRequest.split("\n")[2]).toBe("max-keys=2&prefix=J");
    expect(list.signature).toBe("34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7");
  });

  it("kodiert Pfade und Abfragen nach RFC 3986, Pfade nicht doppelt", () => {
    expect(uriEncode("a b+c/d~e*f!g'(h)")).toBe("a%20b%2Bc%2Fd~e%2Af%21g%27%28h%29");
    expect(uriEncode("Brötchen")).toBe("Br%C3%B6tchen");
    expect(canonicalPath("")).toBe("/");
    expect(canonicalPath("/storage/v1/s3/fotos/a%20b.jpg")).toBe("/storage/v1/s3/fotos/a%20b.jpg");
    expect(canonicalPath("/fotos/a b$.jpg")).toBe("/fotos/a%20b%24.jpg");
    expect(canonicalQuery([["prefix", "fotos/"], ["list-type", "2"], ["continuation-token", "x+y/z=="]])).toBe(
      "continuation-token=x%2By%2Fz%3D%3D&list-type=2&prefix=fotos%2F",
    );
  });
});

describe("Einstellungen aus der Umgebung", () => {
  const base = { S3_ENDPOINT: "https://0123abcd.r2.cloudflarestorage.com", S3_BUCKET: "foodtracker-fotos", S3_ACCESS_KEY_ID: "id", S3_SECRET_ACCESS_KEY: "geheim" };

  it("ohne S3_*: der Ordner PHOTOS_DIR wie bisher", () => {
    expect(objectStorageFromEnv({})).toBeNull();
    expect(objectStorageFromEnv({ S3_ENDPOINT: "  " })).toBeNull();
    expect(imageStoreFromEnv({}).description).toBe("Ordner data/photos");
    expect(imageStoreFromEnv({ PHOTOS_DIR: "/srv/fotos" })).toBeInstanceOf(DirectoryImageStore);
  });

  it("mit allen vier Variablen ein Objektspeicher – die Region bekannter Anbieter steht in der Adresse", () => {
    const settings = objectStorageFromEnv(base)!;
    expect(settings).toMatchObject({ bucket: "foodtracker-fotos", region: "auto", prefix: "", credentials: { accessKeyId: "id", secretAccessKey: "geheim" } });
    expect(settings.endpoint.href).toBe("https://0123abcd.r2.cloudflarestorage.com/");
    const store = imageStoreFromEnv(base);
    expect(store).toBeInstanceOf(ObjectImageStore);
    expect(store.description).toBe("Objektspeicher (S3) foodtracker-fotos bei 0123abcd.r2.cloudflarestorage.com");
    expect(store.description).not.toContain("geheim");
    expect(regionFromEndpoint("0123abcd.eu.r2.cloudflarestorage.com")).toBe("auto");
    expect(regionFromEndpoint("s3.eu-central-003.backblazeb2.com")).toBe("eu-central-003");
    expect(regionFromEndpoint("br-winter-pond-aptw82ef.storage.c-2.eu-central-1.aws.neon.tech")).toBe("eu-central-1");
    expect(regionFromEndpoint("s3.eu-central-1.amazonaws.com")).toBe("eu-central-1");
    expect(regionFromEndpoint("abcdefgh.storage.supabase.co")).toBeUndefined();
  });

  it("S3_REGION und S3_PREFIX, Adresse mit Pfad (Supabase) und ohne https://", () => {
    const settings = objectStorageFromEnv({
      ...base,
      S3_ENDPOINT: "abcdefgh.storage.supabase.co/storage/v1/s3",
      S3_REGION: "eu-central-1",
      S3_PREFIX: "/fotos",
    })!;
    expect(settings.endpoint.href).toBe("https://abcdefgh.storage.supabase.co/storage/v1/s3");
    expect(settings).toMatchObject({ region: "eu-central-1", prefix: "fotos/" });
    expect(new ObjectImageStore(settings).description).toBe("Objektspeicher (S3) foodtracker-fotos/fotos/ bei abcdefgh.storage.supabase.co/storage/v1/s3");
  });

  it("erklärt alle S3-Variablen in .env.example – ohne Werte", () => {
    const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    for (const name of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_REGION", "S3_PREFIX"]) {
      expect(example).toMatch(new RegExp(`^# ${name}=$`, "m"));
    }
  });

  it("meldet Unvollständiges und Falsches mit der Variable, statt Fotos still im Ordner abzulegen", () => {
    const fails = (env: NodeJS.ProcessEnv) => {
      try {
        objectStorageFromEnv(env);
      } catch (e) {
        expect(e).toBeInstanceOf(ObjectStorageConfigError);
        return (e as Error).message;
      }
      throw new Error("keine Meldung");
    };
    expect(fails({ S3_BUCKET: "fotos" })).toContain("fehlt S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (gesetzt: S3_BUCKET)");
    expect(fails({ S3_REGION: "auto" })).toContain("gesetzt: S3_REGION");
    expect(fails({ ...base, S3_ENDPOINT: "http://speicher.example.org" })).toContain("https://");
    expect(fails({ ...base, S3_ENDPOINT: "https://id:geheim@speicher.example.org" })).toContain("ohne Zugangsdaten");
    expect(fails({ ...base, S3_ENDPOINT: "https://speicher.example.org" })).toContain("S3_REGION fehlt");
    expect(fails({ ...base, S3_BUCKET: "a" })).toContain("S3_BUCKET");
    expect(fails({ ...base, S3_BUCKET: "a..b" })).toContain("S3_BUCKET");
    expect(fails({ ...base, S3_PREFIX: "../fremd" })).toContain("S3_PREFIX");
    expect(fails({ ...base, S3_REGION: "EU Central" })).toContain("S3_REGION");
    // Kein Geheimnis in einer Meldung.
    expect(fails({ ...base, S3_BUCKET: "?" })).not.toContain("geheim");
    // http:// nur zum eigenen Rechner bzw. ins eigene Netz (z. B. MinIO zum Testen).
    for (const local of ["http://127.0.0.1:9000", "http://localhost:9000", "http://192.168.1.20:9000", "http://[::1]:9000"]) {
      expect(objectStorageFromEnv({ ...base, S3_ENDPOINT: local, S3_REGION: "us-east-1" })?.endpoint.protocol).toBe("http:");
    }
  });
});

describe("Objektspeicher als Bildspeicher (nachgebaut, über HTTP)", () => {
  let fake: FakeS3 | undefined;
  afterEach(async () => {
    await fake?.close();
    fake = undefined;
  });
  const setup = async (options: FakeS3Options = {}, overrides: Partial<ObjectStorageSettings> = {}) => {
    fake = await startFakeS3(options);
    const settings: ObjectStorageSettings = {
      endpoint: new URL(fake.url),
      bucket: options.bucket ?? "fotos",
      region: options.region ?? "eu-central-1",
      prefix: "",
      credentials: options.credentials ?? { accessKeyId: "AKIAFAKE", secretAccessKey: "geheim/Schl+ssel=" },
      ...overrides,
    };
    return { fake, store: new ObjectImageStore(settings, { retryDelaysMs: [1, 1] }), settings };
  };

  it("speichert, liest und löscht Fotos – mit Format, ohne Pfade von außen", async () => {
    const { fake, store } = await setup();
    const key = newImageKey("image/png");
    await store.put(key, image(PNG));
    expect(fake.objects.get(key)?.contentType).toBe("image/png");
    expect(toDataUri((await store.get(key))!)).toBe(PNG);
    expect(await store.get(newImageKey("image/jpeg"))).toBeUndefined();
    expect(await store.get("../../geheim.jpg")).toBeUndefined();
    await expect(store.put("../ausbruch.jpg", image(JPEG()))).rejects.toThrow("Ungültiger Schlüssel");
    await store.delete(key);
    await store.delete(key);
    expect(fake.objects.size).toBe(0);
    expect(fake.requests.map((r) => r.method)).toEqual(["PUT", "GET", "GET", "DELETE", "DELETE"]);
    expect(fake.requests[0]!.path).toBe(`/fotos/${key}`);
  });

  it("nutzt Ordner im Bucket und Adressen mit Pfad (Supabase: /storage/v1/s3)", async () => {
    const { fake, store } = await setup({ basePath: "/storage/v1/s3" }, { prefix: "app/fotos/" });
    const key = newImageKey("image/jpeg");
    await store.put(key, image(JPEG(2)));
    expect([...fake.objects.keys()]).toEqual([`app/fotos/${key}`]);
    expect(fake.requests[0]!.path).toBe(`/storage/v1/s3/fotos/app/fotos/${key}`);
    expect(toDataUri((await store.get(key))!)).toBe(JPEG(2));
    expect(await store.list()).toEqual([key]);
  });

  it("listet seitenweise nur Fotos – andere Objekte und Ordner zählen nicht", async () => {
    const { fake, store } = await setup({ pageSize: 2 }, { prefix: "fotos/" });
    const keys = Array.from({ length: 5 }, () => newImageKey("image/jpeg"));
    for (const key of keys) await store.put(key, image(JPEG()));
    fake.objects.set("fotos/notiz.txt", { bytes: Buffer.from("x"), contentType: "text/plain" });
    fake.objects.set(`anderes/${newImageKey("image/jpeg")}`, { bytes: Buffer.from("x"), contentType: "image/jpeg" });
    expect(await store.list()).toEqual([...keys].sort());
    // 6 Objekte unter „fotos/“ in Seiten zu 2: drei Anfragen, ab der zweiten mit dem Token der vorigen Seite.
    const lists = fake.requests.filter((r) => r.path.includes("list-type=2"));
    expect(lists).toHaveLength(3);
    expect(lists[1]!.path).toBe("/fotos?continuation-token=seite%2F2%2B%26%3D&list-type=2&prefix=fotos%2F");
  });

  it("wiederholt bei 503 SlowDown und gibt nach drei Versuchen auf", async () => {
    const { fake, store } = await setup();
    const key = newImageKey("image/jpeg");
    fake.failNext(2);
    await store.put(key, image(JPEG(3)));
    expect(fake.objects.has(key)).toBe(true);
    fake.failNext(3);
    const error = await store.get(key).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ObjectStorageError);
    expect(error).toMatchObject({ status: 503, code: "SlowDown" });
    expect((error as Error).message).toBe("Foto lesen: HTTP 503 SlowDown – Please reduce your request rate.");
  });

  it("meldet falsche Schlüssel und Regionen mit dem Code des Anbieters – und einem Hinweis", async () => {
    const { store, settings } = await setup();
    const wrongSecret = new ObjectImageStore({ ...settings, credentials: { ...settings.credentials, secretAccessKey: "falsch" } }, { retryDelaysMs: [] });
    const signature = await wrongSecret.put(newImageKey("image/jpeg"), image(JPEG())).catch((e: unknown) => e);
    expect(signature).toMatchObject({ status: 403, code: "SignatureDoesNotMatch" });
    expect((signature as Error).message).not.toContain("falsch");
    expect(objectStorageHint(signature)).toContain("S3_SECRET_ACCESS_KEY");
    const region = await new ObjectImageStore({ ...settings, region: "us-east-1" }, { retryDelaysMs: [] }).check().catch((e: unknown) => e);
    expect(region).toMatchObject({ code: "AuthorizationHeaderMalformed" });
    expect(objectStorageHint(region)).toContain("S3_REGION");
    const bucket = await new ObjectImageStore({ ...settings, bucket: "gibtsnicht" }, { retryDelaysMs: [] }).check().catch((e: unknown) => e);
    expect(objectStorageHint(bucket)).toContain("S3_BUCKET");
    expect(await store.list()).toEqual([]);
  });

  it("meldet einen nicht erreichbaren Anbieter ohne Adresse oder Schlüssel", async () => {
    const { fake: server, settings } = await setup();
    await server.close();
    const unreachable = new ObjectImageStore(settings, { retryDelaysMs: [1] });
    const error = await unreachable.get(newImageKey("image/jpeg")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ObjectStorageError);
    expect((error as Error).message).toBe("Objektspeicher nicht erreichbar (ECONNREFUSED)");
    expect(objectStorageHint(error)).toContain("S3_ENDPOINT");
  });

  it("prüft beim Start Speichern, Lesen und Löschen und räumt die Probe wieder weg", async () => {
    const { fake, store } = await setup();
    await store.check();
    expect(fake.objects.size).toBe(0);
    expect(fake.requests.map((r) => r.method)).toEqual(["PUT", "GET", "GET", "DELETE"]);
  });

  it("merkt beim Start, wenn ein fehlendes Foto als 403 statt 404 kommt (Schlüssel ohne Recht zum Auflisten)", async () => {
    const { fake, store } = await setup({ missingStatus: 403 });
    const error = await store.check().catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403, code: "AccessDenied" });
    expect((error as Error).message).toContain("auflisten");
    expect(objectStorageHint(error)).toContain("auflisten");
    expect(fake.objects.size).toBe(0);
  });

  it("liefert Fotos über GET /api/images/<Schlüssel> aus dem Objektspeicher und löscht sie mit dem Foto", async () => {
    const { fake, store } = await setup();
    const noAi = new Ai({ hasAnthropicKey: false, ollama: { url: "http://ollama.test", model: "gemma4:e4b", numCtx: 1024, timeoutMs: 1000 } }, async () => {
      throw new TypeError("offline");
    });
    const app = createApp({ images: store, ai: noAi });
    const call = (method: string, path: string, body?: unknown) =>
      app.request(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json", "X-Device-Id": "geraet0objekt1" } });
    const res = await call("POST", "/api/recipes/shakshuka/photos", { authorName: "Lena", uri: JPEG(4) });
    expect(res.status).toBe(201);
    const photo = (await res.json()) as { id: string; uri: string };
    expect(fake.objects.size).toBe(1);
    const served = await call("GET", photo.uri);
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/jpeg");
    expect(Buffer.from(await served.arrayBuffer()).toString("base64")).toBe(JPEG(4).split(",")[1]);
    expect((await call("GET", `/api/images/${newImageKey("image/jpeg")}`)).status).toBe(404);
    expect((await call("DELETE", `/api/photos/${photo.id}`)).status).toBe(204);
    expect(fake.objects.size).toBe(0);
    expect((await call("GET", photo.uri)).status).toBe(404);
  });
});

describe("Fotos umziehen (npm run photos:copy)", () => {
  it("kopiert vom Ordner in den Objektspeicher und zurück – nur, was fehlt, ohne zu löschen", async () => {
    const fake = await startFakeS3();
    try {
      const folder = new DirectoryImageStore(join(tmp, "umzug"));
      const keys = [newImageKey("image/jpeg"), newImageKey("image/png"), newImageKey("image/jpeg")];
      await folder.put(keys[0]!, image(JPEG(5)));
      await folder.put(keys[1]!, image(PNG));
      await folder.put(keys[2]!, image(JPEG(6)));
      writeFileSync(join(tmp, "umzug", "liesmich.txt"), "kein Foto");
      const bucket = new ObjectImageStore({ endpoint: new URL(fake.url), bucket: "fotos", region: "eu-central-1", prefix: "", credentials: { accessKeyId: "AKIAFAKE", secretAccessKey: "geheim/Schl+ssel=" } });
      await bucket.put(keys[2]!, image(JPEG(6)));
      const progress: number[] = [];
      const there = await copyImages(folder, bucket, { parallel: 2, onProgress: (done) => progress.push(done) });
      expect(there).toEqual({ total: 3, copied: 2, present: 1, vanished: 0, failed: [] });
      expect(progress).toEqual([1, 2]);
      expect([...fake.objects.keys()].sort()).toEqual([...keys].sort());
      expect(fake.objects.get(keys[1]!)?.contentType).toBe("image/png");
      expect(await copyImages(folder, bucket)).toMatchObject({ copied: 0, present: 3 });
      // Zurück in einen leeren Ordner: dieselben Bilder unter denselben Schlüsseln.
      const back = new DirectoryImageStore(join(tmp, "zurueck"));
      expect(await copyImages(bucket, back)).toMatchObject({ total: 3, copied: 3, failed: [] });
      expect(readdirSync(join(tmp, "zurueck")).sort()).toEqual([...keys].sort());
      expect(toDataUri((await back.get(keys[0]!))!)).toBe(JPEG(5));
      expect(readdirSync(join(tmp, "umzug"))).toHaveLength(4);
    } finally {
      await fake.close();
    }
  });

  it("zählt Fehler einzeln und macht mit den anderen weiter", async () => {
    const from = new MemoryImageStore();
    const keys = [newImageKey("image/jpeg"), newImageKey("image/jpeg")];
    for (const key of keys) await from.put(key, image(JPEG()));
    const to = new MemoryImageStore();
    const flaky: ImageStore = {
      description: "wackelig",
      get: (key) => to.get(key),
      delete: (key) => to.delete(key),
      list: () => to.list(),
      put: async (key, img) => {
        if (key === keys[0]) throw new Error("kaputt");
        await to.put(key, img);
      },
    };
    const result = await copyImages(from, flaky);
    expect(result).toMatchObject({ total: 2, copied: 1, failed: [{ key: keys[0], error: "kaputt" }] });
    expect(to.keys()).toEqual([keys[1]]);
    expect(await new DirectoryImageStore(join(tmp, "gibtsnicht")).list()).toEqual([]);
  });
});

describe("Startmeldung", () => {
  it("nennt den Objektspeicher ohne Zugangsdaten", () => {
    const store = imageStoreFromEnv({ S3_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com", S3_BUCKET: "foodtracker-fotos", S3_ACCESS_KEY_ID: "003abc", S3_SECRET_ACCESS_KEY: "K003geheim" });
    const message = startupMessage({
      port: 3000,
      addresses: [],
      ai: { provider: null, model: null, state: "not_configured" },
      ollama: { url: "http://127.0.0.1:11434", model: "gemma4:e4b" },
      envFile: null,
      platform: "linux",
      photos: store.description,
      container: true,
    });
    expect(message).toContain("Fotos:               Objektspeicher (S3) foodtracker-fotos bei s3.eu-central-003.backblazeb2.com");
    expect(message).not.toContain("K003geheim");
    expect(message).not.toContain("003abc");
  });
});
