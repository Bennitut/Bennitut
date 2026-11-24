import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
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

/** Code zum Zurücksetzen des Passworts (per E-Mail), nur als Prüfsumme gespeichert. */
interface PasswordReset {
  userId: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
}

interface Session {
  /** SHA-256 des Tokens; das Token selbst wird nicht gespeichert. */
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

/** Öffentliche Ansicht im Nutzerverzeichnis: ohne E-Mail und Anbieter-Kennung. */
export interface PublicUser {
  id: string;
  name: string;
  role: Role;
  createdAt: string;
}

const SESSION_DAYS = 30;
/** So lange gilt ein Code zum Zurücksetzen des Passworts; danach oder nach RESET_MAX_ATTEMPTS Fehlversuchen nicht mehr. */
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

/**
 * Nutzerkonten und Sitzungen in einer JSON-Datei. Für den echten Betrieb gehört das in eine Datenbank.
 * Wer in ADMIN_EMAILS steht, wird bei der Anmeldung Admin; Admins können weitere Rollen vergeben.
 */
export class UserStore {
  private users: User[] = [];
  private sessions: Session[] = [];
  private resets: PasswordReset[] = [];
  /** Hash eines Fantasie-Passworts: Unbekannte E-Mail-Adressen kosten genauso lange wie bekannte. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly file: string | null,
    private readonly adminEmails: string[] = [],
    private readonly passwordCost: ScryptCost = DEFAULT_SCRYPT_COST,
  ) {
    if (!file) return;
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as { users?: User[]; sessions?: Session[]; resets?: PasswordReset[] };
      this.users = data.users ?? [];
      this.sessions = data.sessions ?? [];
      this.resets = data.resets ?? [];
    } catch {
      // Noch keine Datei: leer starten.
    }
  }

  /** Meldet an bzw. legt das Konto an und gibt ein neues Sitzungstoken zurück. */
  login(identity: { provider: AuthProvider; sub: string; email: string | null; name: string | null }): { token: string; user: User } {
    const now = new Date().toISOString();
    let user = this.users.find((u) => u.provider === identity.provider && u.providerSub === identity.sub);
    const email = identity.email?.toLowerCase() ?? null;
    if (!user) {
      user = {
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
      this.users.push(user);
    }
    if (user.blocked) throw new AuthError("blocked");
    if (email) user.email = email;
    return { token: this.startSession(user), user };
  }

  /**
   * Neues Konto mit E-Mail und Passwort. Gibt es die Adresse schon, meldet das richtige Passwort einfach an; ein
   * falsches ergibt denselben Fehler wie bei der Anmeldung (siehe app.ts zu den Grenzen ohne Bestätigungs-Mail).
   */
  async register(input: { email: string; password: string; name: string | null }): Promise<{ token: string; user: User; created: boolean }> {
    const email = normalizeEmail(input.email);
    if (this.passwordUser(email)) {
      const { token, user } = await this.loginWithPassword(email, input.password);
      return { token, user, created: false };
    }
    const passwordHash = await hashPassword(input.password, this.passwordCost);
    // Während des Hashens kann dieselbe Adresse ein zweites Mal angekommen sein.
    if (this.passwordUser(email)) throw new AuthError("invalid_credentials");
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
    this.users.push(user);
    return { token: this.startSession(user), user, created: true };
  }

  /** Anmeldung mit E-Mail und Passwort; derselbe Fehler (und dieselbe Rechenzeit) für unbekannte Adressen. */
  async loginWithPassword(emailInput: string, password: string): Promise<{ token: string; user: User }> {
    const user = this.passwordUser(normalizeEmail(emailInput));
    const ok = await verifyPassword(password, user?.passwordHash ?? (await this.dummy()));
    if (!user || !ok) throw new AuthError("invalid_credentials");
    if (user.blocked) throw new AuthError("blocked");
    if (needsRehash(user.passwordHash!, this.passwordCost)) user.passwordHash = await hashPassword(password, this.passwordCost);
    return { token: this.startSession(user), user };
  }

  /** Prüft das Passwort eines Kontos, z. B. vor dem Löschen (Konten ohne Passwort: no_password). */
  async checkPassword(userId: string, password: string): Promise<void> {
    const user = this.get(userId);
    if (!user?.passwordHash) throw new AuthError("no_password");
    if (!(await verifyPassword(password, user.passwordHash))) throw new AuthError("invalid_credentials");
  }

  /** Neues Passwort; alle anderen Sitzungen enden (z. B. auf einem verlorenen Handy), `keepToken` bleibt gültig. */
  async changePassword(userId: string, current: string, next: string, keepToken: string | undefined): Promise<void> {
    await this.checkPassword(userId, current);
    await this.setPassword(userId, next, keepToken);
  }

  /** Erstellt einen Code zum Zurücksetzen; undefined, wenn es kein passendes Konto gibt (die API sagt das nicht). */
  createResetCode(emailInput: string): { code: string; email: string } | undefined {
    const user = this.passwordUser(normalizeEmail(emailInput));
    if (!user || user.blocked) return undefined;
    const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
    const now = Date.now();
    this.resets = this.resets.filter((r) => r.userId !== user.id && Date.parse(r.expiresAt) > now);
    this.resets.push({ userId: user.id, codeHash: hash(code), expiresAt: new Date(now + RESET_MINUTES * 60_000).toISOString(), attempts: 0 });
    this.save();
    return { code, email: user.email! };
  }

  /** Setzt mit einem gültigen Code ein neues Passwort; alle Sitzungen enden, dafür gibt es eine neue. */
  async resetPassword(emailInput: string, code: string, next: string): Promise<{ token: string; user: User }> {
    const user = this.passwordUser(normalizeEmail(emailInput));
    const reset = user && this.resets.find((r) => r.userId === user.id && Date.parse(r.expiresAt) > Date.now());
    if (!user || !reset || reset.attempts >= RESET_MAX_ATTEMPTS) throw new AuthError("invalid_code");
    const given = Buffer.from(hash(code.replace(/\s+/g, "")));
    if (!timingSafeEqual(given, Buffer.from(reset.codeHash))) {
      reset.attempts++;
      this.save();
      throw new AuthError("invalid_code");
    }
    this.resets = this.resets.filter((r) => r !== reset);
    // Wer den Code aus der E-Mail kennt, hat Zugang zur Adresse.
    user.emailVerified = true;
    await this.setPassword(user.id, next, undefined);
    if (user.blocked) throw new AuthError("blocked");
    return { token: this.startSession(user), user };
  }

  userForToken(token: string): User | undefined {
    const session = this.sessions.find((s) => s.tokenHash === hash(token));
    if (!session || session.expiresAt < new Date().toISOString()) return undefined;
    const user = this.users.find((u) => u.id === session.userId);
    return user && !user.blocked ? user : undefined;
  }

  logout(token: string) {
    this.sessions = this.sessions.filter((s) => s.tokenHash !== hash(token));
    this.save();
  }

  /** Konto mit allen Sitzungen und offenen Codes löschen (die übrigen Daten löscht app.ts in den anderen Speichern). */
  delete(userId: string): User | undefined {
    const user = this.get(userId);
    if (!user) return undefined;
    this.users = this.users.filter((u) => u.id !== userId);
    this.sessions = this.sessions.filter((s) => s.userId !== userId);
    this.resets = this.resets.filter((r) => r.userId !== userId);
    this.save();
    return user;
  }

  get(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  rename(id: string, name: string): User | undefined {
    const user = this.get(id);
    if (!user) return undefined;
    user.name = name;
    this.save();
    return user;
  }

  list(query = ""): User[] {
    const q = query.trim().toLowerCase();
    return this.users
      .filter((u) => !q || u.name.toLowerCase().includes(q) || (u.email ?? "").includes(q))
      .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "admin" ? -1 : 1));
  }

  /** Rolle oder Sperre ändern; der letzte Admin kann sich nicht selbst entmachten. */
  update(id: string, patch: { role?: Role; blocked?: boolean }): User | "last_admin" | undefined {
    const user = this.get(id);
    if (!user) return undefined;
    const admins = this.users.filter((u) => u.role === "admin" && !u.blocked);
    const losesAdmin = user.role === "admin" && (patch.role === "user" || patch.blocked === true);
    if (losesAdmin && admins.length <= 1) return "last_admin";
    if (patch.role) user.role = patch.role;
    if (patch.blocked !== undefined) {
      user.blocked = patch.blocked;
      if (patch.blocked) this.sessions = this.sessions.filter((s) => s.userId !== id);
    }
    this.save();
    return user;
  }

  static toPublic(user: User): PublicUser {
    return { id: user.id, name: user.name, role: user.role, createdAt: user.createdAt };
  }

  private passwordUser(email: string): User | undefined {
    return this.users.find((u) => u.provider === "password" && u.providerSub === email);
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= hashPassword(randomBytes(12).toString("base64"), this.passwordCost);
    return this.dummyHash;
  }

  private async setPassword(userId: string, password: string, keepToken: string | undefined) {
    const user = this.get(userId);
    if (!user) throw new AuthError("unauthorized");
    user.passwordHash = await hashPassword(password, this.passwordCost);
    const keep = keepToken ? hash(keepToken) : null;
    this.sessions = this.sessions.filter((s) => s.userId !== userId || s.tokenHash === keep);
    this.resets = this.resets.filter((r) => r.userId !== userId);
    this.save();
  }

  /** Neue Sitzung (30 Tage); räumt abgelaufene auf und speichert. */
  private startSession(user: User): string {
    const now = new Date().toISOString();
    // Apple und Google bestätigen die Adresse selbst (Google nur mit email_verified, siehe unten); Dev-Login nur zum Testen.
    const verified = user.provider !== "password" || user.emailVerified === true;
    if (user.email && verified && this.adminEmails.includes(user.email)) user.role = "admin";
    user.lastLoginAt = now;
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    this.sessions = this.sessions.filter((s) => s.expiresAt > now);
    this.sessions.push({ tokenHash: hash(token), userId: user.id, expiresAt });
    this.save();
    return token;
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ users: this.users, sessions: this.sessions, resets: this.resets }));
    renameSync(tmp, this.file);
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
