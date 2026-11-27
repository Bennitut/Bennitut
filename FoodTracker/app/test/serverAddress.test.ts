import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_DEVICE_IDS,
  defaultServer,
  deviceIdFor,
  effectiveServer,
  emptyServerSetting,
  knownDeviceId,
  parseServerUrl,
  readServerSetting,
  serverKey,
  withCustom,
} from "../src/lib/serverAddress";
import { asSession, sessionFor } from "../src/lib/session";

// Server-Adresse (Vorrang 1, 9.2 Teil 7): Standard-Adresse, im Profil eingetragene Adresse, Geräte-ID je Server und
// Anmeldung nur für den Server, bei dem sie entstand.

describe("Server-Adresse: Standard", () => {
  const base = { env: undefined, devHost: undefined, web: false, dev: true, pageHost: undefined };

  it("nimmt EXPO_PUBLIC_API_URL vor dem Rechner mit Expo, „off“ heißt ohne Server", () => {
    assert.deepEqual(defaultServer({ ...base, env: " https://foodtracker.onrender.com/ ", devHost: "192.168.1.20" }), {
      url: "https://foodtracker.onrender.com",
      source: "env",
    });
    assert.deepEqual(defaultServer({ ...base, env: "off", devHost: "192.168.1.20" }), { url: null, source: "none" });
    // Unbrauchbar: bleibt, wie angegeben – dann fällt „Keine Verbindung“ auf.
    assert.deepEqual(defaultServer({ ...base, env: "mein server/" }), { url: "mein server", source: "env" });
  });

  it("nimmt sonst den Rechner mit Expo (Port 3000); die exportierte Web-Version hat keinen", () => {
    assert.deepEqual(defaultServer({ ...base, devHost: "192.168.1.20" }), { url: "http://192.168.1.20:3000", source: "dev" });
    assert.deepEqual(defaultServer({ ...base, web: true, pageHost: "localhost" }), { url: "http://localhost:3000", source: "dev" });
    assert.deepEqual(defaultServer({ ...base, web: true, dev: false, pageHost: "bennitut.github.io" }), { url: null, source: "none" });
    assert.deepEqual(defaultServer(base), { url: "http://localhost:3000", source: "dev" });
  });
});

describe("Server-Adresse: Eingabe prüfen", () => {
  const ok = (input: string, pageProtocol?: string) => {
    const parsed = parseServerUrl(input, { pageProtocol });
    assert.ok(parsed.ok, `${input}: ${JSON.stringify(parsed)}`);
    return parsed.url;
  };
  const error = (input: string, pageProtocol?: string) => {
    const parsed = parseServerUrl(input, { pageProtocol });
    assert.ok(!parsed.ok, `${input} sollte abgelehnt werden`);
    return parsed.error;
  };

  it("bringt Adressen in eine Form: ohne „/“ am Ende, ohne Standard-Port, kleingeschrieben", () => {
    assert.equal(ok("https://FoodTracker.onrender.com/"), "https://foodtracker.onrender.com");
    assert.equal(ok("https://foodtracker.onrender.com:443"), "https://foodtracker.onrender.com");
    assert.equal(ok("http://192.168.1.20:3000"), "http://192.168.1.20:3000");
    assert.equal(ok("https://example.org/foodtracker/"), "https://example.org/foodtracker");
    // Die Test-Adresse aus der Anleitung (…/api/health) wird auf den Server gekürzt.
    assert.equal(ok("https://abc.trycloudflare.com/api/health"), "https://abc.trycloudflare.com");
    assert.equal(ok("http://10.0.0.7:3000/api/"), "http://10.0.0.7:3000");
  });

  it("ergänzt ohne Protokoll http für Rechner im eigenen Netz, sonst https", () => {
    assert.equal(ok("192.168.1.20:3000"), "http://192.168.1.20:3000");
    assert.equal(ok("10.0.0.7:3000"), "http://10.0.0.7:3000");
    assert.equal(ok("172.20.1.2:3000"), "http://172.20.1.2:3000");
    assert.equal(ok("localhost:3000"), "http://localhost:3000");
    assert.equal(ok("laptop.local:3000"), "http://laptop.local:3000");
    assert.equal(ok("foodtracker.onrender.com"), "https://foodtracker.onrender.com");
    assert.equal(ok("172.32.1.2"), "https://172.32.1.2", "nicht im privaten Bereich");
  });

  it("lehnt Unbrauchbares ab", () => {
    assert.equal(error("   "), "empty");
    assert.equal(error("ftp://example.org"), "scheme");
    assert.equal(error("mailto:benjamin@example.org"), "scheme");
    assert.equal(error("javascript:alert(1)"), "scheme");
    assert.equal(error("https://nutzer:geheim@example.org"), "credentials");
    assert.equal(error("https://example.org/?server=1"), "invalid");
    assert.equal(error("https://example.org/#x"), "invalid");
    assert.equal(error("mein server"), "invalid");
    assert.equal(error("http://"), "invalid");
  });

  it("lehnt http:// zu einem Rechner im Internet ab – Passwort und Daten gingen sonst unverschlüsselt", () => {
    for (const input of ["http://foodtracker.onrender.com", "http://abc.trycloudflare.com/api/health", "http://203.0.113.5:3000", "http://[2001:db8::1]:3000"]) {
      assert.equal(error(input), "https", input);
    }
    // Spezifischer als „insecure“, auch aus einer Seite über https.
    assert.equal(error("http://foodtracker.onrender.com", "https:"), "https");
    // Im eigenen Netz bleibt http erlaubt – auch mit dem Namen des Laptops und mit privaten IPv6-Adressen.
    for (const input of ["http://192.168.1.20:3000", "http://localhost:3000", "http://laptop:3000", "http://laptop.fritz.box:3000", "http://[fd12:3456::1]:3000", "http://[fe80::1]:3000", "http://[::1]:3000"]) {
      assert.ok(parseServerUrl(input).ok, input);
    }
    assert.equal(ok("laptop:3000"), "http://laptop:3000");
    // Gespeicherte Einstellung mit http:// ins Internet (ältere Fassung): gilt nicht mehr, die Standard-Adresse gilt.
    assert.equal(readServerSetting(JSON.stringify({ custom: "http://foodtracker.example.org", deviceIds: {} })).custom, null);
  });

  it("erlaubt einer Seite über https nur Server mit https – außer dem eigenen Rechner", () => {
    assert.equal(error("http://192.168.1.20:3000", "https:"), "insecure");
    assert.equal(error("192.168.1.20:3000", "https:"), "insecure");
    assert.equal(ok("http://localhost:3000", "https:"), "http://localhost:3000");
    assert.equal(ok("http://127.0.0.1:3000", "https:"), "http://127.0.0.1:3000");
    assert.equal(ok("https://abc.trycloudflare.com", "https:"), "https://abc.trycloudflare.com");
    assert.equal(ok("http://192.168.1.20:3000", "http:"), "http://192.168.1.20:3000");
  });
});

describe("Server-Adresse: Einstellung, Geräte-ID und Anmeldung", () => {
  const dev = { url: "http://192.168.1.20:3000", source: "dev" as const };
  let counter = 0;
  const newId = () => `neu-geraet-${++counter}`;

  it("liest die Einstellung vorsichtig: Unbrauchbares heißt Standard-Adresse", () => {
    assert.deepEqual(readServerSetting(null), emptyServerSetting());
    assert.deepEqual(readServerSetting("kaputt{"), emptyServerSetting());
    assert.deepEqual(readServerSetting(JSON.stringify({ custom: "ftp://x", deviceIds: { a: "zu kurz", b: "gute-id-12345" } })), {
      custom: null,
      deviceIds: { b: "gute-id-12345" },
    });
    const saved = { custom: "https://foodtracker.onrender.com", deviceIds: { "https://foodtracker.onrender.com": "abcdef0123456789" } };
    assert.deepEqual(readServerSetting(JSON.stringify(saved)), saved);
    assert.deepEqual(effectiveServer(readServerSetting(JSON.stringify(saved)), dev), { url: "https://foodtracker.onrender.com", source: "custom" });
    assert.equal(effectiveServer(emptyServerSetting(), dev), dev);
  });

  it("gibt jedem eingetragenen Server eine eigene Geräte-ID, beim Zurückwechseln gilt die alte wieder", () => {
    const start = emptyServerSetting();
    assert.deepEqual(deviceIdFor(start, "standard-id-1", newId), { id: "standard-id-1", setting: start });
    const cloud = deviceIdFor(withCustom(start, "https://foodtracker.onrender.com", dev), "standard-id-1", newId);
    assert.match(cloud.id, /^neu-geraet-/);
    assert.notEqual(cloud.id, "standard-id-1", "ein anderer Server erfährt die Geräte-ID des Standard-Servers nie");
    assert.equal(knownDeviceId(cloud.setting, "standard-id-1"), cloud.id);
    const back = withCustom(cloud.setting, null, dev);
    assert.equal(knownDeviceId(back, "standard-id-1"), "standard-id-1");
    const again = deviceIdFor(withCustom(back, "https://foodtracker.onrender.com", dev), "standard-id-1", newId);
    assert.equal(again.id, cloud.id);
    // Sehr viele Adressen: die ältesten fallen weg.
    let many = again.setting;
    for (let i = 0; i < MAX_DEVICE_IDS + 5; i++) many = deviceIdFor(withCustom(many, `https://server${i}.example.org`, dev), "standard-id-1", newId).setting;
    assert.equal(Object.keys(many.deviceIds).length, MAX_DEVICE_IDS);
    assert.ok(!("https://foodtracker.onrender.com" in many.deviceIds));
  });

  it("zählt eine eingetragene Adresse, die der Standard-Adresse gleicht, nicht als eigene", () => {
    const start = emptyServerSetting();
    assert.equal(withCustom(start, dev.url, dev), start);
    assert.equal(withCustom(start, null, dev), start);
    assert.equal(serverKey(start), "default");
    assert.equal(serverKey(withCustom(start, "https://foodtracker.onrender.com", dev)), "https://foodtracker.onrender.com");
  });

  it("nutzt eine Anmeldung nur beim Server, bei dem sie entstand", () => {
    const user = { id: "u1", name: "Benjamin", email: null, role: "user", provider: "password", createdAt: "" };
    const old = asSession({ token: "x".repeat(32), user });
    assert.equal(old?.server, undefined);
    assert.equal(sessionFor(old, "default"), old, "ältere Sitzungen gehören zur Standard-Adresse");
    assert.equal(sessionFor(old, "https://foodtracker.onrender.com"), null);
    const cloud = asSession({ token: "y".repeat(32), user, server: "https://foodtracker.onrender.com" });
    assert.equal(cloud?.server, "https://foodtracker.onrender.com");
    assert.equal(sessionFor(cloud, "https://foodtracker.onrender.com"), cloud);
    assert.equal(sessionFor(cloud, "default"), null);
  });
});
