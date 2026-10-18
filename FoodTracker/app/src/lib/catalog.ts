// Katalog und Planer kommen aus dem Server-Code und sind fest in die App eingebaut.
export { INGREDIENTS } from "../../../server/src/data/ingredients";
export { RECIPES } from "../../../server/src/data/recipes";
export { MONTH_DAYS, MONTH_WEEKS, planMonth, weekOfDay } from "../../../server/src/planner/monthPlanner";
export { PlanError, matchesPreferences } from "../../../server/src/planner/zeroWastePlanner";
export type { PlanRequest } from "../../../server/src/types";
