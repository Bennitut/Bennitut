import { describe, expect, it } from "vitest";
import { aiLine, corsLine, displayUrl, lanAddresses, startupMessage } from "../src/startInfo.js";

const OLLAMA = { url: "http://127.0.0.1:11434", model: "gemma4:e4b" };
const nic = (address: string, internal = false) => ({ address, family: "IPv4" as const, internal, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: null });

describe("Startmeldung des Servers", () => {
  it("findet die WLAN-Adressen, private zuerst, ohne localhost und 169.254.x.x", () => {
    const interfaces = { lo: [nic("127.0.0.1", true)], wlan: [nic("192.168.1.23")], vpn: [nic("100.64.0.5")], kaputt: [nic("169.254.10.2")] };
    expect(lanAddresses(interfaces as never)).toEqual(["192.168.1.23", "100.64.0.5"]);
  });

  it("nennt die aktive KI und den nächsten Schritt", () => {
    expect(aiLine({ provider: "ollama", model: "gemma4:e4b", state: "ready" }, OLLAMA)).toContain("kostenlos");
    expect(aiLine({ provider: "ollama", model: "gemma4:e4b", state: "model_missing" }, OLLAMA)).toContain("ollama pull gemma4:e4b");
    expect(aiLine({ provider: "claude", model: "claude-opus-5-5", state: "ready" }, OLLAMA)).toContain("API-Guthaben");
    expect(aiLine({ provider: null, model: null, state: "not_configured" }, OLLAMA)).toContain("winget install Ollama.Ollama");
  });

  it("zeigt unter Windows die Firewall-Regel und einen Test fürs iPhone", () => {
    const text = startupMessage({ port: 3000, addresses: ["192.168.1.23"], ai: { provider: null, model: null, state: "not_configured" }, ollama: OLLAMA, envFile: null, platform: "win32" });
    expect(text).toContain("http://192.168.1.23:3000");
    expect(text).toContain("New-NetFirewallRule");
    expect(text).toContain("-LocalPort 3000,8081");
    expect(text).toContain("http://192.168.1.23:3000/api/health");
    expect(startupMessage({ port: 3000, addresses: [], ai: { provider: null, model: null, state: "not_configured" }, ollama: OLLAMA, envFile: null, platform: "linux" })).not.toContain("Firewall");
  });

  it("nennt, wo die Daten liegen", () => {
    const base = { port: 3000, addresses: [], ai: { provider: null, model: null, state: "not_configured" } as const, ollama: OLLAMA, envFile: null, platform: "linux" as const };
    const text = startupMessage({ ...base, storage: "SQLite-Datei data/foodtracker.db", photos: "Ordner data/photos" });
    expect(text).toContain("Daten:               SQLite-Datei data/foodtracker.db");
    expect(text).toContain("Fotos:               Ordner data/photos");
    expect(startupMessage(base)).not.toContain("Daten:");
    expect(startupMessage(base)).not.toContain("Fotos:");
  });

  it("nennt, welche Websites den Server aus dem Browser nutzen dürfen", () => {
    const base = { port: 3000, addresses: [], ai: { provider: null, model: null, state: "not_configured" } as const, ollama: OLLAMA, envFile: null, platform: "linux" as const };
    expect(startupMessage({ ...base, corsOrigins: ["https://bennitut.github.io"] })).toContain(
      "Browser (CORS):      localhost und eigenes Netz, dazu https://bennitut.github.io",
    );
    expect(corsLine([])).toContain("weitere Websites mit CORS_ORIGINS");
    expect(corsLine(["https://bennitut.github.io", "https://www.example.org"])).toBe("localhost und eigenes Netz, dazu https://bennitut.github.io, https://www.example.org");
    expect(startupMessage(base)).not.toContain("CORS");
  });

  it("zeigt im Container den Port statt WLAN, Firewall und Test am iPhone", () => {
    const text = startupMessage({
      port: 10000,
      addresses: ["172.17.0.2"],
      ai: { provider: null, model: null, state: "not_configured" },
      ollama: OLLAMA,
      envFile: null,
      platform: "win32",
      mail: false,
      container: true,
    });
    expect(text).toContain("Im Container:        Port 10000");
    expect(text).toContain("docker run -p 10000:10000");
    expect(text).toContain("Einstellungen:       Umgebungsvariablen (alle erklärt in .env.example)");
    expect(text).toContain("SMTP_* als Umgebungsvariablen");
    expect(text).toContain("ANTHROPIC_API_KEY setzen");
    for (const laptop of ["Im WLAN", "172.17.0.2", "localhost:10000", "Firewall", "iPhone", "winget", "server/.env"]) expect(text).not.toContain(laptop);
  });

  it("nennt im Container, wo Ollama läuft – ohne Zugangsdaten aus OLLAMA_URL", () => {
    const remote = { url: "https://nutzer:geheim@ollama.example.org/pfad?key=geheim", model: "gemma4:e4b" };
    const ready = aiLine({ provider: "ollama", model: "gemma4:e4b", state: "ready" }, remote, true);
    expect(ready).toBe("KI: Ollama mit gemma4:e4b unter https://ollama.example.org – kostenlos.");
    expect(aiLine({ provider: "ollama", model: "gemma4:e4b", state: "unreachable" }, remote, true)).not.toContain("geheim");
    expect(aiLine({ provider: "ollama", model: "gemma4:e4b", state: "model_missing" }, remote, true)).toContain("auf dem Rechner mit Ollama ausführen");
    expect(aiLine({ provider: "claude", model: "claude-opus-5-5", state: "not_configured" }, remote, true)).toContain("Umgebungsvariable ANTHROPIC_API_KEY");
    expect(displayUrl("kein url")).toBe("(keine gültige Adresse)");
    expect(displayUrl("http://127.0.0.1:11434")).toBe("http://127.0.0.1:11434");
  });
});
