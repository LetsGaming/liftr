import { RUN_CATEGORIES, TIERS } from "@liftr/shared";
import { z } from "zod";

/** Cross-route zod fragments (DRY: "never duplicate a value across a boundary") — the tier/trust
 *  enums are used in response schemas by both `routes/ranks.ts` and
 *  `routes/routineSuggestions.ts`'s underlying rank data. */
export const tierSchema = z.enum(TIERS);
export const trustSchema = z.enum(["real", "derived", "synthetic"]);
/** Used by the run-rank/run-PR response schemas (`routes/runRanks.ts`/`routes/runPrs.ts`). */
export const runCategorySchema = z.enum(RUN_CATEGORIES);
