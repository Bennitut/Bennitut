import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { KeyValueStorage } from "./session";

/**
 * Speicher für die Anmeldung: auf iPhone und Android verschlüsselt im Schlüsselbund bzw. Keystore (expo-secure-store,
 * in Expo Go enthalten), im Browser in localStorage – expo-secure-store gibt es dort nicht. Fehler (privater Modus,
 * gesperrter Schlüsselbund) kommen als abgelehntes Promise zurück; lib/session.ts fängt sie ab.
 */
export const sessionStore: KeyValueStorage =
  Platform.OS === "web"
    ? {
        getItem: async (key) => globalThis.localStorage.getItem(key),
        setItem: async (key, value) => globalThis.localStorage.setItem(key, value),
        removeItem: async (key) => globalThis.localStorage.removeItem(key),
      }
    : {
        getItem: (key) => SecureStore.getItemAsync(key),
        setItem: (key, value) => SecureStore.setItemAsync(key, value),
        removeItem: (key) => SecureStore.deleteItemAsync(key),
      };
