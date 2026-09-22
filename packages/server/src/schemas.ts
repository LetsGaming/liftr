import { ACTIVITY_TYPES, RUN_CATEGORIES, TIERS } from "@liftr/shared";
import { z } from "zod";

/** Cross-route zod fragments (DRY: "never duplicate a value across a boundary") — the tier/trust
 *  enums are used in response schemas by both `routes/ranks.ts` and
 *  `routes/routineSuggestions.ts`'s underlying rank data. */
export const tierSchema = z.enum(TIERS);
export const trustSchema = z.enum(["real", "derived", "synthetic"]);
/** A running category — used by manual-run input and anywhere a `RunCategory` specifically (not
 *  a general rank bucket) is expected. */
export const runCategorySchema = z.enum(RUN_CATEGORIES);
/** A rank-bucket identifier: a `RunCategory` for running's distance-ladder, or the literal "all"
 *  for a single-speed activity (walk/hike, one bucket each). Used by the run-rank/run-PR response
 *  schemas (`routes/runRanks.ts`/`routes/runPrs.ts`) since those rows can be either shape. */
export const rankBucketSchema = z.enum([...RUN_CATEGORIES, "all"]);
/** Every cardio activity type, for request bodies and response fields. */
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
/** Just the ranked activity types (everything except "other") — must be kept in lockstep with
 *  `RankedActivityType` in riegel.ts (same "hand-edited literal tuple" trade-off the DB schema's
 *  own enum columns already make, see schema.ts's note on why). Used by `routes/runRanks.ts`'s
 *  `?activityType=` query param. */
export const rankedActivityTypeSchema = z.enum(["run", "walk", "hike"]);

/** Finite, bounded number — the standard shape for any client-supplied numeric input that flows
 *  into math (XP/level/pace calculations etc). Plain `.positive()`/`.min()` alone still let
 *  `Infinity`/`-Infinity` through (both satisfy those comparisons), which can hang unbounded
 *  loops downstream (see computeLevel) or return NaN. Always use this at trust boundaries instead
 *  of hand-rolling `.finite()` on each field. */
export const boundedNumber = (min: number, max: number) => z.number().finite().min(min).max(max);
