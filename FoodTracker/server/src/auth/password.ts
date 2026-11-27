import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Passwörter mit scrypt aus node:crypto (ohne native Zusatzpakete). Gespeichert wird nur
 * „scrypt$N$r$p$Salz$Schlüssel“ (Base64), nie das Passwort selbst.
 */
export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

/** Eine der von OWASP empfohlenen Einstellungen: rund 32 MiB Speicher pro Prüfung, auch auf kleinen Servern machbar. */
export const DEFAULT_SCRYPT_COST: ScryptCost = { N: 2 ** 15, r: 8, p: 3 };
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Gleiche Zeichen, gleiche Bytes: „é“ als ein Zeichen oder als e + Akzent ergibt dasselbe Passwort. */
const normalize = (password: string) => password.normalize("NFKC");

/** Länge in Zeichen (nicht in UTF-16-Einheiten), damit Emojis und Umlaute fair zählen. */
export function passwordProblem(password: string): "too_short" | "too_long" | null {
  const length = [...normalize(password)].length;
  if (length < PASSWORD_MIN_LENGTH) return "too_short";
  if (length > PASSWORD_MAX_LENGTH) return "too_long";
  return null;
}

/** Schutz vor manipulierten oder kaputten Einträgen: keine Einstellungen, die den Server lahmlegen. */
const sane = ({ N, r, p }: ScryptCost) =>
  Number.isInteger(N) && N >= 2 && N <= 2 ** 20 && (N & (N - 1)) === 0 && Number.isInteger(r) && r >= 1 && r <= 32 && Number.isInteger(p) && p >= 1 && p <= 16;

function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Node bricht ab, wenn 128 · N · r den Speicherrahmen übersteigt; doppelt so viel erlauben.
    const maxmem = 256 * cost.N * cost.r;
    scrypt(normalize(password), salt, KEY_LENGTH, { N: cost.N, r: cost.r, p: cost.p, maxmem }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string, cost: ScryptCost = DEFAULT_SCRYPT_COST): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, cost);
  return ["scrypt", cost.N, cost.r, cost.p, salt.toString("base64"), key.toString("base64")].join("$");
}

function parse(stored: string): { cost: ScryptCost; salt: Buffer; key: Buffer } | null {
  const [kind, n, r, p, salt, key, ...rest] = stored.split("$");
  if (kind !== "scrypt" || rest.length > 0 || !salt || !key) return null;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  return sane(cost) ? { cost, salt: Buffer.from(salt, "base64"), key: Buffer.from(key, "base64") } : null;
}

/** Vergleich in konstanter Zeit; ein unlesbarer Eintrag passt zu keinem Passwort. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed || parsed.key.length !== KEY_LENGTH) return false;
  const actual = await derive(password, parsed.salt, parsed.cost);
  return timingSafeEqual(actual, parsed.key);
}

/** Mit anderen Einstellungen gespeichert (z. B. nach einer Erhöhung): beim nächsten Anmelden neu berechnen. */
export function needsRehash(stored: string, cost: ScryptCost = DEFAULT_SCRYPT_COST): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.cost.N !== cost.N || parsed.cost.r !== cost.r || parsed.cost.p !== cost.p;
}
