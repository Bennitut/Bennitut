import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, daysBetween, formatDay } from "../src/lib/dates";
import { useTimeZone } from "./fixtures";

// Die Datumsfunktionen rechnen in Ortszeit. Geprüft wird deshalb in Zeitzonen mit und ohne Sommerzeit.
// Umstellungen 2026: EU 29.3./25.10., USA 8.3./1.11., Chile 5.4./6.9. (dort fällt Mitternacht aus).
const ZONES = ["Europe/Vienna", "Asia/Tokyo", "America/New_York", "America/Santiago", "UTC"];

/** Wochentag eines Kalendertags, unabhängig von der Zeitzone berechnet. */
const weekday = (date: string, language: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(language, { weekday: "short", timeZone: "UTC" });

for (const zone of ZONES) {
  describe(`Datumslogik (${zone})`, () => {
    useTimeZone(zone);

    it("addDays kommt über Monats-, Jahres- und Schaltjahreswechsel", () => {
      assert.equal(addDays("2026-01-31", 1), "2026-02-01");
      assert.equal(addDays("2026-02-28", 1), "2026-03-01");
      assert.equal(addDays("2028-02-28", 1), "2028-02-29");
      assert.equal(addDays("2026-12-31", 1), "2027-01-01");
      assert.equal(addDays("2026-03-01", -1), "2026-02-28");
      assert.equal(addDays("2026-11-24", 0), "2026-11-24");
      // Letzter Tag eines Monatsplans (30 Tage), der am 24.11. beginnt.
      assert.equal(addDays("2026-11-24", 29), "2026-12-23");
    });

    it("addDays und daysBetween stimmen an den Tagen der Zeitumstellung", () => {
      for (const date of ["2026-03-08", "2026-03-29", "2026-04-05", "2026-09-06", "2026-10-25", "2026-11-01"]) {
        assert.equal(addDays(addDays(date, -1), 1), date);
        assert.equal(addDays(date, 1), addDays(addDays(date, 2), -1));
        assert.equal(daysBetween(addDays(date, -1), addDays(date, 1)), 2, date);
      }
    });

    it("daysBetween ist das Gegenstück zu addDays (jeder Tag von gut zwei Jahren)", () => {
      for (let n = -400; n <= 400; n++) {
        const date = addDays("2026-06-15", n);
        assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(daysBetween("2026-06-15", date), n, `${n} Tage → ${date}`);
      }
    });

    it("daysBetween zählt rückwärts negativ", () => {
      assert.equal(daysBetween("2026-11-24", "2026-11-20"), -4);
      assert.equal(daysBetween("2027-01-01", "2026-12-31"), -1);
    });

    it("formatDay zeigt Wochentag und Tag des richtigen Kalendertags", () => {
      for (const date of ["2026-11-24", "2026-03-29", "2026-09-06", "2026-10-25"]) {
        for (const language of ["de", "en", "fr", "it", "es"]) {
          const text = formatDay(date, language);
          assert.ok(text.includes(weekday(date, language)), `${language} ${date}: „${text}“`);
          assert.match(text, new RegExp(`(^|\\D)0?${Number(date.slice(8))}(\\D|$)`), `${language} ${date}: „${text}“`);
        }
      }
    });

    it("formatDay fällt bei einer ungültigen Sprache auf das Datum zurück", () => {
      assert.equal(formatDay("2026-11-24", "!!"), "2026-11-24");
    });
  });
}
