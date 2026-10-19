import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];
export type AuthProvider = "apple" | "google" | "dev";

export interface User {
  id: string;
  provider: AuthProvider;
  /** Eindeutige Kennung beim Anbieter („sub“ im Token). */
  providerSub: string;
  email: string | null;
  name: string;
  role: Role;
  blocked: boolean;
  createdAt: string;
  lastLoginAt: string;
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
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export class AuthError extends Error {
  constructor(readonly code: "invalid_token" | "not_configured" | "blocked" | "unauthorized" | "forbidden") {
    super(code);
  }
}

/**
 * Nutzerkonten und Sitzungen in einer JSON-Datei. Für den echten Betrieb gehört das in eine Datenbank.
 * Wer in ADMIN_EMAILS steht, wird bei der Anmeldung Admin; Admins können weitere Rollen vergeben.
 */
export class UserStore {
  private users: User[] = [];
  private sessions: Session[] = [];

  constructor(
    private readonly file: string | null,
    private readonly adminEmails: string[] = [],
  ) {
    if (!file) return;
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as { users?: User[]; sessions?: Session[] };
      this.users = data.users ?? [];
      this.sessions = data.sessions ?? [];
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
        name: identity.name?.trim() || email?.split("@")[0] || "Nutzer:in",
        role: "user",
        blocked: false,
        createdAt: now,
        lastLoginAt: now,
      };
      this.users.push(user);
    }
    if (user.blocked) throw new AuthError("blocked");
    if (email) user.email = email;
    if (email && this.adminEmails.includes(email)) user.role = "admin";
    user.lastLoginAt = now;
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    this.sessions = this.sessions.filter((s) => s.expiresAt > now);
    this.sessions.push({ tokenHash: hash(token), userId: user.id, expiresAt });
    this.save();
    return { token, user };
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

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ users: this.users, sessions: this.sessions }));
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
