import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_CONSENT_HEADER as SERVER_HEADER,
  AI_CONSENT_VERSION as SERVER_VERSION,
  hasAiConsent as serverHasAiConsent,
} from "../../server/src/ai/consent";
import { DICTIONARIES } from "../src/i18n";
import {
  AI_CONSENT_HEADER,
  AI_CONSENT_VERSION,
  AI_FEATURES,
  AI_FEATURE_TEXT,
  aiConsentHeaders,
  grantAiConsent,
  hasAiConsent,
  readAiConsent,
} from "../src/lib/aiConsent";

describe("Einwilligung in die KI-Funktionen", () => {
  it("gilt erst nach der Zustimmung zur aktuellen Fassung", () => {
    assert.equal(hasAiConsent(null), false);
    assert.equal(hasAiConsent(undefined), false);
    assert.equal(hasAiConsent({ version: AI_CONSENT_VERSION - 1, at: "2026-11-01T10:00:00.000Z" }), false);
    assert.equal(hasAiConsent({ version: AI_CONSENT_VERSION, at: "2026-11-01T10:00:00.000Z" }), true);
    const granted = grantAiConsent(new Date("2026-11-26T12:30:00Z"));
    assert.deepEqual(granted, { version: AI_CONSENT_VERSION, at: "2026-11-26T12:30:00.000Z" });
    assert.equal(hasAiConsent(granted), true);
  });

  it("liest nur gültig Gespeichertes – sonst fragt die App lieber noch einmal", () => {
    const saved = { version: 1, at: "2026-11-26T12:30:00.000Z" };
    assert.deepEqual(readAiConsent(saved), saved);
    assert.deepEqual(readAiConsent({ ...saved, extra: "weg" }), saved);
    for (const raw of [
      undefined,
      null,
      true,
      "1",
      1,
      [],
      {},
      { version: 1 },
      { at: saved.at },
      { version: 0, at: saved.at },
      { version: -1, at: saved.at },
      { version: 1.5, at: saved.at },
      { version: "1", at: saved.at },
      { version: 1, at: "gestern" },
      { version: 1, at: 1764160200000 },
    ]) {
      assert.equal(readAiConsent(raw), null, JSON.stringify(raw));
    }
  });

  it("schickt die Fassung nur mit gültiger Zustimmung im Header mit", () => {
    assert.deepEqual(aiConsentHeaders(null), {});
    assert.deepEqual(aiConsentHeaders({ version: 0, at: "2026-11-26T12:30:00.000Z" }), {});
    assert.deepEqual(aiConsentHeaders(grantAiConsent()), { [AI_CONSENT_HEADER]: String(AI_CONSENT_VERSION) });
  });

  it("passt zum Server: gleicher Header, gleiche Fassung, der Server nimmt an, was die App schickt", () => {
    assert.equal(AI_CONSENT_HEADER, SERVER_HEADER);
    assert.equal(AI_CONSENT_VERSION, SERVER_VERSION);
    assert.equal(serverHasAiConsent(aiConsentHeaders(grantAiConsent())[AI_CONSENT_HEADER]), true);
    assert.equal(serverHasAiConsent(aiConsentHeaders(null)[AI_CONSENT_HEADER]), false);
  });

  it("sagt für jede KI-Funktion in allen Sprachen, was an die KI geht, mit dem Hinweis zur Zustimmung eines Elternteils", () => {
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      for (const feature of AI_FEATURES) {
        const key = AI_FEATURE_TEXT[feature].split(".")[1] as keyof typeof dict.aiConsent;
        assert.ok(dict.aiConsent[key].includes("FoodTracker"), `${lang}: ${feature}`);
      }
      // Kein Mindestalter, aber unter 14 bzw. bei Gesundheitsangaben unter 18 nur mit Zustimmung eines Elternteils.
      assert.ok(/14/.test(dict.aiConsent.parental) && /18/.test(dict.aiConsent.parental), `${lang}: Eltern-Hinweis`);
      assert.ok(dict.aiConsent.recipient.includes("Anthropic"), `${lang}: Empfänger`);
    }
  });
});
