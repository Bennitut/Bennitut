import { describe, expect, it } from "vitest";
import { aiLine, lanAddresses, startupMessage } from "../src/startInfo.js";

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
    expect(startupMessage({ ...base, storage: "SQLite-Datei data/foodtracker.db" })).toContain("Daten:               SQLite-Datei data/foodtracker.db");
    expect(startupMessage(base)).not.toContain("Daten:");
  });
});
