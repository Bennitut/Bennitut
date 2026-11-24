/** Hilfsfunktionen für Kalendertage im Format YYYY-MM-DD (lokale Zeit). */

const parse = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

const format = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setDate(d.getDate() + days);
  return format(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

/** Montag der Woche, in der der Tag liegt (Wochen von Montag bis Sonntag). */
export function startOfWeek(date: string): string {
  const d = parse(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return format(d);
}

/** Erster Tag des Monats danach. */
export function nextMonth(date: string): string {
  const d = parse(date);
  return format(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

/** z. B. "Mo., 3.11." in der gewählten Sprache, mit `withYear` "Mo., 3.11.2025". */
export function formatDay(date: string, language: string, withYear = false): string {
  try {
    return parse(date).toLocaleDateString(language, { weekday: "short", day: "numeric", month: "numeric", ...(withYear ? { year: "numeric" } : {}) });
  } catch {
    return date;
  }
}

/** z. B. "3.11.2025" in der gewählten Sprache. */
export function formatDate(date: string, language: string): string {
  try {
    return parse(date).toLocaleDateString(language, { day: "numeric", month: "numeric", year: "numeric" });
  } catch {
    return date;
  }
}
