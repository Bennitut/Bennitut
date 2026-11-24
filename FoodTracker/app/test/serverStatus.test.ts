import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serverLine } from "../src/lib/serverStatus";

describe("Profilzeile zum Server", () => {
  it("zeigt, ob und mit welcher KI der Server verbunden ist", () => {
    assert.deepEqual(serverLine(undefined), { key: "profile.serverChecking", model: "" });
    assert.deepEqual(serverLine(null), { key: "profile.serverOffline", model: "" });
    assert.deepEqual(serverLine({ ok: true, ai: { provider: "claude", model: "claude-opus-5-5", state: "ready" } }).key, "profile.serverClaude");
    assert.deepEqual(serverLine({ ok: true, ai: { provider: "ollama", model: "gemma4:e4b", state: "ready" } }), { key: "profile.serverLocalAi", model: "gemma4:e4b" });
    assert.deepEqual(serverLine({ ok: true, ai: { provider: "ollama", model: "gemma4:e4b", state: "model_missing" } }), {
      key: "profile.serverModelMissing",
      model: "gemma4:e4b",
    });
    assert.equal(serverLine({ ok: true, ai: { provider: null, model: null, state: "not_configured" } }).key, "profile.serverNoAi");
    assert.equal(serverLine({ ok: true, ai: { provider: "ollama", model: "gemma4:e4b", state: "unreachable" } }).key, "profile.serverNoAi");
    assert.equal(serverLine({ ok: true, ai: { provider: "claude", model: "claude-opus-5-5", state: "not_configured" } }).key, "profile.serverNoAi");
  });

  it("nimmt einen älteren Server ohne KI-Angabe als verbunden", () => {
    assert.equal(serverLine({ ok: true }).key, "profile.serverConnected");
  });
});
