import { RUN_CATEGORIES, TIERS } from "@liftr/shared";
import { z } from "zod";

/** Cross-route zod fragments (DRY: "never duplicate a value across a boundary") — the tier/trust
 *  enums are used in response schemas by both `routes/ranks.ts` and
 *  `routes/routineSuggestions.ts`'s underlying rank data. */
export const tierSchema = z.enum(TIERS);
export const trustSchema = z.enum(["real", "derived", "synthetic"]);
/** Used by the run-rank/run-PR response schemas (`routes/runRanks.ts`/`routes/runPrs.ts`). */
export const runCategorySchema = z.enum(RUN_CATEGORIES);

/** Finite, bounded number — the standard shape for any client-supplied numeric input that flows
 *  into math (XP/level/pace calculations etc). Plain `.positive()`/`.min()` alone still let
 *  `Infinity`/`-Infinity` through (both satisfy those comparisons), which can hang unbounded
 *  loops downstream (see computeLevel) or return NaN. Always use this at trust boundaries instead
 *  of hand-rolling `.finite()` on each field. */
export const boundedNumber = (min: number, max: number) => z.number().finite().min(min).max(max);
