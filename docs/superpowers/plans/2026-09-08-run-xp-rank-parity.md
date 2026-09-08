# Run XP/LP parity: implementation plan

## Goal

Runs today earn nothing but a streak credit — no XP, no rank, no PRs. This plan gives runs full
parity with workouts: a distance/duration-derived XP contribution (feeding the same global player
level workouts already feed), and a genuine rank/LP progression system built on five fixed distance
categories (Mile, 5K, 10K, Half Marathon, Marathon), each with its own 9-tier standards ladder —
mirroring, as closely as the domain allows, the existing per-exercise strength-rank engine.

## Why now

This surfaced from a direct question: "the anti-cheat was mostly designed for workouts, how does it
act for runs?" — answer: it doesn't, because runs don't feed the progression system the plausibility
gate protects at all. Once that gap was visible, the natural follow-up was "should runs earn XP/LP
in the first place?" — they don't today, and the user decided they should, at full parity with
workouts rather than a token gesture. Building the anti-cheat coverage in isolation would have
nothing to protect; building the progression system without anti-cheat would reopen the exact
fabrication risk the original conversation was about. This plan does both together.

## Decisions locked in during brainstorming (do not re-litigate)

1. **Five fixed distance categories**, one 9-tier standards ladder each: Mile (1609.344 m), 5K
   (5000 m), 10K (10000 m), Half Marathon (21097.5 m), Marathon (42195 m).
2. **Off-distance runs** bucket to the *nearest* category by absolute distance, but the run's actual
   time is first converted to a *Riegel-predicted equivalent time at that category's exact distance*
   before it's ranked — an 8K isn't compared raw against 10K standards.
3. **Standards data is real, sourced, and included in this plan** (Task 2) — not placeholders.
4. **Manual runs earn XP but are excluded from rank/PR entirely.** Only GPS/FIT/HealthConnect-sourced
   runs (i.e. runs with real `run_points` rows) are rank/PR-eligible, because only they have anything
   a plausibility check can verify.
5. **A run-specific plausibility gate is in scope**, parallel to (not a modification of) the existing
   workout gate, gating rank-up/PR eligibility for GPS-tracked runs.
6. **A new, separate "Overall Runner Rank"** aggregate — never merged into "Overall Lifter Rank."
7. **Runs stay REST-only** — no sync-queue integration. The orchestration hooks into
   `persistRun` (`packages/server/src/services/runImportService.ts`), the one choke point every
   run-creation path already shares, not into `SyncItem` processing.
8. **XP has no ledger table**, matching the existing "recompute from source rows on every read"
   philosophy (`xpService.ts`'s `getXpSummary` re-derives total XP from `sets`+`ranks`+two frozen
   `workouts` columns every time it's called — there is no XP table anywhere today). Run XP follows
   the same pattern: recomputed from `runs` rows on read, nothing new persisted except the one frozen
   `plausibilityMultiplier` column runs currently lack (mirroring `workouts.plausibilityMultiplier`).

## Architecture

**Reused wholesale, zero changes needed** (both explore passes independently confirmed these are
already metric-agnostic by construction):
- `packages/shared/src/rank/tiers.ts` — `TIERS`, `TIER_DIVISION_COUNT`, `ordinal`/`ordinalToBand`/
  `positionToBand`, and critically `resolveRank(value, thresholds)` itself. Feeding it a run's
  average speed in m/s (higher = better) needs no inversion of its comparison direction — it already
  serves two unrelated metrics (`load_ratio`, rep counts) via the same function.
- `packages/shared/src/rank/decay.ts` — `computeCurrentBand`, `applySessionRecoveryGain`, all four
  constants. Operates purely on `RankBand` + a day count; no strength-specific math anywhere in it.
- `packages/shared/src/rank/tiers.ts`'s `ratchetPeak` — pure band comparison, reused as-is.
- `packages/shared/src/rank/aggregate.ts` — `computeOverallRank`/`computeOverallPeak`, called a
  second time with the five category ranks instead of exercise ranks, to produce Overall Runner Rank.
- `packages/shared/src/rank/defaultStandards.ts`'s **interpolation machinery** —
  `widenAnchorSpread`, `interpolateNineTierAnchors`, `expand` — all three operate on plain number
  tuples and are reused unchanged to turn 5 running anchor speeds into a full 9-tier threshold table.
  Only the anchor *data* is new (Task 2), not the interpolation math.
- `packages/shared/src/math/gps.ts`'s `MAX_PLAUSIBLE_SPEED_M_S`, `haversineM`, `smoothPoints` — the
  run-plausibility gate (Task 6) builds on these rather than duplicating them.

**Genuinely new** (no existing counterpart, the actual work of this plan):
- A run performance metric: Riegel-adjusted category-equivalent speed (Task 1).
- Running standards data, sourced (Task 2).
- Schema: `runCategory` enum, `runStandards`, `runRanks`, `runRankEvents`, `runPrs` tables, plus
  `runs.plausibilityMultiplier` (Task 3). **New parallel tables, not exercise-FK reuse** — `ranks`/
  `prs`/`rankEvents` all hard-FK to `exercises.id` NOT NULL, and shoehorning running through a
  synthetic "exercise" row was considered and rejected as conceptually dishonest.
- A run-specific plausibility gate (Task 4).
- A run XP formula (Task 5).
- A run-finish orchestration function, the run-analog of `applyFinishWorkout`, hooked into
  `persistRun`'s call sites (Task 7).
- A run-rank recompute function, the run-analog of `recomputeRankForExercise`, category-keyed
  instead of exercise-keyed (Task 8).
- Client UI: rank/PR display on runs, a running Rekorde section, an Overall Runner Rank section, and
  — for the first time — runs legitimately earning the `--ease-spring` "earned moment" motion
  convention already reserved for rank-ups/PRs/level-ups (`RunsPage.vue`'s own doc comment currently
  states runs are deliberately excluded from it).

## Tech stack

Same as the rest of the repo: TypeScript throughout, Drizzle/SQLite, Fastify + zod, Vue 3/Ionic
client, Vitest. No new dependencies — the Riegel formula and the interpolation reuse are pure
arithmetic on primitives already available.

## Global constraints

- **Pre-v1, no migrations to accumulate** (`docs/CONTRIBUTING.md`): the schema changes in Task 3
  regenerate the single squashed baseline (`packages/db/drizzle/0000_initial_schema.sql`), exactly
  as the planned-routes work just did — never a new incremental migration file.
- **App UI strings are German.** Established vocabulary to reuse, not reinvent: Läufe/Lauf/Verlauf
  (existing), Rekord/Rekorde/Neuer Rekord/Persönlicher Rekord/Beförderung/LP (existing, strength-only
  today — this plan is what first extends them to running). New category labels needed: **Meile**,
  **5 km**, **10 km**, **Halbmarathon**, **Marathon** (all standard German running vocabulary, no
  invented terms). `docs/concepts/glossary.md` gets its first-ever run entries (Task 15).
- **Two existing code comments assert the invariant this plan reverses** and must be updated, not
  just left stale: `packages/server/src/routes/runs.ts:128-135` and
  `packages/client/src/services/runService.ts:69-70` (both currently say "runs don't feed XP/LP").
- **Manual runs (`runs.source === "manual"`) never touch rank/PR logic** — the run-finish
  orchestration (Task 7) must check `source` and/or `run_points` existence before calling into
  rank recompute at all, not merely discount the result.
- **`resolveRank`'s value must be "higher = better."** Running "value" is average speed in m/s, not
  raw time — every place a time is compared, it must already have been converted to a speed before
  reaching `resolveRank`/`ratchetPeak`/anything else in `tiers.ts`.
- **No sync-queue changes.** `SyncItem`'s union in `syncService.ts` is not touched by this plan.
- **`mobile-viewport-check` skill required** for every client-facing task, per this repo's CLAUDE.md.
- **`pnpm typecheck && pnpm lint && pnpm test` must be clean** before any task is considered done.
- **`node scripts/dev-up.mjs --id <session-id>` / `dev-down.mjs`** for all manual verification, per
  CLAUDE.md — never a bare `pnpm dev`, never skip the matching `dev-down`.

---

## Task 1: Riegel equivalence + category-assignment math

**Files:** `packages/shared/src/math/riegel.ts` (new), `tests/shared/math/riegel.test.ts` (new)

**Interfaces:**
```ts
export const RUN_CATEGORIES = ["mile", "5k", "10k", "half_marathon", "marathon"] as const;
export type RunCategory = (typeof RUN_CATEGORIES)[number];

export const RUN_CATEGORY_DISTANCE_M: Record<RunCategory, number> = {
  mile: 1609.344,
  "5k": 5000,
  "10k": 10000,
  half_marathon: 21097.5,
  marathon: 42195,
};

// Riegel (1977) "Athletic Records and Human Endurance" gives a single exponent (~1.06), but a
// deep-research pass cross-validating against Daniels' VDOT equivalent-performance tables (see
// this plan's research notes) found the real exponent is NOT uniform across our five category
// distances: it clusters tightly around 1.06 for 5K<->10K, 10K<->HalfMarathon, and
// HalfMarathon<->Marathon (all aerobic-endurance-dominated), but is consistently higher, ~1.08,
// for Mile<->5K specifically — that transition crosses into VO2max/anaerobic-capacity-influenced
// territory that decays faster with distance than pure aerobic endurance does. Using 1.06 for a
// Mile<->5K conversion systematically under-corrects. We only ever predict a time AT one of the 5
// fixed category distances (nearest-category bucketing), so the exponent only needs to vary by
// TARGET category, not by an arbitrary distance pair.
const RIEGEL_EXPONENT_MILE = 1.08;
const RIEGEL_EXPONENT_DEFAULT = 1.06;

function riegelExponentForCategory(category: RunCategory): number {
  return category === "mile" ? RIEGEL_EXPONENT_MILE : RIEGEL_EXPONENT_DEFAULT;
}

/** Riegel's race-time-prediction formula: given a known performance at distance d1, predicts the
 *  equivalent time at distance d2, using the exponent appropriate for the target category (see
 *  above). Used here to normalize an off-distance run onto its nearest fixed category's exact
 *  distance before ranking it. */
export function riegelPredictedTimeS(d1M: number, t1S: number, d2M: number, targetCategory: RunCategory): number;

/** Nearest category by absolute distance difference — the five category distances are spread
 *  geometrically enough (1.6/5/10/21/42 km) that this never needs anything fancier than a
 *  straight nearest-neighbor scan. */
export function nearestRunCategory(distanceM: number): RunCategory;

/** The rank-comparable value for a finished run: Riegel-adjusts (distanceM, durationS) onto the
 *  nearest category's exact distance (using that category's own exponent) and returns the
 *  category plus the resulting average speed in m/s — "higher is better," so it plugs directly
 *  into `resolveRank` with no inversion. */
export function runRankValue(distanceM: number, durationS: number): { category: RunCategory; speedMps: number };
```

**Steps:**
- [ ] RED: write tests first — `riegelPredictedTimeS` against known reference pairs for BOTH
  exponent regimes: a 20:00 5K predicting ~41:40-42:00 for 10K (default exponent), and a mile time
  predicting a 5K time using the 1.08 exponent specifically (assert it differs measurably from what
  a naive 1.06 conversion would give — this is the regression test that would catch someone
  "simplifying" back to a single constant); `nearestRunCategory` at exact category distances and at
  midpoints between two categories; `runRankValue` end-to-end for a distance exactly on a category
  (equivalent time should equal actual time, speed = distance/duration unchanged) and for an
  off-distance run in both the mile-adjacent and non-mile-adjacent ranges.
- [ ] GREEN: implement.
- [ ] Export `RunCategory`, `RUN_CATEGORIES`, `RUN_CATEGORY_DISTANCE_M` from
  `packages/shared/src/index.ts` — every later task needs these.

---

## Task 2: Sourced running standards data

**Files:** `packages/shared/src/rank/runStandards.ts` (new), `tests/shared/rank/runStandards.test.ts` (new)

**Source and cross-validation:** anchor times originate from [Running Level](https://runninglevel.com)'s
tiered finish-time tables (Beginner/Novice/Intermediate/Advanced/Elite, defined as the
5th/20th/50th/80th/95th percentile of RunRepeat's underlying ~35M-result/28,000+-race database),
age 20 as the open/prime-age baseline — the same simplification `defaultStandards.ts` makes
implicitly (its strength anchors aren't age-graded either). A dedicated deep-research pass then
independently cross-validated every tier row before this plan trusted the numbers:

- **Internal consistency via Daniels' VDOT**: each tier row's time at all 5 distances was converted
  to an implied VDOT score (Daniels' Running Formula, 3rd ed., cross-checked against two
  independently-reproduced VDOT tables that agree exactly on 5K times). Every row tested clustered
  within ~0.3 VDOT points across all 5 distances — i.e. the table behaves exactly like one
  physiologically coherent fitness level measured at 5 distances, not an arbitrary per-distance
  guess. This is strong evidence the numbers are internally sound.
- **Sanity ceiling via WMA/USATF age-grading Age Standards** (the ~100%/world-record-caliber
  baseline used for age-grading): 2025 values M/F 5K 12:49/13:54, 10K 26:24/28:46, Half
  57:31/1:02:52, Marathon 2:00:35/2:09:56 — comfortably faster than our Elite tier everywhere, as
  expected (Elite here means "strong competitive amateur," not "near world record").
- **A resolved discrepancy**: RunRepeat's own raw all-comers percentile calculator and
  pacepercentile.com both imply a much slower population median (e.g. men's 5K median ~31:28 vs.
  our Intermediate anchor of 22:31). This is a population-definition difference, not an error —
  RunningLevel's tiers reflect people who train and race with intent, not every charity-5K
  finisher. Liftr's strength-standards precedent already uses a training-intent population (gym
  lifters), not a general-public one, so this table's population framing is the right fit and was
  deliberately kept rather than pulled toward the slower raw/all-comers numbers.
- **Trust tier: `"derived"`** — not `"real"` (no single row is a direct primary governing-body
  number) but stronger than `"synthetic"` (every row passed real independent physiological
  cross-validation against an established model, not just a single commercial source taken on faith).

No anchor values changed as a result of this research — the original table held up. What changed is
confidence and citation rigor, and (see Task 1) the discovery that the Riegel exponent used to
normalize off-distance runs onto these anchors is NOT uniform across category pairs.

Values converted from finish time to average speed (`categoryDistanceM / finishTimeS`) so they slot
directly into `resolveRank`'s "higher = better" convention:

| Category | Sex | Beginner | Novice | Intermediate | Advanced | Elite |
|---|---|---|---|---|---|---|
| Mile | M | 2.848 | 3.439 | 4.043 | 4.651 | 5.226 |
| Mile | F | 2.514 | 2.980 | 3.469 | 3.945 | 4.397 |
| 5K | M | 2.647 | 3.167 | 3.701 | 4.223 | 4.717 |
| 5K | F | 2.351 | 2.766 | 3.191 | 3.613 | 4.010 |
| 10K | M | 2.545 | 3.050 | 3.568 | 4.075 | 4.550 |
| 10K | F | 2.253 | 2.654 | 3.068 | 3.476 | 3.858 |
| Half Marathon | M | 2.426 | 2.902 | 3.396 | 3.884 | 4.341 |
| Half Marathon | F | 2.141 | 2.514 | 2.903 | 3.290 | 3.654 |
| Marathon | M | 2.368 | 2.812 | 3.272 | 3.727 | 4.156 |
| Marathon | F | 2.102 | 2.453 | 2.816 | 3.176 | 3.516 |

(All values m/s, 3 decimal places. Source finish times and the conversion arithmetic are recorded in
the module's own doc comment for anyone who wants to re-derive them — mirroring how
`defaultStandards.ts` cites Nuttall et al. 2024 for its male/female ratio.)

**Interfaces:**
```ts
export const RUN_ANCHOR_STANDARDS: Record<RunCategory, { male: FiveAnchor; female: FiveAnchor }>;
// FiveAnchor = [number, number, number, number, number], reusing defaultStandards.ts's own type

/** Runs RUN_ANCHOR_STANDARDS through the exact same widenAnchorSpread -> interpolateNineTierAnchors
 *  -> expand pipeline defaultStandards.ts already uses for strength, producing the full 9-tier
 *  threshold table per category per sex. Zero new interpolation math — only new anchor data. */
export function buildRunStandards(): { category: RunCategory; sex: "male" | "female"; tier: Tier; division: number; threshold: number; trust: TrustTier }[];
```

**Steps:**
- [ ] `packages/shared/src/rank/defaultStandards.ts`: `widenAnchorSpread` and
  `interpolateNineTierAnchors` are already exported; `expand` is currently module-private (verified
  by reading the file directly) — add `export` to its declaration (a one-line, purely-additive
  change; no existing caller is affected). Import all three into `runStandards.ts`.
- [ ] RED: test `buildRunStandards()` produces exactly `5 categories * 2 sexes * 27 divisions = 270`
  rows; spot-check a few known thresholds land where expected (e.g. Mile/male/Beginner-tier's
  weakest division should resolve back to approximately the 2.848 m/s anchor).
- [ ] GREEN: implement `RUN_ANCHOR_STANDARDS` (the table above) and `buildRunStandards()`.
- [ ] `trust: "derived"` for all rows (real percentile data, but age-20-baseline and not a
  direct 1:1 lift of `defaultStandards.ts`'s "real" bar, which is reserved for anchors sourced
  from the OPL barbell-lift database specifically) — note this judgment call in a code comment so a
  future contributor can revisit it if better-sourced data becomes available.

---

## Task 3: Schema — run categories, standards, ranks, rank events, PRs

**Files:** `packages/db/src/schema.ts`, squashed migration regenerate (`packages/db/drizzle/`)

**New schema (mirror the exact style of `standards`/`ranks`/`prs`/`rankEvents` — read those four
table definitions in `schema.ts` before writing these):**

```ts
export const runCategoryEnum = ["mile", "5k", "10k", "half_marathon", "marathon"] as const;

export const runStandards = sqliteTable("run_standards", {
  id: id(),
  category: text("category", { enum: runCategoryEnum }).notNull(),
  sex: text("sex", { enum: ["male", "female"] }).notNull(),
  tier: text("tier", { enum: TIERS }).notNull(),
  division: integer("division").notNull(),
  threshold: real("threshold").notNull(), // m/s
  trust: text("trust", { enum: ["real", "derived", "synthetic"] }).notNull(),
}, (t) => [uniqueIndex("run_standards_category_sex_tier_division_idx")
  .on(t.category, t.sex, t.tier, t.division)]);

export const runRanks = sqliteTable("run_ranks", {
  userId: userId(),
  category: text("category", { enum: runCategoryEnum }).notNull(),
  tier: text("tier", { enum: TIERS }).notNull(),
  division: integer("division").notNull(),
  lp: real("lp").notNull(),
  bestSpeedMps: real("best_speed_mps"),
  trust: text("trust", { enum: ["real", "derived", "synthetic"] }),
  nextTargetSpeedMps: real("next_target_speed_mps"),
  computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull(),
  peakTier: text("peak_tier", { enum: TIERS }),
  peakDivision: integer("peak_division"),
  peakLp: real("peak_lp"),
  peakSpeedMps: real("peak_speed_mps"),
  peakAchievedAt: integer("peak_achieved_at", { mode: "timestamp_ms" }),
}, (t) => [primaryKey({ columns: [t.userId, t.category] })]);

export const runRankEvents = sqliteTable("run_rank_events", {
  id: id(),
  userId: userId(),
  category: text("category", { enum: runCategoryEnum }).notNull(),
  tier: text("tier", { enum: TIERS }).notNull(),
  division: integer("division").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  plausibilityReason: text("plausibility_reason", { enum: [...] }), // reuse PlausibilityReason-shaped enum, see Task 4
});

export const runPrs = sqliteTable("run_prs", {
  id: id(),
  userId: userId(),
  category: text("category", { enum: runCategoryEnum }).notNull(),
  kind: text("kind", { enum: ["time", "speed"] }).notNull(),
  value: real("value").notNull(), // seconds for "time", m/s for "speed" — mirrors prs.kind's
  // e1rm/weight/reps/volume split, one row per kind so both a category's "fastest time" and
  // "highest average speed" (same underlying number, but time is what a runner actually cares
  // about seeing) can be queried without recomputing from value each time
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  achievedAt: integer("achieved_at", { mode: "timestamp_ms" }).notNull(),
});
```

Plus one new column on the existing `runs` table:
```ts
plausibilityMultiplier: real("plausibility_multiplier"), // frozen at write time, null until a
// GPS-tracked run's plausibility gate has run (Task 4/7); always null for manual runs
```

Add corresponding Drizzle relations (`runRanksRelations` not really needed — no FK to a parent
row other than `users`; `runPrsRelations` for the `runId` FK, mirroring how `prs` doesn't define a
relations object either, per the existing style — check and match).

**Steps:**
- [ ] RED: write a repository-level test inserting a `runStandards` row, a `runRanks` row, a
  `runPrs` row referencing a real seeded run — confirm FK/uniqueness constraints behave (a second
  `runPrs` row for the same `(userId, category, kind)` should NOT be rejected by a DB constraint —
  "best" is an application-level concept, `findBestRunPrByKind` (Task 9) does the comparison, same
  as the existing `prs` table allows multiple historical rows).
- [ ] GREEN: add the schema.
- [ ] Regenerate the squashed migration baseline: `rm -rf packages/db/drizzle && mkdir -p
  packages/db/drizzle && cd packages/db && npx drizzle-kit generate --name initial_schema` — **do
  not hand-edit `packages/db/drizzle/`** (blocked by a `PreToolUse` hook anyway). Re-add the
  owner-seed `INSERT` by hand afterward, exactly as the planned-routes squash did.
- [ ] Verify via `LIFTR_DB_PATH=<scratch> pnpm test` that nothing broke, per this repo's documented
  stale-`data/liftr.db` workaround — never touch the real `data/liftr.db`.

---

## Task 4: Run-specific plausibility gate

**Files:** `packages/shared/src/rank/runPlausibility.ts` (new), `tests/shared/rank/runPlausibility.test.ts` (new)

The existing `plausibility.ts`'s `paceSeverity` (seconds-per-*set*) has no meaning for a run — this
is a genuinely new heuristic, not a reuse. Two checks, same `severityRamp`-based continuous-severity
approach as the existing module (never a hard binary cutoff):

**Interfaces:**
```ts
export interface RunPlausibilityInput {
  distanceM: number;
  durationS: number;
  points: { t: number; lat: number; lon: number }[]; // run_points, chronological
}

export type RunPlausibilityReason = "sustained_speed" | "distance_mismatch";

export interface RunPlausibilityResult {
  multiplier: number; // same PLAUSIBILITY_FLOOR=0.05 floor as the workout gate, never zero
  reason: RunPlausibilityReason | null;
}

export function computeRunPlausibility(input: RunPlausibilityInput): RunPlausibilityResult;
```

**Heuristic 1 — sustained speed.** Point-level jitter is already filtered by `smoothPoints`/
`summarizeRun` before a run is ever persisted (an isolated GPS glitch doesn't inflate `distanceM`).
This heuristic instead checks the run's *overall* average speed (`distanceM/durationS`) against
`MAX_PLAUSIBLE_SPEED_M_S` (already in `gps.ts` = 8 m/s, i.e. a 3:20/km pace, faster than
world-class marathon pace) — a `severityRamp` from some fraction below that ceiling up to it, so a
run that's fast-but-plausible (a genuine elite performance) isn't penalized the same as one that's
physically impossible for a sustained distance.

**Heuristic 2 — distance/duration consistency.** For GPS-tracked runs (which have `run_points`),
independently recompute distance via `pathDistanceM(points)` (already in `gps.ts`) and compare
against the stored `distanceM` — a large mismatch (someone editing/fabricating a manual override of
a GPS-derived value, or a corrupted import) is suspicious even if the reported pace alone looks fine.

**Steps:**
- [ ] RED: tests for both heuristics independently and combined (worst-of, same pattern as
  `computeWorkoutPlausibility`); a plausible elite run (e.g. sub-15:00 5K) should NOT be
  maximally flagged just for being fast; a physically-impossible pace should hit the floor.
- [ ] GREEN: implement, following `plausibility.ts`'s existing structure closely (read it first —
  `severityRamp`, the `worst = Math.max(...)` combination, the floor) so the two modules read as
  siblings, not unrelated implementations.
- [ ] This function does NOT get called for manual runs (`source === "manual"`) — Task 7 enforces
  that at the call site, not here; this module stays a pure function with no knowledge of `source`.

---

## Task 5: Run XP formula

**Files:** `packages/shared/src/math/runXp.ts` (new), `tests/shared/math/runXp.test.ts` (new)

Mirrors `computeSetXp`'s anti-grinding philosophy: not linear in distance (trivially gameable —
"run the same easy 1K in a loop all day"), decayed on repetition of a similar distance/route.

**Interfaces:**
```ts
export interface RunXpInput {
  runId: string;
  distanceM: number;
  durationS: number;
  loggedAt: Date; // startedAt
  plausibilityMultiplier?: number; // default 1 — manual runs always pass 1 (no gate ever ran)
}

const RUN_XP_PER_KM = 60; // nominal, tuned so a typical 5K (~300 XP) sits in the same rough
// order of magnitude as a typical strength session's per-set XP total — exact tuning is a
// balancing pass, flag this constant clearly as an initial guess in a comment, matching how
// TIER_XP_MULTIPLIER's own values were arrived at by iteration, not first-principles derivation

/** Anti-grinding decay keyed on a rounded distance bucket (nearest 500m) + calendar day —
 *  running the "same" distance repeatedly nets diminishing XP, same spirit as
 *  repeatSetMultiplier/quantizeLoadForDecay but on distance instead of load. */
export function computeRunXp(runs: RunXpInput[]): number; // total, chronological, same
// "sort then walk, keying occurrence on a bucketed value" shape as computeTotalXp
```

**Steps:**
- [ ] RED: a single run's XP scales with distance but sub-linearly is NOT required (unlike sets,
  which are literally identical in shape — different distances ARE different runs); the decay
  applies to *repeating a similar distance*, not to distance itself. Test: three 5K runs on
  different days should show diminishing XP for the 2nd/3rd; a 5K then a 10K should NOT trigger the
  same decay (different bucket).
- [ ] GREEN: implement, reusing the `1/(1 + DECAY_STEP*(occurrence-1))`-shaped formula from
  `repeatSetMultiplier`, floored the same way.
- [ ] Do not persist anything — `getRunXpSummary` (Task 10) calls this by scanning all of a user's
  `runs` rows fresh on every read, matching the codebase's "no XP ledger table" philosophy stated
  in Global Constraints.

---

## Task 6: Run-rank repository

**Files:** `packages/server/src/repositories/runRankRepository.ts` (new), `tests/server/repositories/runRankRepository.test.ts` (new)

Mirrors `rankRepository.ts`'s shape exactly (read it first for the precise query patterns/style):

```ts
findRunStandardsForCategory(db, category): Promise<RunStandardRow[]>;
findLoggedRunsForCategory(db, userId, category, { rankEligibleOnly: true }): Promise<Run[]>;
// rankEligibleOnly filters source !== "manual" AND EXISTS a run_points row — see Global Constraints
findRunRankByCategory(db, userId, category): Promise<RunRankRow | null>;
upsertRunRank(db, userId, category, values): Promise<void>; // onConflict (userId, category)
findBestRunPrByKind(db, userId, category, kind): Promise<RunPrRow | null>;
insertRunPr(db, values): Promise<void>;
insertRunRankEvent(db, values): Promise<void>;
findAllRunRanks(db, userId): Promise<RunRankRow[]>; // for Overall Runner Rank aggregation
```

**Steps:**
- [ ] RED: one test per function against a real in-memory DB (`createTestDb`), including a
  cross-user-isolation case using `insertTestUser` for a real second user row (per this repo's
  established FK-fixture pattern — do not use a literal nonexistent-user-id string).
- [ ] GREEN: implement.

---

## Task 7: Run-rank recompute service

**Files:** `packages/server/src/services/runRankService.ts` (new), `tests/server/services/runRankService.test.ts` (new)

The run-analog of `recomputeRankForExercise` (`rankService.ts`) — same algorithm *shape*, adapted:

```
recomputeRunRank(db, userId, category, plausibilityMultiplier = 1, plausibilityReason = null):
  1. findRunStandardsForCategory(category) -> thresholds for both sexes (sex comes from the user's
     profile setting, same getUserSex() helper rankService.ts already has — reuse it directly)
  2. findLoggedRunsForCategory(userId, category, { rankEligibleOnly: true }) -> full history of
     GPS-tracked, non-manual runs whose nearest category (Task 1) is this one
  3. For each run: runRankValue(distanceM, durationS) -> speedMps (Task 1) — track bestSpeedMps,
     bestRun, and a dailyBest: Map<UTC-day, bestSpeedMps> (same corroboration-evidence shape as
     rankService.ts)
  4. rank = resolveRank(bestSpeedMps, thresholds)
  5. isPeakCorroborated: same day-based check as rankService.ts, reusing its exact comparison
     logic (band-position compare, not raw-value compare)
  6. storedPeak reconstructed from the prior runRanks row
  7. Same eligibility floors as strength (PEAK_ELIGIBILITY_FLOOR=0.3, PR_ELIGIBILITY_FLOOR=0.5,
     imported from rankService.ts's constants, not re-declared)
  8. peak = peakEligible ? ratchetPeak(...) : storedPeak
  9. rankedUp defined against peak, same as strength
  10. Current band via computeCurrentBand/applySessionRecoveryGain, same as strength — decay uses
      the run's own startedAt for "days since last trained" (i.e. days since the most recent
      rank-eligible run in this category)
  11. insertRunRankEvent if rankedUp; upsertRunRank; PR check via findBestRunPrByKind (kind="time"
      AND kind="speed", inserting a new runPrs row for either that improved) — a PR requires
      plausibilityMultiplier >= PR_ELIGIBILITY_FLOOR, same gate as strength
  12. Returns { rankedUp, newPr, tier, division, lp, prevLp } — same shape as RecomputeResult
```

**Steps:**
- [ ] RED: tests covering the full sequence above against real seeded run history — first
  rank-eligible run ever (no storedPeak), a same-day repeat (uncorroborated), a next-day
  corroborating run (peak locks in), a long gap (decay), a manual run in the mix (must be excluded
  from the history scan entirely, confirm it doesn't affect `bestSpeedMps`).
- [ ] GREEN: implement, importing (not duplicating) `resolveRank`, `ratchetPeak`,
  `computeCurrentBand`, `applySessionRecoveryGain`, `PEAK_ELIGIBILITY_FLOOR`, `PR_ELIGIBILITY_FLOOR`
  from their existing modules.

---

## Task 8: Run-finish orchestration

**Files:** `packages/server/src/services/runImportService.ts` (modify), `tests/server/services/runImportService.test.ts` (extend)

Hooks into `persistRun`'s three existing call sites. Order of operations, mirroring
`applyFinishWorkout`'s structure:

```
finishRun(db, userId, run: NewRun, points: RunPoint[]):
  1. insertRun -> the persisted run row
  2. insertRunPoints
  3. creditStreak(db, userId, dateStr, "run")  // unchanged, already exists
  4. if run.source !== "manual" && points.length > 0:
       a. plausibility = computeRunPlausibility({ distanceM, durationS, points })  // Task 4
       b. patch the run row: plausibilityMultiplier = plausibility.multiplier
       c. { category } = runRankValue(distanceM, durationS)  // Task 1
       d. recomputeRunRank(db, userId, category, plausibility.multiplier, plausibility.reason)  // Task 7
     else:
       // manual run: no plausibility computed (nothing to check), no rank recompute — XP-only,
       // per Global Constraints. plausibilityMultiplier stays null.
  5. return the persisted run row (+ rank verdict if one was computed, for the caller to surface)
```

**Steps:**
- [ ] RED: extend the existing `runImportService.test.ts` suite — a GPS-tracked import now
  triggers a rank recompute (assert a `runRanks` row exists afterward); a manual run does not
  (assert no `runRanks` row, `plausibilityMultiplier` stays null); a HealthConnect import behaves
  like GPX/FIT (same GPS-tracked path).
- [ ] GREEN: implement, replacing the current three-line `persistRun` body with the sequence above
  (or keep `persistRun` as the first 2 steps and add this orchestration as a wrapper — your call
  based on how invasive the real diff turns out to be; keep call sites simple either way).
- [ ] Update the stale doc comment on `packages/server/src/routes/runs.ts:128-135`'s `DELETE`
  handler — it currently says "no rank recompute needed here" for deletion, which is now only
  half-true: deleting a run should NOT retroactively un-rank a category (matching how deleting a
  workout doesn't retroactively undo past rank state either — `ranks`/`runRanks` are a cache of the
  *current* best, not an append-only ledger that needs pruning), but the comment's framing needs to
  change from "runs don't feed rank" to "deleting a run doesn't need a live recompute, unlike
  logging one." Get this right — don't just delete the comment.

---

## Task 9: Run XP + Overall Runner Rank in the API

**Files:** `packages/server/src/services/xpService.ts` (modify), `packages/server/src/services/overallRankService.ts` (modify or new sibling `overallRunnerRankService.ts`), `packages/server/src/repositories/xpRepository.ts` (modify), `packages/server/src/routes/xp.ts` (modify), new route file or extension for run-rank endpoints

- [ ] `xpRepository.ts`: add `findAllRunsForXp(db, userId)` (selects `distanceM, durationS,
  startedAt, plausibilityMultiplier` for all of a user's runs — no join needed, unlike
  `findAllSetsForXp`'s three-way join).
- [ ] `xpService.ts`'s `getXpSummary`: add `computeRunXp(runs)` (Task 5) into the existing
  `totalXp` sum alongside per-set XP and the two session bonuses — XP is global-per-user already,
  this is the one place strength and running literally converge into the same number.
- [ ] New `computeOverallRunnerRank(db, userId)` (naming/location: sibling function or file next to
  the existing `computeOverallRank` in `overallRankService.ts` — read that file first to match its
  exact style), calling `findAllRunRanks` (Task 6) then the *existing*, unmodified
  `aggregate.ts` helpers.
- [ ] New route(s): `GET /api/runs/ranks` (all 5 category ranks for the current user, shape mirrors
  `GET /api/ranks`), `GET /api/runs/prs` (mirrors `GET /api/prs`), `GET /api/runs/overall-rank`
  (mirrors whatever the existing overall-lifter-rank endpoint returns). Check
  `packages/server/src/routes/ranks.ts`/`prs.ts` for the exact response-shape convention to mirror.
- [ ] RED/GREEN as usual; extend `tests/server/routes/runs.test.ts` or add sibling test files
  matching whichever file(s) gain the new routes.

---

## Task 10: Client services + stores for run rank/PR/XP

**Files:** `packages/client/src/services/runRankService.ts` (new), `packages/client/src/stores/runRankStore.ts` (new), extend `packages/client/src/services/runService.ts`/`stores/runsStore.ts` if `GET /api/runs`'s response gains rank-adjacent fields

Mirror `rankStore.ts`/`prStore.ts`'s existing client patterns exactly (read them first). Update the
stale comment at `packages/client/src/services/runService.ts:69-70` (the client-side twin of Task
8's server-side comment fix).

**Steps:**
- [ ] RED/GREEN: services + Pinia stores + tests, same shape as Task 6's server repository but
  client-side (fetch wrappers, not DB queries).

---

## Task 11: RunsPage.vue / RunDetail.vue — rank/PR display + earned-moment motion

**Files:** `packages/client/src/pages/RunsPage.vue`, `packages/client/src/components/run/RunDetail.vue`

- [ ] Add a rank/category chip next to the existing `.route-chip` slot (reuse that visual pattern,
  don't invent a new one) showing the run's nearest category + current tier/division, when the run
  is rank-eligible (has a `runRanks` entry for that category) — e.g. "5K · Fortgeschritten III"
  using the existing `TIER_LABEL_DE` translation table.
- [ ] A "Neuer Rekord" indicator (reusing the exact existing strength wording) when a run set a
  `runPrs` row.
- [ ] **This is the first time a run legitimately earns `--ease-spring`** — read `RunsPage.vue`'s
  own doc comment (currently at ~line 498-501) explaining why run rows use `--ease-out`, and add
  the `--ease-spring` treatment specifically to the rank-up/PR moment (not to ordinary run-list row
  entrance, which should stay as-is) — update that comment to reflect the new, narrower exception
  rather than deleting it wholesale.
- [ ] Manual runs: no rank/PR chip at all (nothing to show — they were never rank-eligible), but
  their earned XP still displays wherever XP is shown elsewhere (Task 5's XP is real for them).
- [ ] `mobile-viewport-check` on both files before calling this done.

---

## Task 12: RecordsPage.vue — running Rekorde section

**Files:** `packages/client/src/pages/RecordsPage.vue`

Add a running section alongside the existing exercise-PR list, sourced from Task 10's PR store —
five rows (one per category), each showing the category's fastest time (from `runPrs` where
`kind === "time"`) and the date/run it was set on, linking to that run's detail view. Follow this
page's existing layout/empty-state conventions for the strength section exactly.

**Steps:**
- [ ] `mobile-viewport-check` required (this page's layout changes).

---

## Task 13: RanksPage.vue — Overall Runner Rank section

**Files:** `packages/client/src/pages/RanksPage.vue`, `packages/client/src/components/rank/RankProgress.vue` (reuse, don't fork, if its props are generic enough — check first)

A second "Overall Runner Rank" summary, visually parallel to but clearly separate from "Overall
Lifter Rank" (distinct heading, not merged into the same card) — plus the five per-category rank
rows beneath it, mirroring the per-exercise rank list's existing layout.

**Steps:**
- [ ] `mobile-viewport-check` required.

---

## Task 14: Seed data

**Files:** `scripts/seed-mock-data.ts` (modify)

Extend the existing GPS-tracked run seed (`seedGpsRun`, already producing one GPS run per the
planned-routes work) into a short realistic history across at least two categories with varied
paces, so a fresh `dev-up.mjs` session shows real rank/PR content instead of an empty state —
mirroring how the planned-routes seed deliberately varied its data (one corroborated, one not, one
abandoned-and-decayed). Include: at least one corroborated category rank, one run whose distance
falls between two categories (exercises the Riegel-adjustment path), and the existing manual run
(confirm it correctly shows XP but no rank chip).

**Steps:**
- [ ] Update `CLAUDE.md`/`docs/guides/local-development.md`'s description of what gets seeded, same
  as every prior seed-touching task in this repo's history has done.
- [ ] Real `dev-up.mjs`/`dev-down.mjs` verification, not just a unit-level check.

---

## Task 15: Docs

**Files:** `docs/concepts/rank-engine.md`, `docs/concepts/xp-and-streaks.md`, `docs/concepts/glossary.md`, `docs/features.md`, `docs/reference/http-api.md`

- [ ] `rank-engine.md`: add a "Running ranks" section parallel to the existing per-exercise
  explanation — the five categories, the Riegel-adjustment step, the manual-run exclusion, the
  separate Overall Runner Rank. Link to `runStandards.ts`/`riegel.ts` the way the doc already links
  to `tiers.ts` rather than restating values that could drift.
- [ ] `xp-and-streaks.md`: document `computeRunXp`, note the level convergence (running and strength
  XP share one global level).
- [ ] `glossary.md`: first-ever run entries — Category (Mile/5K/10K/Half Marathon/Marathon), Riegel
  equivalence, and cross-reference the existing Tier/Division/LP/Peak/Corroboration/Decay/
  Plausibility entries as shared vocabulary rather than duplicating their definitions.
- [ ] `features.md`'s Running section: state plainly that runs now earn XP and rank, correcting the
  "first-class second discipline" framing to actually be true of progression, not just import/display.
- [ ] `http-api.md`: document the new endpoints from Task 9.
- [ ] Verify every fact against real source before writing it down (this repo's established
  practice, per the planned-routes docs task) — don't trust this plan's own numbers without
  re-checking them against whatever Task 2/3 actually shipped.

---

## Task 16: Full verification

**Files:** none (verify-only, matches the planned-routes plan's own final task)

- [ ] `pnpm typecheck && pnpm lint && pnpm test` clean.
- [ ] `mobile-viewport-check` across the combined surface (RunsPage, RunDetail, RecordsPage,
  RanksPage) if any per-task check missed something once everything's combined.
- [ ] `dev-up.mjs` walkthrough: log a GPS-tracked run that ranks up, log one that sets a PR, log a
  manual run (confirm XP-only, no rank chip), log an off-distance run (confirm Riegel-adjusted
  category assignment matches expectations), delete a rank-contributing run (confirm no crash, rank
  state doesn't retroactively change), check Overall Runner Rank updates correctly.
- [ ] `dev-down.mjs` cleanup.

---

## Verification (end to end, for the whole plan)

1. `pnpm typecheck && pnpm lint && pnpm test` — all green (the one pre-existing, unrelated
   `rankService.test.ts` weekday flake noted elsewhere in this repo's history is not this plan's
   concern).
2. `node scripts/dev-up.mjs --id run-xp-verify`, walk Task 16's matrix live.
3. Confirm both stale "runs don't feed XP/LP" comments (`runs.ts`, `runService.ts`) now read
   correctly, and grep the repo for any other place that might still assert the old invariant
   (`docs/features.md`'s running section was one; there could be others not caught during research).
4. `node scripts/dev-down.mjs --id run-xp-verify`.
