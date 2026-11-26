import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PASSWORD_MAX_LENGTH as SERVER_MAX, PASSWORD_MIN_LENGTH as SERVER_MIN, passwordProblem as serverPasswordProblem } from "../../server/src/auth/password";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, accountExportName, errorParams, looksLikeEmail, passwordProblem, providerName } from "../src/lib/account";

describe("Konto mit E-Mail und Passwort", () => {
  it("prüft Passwörter genau wie der Server", () => {
    assert.equal(PASSWORD_MIN_LENGTH, SERVER_MIN);
    assert.equal(PASSWORD_MAX_LENGTH, SERVER_MAX);
    const samples = [
      "",
      "123456789",
      "1234567890",
      "Käsespätzle",
      // Emojis zählen als ein Zeichen (in UTF-16 sind es zwei Einheiten).
      "🥕🥕🥕🥕🥕🥕🥕🥕🥕",
      "🥕🥕🥕🥕🥕🥕🥕🥕🥕🥕",
      // „e“ mit getrenntem Akzent ist nach NFKC ein Zeichen.
      "cafécaféab",
      "x".repeat(200),
      "x".repeat(201),
    ];
    for (const password of samples) assert.equal(passwordProblem(password), serverPasswordProblem(password), JSON.stringify(password));
  });

  it("nimmt die Mindestlänge des Servers, wenn er eine andere meldet", () => {
    assert.equal(passwordProblem("1234567890", 12), "too_short");
    assert.equal(passwordProblem("123456789012", 12), null);
  });

  it("erkennt Tippfehler in der E-Mail-Adresse vor dem Absenden", () => {
    for (const ok of ["benjamin@example.org", " a.b+test@mail.example.at ", "x_y@sub-domain.example.co"]) assert.equal(looksLikeEmail(ok), true, ok);
    for (const bad of ["", "benjamin", "benjamin@", "@example.org", "a@b", "a@example.o", "a b@example.org", "a@@example.org", "a..b@example.org"]) {
      assert.equal(looksLikeEmail(bad), false, bad);
    }
    assert.equal(looksLikeEmail(`${"a".repeat(250)}@example.org`), false);
  });

  it("nennt die Wartezeit nach zu vielen Versuchen in ganzen Minuten", () => {
    assert.deepEqual(errorParams({ retryAfter: 30 }), { minutes: 1, min: 10 });
    assert.deepEqual(errorParams({ retryAfter: 900 }), { minutes: 15, min: 10 });
    assert.deepEqual(errorParams({ retryAfter: 901, minLength: 12 }), { minutes: 16, min: 12 });
    // Älterer Server ohne Angaben: Standardwerte statt „{minutes}“ im Text.
    assert.deepEqual(errorParams({}), { minutes: 1, min: 10 });
    assert.deepEqual(errorParams({ retryAfter: "bald", minLength: -1 }), { minutes: 1, min: 10 });
  });

  it("benennt Datei und Anmeldeart", () => {
    assert.equal(accountExportName("2026-11-26"), "foodtracker-konto-2026-11-26.json");
    assert.equal(providerName("password", "E-Mail"), "E-Mail");
    assert.equal(providerName("apple", "E-Mail"), "Apple");
    assert.equal(providerName("dev", "E-Mail"), "Test");
  });
});
