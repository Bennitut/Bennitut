import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RECIPES } from "../src/lib/catalog";
import { PAGE_SIZE, firstPage, ratingScore, sortByRating, topRated } from "../src/lib/recipeLists";
import type { RatingSummary } from "../src/lib/types";

const rating = (avg: number, count: number): RatingSummary => ({ avg, count, mine: null });

describe("Lange Rezeptlisten (Entdecken, Tauschen im Plan)", () => {
  const catalog = sortByRating(RECIPES, {});

  it("zeigen zuerst 30 Rezepte – „Entdecken“ lädt also nicht mehr alle Katalogfotos auf einmal", () => {
    // Nur sinnvoll, solange der Katalog deutlich mehr Fotos hat, als zuerst gezeigt werden.
    assert.ok(RECIPES.filter((r) => r.media?.image).length > 3 * PAGE_SIZE);
    const { shown, total } = firstPage(catalog, PAGE_SIZE);
    assert.equal(shown.length, PAGE_SIZE);
    assert.equal(total, RECIPES.length);
    assert.deepEqual(shown, catalog.slice(0, PAGE_SIZE));
  });

  it("„Mehr anzeigen“ zeigt jeweils 30 weitere und zuletzt den Rest", () => {
    assert.deepEqual(firstPage(catalog, 2 * PAGE_SIZE).shown, catalog.slice(0, 2 * PAGE_SIZE));
    let limit = PAGE_SIZE;
    let taps = 0;
    while (firstPage(catalog, limit).shown.length < catalog.length) {
      limit += PAGE_SIZE;
      taps++;
    }
    assert.equal(taps, Math.ceil(RECIPES.length / PAGE_SIZE) - 1);
    assert.deepEqual(firstPage(catalog, limit).shown, catalog);
    assert.deepEqual(firstPage(catalog, 0).shown, []);
  });

  it("die Suche findet auch Rezepte, die ganz hinten stehen", () => {
    const last = catalog[catalog.length - 1]!;
    const { shown, total } = firstPage(catalog, PAGE_SIZE, (r) => r.name === last.name);
    assert.deepEqual(
      shown.map((r) => r.id),
      [last.id],
    );
    assert.equal(total, 1);
    // Passen mehr als 30, zählt „von …“ alle Treffer.
    const withPhoto = firstPage(catalog, PAGE_SIZE, (r) => !!r.media?.image);
    assert.equal(withPhoto.shown.length, PAGE_SIZE);
    assert.equal(withPhoto.total, RECIPES.filter((r) => r.media?.image).length);
  });
});

describe("Sortierung in „Entdecken“", () => {
  it("ohne Bewertungen bleibt die Reihenfolge des Katalogs", () => {
    assert.deepEqual(
      sortByRating(RECIPES, {}).map((r) => r.id),
      RECIPES.map((r) => r.id),
    );
    assert.equal(ratingScore(undefined), 3);
    assert.equal(ratingScore(rating(5, 0)), 3);
  });

  it("eine einzelne 5-Sterne-Bewertung überholt nicht zehn Bewertungen mit 4,5 Sternen", () => {
    const [once, often, poor] = RECIPES;
    const ratings = { [once!.id]: rating(5, 1), [often!.id]: rating(4.5, 10), [poor!.id]: rating(2, 3) };
    const ids = sortByRating(RECIPES, ratings).map((r) => r.id);
    // 4,5 × 10 → 4,25; 5 × 1 → 3,67; ohne Bewertung 3; 2 × 3 → 2,4
    assert.deepEqual(ids.slice(0, 3), [often!.id, once!.id, RECIPES[3]!.id]);
    assert.equal(ids[ids.length - 1], poor!.id);
  });

  it("„Am besten bewertet“: nur bewertete Rezepte ab 4 Sternen, die besten zuerst, höchstens zehn", () => {
    const ratings: Record<string, RatingSummary> = {};
    RECIPES.slice(0, 12).forEach((r, i) => (ratings[r.id] = rating([4, 4.5, 5][i % 3]!, 2)));
    ratings[RECIPES[12]!.id] = rating(3.9, 20); // gute Wertung durch viele Bewertungen, aber unter 4 Sternen
    ratings[RECIPES[13]!.id] = rating(5, 0); // noch keine Bewertung
    const best = topRated(sortByRating(RECIPES, ratings), ratings);
    assert.equal(best.length, 10);
    assert.ok(best.every((r) => ratings[r.id]!.count > 0 && ratings[r.id]!.avg >= 4));
    assert.deepEqual(
      best.map((r) => ratings[r.id]!.avg),
      [5, 5, 5, 5, 4.5, 4.5, 4.5, 4.5, 4, 4],
    );
  });
});
