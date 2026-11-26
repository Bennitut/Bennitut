import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SERVER_IMAGE_PATH, resolveImage, resolveImageUri } from "../src/lib/serverImages";

// Fotos aus dem Bildspeicher des Servers kommen als Pfad und bekommen erst beim Anzeigen die Server-Adresse (Vorrang 1,
// 9.2 Teil 3).

const key = "0b6c3f0e-7a1d-4c55-9a0e-2f4b1c9d8e7a.jpg";

describe("Fotos aus dem Bildspeicher des Servers", () => {
  it("setzt die Server-Adresse vor den Pfad – auch mit Schrägstrich am Ende", () => {
    assert.equal(resolveImageUri(`/api/images/${key}`, "http://192.168.1.23:3000"), `http://192.168.1.23:3000/api/images/${key}`);
    assert.equal(resolveImageUri(`/api/images/${key}`, "https://foodtracker.example.org/"), `https://foodtracker.example.org/api/images/${key}`);
  });

  it("zeigt ohne Server nichts statt einer kaputten Adresse", () => {
    assert.equal(resolveImageUri(`/api/images/${key}`, null), undefined);
    assert.equal(resolveImage({ uri: `/api/images/${key}`, credit: "Lena" }, null), undefined);
  });

  it("lässt data-URIs, Adressen im Netz und Leeres, wie sie sind", () => {
    for (const uri of ["data:image/jpeg;base64,/9j/4AAQ", "https://upload.wikimedia.org/foto.jpg", "file:///foto.jpg"]) {
      assert.equal(resolveImageUri(uri, "http://localhost:3000"), uri);
      assert.equal(resolveImageUri(uri, null), uri);
    }
    assert.equal(resolveImageUri(undefined, "http://localhost:3000"), undefined);
    assert.equal(resolveImageUri("", "http://localhost:3000"), "");
    assert.equal(resolveImage(undefined, "http://localhost:3000"), undefined);
  });

  it("behält den Bildnachweis", () => {
    const image = { uri: `/api/images/${key}`, credit: "Foto: Lena", source: "https://example.org" };
    assert.deepEqual(resolveImage(image, "http://localhost:3000"), { ...image, uri: `http://localhost:3000/api/images/${key}` });
  });

  it("nutzt denselben Pfad wie der Server", () => {
    const server = readFileSync(new URL("../../server/src/storage/images.ts", import.meta.url), "utf8");
    assert.match(server, new RegExp(`export const IMAGE_PATH = "${SERVER_IMAGE_PATH.replace(/\//g, "\\/")}";`));
  });
});
