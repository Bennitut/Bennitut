// Katalog und Planer kommen aus dem Server-Code und sind fest in die App eingebaut.
import { RECIPES } from "../../../server/src/data/recipes";
import { videoLanguageIndex } from "./videos";

export { INGREDIENTS } from "../../../server/src/data/ingredients";
export { RECIPES };
export { applyOverrides } from "../../../server/src/admin/recipePatch";
export { MONTH_DAYS, MONTH_WEEKS, planMonth, weekOfDay } from "../../../server/src/planner/monthPlanner";
export { PlanError, matchesPreferences } from "../../../server/src/planner/zeroWastePlanner";
export type { PlanRequest } from "../../../server/src/types";

/** Sprache der Katalogvideos nach URL – auch für Kopien und Admin-Änderungen, die sie ohne Sprache gespeichert haben. */
export const CATALOG_VIDEO_LANGUAGES = videoLanguageIndex(RECIPES);
