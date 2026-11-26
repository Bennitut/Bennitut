import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SESSION_KEY, asSession, loadSession, saveSession, sessionWriter, type KeyValueStorage, type Session } from "../src/lib/session";

/** Speicher wie expo-secure-store bzw. localStorage – mit Liste der Schreibvorgänge, „gesperrt“ und „unlesbar“. */
class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  writes: string[] = [];
  locked = false;
  broken = false;
  async getItem(key: string) {
    if (this.broken) throw new Error("User interaction is not allowed");
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    if (this.locked) throw new Error("Keychain locked");
    this.writes.push(`set ${key}`);
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    if (this.locked) throw new Error("Keychain locked");
    this.writes.push(`remove ${key}`);
    this.data.delete(key);
  }
}

const session = (name = "Benjamin", token = "t".repeat(43)): Session => ({
  token,
  user: { id: "u1", name, email: "test@example.org", role: "user", provider: "password", createdAt: "2026-11-25T03:00:00.000Z" },
});

describe("Anmeldung merken", () => {
  it("nimmt für den Schlüssel nur Zeichen, die expo-secure-store erlaubt", () => {
    assert.match(SESSION_KEY, /^[\w.-]+$/);
  });

  it("speichert die Sitzung und lädt sie nach einem Neustart wieder", async () => {
    const storage = new MemoryStorage();
    await saveSession(storage, session());
    assert.deepEqual(await loadSession(storage, undefined), session());
  });

  it("löscht die Sitzung beim Abmelden", async () => {
    const storage = new MemoryStorage();
    await saveSession(storage, session());
    await saveSession(storage, null);
    assert.equal(storage.data.has(SESSION_KEY), false);
    assert.equal(await loadSession(storage, undefined), null);
  });

  it("übernimmt die Anmeldung vom alten Speicherort einmal in den sicheren Speicher", async () => {
    const storage = new MemoryStorage();
    const legacy = { token: "x".repeat(43), user: { id: "u7", name: "Alt", email: null, role: "admin", provider: "dev", createdAt: "2026-11-20T10:00:00.000Z" } };
    const loaded = await loadSession(storage, legacy);
    assert.deepEqual(loaded, legacy);
    assert.deepEqual(storage.writes, [`set ${SESSION_KEY}`]);
    // Beim nächsten Start kommt sie aus dem eigenen Speicher, auch wenn der alte Eintrag fehlt.
    assert.deepEqual(await loadSession(storage, undefined), legacy);
  });

  it("bevorzugt die gespeicherte Sitzung vor einem alten Eintrag", async () => {
    const storage = new MemoryStorage();
    await saveSession(storage, session("Neu"));
    const loaded = await loadSession(storage, { token: "y".repeat(43), user: { id: "u2", name: "Alt" } });
    assert.equal(loaded?.user.name, "Neu");
    assert.equal(storage.writes.length, 1);
  });

  it("startet ohne Anmeldung, wenn der Speicher unlesbar oder der Eintrag kaputt ist", async () => {
    const broken = new MemoryStorage();
    broken.broken = true;
    assert.equal(await loadSession(broken, undefined), null);
    // Unlesbarer sicherer Speicher: der alte Eintrag hilft noch, gespeichert wird trotzdem versucht.
    assert.equal((await loadSession(broken, session()))?.user.id, "u1");

    const garbage = new MemoryStorage();
    garbage.data.set(SESSION_KEY, "{kaputt");
    assert.equal(await loadSession(garbage, undefined), null);
    garbage.data.set(SESSION_KEY, JSON.stringify({ token: "kurz", user: { id: "u1", name: "A" } }));
    assert.equal(await loadSession(garbage, undefined), null);
  });

  it("übersteht einen gesperrten Schlüsselbund beim Übernehmen", async () => {
    const storage = new MemoryStorage();
    storage.locked = true;
    assert.equal((await loadSession(storage, session()))?.user.name, "Benjamin");
    assert.equal(storage.data.size, 0);
  });

  it("prüft gespeicherte Sitzungen und setzt fehlende Felder sicher", () => {
    assert.equal(asSession(null), null);
    assert.equal(asSession("token"), null);
    assert.equal(asSession({ token: 42, user: { id: "u1", name: "A" } }), null);
    assert.equal(asSession({ token: "t".repeat(43), user: { id: "", name: "A" } }), null);
    assert.equal(asSession({ token: "t".repeat(43), user: { id: "u1" } }), null);
    // Rolle und Anmeldeart nur aus der bekannten Liste – eine manipulierte Rolle macht niemanden zum Admin.
    assert.deepEqual(asSession({ token: "t".repeat(43), user: { id: "u1", name: "A", role: "superuser", provider: "facebook" } })?.user, {
      id: "u1",
      name: "A",
      email: null,
      role: "user",
      provider: "dev",
      createdAt: "",
    });
  });

  it("schreibt der Reihe nach und nur Änderungen", async () => {
    const storage = new MemoryStorage();
    const write = sessionWriter(storage, null);
    await write(null);
    assert.deepEqual(storage.writes, [], "unverändert: nichts schreiben");
    // Anmelden und sofort wieder abmelden: am Ende ist niemand angemeldet.
    void write(session());
    await write(null);
    assert.deepEqual(storage.writes, [`set ${SESSION_KEY}`, `remove ${SESSION_KEY}`]);
    assert.equal(storage.data.has(SESSION_KEY), false);
    // Neuer Name vom Server: neu schreiben.
    await write(session("Benni"));
    await write(session("Benni"));
    assert.equal(storage.writes.length, 3);
    assert.equal(JSON.parse(storage.data.get(SESSION_KEY)!).user.name, "Benni");
  });

  it("versucht es nach einem Fehler beim nächsten Wechsel erneut", async () => {
    const storage = new MemoryStorage();
    const write = sessionWriter(storage, null);
    storage.locked = true;
    await write(session());
    assert.equal(storage.data.size, 0);
    storage.locked = false;
    await write(session());
    assert.equal(storage.data.has(SESSION_KEY), true);
  });
});
