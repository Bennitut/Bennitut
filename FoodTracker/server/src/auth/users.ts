import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Db, Queryable, SqlValue } from "../storage/db.js";
import { DEFAULT_SCRYPT_COST, hashPassword, needsRehash, verifyPassword, type ScryptCost } from "./password.js";

export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];
export type AuthProvider = "apple" | "google" | "dev" | "password";

export interface User {
  id: string;
  provider: AuthProvider;
  /** Eindeutige Kennung beim Anbieter („sub“ im Token); bei E-Mail und Passwort die E-Mail-Adresse in Kleinbuchstaben. */
  providerSub: string;
  email: string | null;
  name: string;
  role: Role;
  blocked: boolean;
  createdAt: string;
  lastLoginAt: string;
  /** Nur bei Konten mit E-Mail und Passwort: scrypt-Hash (siehe password.ts), nie das Passwort selbst. */
  passwordHash?: string;
  /**
   * Nur bei Konten mit E-Mail und Passwort: Adresse bestätigt (bisher durch einen Code per E-Mail beim Zurücksetzen).
   * Erst dann macht ADMIN_EMAILS das Konto zum Admin – sonst könnte sich jede:r mit dieser Adresse registrieren.
   */
  emailVerified?: boolean;
}

/** Öffentliche Ansicht im Nutzerverzeichnis: ohne E-Mail und Anbieter-Kennung. */
export interface PublicUser {
  id: string;
  name: string;
  role: Role;
  createdAt: string;
}

const SESSION_DAYS = 30;
/** So lange gilt ein Code zum Zurücksetzen des Passworts, für höchstens RESET_MAX_ATTEMPTS Versuche. */
export const RESET_MINUTES = 30;
const RESET_MAX_ATTEMPTS = 5;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
/** Ohne Namen: neutral statt des Teils der E-Mail-Adresse vor dem „@“ (der Name steht im Nutzerverzeichnis). */
const FALLBACK_NAME = "Nutzer:in";

export type AuthErrorCode =
  | "invalid_token"
  | "not_configured"
  | "blocked"
  | "unauthorized"
  | "forbidden"
  | "invalid_credentials"
  | "weak_password"
  | "no_password"
  | "invalid_code";

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
  }
}

/** E-Mail-Adressen einheitlich vergleichen: ohne Leerzeichen am Rand, in Kleinbuchstaben. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Eine Zeile der Tabelle users, wie sie aus der Datenbank kommt (Ja/Nein als 0/1). */
interface UserRow {
  id: string;
  provider: string;
  provider_sub: string;
  email: string | null;
  name: string;
  role: string;
  blocked: number | string;
  created_at: string;
  last_login_at: string;
  password_hash: string | null;
  email_verified: number | string | null;
}

const COLUMNS = ["id", "provider", "provider_sub", "email", "name", "role", "blocked", "created_at", "last_login_at", "password_hash", "email_verified"];
const SELECT_USER = `SELECT ${COLUMNS.join(", ")} FROM users`;
/** Neues Konto; gibt es die ID oder die Anmeldung beim Anbieter schon, passiert nichts (0 geänderte Zeilen). */
export const INSERT_USER = `INSERT INTO users (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`;

function toUser(r: UserRow): User {
  const user: User = {
    id: r.id,
    provider: r.provider as AuthProvider,
    providerSub: r.provider_sub,
    email: r.email ?? null,
    name: r.name,
    role: r.role === "admin" ? "admin" : "user",
    blocked: Number(r.blocked) === 1,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
  };
  if (r.password_hash) user.passwordHash = r.password_hash;
  if (r.email_verified !== null && r.email_verified !== undefined) user.emailVerified = Number(r.email_verified) === 1;
  return user;
}

/** Werte für INSERT_USER, in der Reihenfolge der Spalten. */
export const userValues = (u: User): SqlValue[] => [
  u.id,
  u.provider,
  u.providerSub,
  u.email,
  u.name,
  u.role,
  u.blocked ? 1 : 0,
  u.createdAt,
  u.lastLoginAt,
  u.passwordHash ?? null,
  u.emailVerified === undefined ? null : u.emailVerified ? 1 : 0,
];

/**
 * Nutzerkonten, Sitzungen und Codes zum Zurücksetzen in der Datenbank (storage/db.ts: SQLite-Datei oder Postgres).
 * Sitzungs-Tokens und Codes stehen dort nur als SHA-256-Prüfsumme, Passwörter nur als scrypt-Hash.
 * Wer in ADMIN_EMAILS steht, wird bei der Anmeldung Admin; Admins können weitere Rollen vergeben.
 */
export class UserStore {
  /** Hash eines Fantasie-Passworts: Unbekannte E-Mail-Adressen kosten genauso lange wie bekannte. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly db: Db,
    private readonly adminEmails: string[] = [],
    private readonly passwordCost: ScryptCost = DEFAULT_SCRYPT_COST,
  ) {}

  /** Meldet an bzw. legt das Konto an und gibt ein neues Sitzungstoken zurück. */
  async login(identity: { provider: AuthProvider; sub: string; email: string | null; name: string | null }): Promise<{ token: string; user: User }> {
    const email = identity.email?.toLowerCase() ?? null;
    let user = await this.byProvider(identity.provider, identity.sub);
    if (!user) {
      const now = new Date().toISOString();
      const fresh: User = {
        id: randomUUID(),
        provider: identity.provider,
        providerSub: identity.sub,
        email,
        // Apple liefert den Namen nur bei der ersten Anmeldung; sonst ein neutraler Name.
        name: identity.name?.trim() || FALLBACK_NAME,
        role: "user",
        blocked: false,
        createdAt: now,
        lastLoginAt: now,
      };
      // Zweimal gleichzeitig angemeldet: Beim zweiten Mal gibt es das Konto schon.
      user = (await this.db.run(INSERT_USER, userValues(fresh))) > 0 ? fresh : await this.byProvider(identity.provider, identity.sub);
      if (!user) throw new AuthError("unauthorized");
    }
    if (user.blocked) throw new AuthError("blocked");
    if (email) user.email = email;
    return { token: await this.startSession(user), user };
  }

  /**
   * Neues Konto mit E-Mail und Passwort. Gibt es die Adresse schon, meldet das richtige Passwort einfach an; ein
   * falsches ergibt denselben Fehler wie bei der Anmeldung (siehe app.ts zu den Grenzen ohne Bestätigungs-Mail).
   */
  async register(input: { email: string; password: string; name: string | null }): Promise<{ token: string; user: User; created: boolean }> {
    const email = normalizeEmail(input.email);
    if (await this.passwordUser(email)) {
      const { token, user } = await this.loginWithPassword(email, input.password);
      return { token, user, created: false };
    }
    const passwordHash = await hashPassword(input.password, this.passwordCost);
    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      provider: "password",
      providerSub: email,
      email,
      name: input.name?.trim() || FALLBACK_NAME,
      role: "user",
      blocked: false,
      createdAt: now,
      lastLoginAt: now,
      passwordHash,
      emailVerified: false,
    };
    // Während des Hashens kann dieselbe Adresse ein zweites Mal angekommen sein – dann gibt es das Konto schon.
    if ((await this.db.run(INSERT_USER, userValues(user))) === 0) throw new AuthError("invalid_credentials");
    return { token: await this.startSession(user), user, created: true };
  }

  /** Anmeldung mit E-Mail und Passwort; derselbe Fehler (und dieselbe Rechenzeit) für unbekannte Adressen. */
  async loginWithPassword(emailInput: string, password: string): Promise<{ token: string; user: User }> {
    const user = await this.passwordUser(normalizeEmail(emailInput));
    const ok = await verifyPassword(password, user?.passwordHash ?? (await this.dummy()));
    if (!user || !ok) throw new AuthError("invalid_credentials");
    if (user.blocked) throw new AuthError("blocked");
    if (needsRehash(user.passwordHash!, this.passwordCost)) {
      user.passwordHash = await hashPassword(password, this.passwordCost);
      await this.db.run("UPDATE users SET password_hash = ? WHERE id = ?", [user.passwordHash, user.id]);
    }
    return { token: await this.startSession(user), user };
  }

  /** Prüft das Passwort eines Kontos, z. B. vor dem Löschen (Konten ohne Passwort: no_password). */
  async checkPassword(userId: string, password: string): Promise<void> {
    const user = await this.get(userId);
    if (!user?.passwordHash) throw new AuthError("no_password");
    if (!(await verifyPassword(password, user.passwordHash))) throw new AuthError("invalid_credentials");
  }

  /** Neues Passwort; alle anderen Sitzungen enden (z. B. auf einem verlorenen Handy), `keepToken` bleibt gültig. */
  async changePassword(userId: string, current: string, next: string, keepToken: string | undefined): Promise<void> {
    await this.checkPassword(userId, current);
    await this.setPassword(userId, next, keepToken);
  }

  /** Erstellt einen Code zum Zurücksetzen; undefined, wenn es kein passendes Konto gibt (die API sagt das nicht). */
  async createResetCode(emailInput: string): Promise<{ code: string; email: string } | undefined> {
    const user = await this.passwordUser(normalizeEmail(emailInput));
    if (!user || user.blocked) return undefined;
    const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
    const now = Date.now();
    await this.db.transaction(async (tx) => {
      await tx.run("DELETE FROM password_resets WHERE user_id = ? OR expires_at <= ?", [user.id, new Date(now).toISOString()]);
      await tx.run("INSERT INTO password_resets (user_id, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)", [
        user.id,
        hash(code),
        new Date(now + RESET_MINUTES * 60_000).toISOString(),
      ]);
    });
    return { code, email: user.email! };
  }

  /** Setzt mit einem gültigen Code ein neues Passwort; alle Sitzungen enden, dafür gibt es eine neue. */
  async resetPassword(emailInput: string, code: string, next: string): Promise<{ token: string; user: User }> {
    const user = await this.passwordUser(normalizeEmail(emailInput));
    if (!user) throw new AuthError("invalid_code");
    // Jeder Versuch zählt, bevor verglichen wird – so bleibt es bei RESET_MAX_ATTEMPTS, auch wenn viele gleichzeitig kommen.
    const counted = await this.db.run("UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ? AND expires_at > ? AND attempts < ?", [
      user.id,
      new Date().toISOString(),
      RESET_MAX_ATTEMPTS,
    ]);
    const reset = counted > 0 ? await this.db.get<{ code_hash: string }>("SELECT code_hash FROM password_resets WHERE user_id = ?", [user.id]) : undefined;
    if (!reset) throw new AuthError("invalid_code");
    const given = Buffer.from(hash(code.replace(/\s+/g, "")));
    if (!timingSafeEqual(given, Buffer.from(reset.code_hash))) throw new AuthError("invalid_code");
    // Wer den Code aus der E-Mail kennt, hat Zugang zur Adresse.
    user.emailVerified = true;
    await this.db.run("UPDATE users SET email_verified = 1 WHERE id = ?", [user.id]);
    await this.setPassword(user.id, next, undefined);
    if (user.blocked) throw new AuthError("blocked");
    return { token: await this.startSession(user), user };
  }

  async userForToken(token: string): Promise<User | undefined> {
    const row = await this.db.get<UserRow>(
      `SELECT ${COLUMNS.map((c) => `u.${c}`).join(", ")} FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at >= ? AND u.blocked = 0`,
      [hash(token), new Date().toISOString()],
    );
    return row ? toUser(row) : undefined;
  }

  async logout(token: string): Promise<void> {
    await this.db.run("DELETE FROM sessions WHERE token_hash = ?", [hash(token)]);
  }

  /** Konto mit allen Sitzungen und offenen Codes löschen (die übrigen Daten löscht app.ts in den anderen Speichern). */
  async delete(userId: string): Promise<User | undefined> {
    const user = await this.get(userId);
    if (!user) return undefined;
    await this.db.transaction(async (tx) => {
      await tx.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
      await tx.run("DELETE FROM password_resets WHERE user_id = ?", [userId]);
      await tx.run("DELETE FROM users WHERE id = ?", [userId]);
    });
    return user;
  }

  async get(id: string): Promise<User | undefined> {
    return UserStore.one(this.db, `${SELECT_USER} WHERE id = ?`, [id]);
  }

  async rename(id: string, name: string): Promise<User | undefined> {
    await this.db.run("UPDATE users SET name = ? WHERE id = ?", [name, id]);
    return this.get(id);
  }

  async list(query = ""): Promise<User[]> {
    const q = query.trim().toLowerCase();
    return (await this.db.all<UserRow>(SELECT_USER))
      .map(toUser)
      .filter((u) => !q || u.name.toLowerCase().includes(q) || (u.email ?? "").includes(q))
      .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "admin" ? -1 : 1));
  }

  /** Rolle oder Sperre ändern; der letzte Admin kann sich nicht selbst entmachten. */
  async update(id: string, patch: { role?: Role; blocked?: boolean }): Promise<User | "last_admin" | undefined> {
    return this.db.transaction(async (tx) => {
      const user = await UserStore.one(tx, `${SELECT_USER} WHERE id = ?`, [id]);
      if (!user) return undefined;
      const admins = Number((await tx.get<{ n: number | string }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND blocked = 0"))?.n ?? 0);
      const losesAdmin = user.role === "admin" && (patch.role === "user" || patch.blocked === true);
      if (losesAdmin && admins <= 1) return "last_admin" as const;
      if (patch.role) user.role = patch.role;
      if (patch.blocked !== undefined) user.blocked = patch.blocked;
      await tx.run("UPDATE users SET role = ?, blocked = ? WHERE id = ?", [user.role, user.blocked ? 1 : 0, id]);
      if (patch.blocked) await tx.run("DELETE FROM sessions WHERE user_id = ?", [id]);
      return user;
    });
  }

  static toPublic(user: User): PublicUser {
    return { id: user.id, name: user.name, role: user.role, createdAt: user.createdAt };
  }

  private static async one(q: Queryable, sql: string, params: SqlValue[]): Promise<User | undefined> {
    const row = await q.get<UserRow>(sql, params);
    return row ? toUser(row) : undefined;
  }

  private byProvider(provider: AuthProvider, sub: string): Promise<User | undefined> {
    return UserStore.one(this.db, `${SELECT_USER} WHERE provider = ? AND provider_sub = ?`, [provider, sub]);
  }

  private passwordUser(email: string): Promise<User | undefined> {
    return this.byProvider("password", email);
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= hashPassword(randomBytes(12).toString("base64"), this.passwordCost);
    return this.dummyHash;
  }

  /** Neues Passwort speichern; Sitzungen außer `keepToken` und offene Codes enden. */
  private async setPassword(userId: string, password: string, keepToken: string | undefined) {
    // Erst hashen (dauert), dann in einem Rutsch speichern.
    const passwordHash = await hashPassword(password, this.passwordCost);
    await this.db.transaction(async (tx) => {
      if ((await tx.run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId])) === 0) throw new AuthError("unauthorized");
      if (keepToken) await tx.run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", [userId, hash(keepToken)]);
      else await tx.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
      await tx.run("DELETE FROM password_resets WHERE user_id = ?", [userId]);
    });
  }

  /** Neue Sitzung (30 Tage); räumt abgelaufene auf und merkt sich Anmeldezeit, Adresse und Rolle. */
  private async startSession(user: User): Promise<string> {
    const now = new Date().toISOString();
    // Apple und Google bestätigen die Adresse selbst (Google nur mit email_verified, siehe unten); Dev-Login nur zum Testen.
    const verified = user.provider !== "password" || user.emailVerified === true;
    if (user.email && verified && this.adminEmails.includes(user.email)) user.role = "admin";
    user.lastLoginAt = now;
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    await this.db.transaction(async (tx) => {
      await tx.run("UPDATE users SET email = ?, role = ?, last_login_at = ? WHERE id = ?", [user.email, user.role, now, user.id]);
      await tx.run("DELETE FROM sessions WHERE expires_at <= ?", [now]);
      await tx.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [hash(token), user.id, expiresAt]);
    });
    return token;
  }
}

let appleKeys: JWTVerifyGetKey | undefined;
let googleKeys: JWTVerifyGetKey | undefined;

/**
 * Prüft das Identity-Token von „Mit Apple anmelden“. audiences = Bundle-IDs der App
 * (in Expo Go: host.exp.Exponent).
 */
export async function verifyAppleToken(token: string, audiences: string[]) {
  if (audiences.length === 0) throw new AuthError("not_configured");
  appleKeys ??= createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  try {
    const { payload } = await jwtVerify(token, appleKeys, { issuer: "https://appleid.apple.com", audience: audiences });
    if (!payload.sub) throw new AuthError("invalid_token");
    return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError("invalid_token");
  }
}

/** Prüft das ID-Token von „Mit Google anmelden“. audiences = OAuth-Client-IDs (iOS, Android, Web). */
export async function verifyGoogleToken(token: string, audiences: string[]) {
  if (audiences.length === 0) throw new AuthError("not_configured");
  googleKeys ??= createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  try {
    const { payload } = await jwtVerify(token, googleKeys, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: audiences });
    if (!payload.sub) throw new AuthError("invalid_token");
    const verified = payload.email_verified === true || payload.email_verified === "true";
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" && verified ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError("invalid_token");
  }
}
