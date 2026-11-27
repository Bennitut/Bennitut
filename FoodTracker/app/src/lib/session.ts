// Anmeldung merken: Sitzungstoken und Konto liegen nicht im übrigen Zustand (AsyncStorage), sondern unter einem
// eigenen Schlüssel – auf dem Handy im Schlüsselbund (iOS) bzw. Keystore (Android) über expo-secure-store, im Browser
// in localStorage (lib/sessionStore.ts). Hier nur die Logik ohne native Module, damit sie in Node testbar ist.
import type { Account } from "./types";

export interface Session {
  token: string;
  user: Account;
  /**
   * Für welchen Server die Anmeldung gilt (lib/serverAddress.ts, serverKey): die im Profil eingetragene Adresse bzw.
   * „default“. Ältere Sitzungen ohne Angabe gehören zur Standard-Adresse. Ein anderer Server bekommt das Token nie.
   */
  server?: string;
}

/** Die Sitzung, wenn sie zu diesem Server gehört – sonst null (dann ist man dort nicht angemeldet). */
export const sessionFor = (session: Session | null, server: string): Session | null => (session && (session.server ?? "default") === server ? session : null);

/** Erlaubt sind bei expo-secure-store nur Buchstaben, Ziffern, „.“, „-“ und „_“. */
export const SESSION_KEY = "foodtracker.session.v1";

/** Schnittstelle wie bei AsyncStorage; expo-secure-store und localStorage werden darauf abgebildet. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const PROVIDERS: readonly Account["provider"][] = ["apple", "google", "dev", "password"];

/**
 * Prüft eine gespeicherte (oder aus einer älteren Version übernommene) Sitzung. Alles Unvollständige gilt als
 * „nicht angemeldet“ – dann meldet man sich einfach neu an. Beim Start holt die App das Konto ohnehin frisch vom Server.
 */
export function asSession(value: unknown): Session | null {
  if (!value || typeof value !== "object") return null;
  const { token, user } = value as { token?: unknown; user?: unknown };
  if (typeof token !== "string" || token.length < 16 || !user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  if (typeof u.id !== "string" || !u.id || typeof u.name !== "string") return null;
  const { server } = value as { server?: unknown };
  return {
    token,
    user: {
      id: u.id,
      name: u.name,
      email: typeof u.email === "string" ? u.email : null,
      role: u.role === "admin" ? "admin" : "user",
      provider: PROVIDERS.includes(u.provider as Account["provider"]) ? (u.provider as Account["provider"]) : "dev",
      createdAt: typeof u.createdAt === "string" ? u.createdAt : "",
    },
    ...(typeof server === "string" && server ? { server } : {}),
  };
}

/** Speichert die Sitzung bzw. löscht sie beim Abmelden (null). */
export async function saveSession(storage: KeyValueStorage, session: Session | null): Promise<void> {
  if (session) await storage.setItem(SESSION_KEY, JSON.stringify(session));
  else await storage.removeItem(SESSION_KEY);
}

/**
 * Lädt die Sitzung. Bis November 2026 stand sie im übrigen Zustand (`legacy`, Feld `auth`): Fehlt sie unter dem
 * eigenen Schlüssel, wird sie einmal dorthin übernommen. Ein unlesbarer Speicher (z. B. Schlüsselbund nach einer
 * Wiederherstellung) zählt als „nicht angemeldet“ und hält den Start nicht auf.
 */
export async function loadSession(storage: KeyValueStorage, legacy: unknown): Promise<Session | null> {
  let raw: string | null = null;
  try {
    raw = await storage.getItem(SESSION_KEY);
  } catch {
    raw = null;
  }
  if (raw) {
    try {
      const stored = asSession(JSON.parse(raw));
      if (stored) return stored;
    } catch {
      // unlesbar: wie nicht gespeichert
    }
  }
  const old = asSession(legacy);
  if (old) await saveSession(storage, old).catch(() => {});
  return old;
}

/**
 * Schreibt Sitzungen der Reihe nach, damit nach „Anmelden, gleich wieder Abmelden“ nie die ältere übrig bleibt, und
 * nur, wenn sich etwas geändert hat. Fehler (Schlüsselbund gesperrt o. Ä.) lassen die Anmeldung für diese Sitzung
 * bestehen; dann muss man sich nach einem Neustart neu anmelden.
 */
export function sessionWriter(storage: KeyValueStorage, initial: Session | null) {
  let queue: Promise<void> = Promise.resolve();
  /** Zuletzt geschriebener Stand; undefined = unbekannt (nach einem Fehler), dann beim nächsten Mal schreiben. */
  let written: string | null | undefined = initial ? JSON.stringify(initial) : null;
  return (session: Session | null): Promise<void> => {
    const next = session ? JSON.stringify(session) : null;
    if (next === written) return queue;
    written = next;
    queue = queue
      .then(() => saveSession(storage, session))
      .catch(() => {
        written = undefined;
      });
    return queue;
  };
}
