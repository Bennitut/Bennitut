import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claimedAnything, needsDeviceClaim } from "../src/lib/deviceClaim";

describe("Gerätedaten ins Konto", () => {
  it("übernimmt nach der Anmeldung einmal pro Konto", () => {
    assert.equal(needsDeviceClaim(null, null), false, "ohne Konto nichts zu übernehmen");
    assert.equal(needsDeviceClaim(null, "konto-a"), false, "abgemeldet");
    assert.equal(needsDeviceClaim("konto-a", null), true, "nach der Anmeldung (setAuth setzt auf null zurück)");
    assert.equal(needsDeviceClaim("konto-a", undefined), true, "angemeldet aus einer älteren Version (Feld fehlt)");
    assert.equal(needsDeviceClaim("konto-a", "konto-a"), false, "schon erledigt, auch nach einem Neustart");
    assert.equal(needsDeviceClaim("konto-b", "konto-a"), true, "anderes Konto auf demselben Gerät");
  });

  it("zeigt den Hinweis nur, wenn etwas übernommen wurde", () => {
    assert.equal(claimedAnything({ recipes: 0, likes: 0, photos: 0, ratings: 0, flags: 0, diary: 0 }), false);
    assert.equal(claimedAnything({ recipes: 0, likes: 0, photos: 0, ratings: 2, flags: 0, diary: 0 }), true);
    assert.equal(claimedAnything({ diary: 1 }), true, "ältere oder neuere Server mit anderen Feldern");
    assert.equal(claimedAnything(null), false);
    assert.equal(claimedAnything(undefined), false);
  });
});
