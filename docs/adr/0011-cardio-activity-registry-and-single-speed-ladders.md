# 0011. Cardio activity registry, with walking/hiking on a single-speed rank

**Date:** 2026-09-22
**Status:** Accepted

## Context

A walk recorded on a watch silently failed to import into Liftr: the client dropped any Health
Connect workout without a GPS route, and even a successful import would have been scored against
the running ladder, since Liftr had no concept of a non-running cardio activity.

An initial design gave walking its own five-distance-category ladder, mirroring running exactly
— including its own Riegel normalization exponent. That design didn't ship: the exponent
(`WALK_RIEGEL_EXPONENT = 1.02`, justified by "walking pace barely decays with distance")
contradicted its own anchor data, which dropped ~15% from mile to marathon pace — an effective
exponent of ~1.05, not 1.02. Reconciling synthetic anchor data against itself wasn't worth doing;
the whole premise (walking needs five distance categories) was reconsidered instead.

Separately, running's rankable unit (`RUN_CATEGORIES`, a hardcoded TS tuple) is not extensible the
way the strength side is: adding a rankable exercise there is a `curated.yaml` append plus an
ingest run, with zero TS changes, because the rankable unit is a DB row. Running's rankable unit
is a compile-time literal with ~6 exhaustive `Record<RunCategory, …>` maps, a Zod enum, and 4
copy-pasted DB column literals. Introducing a second and third cardio activity (walk, hike) was
the forcing function to close that gap before a fourth (cycling, rowing, ...) makes it worse.

## Decision

**Walking and hiking rank on one bucket each, not five.** Average speed (distance ÷ duration) over
the whole activity, against a single 9-tier threshold table, gated on a minimum distance AND
duration (walk: 1 km / 10 min; hike: 2 km / 30 min — below the floor, XP and streak credit still
apply, just no rank). No Riegel normalization at all — XP already rewards distance
(`WALK_XP_PER_KM`/`HIKE_XP_PER_KM`), so ranking on pace alone loses nothing.

**A declarative registry (`packages/shared/src/rank/cardioActivities.ts`) is the single source of
truth for every cardio activity**: its rank shape (`"distance-ladder"` for running,
`"single-speed"` for walk/hike, `"none"` for `other`), anchor speeds, trust tier, XP rate, Health
Connect type mapping, and whether it counts toward Overall Runner Rank. Every layer —
`classifyHealthConnectWorkoutType`, `buildCardioStandards` (ingest), `recomputeRunRank`'s bucket
dispatch, the `/api/runs/ranks` route, the client's `RankRunnerSection.vue` grid — reads this
registry instead of hardcoding per-activity branches. Adding a fourth activity (cycling, once
honest standards data exists) is a new registry entry plus anchor data.

**Walking and hiking are excluded from Overall Runner Rank**, and that exclusion is stated in the
UI (`RankRunnerSection.vue`'s note under the single-speed cards), not left for the user to infer
from the aggregate simply never moving. Two reasons: their standards are `trust: "synthetic"`
estimates, not the physiologically cross-validated table running uses; and folding them in would
let effort that takes no specific fitness move a number people read as being about running.

**`run_ranks.category` (and `run_standards`/`run_prs`) hold either a `RunCategory` or the literal
`"all"`** for a single-speed activity's one bucket. This needed no migration: `category` is a
plain SQLite `text` column with no CHECK constraint (Drizzle's `{ enum }` option is TypeScript-only
— confirmed against the generated DDL), so widening it to include `"all"`, and `runs.activityType`
to include `"hike"`, is a TS-literal-only change. The two migrations that added the
`activityType`/widened-PK columns predate this decision and needed no changes.

## Consequences

- Buys real extensibility on the cardio side: a future activity is a registry entry, not a
  multi-file change. `buildCardioStandards()`, `recompute.ts`'s recompute loop, and
  `RankRunnerSection.vue`'s grid all walk the registry rather than enumerating activities by name.
- Costs a "time" PR for single-speed activities: there's no fixed category distance to divide by,
  so walk/hike get a speed PR only (`RunRankRow`'s time-kind PR is gated on
  `rank.mode === "distance-ladder"`).
- The eligibility floor (`isRankEligible`) is a new kind of gate the strength side has no
  equivalent for — strength has no analogous "too short to count" case, since a logged set is
  never partial.
- Removal (of an activity, or of a strength exercise) still isn't implemented on either side —
  `ingestCatalog.ts` never prunes exercises, and there's no delete endpoint. Reads are resilient
  (a rank/PR row whose `activityType` has no registry entry is filtered, not a crash), but a
  clean removal path remains unbuilt on both sides, unchanged by this decision.
