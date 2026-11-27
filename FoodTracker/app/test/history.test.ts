import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays } from "../src/lib/dates";
import { addEntry, emptyDiary, removeEntry, type DiaryState } from "../src/lib/diary";
import { backupFileName, diaryCsv, diaryJson, historySummary, importDiaryJson, type CsvLabels } from "../src/lib/history";
import type { DiaryEntry } from "../src/lib/types";

const entry = (id: string, date: string, kcal: number, title = "Linsen-Bolognese", time = "12:30"): DiaryEntry => ({
  id,
  date,
  time,
  title,
  nutrients: { kcal, protein: 20, carbs: 50, fat: 10 },
  source: "plan",
  updatedAt: `${date}T10:00:00.000Z`,
});
const TODAY = "2026-11-24"; // ein Dienstag

describe("Ernährungshistorie: Auswertung", () => {
  it("7 Tage: ein Balken pro Tag, Durchschnitt über die erfassten Tage, häufigste Gerichte", () => {
    const entries = [entry("a", "2026-11-24", 500), entry("b", "2026-11-24", 700, "Rösti"), entry("c", "2026-11-22", 1800), entry("alt", "2026-11-17", 3000)];
    const h = historySummary(entries, 7, TODAY);
    assert.equal(h.unit, "day");
    assert.equal(h.from, "2026-11-18");
    assert.equal(h.bars.length, 7);
    assert.deepEqual(h.bars.map((b) => b.kcal), [0, 0, 0, 0, 1800, 0, 1200]);
    assert.deepEqual(h.days.map((d) => d.date), ["2026-11-24", "2026-11-22"], "neueste zuerst, „alt“ liegt davor");
    assert.equal(h.avg.kcal, 1500);
    assert.deepEqual(h.top, [["Linsen-Bolognese", 2], ["Rösti", 1]]);
  });

  it("1 Jahr: ein Balken pro Woche (Montag bis Sonntag) mit Ø pro erfasstem Tag", () => {
    const entries = [entry("mo", "2026-11-23", 2000), entry("di", "2026-11-24", 1000), entry("so", "2026-11-22", 1500), entry("vorjahr", "2025-11-26", 1700)];
    const h = historySummary(entries, 365, TODAY);
    assert.equal(h.unit, "week");
    assert.equal(h.totalDays, 365);
    assert.ok(h.bars.every((b) => new Date(`${b.start}T12:00:00`).getDay() === 1), "jeder Balken beginnt an einem Montag");
    assert.equal(h.bars.at(-1)?.start, "2026-11-23");
    assert.deepEqual({ logged: h.bars.at(-1)?.logged, kcal: h.bars.at(-1)?.kcal }, { logged: 2, kcal: 1500 });
    assert.deepEqual({ start: h.bars.at(-2)?.start, kcal: h.bars.at(-2)?.kcal }, { start: "2026-11-16", kcal: 1500 });
    assert.equal(h.bars[0]?.kcal, 1700, "erster Balken: Woche mit dem 26.11.2025");
    assert.equal(h.days.length, 4);
  });

  it("Alles: seit dem ersten Eintrag, bei langen Zeiträumen ein Balken pro Monat", () => {
    const entries = [entry("a", "2024-12-31", 2100), entry("b", "2025-01-15", 1900), entry("c", "2025-01-16", 2100), entry("d", TODAY, 1800)];
    const h = historySummary(entries, "all", TODAY);
    assert.equal(h.unit, "month");
    assert.equal(h.from, "2024-12-31");
    assert.equal(h.bars.length, 24, "Dezember 2024 bis November 2026");
    assert.deepEqual(h.bars.slice(0, 2).map((b) => [b.start, b.kcal]), [["2024-12-01", 2100], ["2025-01-01", 2000]]);
    assert.equal(h.days.length, 4);
    assert.equal(h.totalDays, 694);
  });

  it("Alles: kurze Historie pro Tag bzw. Woche, ohne Einträge nur heute", () => {
    assert.equal(historySummary([entry("a", addDays(TODAY, -10), 2000)], "all", TODAY).unit, "day");
    assert.equal(historySummary([entry("a", addDays(TODAY, -100), 2000)], "all", TODAY).unit, "week");
    const empty = historySummary([], "all", TODAY);
    assert.deepEqual([empty.from, empty.to, empty.bars.length, empty.days.length], [TODAY, TODAY, 1, 0]);
    // Einträge mit sehr altem Datum (falsche Uhr) ziehen „Alles“ nicht über Jahrzehnte.
    assert.equal(historySummary([entry("x", "1970-01-01", 100), entry("a", TODAY, 2000)], "all", TODAY).from, TODAY);
  });
});

const LABELS: CsvLabels = {
  date: "Datum",
  time: "Uhrzeit",
  title: "Gericht",
  kcal: "kcal",
  protein: "Eiweiß (g)",
  carbs: "Kohlenhydrate (g)",
  fat: "Fett (g)",
  source: "Quelle",
  sources: { foto: "Foto", plan: "Plan", manuell: "von Hand" },
};

describe("Ernährungshistorie: Export und Import", () => {
  it("CSV für Excel: Dezimalkomma mit „;“, Anführungszeichen, keine Formeln, BOM", () => {
    const entries = [
      { ...entry("b", "2026-11-24", 612.44, 'Pasta "al forno"; extra'), time: "19:00" },
      { ...entry("a", "2026-11-24", 450.06, "=HYPERLINK(1)"), time: "08:00", source: "foto" as const },
    ];
    const csv = diaryCsv(entries, LABELS, true);
    assert.ok(csv.startsWith("﻿Datum;Uhrzeit;Gericht;kcal;Eiweiß (g);Kohlenhydrate (g);Fett (g);Quelle\r\n"));
    const lines = csv.slice(1).trimEnd().split("\r\n");
    assert.equal(lines[1], "2026-11-24;08:00;'=HYPERLINK(1);450,1;20;50;10;Foto", "nach Uhrzeit sortiert, Formel entschärft");
    assert.equal(lines[2], '2026-11-24;19:00;"Pasta ""al forno""; extra";612,4;20;50;10;Plan');
    assert.equal(diaryCsv(entries, LABELS, false).split("\r\n")[1], "2026-11-24,08:00,'=HYPERLINK(1),450.1,20,50,10,Foto");
    assert.equal(backupFileName(TODAY, "csv"), "FoodTracker-Historie-2026-11-24.csv");
  });

  it("JSON-Sicherung: wieder importieren ohne Duplikate, Gelöschtes bleibt gelöscht", () => {
    let phone = addEntry(emptyDiary(), entry("a", "2026-11-23", 500), new Date("2026-11-23T10:00:00Z"));
    phone = addEntry(phone, entry("b", "2026-11-24", 700), new Date("2026-11-24T10:00:00Z"));
    phone = addEntry(phone, entry("c", "2026-11-24", 300), new Date("2026-11-24T11:00:00Z"));
    phone = removeEntry(phone, "c", new Date("2026-11-24T12:00:00Z"));
    const file = diaryJson(phone, new Date("2026-11-24T13:00:00Z"));
    assert.ok(JSON.parse(file).exportedAt === "2026-11-24T13:00:00.000Z");

    // Neues Gerät ohne Server und Konto: alles kommt zurück, die Löschmarke von c auch.
    const restored = importDiaryJson(emptyDiary(), file);
    assert.ok(restored.ok);
    assert.deepEqual([restored.added, restored.updated, restored.unchanged], [2, 0, 0]);
    assert.deepEqual(restored.state.entries, phone.entries);
    assert.deepEqual(restored.state.deleted, phone.deleted);
    assert.deepEqual([...restored.state.pending].sort(), ["a", "b", "c"], "geht bei Gelegenheit auch auf den Server");

    // Noch einmal importieren: nichts doppelt.
    const again = importDiaryJson(restored.state, file);
    assert.ok(again.ok);
    assert.deepEqual([again.added, again.updated, again.unchanged], [0, 0, 2]);
    assert.equal(again.state.entries.length, 2);

    // Nach dem Export gelöscht: die alte Sicherung bringt den Eintrag nicht zurück; Fehlendes wird nicht gelöscht.
    const later = removeEntry(addEntry(phone, entry("d", "2026-11-25", 900), new Date("2026-11-25T08:00:00Z")), "a", new Date("2026-11-25T09:00:00Z"));
    const merged = importDiaryJson(later, file);
    assert.ok(merged.ok);
    assert.deepEqual(merged.state.entries.map((e) => e.id), ["b", "d"]);
  });

  it("nimmt auch eine reine Liste von Einträgen und meldet falsche Dateien", () => {
    const list = importDiaryJson(emptyDiary(), JSON.stringify([entry("x", "2026-11-24", 400), { kaputt: true }]));
    assert.ok(list.ok && list.added === 1);
    const results = [importDiaryJson(emptyDiary(), "kein json"), importDiaryJson(emptyDiary(), '{"name":"anderes"}'), importDiaryJson(emptyDiary(), "[1,2,3]")];
    assert.deepEqual(results.map((r) => (r.ok ? "ok" : r.error)), ["not_json", "not_backup", "not_backup"]);
    const bom = importDiaryJson(emptyDiary() as DiaryState, `﻿${diaryJson(emptyDiary())}`);
    assert.ok(bom.ok && bom.added === 0);
  });
});
