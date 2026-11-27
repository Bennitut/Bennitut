import { getRandomBytes } from "expo-crypto";
import { newId } from "./pantry";

/**
 * Neue Geräte-ID: 32 Hex-Zeichen, kryptografisch zufällig (expo-crypto, in Expo Go enthalten; im Browser
 * `crypto.getRandomValues`, das es auch ohne https gibt). Notfalls wie bisher aus Zeitstempel und Zufall (lib/pantry.ts).
 * Die Geräte-ID verwaltet ohne Konto die Daten des Geräts auf dem Server – sie soll sich nicht erraten lassen.
 */
export function randomDeviceId(): string {
  try {
    return Array.from(getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${newId()}${newId()}`;
  }
}
