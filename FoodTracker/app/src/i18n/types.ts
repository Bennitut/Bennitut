import type { de } from "./de";

type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };

/** Struktur aller Übersetzungen – abgeleitet aus der deutschen Referenz. */
export type Dictionary = DeepStrings<typeof de>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Alle gültigen Übersetzungsschlüssel, z. B. "plan.createTitle". */
export type TKey = Leaves<Dictionary>;
