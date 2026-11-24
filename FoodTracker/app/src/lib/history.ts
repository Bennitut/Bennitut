// Ernährungshistorie im Profil: Auswertung für 7 Tage bis „Alles“, Export (CSV und JSON) und Import (JSON).
// Ohne native Module, damit alles in test/ läuft; das Speichern und Auswählen der Datei steht in historyFiles.ts.
import { addDays, daysBetween, nextMonth, startOfWeek } from "./dates";
import { isoTime, mergeRecords, normalizeEntry, type DiaryRecord, type DiaryState } from "./diary";
import { sumNutrients } from "./pantry";
import type { DiaryEntry, Nutrients } from "./types";

export const HISTORY_RANGES = [7, 30, 365, "all"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];
/** Wofür ein Balken steht: ein Tag, eine Woche (Montag bis Sonntag) oder ein Monat. */
export type BarUnit = "day" | "week" | "month";

export interface HistoryDay {
  date: string;
  entries: DiaryEntry[];
  total: Nutrients;
}

export interface HistoryBar {
  /** Erster Tag: der Tag selbst, der Montag der Woche bzw. der Monatserste. */
  start: string;
  /** Erfasste Tage im Balken. */
  logged: number;
  /** Ø kcal pro erfasstem Tag (0 ohne erfasste Tage). */
  kcal: number;
}

export interface HistorySummary {
  from: string;
  to: string;
  /** Tage im Zeitraum (bei „Alles“ seit dem ersten Eintrag). */
  totalDays: number;
  unit: BarUnit;
  /** Älteste zuerst. */
  bars: HistoryBar[];
  /** Erfasste Tage, neueste zuerst. */
  days: HistoryDay[];
  /** Durchschnitt pro erfasstem Tag. */
  avg: Nutrients;
  /** Häufigste Gerichte: Name und Anzahl. */
  top: [string, number][];
}

/** Ältere Einträge (falsche Uhr o. Ä.) ziehen „Alles“ nicht über Jahrzehnte. */
const EARLIEST = "2000-01-01";

export function historySummary(entries: DiaryEntry[], range: HistoryRange, today: string): HistorySummary {
  let first: string | null = null;
  let last: string | null = null;
  for (const e of entries) {
    if (e.date < EARLIEST) continue;
    if (first === null || e.date < first) first = e.date;
    if (last === null || e.date > last) last = e.date;
  }
  // Einträge mit späterem Datum (Uhr eines anderen Geräts) zählen bei „Alles“ mit.
  const to = range === "all" && last !== null && last > today ? last : today;
  const from = range === "all" ? (first !== null && first < to ? first : to) : addDays(today, -(range - 1));
  const totalDays = daysBetween(from, to) + 1;
  const unit: BarUnit =
    range === 7 || range === 30 ? "day" : range === 365 ? "week" : totalDays <= 31 ? "day" : totalDays <= 366 ? "week" : "month";

  const byDate = new Map<string, DiaryEntry[]>();
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  const days: HistoryDay[] = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, entries: list, total: sumNutrients(list.map((e) => e.nutrients)) }));

  const keyOf = (date: string) => (unit === "day" ? date : unit === "week" ? startOfWeek(date) : `${date.slice(0, 7)}-01`);
  const step = (date: string) => (unit === "day" ? addDays(date, 1) : unit === "week" ? addDays(date, 7) : nextMonth(date));
  const bars: HistoryBar[] = [];
  const index = new Map<string, HistoryBar>();
  for (let cursor = keyOf(from), end = keyOf(to); cursor <= end; cursor = step(cursor)) {
    const bar: HistoryBar = { start: cursor, logged: 0, kcal: 0 };
    bars.push(bar);
    index.set(cursor, bar);
  }
  for (const day of days) {
    const bar = index.get(keyOf(day.date));
    if (!bar) continue;
    bar.logged++;
    bar.kcal += day.total.kcal;
  }
  for (const bar of bars) bar.kcal = bar.logged > 0 ? bar.kcal / bar.logged : 0;

  const sum = sumNutrients(days.map((d) => d.total));
  const n = Math.max(1, days.length);
  const counts = new Map<string, number>();
  for (const d of days) for (const e of d.entries) counts.set(e.title, (counts.get(e.title) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
  return {
    from,
    to,
    totalDays,
    unit,
    bars,
    days,
    avg: { kcal: sum.kcal / n, protein: sum.protein / n, carbs: sum.carbs / n, fat: sum.fat / n },
    top,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Export und Import
// ---------------------------------------------------------------------------------------------------------------

/** Dateiname ohne Sprache, z. B. „FoodTracker-Historie-2026-11-24.json“. */
export const backupFileName = (today: string, extension: "json" | "csv") => `FoodTracker-Historie-${today}.${extension}`;

export interface CsvLabels {
  date: string;
  time: string;
  title: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  source: string;
  sources: Record<DiaryEntry["source"], string>;
}

const byDateTime = (a: DiaryEntry, b: DiaryEntry) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

/**
 * Tabelle für Excel, Numbers oder LibreOffice. Mit Dezimalkomma (Deutsch, Französisch, Italienisch, Spanisch) trennt
 * „;“ die Spalten, sonst „,“ – so öffnet Excel die Datei in der jeweiligen Sprache direkt richtig. Mit BOM, damit
 * Umlaute stimmen; Texte, die mit = + - @ beginnen, bekommen ein ' davor, damit Excel sie nicht als Formel ausführt.
 */
export function diaryCsv(entries: DiaryEntry[], labels: CsvLabels, decimalComma: boolean): string {
  const separator = decimalComma ? ";" : ",";
  const cell = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[";,\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const num = (value: number) => {
    const text = String(Math.round(value * 10) / 10);
    return decimalComma ? text.replace(".", ",") : text;
  };
  const header = [labels.date, labels.time, labels.title, labels.kcal, labels.protein, labels.carbs, labels.fat, labels.source].map(cell);
  const rows = [...entries]
    .sort(byDateTime)
    .map((e) => [e.date, e.time, cell(e.title), num(e.nutrients.kcal), num(e.nutrients.protein), num(e.nutrients.carbs), num(e.nutrients.fat), cell(labels.sources[e.source])]);
  return `﻿${[header, ...rows].map((r) => r.join(separator)).join("\r\n")}\r\n`;
}

/** Sicherung zum Wieder-Importieren: alle Einträge (eine Zeile pro Eintrag) und die Löschmarken. */
export function diaryJson(state: DiaryState, now = new Date()): string {
  const entries = [...state.entries].sort(byDateTime).map((e) => `    ${JSON.stringify(e)}`);
  return [
    "{",
    '  "app": "FoodTracker",',
    '  "kind": "diary",',
    '  "version": 1,',
    `  "exportedAt": ${JSON.stringify(now.toISOString())},`,
    entries.length > 0 ? `  "entries": [\n${entries.join(",\n")}\n  ],` : '  "entries": [],',
    `  "deleted": ${JSON.stringify(state.deleted)}`,
    "}",
    "",
  ].join("\n");
}

export type ImportResult =
  | { ok: true; state: DiaryState; added: number; updated: number; unchanged: number }
  | { ok: false; error: "not_json" | "not_backup" };

/**
 * Übernimmt eine Sicherung (von „Als Sicherung (JSON)“ oder eine reine Liste von Einträgen). Nichts doppelt: Einträge
 * mit derselben ID kommen nur dazu, wenn sie neuer sind; im Tagebuch Gelöschtes bleibt gelöscht, wenn es danach
 * gelöscht wurde. Gelöscht wird nichts, was in der Datei fehlt.
 */
export function importDiaryJson(state: DiaryState, text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { ok: false, error: "not_json" };
  }
  const backup = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  const rawEntries = Array.isArray(data) ? data : backup && (backup.app === "FoodTracker" || backup.kind === "diary") && Array.isArray(backup.entries) ? backup.entries : null;
  if (!rawEntries) return { ok: false, error: "not_backup" };
  const entries = rawEntries.map(normalizeEntry).filter((e): e is DiaryEntry => e !== null);
  if (rawEntries.length > 0 && entries.length === 0) return { ok: false, error: "not_backup" };
  const tombstones = (backup && Array.isArray(backup.deleted) ? backup.deleted : []).flatMap((d): DiaryRecord[] => {
    const record = d as { id?: unknown; deletedAt?: unknown };
    const deletedAt = isoTime(record?.deletedAt);
    return typeof record?.id === "string" && record.id.length > 0 && record.id.length <= 100 && deletedAt ? [{ id: record.id, updatedAt: deletedAt, entry: null }] : [];
  });
  const records: DiaryRecord[] = [...entries.map((entry) => ({ id: entry.id, updatedAt: entry.updatedAt!, entry })), ...tombstones];
  const merged = mergeRecords(state, records, { fromServer: false });
  return { ok: true, state: merged.state, added: merged.added, updated: merged.updated, unchanged: entries.length - merged.added - merged.updated };
}
