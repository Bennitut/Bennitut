import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Recipe } from "../types.js";
import { applyOverrides, type RecipeOverride, type RecipePatch } from "./recipePatch.js";

export { applyOverrides, type RecipeOverride, type RecipePatch };

/** Änderungen von Admins an Katalogrezepten, in einer JSON-Datei gespeichert. */
export class OverrideStore {
  private overrides: Record<string, RecipeOverride> = {};

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.overrides = JSON.parse(readFileSync(file, "utf8")) as Record<string, RecipeOverride>;
    } catch {
      // Noch keine Datei: leer starten.
    }
  }

  all(): Record<string, RecipeOverride> {
    return this.overrides;
  }

  set(recipeId: string, patch: RecipePatch, userName: string): RecipeOverride {
    const entry = { patch: { ...this.overrides[recipeId]?.patch, ...patch }, updatedBy: userName, updatedAt: new Date().toISOString() };
    this.overrides[recipeId] = entry;
    this.save();
    return entry;
  }

  /** Beim Löschen eines Admin-Kontos: dessen Namen aus „zuletzt geändert von“ entfernen. */
  anonymize(userName: string) {
    let changed = false;
    for (const entry of Object.values(this.overrides)) {
      if (entry.updatedBy === userName) {
        entry.updatedBy = "Gelöschtes Konto";
        changed = true;
      }
    }
    if (changed) this.save();
  }

  remove(recipeId: string): boolean {
    if (!this.overrides[recipeId]) return false;
    delete this.overrides[recipeId];
    this.save();
    return true;
  }

  /** Katalog mit allen Änderungen; ausgeblendete Rezepte fallen weg. */
  apply(recipes: Recipe[]): Recipe[] {
    return applyOverrides(recipes, this.overrides);
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.overrides));
    renameSync(tmp, this.file);
  }
}
