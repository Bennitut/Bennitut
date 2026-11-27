import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Keine Geheimnisse im Repository (Vorrang 1, 9.3 „Sicherheit“): Das Repository ist öffentlich. Prüft alle
// eingecheckten Dateien unter FoodTracker/ und .github/ auf Schlüssel, Passwörter in Adressen, private Schlüssel,
// .env-Dateien und Datenbanken. Läuft nur, wo git das Repository kennt (sonst übersprungen).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function trackedFiles(): string[] | null {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--", "FoodTracker", ".github"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const files = out.split("\0").filter(Boolean);
    return files.length > 0 ? files : null;
  } catch {
    return null;
  }
}

const files = trackedFiles();

/** Dateien, die nie ins Repository gehören – Einstellungen mit Schlüsseln, Datenbanken, Zertifikate. */
const FORBIDDEN_FILES = [
  /(^|\/)\.env(\.(?!example$)[^/]+)?$/,
  /(^|\/)server\/data\//,
  /\.(db|sqlite|sqlite3|db-wal|db-shm)$/i,
  /\.(pem|key|p8|p12|pfx|jks|keystore|mobileprovision)$/i,
];

const BINARY = /\.(png|jpe?g|webp|gif|ico|icns|mp4|mov|webm|pdf|ttf|otf|woff2?|zip|gz)$/i;

/** Muster typischer Schlüssel; Beispiele aus Dokumentationen (…EXAMPLE…) und Platzhalter zählen nicht. */
const SECRET_PATTERNS: [name: string, pattern: RegExp][] = [
  ["Anthropic-Schlüssel", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["AWS-Zugangsschlüssel", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["privater Schlüssel", /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ["GitHub-Token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/],
  ["Slack-Token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Google-API-Schlüssel", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Passwort in einer Adresse", /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|smtps?):\/\/[^\s:/@"'`]+:(?![.…*<>x]+@|PASSWORT@|PASSWORD@|passwort@|password@|\$\{)[^\s@/"'`]{4,}@/],
  // Wie in einer .env-Datei (NAME=Wert); nicht gemeint sind Platzhalter („…“, „${key}“) und Namen anderer Variablen.
  ["Schlüssel in einer Einstellung", /\b(?:ANTHROPIC_API_KEY|OLLAMA_API_KEY|OLLAMA_RELAY_KEY|S3_SECRET_ACCESS_KEY|SMTP_PASS|GOOGLE_CLIENT_SECRET)=["']?(?![A-Z][A-Z0-9_]*\b)[^\s"'`#…$]{8,}/],
];

const isExample = (match: string) => /EXAMPLE/i.test(match);

describe.skipIf(files === null)("Keine Geheimnisse im Repository", () => {
  it("enthält keine .env-Dateien, Datenbanken oder Zertifikate", () => {
    const found = files!.filter((file) => FORBIDDEN_FILES.some((pattern) => pattern.test(file)));
    expect(found).toEqual([]);
    // Die Vorlage gehört dazu.
    expect(files).toContain("FoodTracker/server/.env.example");
  });

  it("enthält keine Schlüssel, Tokens oder Passwörter", () => {
    const found: string[] = [];
    for (const file of files!) {
      if (BINARY.test(file)) continue;
      let text: string;
      try {
        if (statSync(join(ROOT, file)).size > 5 * 1024 * 1024) continue;
        text = readFileSync(join(ROOT, file), "utf8");
      } catch {
        continue; // gelöscht, aber noch nicht eingecheckt
      }
      for (const [name, pattern] of SECRET_PATTERNS) {
        const global = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
        for (const match of text.matchAll(global)) {
          if (isExample(match[0])) continue;
          const line = text.slice(0, match.index).split("\n").length;
          found.push(`${file}:${line} (${name})`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("erkennt die Muster wirklich (Gegenprobe)", () => {
    const samples = [
      "ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345",
      "DATABASE_URL=postgresql://neondb_owner:npg_AbCdEf123456@ep-cool-1.eu-central-1.aws.neon.tech/neondb",
      "OLLAMA_RELAY_KEY=Zq3X9mN2vB7cL4kJ8hG1fD6sA0pO5iU3yT",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "SMTP_PASS=abcdefghijklmnop",
    ];
    for (const sample of samples) expect(SECRET_PATTERNS.some(([, p]) => p.test(sample)), sample).toBe(true);
    for (const placeholder of ["postgresql://nutzer:…@host/db", "postgresql://USER:PASSWORT@host", "S3_SECRET_ACCESS_KEY=…", "OLLAMA_RELAY_KEY=${key}", "OLLAMA_API_KEY = OLLAMA_RELAY_KEY", "# SMTP_PASS=", "AKIAIOSFODNN7EXAMPLE"]) {
      expect(SECRET_PATTERNS.some(([, p]) => p.test(placeholder) && !isExample(placeholder)), placeholder).toBe(false);
    }
    expect(FORBIDDEN_FILES.some((p) => p.test("FoodTracker/server/.env"))).toBe(true);
    expect(FORBIDDEN_FILES.some((p) => p.test("FoodTracker/app/.env.local"))).toBe(true);
    expect(FORBIDDEN_FILES.some((p) => p.test("FoodTracker/server/.env.example"))).toBe(false);
    expect(FORBIDDEN_FILES.some((p) => p.test("FoodTracker/server/data/foodtracker.db"))).toBe(true);
  });
});
