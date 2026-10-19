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

/** z. B. "Mo., 3.11." in der gewählten Sprache. */
export function formatDay(date: string, language: string): string {
  try {
    return parse(date).toLocaleDateString(language, { weekday: "short", day: "numeric", month: "numeric" });
  } catch {
    return date;
  }
}
