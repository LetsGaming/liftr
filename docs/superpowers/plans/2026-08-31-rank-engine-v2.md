# Rank Engine v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-tier Bronze-Diamond rank ladder with a 9-tier ladder (variable divisions
per tier), replace instant decay snap-back with a buffed multi-session climb-back, and add a
per-workout plausibility gate that discounts XP/LP/peak eligibility for implausible sessions
without discarding the workout.

**Architecture:** Pure math changes land first in `@liftr/shared` (tier ladder, standards
interpolation, recovery-gain, plausibility scoring) with full unit test coverage, each usable and
testable in isolation before anything downstream depends on it. A DB migration adds the new tier
enum values and one new `workouts.plausibilityMultiplier` column. Server integration
(`rankService.ts`, `syncService.ts`, XP wiring) wires the new pure functions into the existing
recompute/sync flow. Client changes (tier branding, recovery/plausibility captions) land last,
once the server contract is stable.

**Tech Stack:** TypeScript, Drizzle ORM/SQLite, Vue 3, Vitest, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-31-rank-engine-v2-design.md`

## Global Constraints

- 9 tiers: Initiate(6 divisions) → Apprentice(5) → Trainee(5) → Athlete(4) → Lifter(4) →
  Advanced(3) → Elite(3) → Expert(2) → Apex(1). 33 total bands.
- Division numbering: within a tier of N divisions, values run N (weakest) down to 1 (strongest).
- No new rank-history table for recovery-gain events; no chart library; no new celebration/
  animation system.
- Plausibility gate never discards a workout or its sets — only discounts XP/LP/peak contribution.
- Exact plausibility thresholds never surface in the UI or API response, only a general reason.
- Every existing test in `packages/shared/src/rank/{tiers,decay,aggregate}.test.ts` and
  `packages/server/src/services/rankService.test.ts` must keep passing (the generalization is a
  strict superset of today's behavior when division-count-per-tier is held constant).
- Passive decay curve (`computeCurrentBand`, grace period + linear decay to floor) is **unchanged**
  — only the return-from-decay path changes.
- Run `pnpm typecheck` and `pnpm test` after every task; both must be clean before moving on.

---

## Task 1: 9-tier ladder in `@liftr/shared`

**Files:**
- Modify: `packages/shared/src/rank/tiers.ts`
- Test: `packages/shared/src/rank/tiers.test.ts`

**Interfaces:**
- Produces: `TIERS` (9-element readonly array), `Tier` (9-value union), `TIER_DIVISION_COUNT:
  Record<Tier, number>`, `Division = number` (no longer `1|2|3`), `ordinal(tier: Tier, division:
  number): number`, `ordinalToBand(ord: number): { tier: Tier; division: number }`,
  `MAX_ORDINAL: number`. All other existing exports (`resolveRank`, `sortedThresholds`,
  `nextLoadTarget`, `nextRepTarget`, `nextTargetAtOrdinal`, `ratchetPeak`, `PeakSnapshot`,
  `RankResult`, `StandardThreshold`, `TrustTier`, `RankMetric`) keep their existing signatures —
  only their internal use of `ordinal`/`DIVISIONS` changes.

- [ ] **Step 1: Write the failing tests for the new tier ladder and generalized ordinal math**

Add to `packages/shared/src/rank/tiers.test.ts` (append; keep all existing tests in the file
unchanged — they must still pass after this task):

```ts
describe("9-tier ladder", () => {
  it("has exactly 9 tiers with the documented names, in order", () => {
    expect(TIERS).toEqual([
      "initiate", "apprentice", "trainee", "athlete", "lifter",
      "advanced", "elite", "expert", "apex",
    ]);
  });

  it("has the documented division count per tier, summing to 33 bands", () => {
    expect(TIER_DIVISION_COUNT).toEqual({
      initiate: 6, apprentice: 5, trainee: 5, athlete: 4, lifter: 4,
      advanced: 3, elite: 3, expert: 2, apex: 1,
    });
    const total = Object.values(TIER_DIVISION_COUNT).reduce((a, b) => a + b, 0);
    expect(total).toBe(33);
    expect(MAX_ORDINAL).toBe(32);
  });

  it("ordinal: division N (weakest) in a tier is always the tier's lowest ordinal", () => {
    expect(ordinal("initiate", 6)).toBe(0);
    expect(ordinal("initiate", 1)).toBe(5);
    expect(ordinal("apprentice", 5)).toBe(6); // right after initiate's 6 bands (0-5)
    expect(ordinal("apprentice", 1)).toBe(10);
    expect(ordinal("apex", 1)).toBe(32); // last band overall
  });

  it("ordinalToBand inverts ordinal exactly across the whole range", () => {
    for (let o = 0; o <= MAX_ORDINAL; o++) {
      const band = ordinalToBand(o);
      expect(ordinal(band.tier, band.division)).toBe(o);
    }
  });

  it("ordinalToBand clamps above MAX_ORDINAL to apex division 1", () => {
    expect(ordinalToBand(MAX_ORDINAL + 5)).toEqual({ tier: "apex", division: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @liftr/shared test tiers.test.ts`
Expected: FAIL — `TIER_DIVISION_COUNT`/`ordinalToBand`/`MAX_ORDINAL` not exported, `TIERS` still
has 5 entries.

- [ ] **Step 3: Rewrite the tier ladder and generalize `ordinal`/add `ordinalToBand`**

Replace lines 7-11 of `packages/shared/src/rank/tiers.ts`:

```ts
export const TIERS = [
  "initiate", "apprentice", "trainee", "athlete", "lifter",
  "advanced", "elite", "expert", "apex",
] as const;
export type Tier = (typeof TIERS)[number];

/** Divisions per tier — deliberately more at the bottom (frequent rank-ups early) and fewer at
 *  the top (Apex has exactly 1: a single real milestone, not another grind). Within a tier of N
 *  divisions, values run N (weakest, entry) down to 1 (strongest, closest to promotion) — same
 *  "higher number = weaker" convention as the old fixed III/II/I, generalized to N divisions. */
export const TIER_DIVISION_COUNT: Record<Tier, number> = {
  initiate: 6, apprentice: 5, trainee: 5, athlete: 4, lifter: 4,
  advanced: 3, elite: 3, expert: 2, apex: 1,
};

export type Division = number;
```

Replace the `ordinal` function (was lines 41-43) and add `ordinalToBand` + `MAX_ORDINAL`
immediately after it:

```ts
function cumulativeDivisionsBefore(tier: Tier): number {
  return TIERS.slice(0, TIERS.indexOf(tier)).reduce((sum, t) => sum + TIER_DIVISION_COUNT[t], 0);
}

/** Flatten (tier, division) into a single ascending-strength ordinal for comparison/iteration. */
export function ordinal(tier: Tier, division: number): number {
  return cumulativeDivisionsBefore(tier) + (TIER_DIVISION_COUNT[tier] - division);
}

export const MAX_ORDINAL = Object.values(TIER_DIVISION_COUNT).reduce((a, b) => a + b, 0) - 1;

/** Inverse of `ordinal` — clamped to the valid range (an ordinal past `MAX_ORDINAL` returns
 *  Apex's single division). Centralizes what `decay.ts` and `aggregate.ts` previously each
 *  duplicated as their own `positionToBand`, since that fixed-length-array inversion no longer
 *  works once tiers have different division counts. */
export function ordinalToBand(ord: number): { tier: Tier; division: number } {
  const clamped = Math.max(0, Math.min(MAX_ORDINAL, Math.round(ord)));
  let remaining = clamped;
  for (const tier of TIERS) {
    const count = TIER_DIVISION_COUNT[tier];
    if (remaining < count) return { tier, division: count - remaining };
    remaining -= count;
  }
  return { tier: "apex", division: 1 };
}
```

Now find every remaining reference to the old `DIVISIONS` constant in this file (`sortedThresholds`
doesn't use it directly — it calls `ordinal`, so it's already fine) and remove the now-unused
`DIVISIONS`/`DIVISIONS as const` export entirely (grep the file for `DIVISIONS` to confirm no
other function in `tiers.ts` still references it before deleting the export).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @liftr/shared test tiers.test.ts`
Expected: PASS — all new tests plus every pre-existing test in the file (resolveRank,
nextLoadTarget, nextRepTarget, ratchetPeak) unchanged and still green, since none of those
functions hardcode a tier count or division count.

- [ ] **Step 5: Fix the two call sites outside `tiers.ts` that imported `DIVISIONS`**

Run: `grep -rn "DIVISIONS" packages/shared/src packages/server/src packages/client/src` to find
every remaining import. Expected hits: `packages/shared/src/rank/decay.ts` and
`packages/shared/src/rank/aggregate.ts` (both import `DIVISIONS, TIERS` from `./tiers.js` to
build their own `MAX_ORDINAL`/`positionToBand` — these get replaced in Tasks 2 and 5 below, so
leave them broken for now; do not fix them in this task, the next tasks fix them as part of their
own rewrite). Confirm no other file references `DIVISIONS`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/rank/tiers.ts packages/shared/src/rank/tiers.test.ts
git commit -m "feat(rank): expand tier ladder to 9 tiers with variable divisions per tier"
```

(This commit intentionally leaves `decay.ts`/`aggregate.ts` red — Tasks 2 and 3 fix them
immediately next as part of the same logical unit of work, kept as separate commits for
reviewability.)

---

## Task 2: Recalibrate standards data for 9 tiers

**Files:**
- Modify: `packages/shared/src/rank/defaultStandards.ts`
- Test: `packages/shared/src/rank/defaultStandards.test.ts`

**Interfaces:**
- Consumes: `TIERS`, `TIER_DIVISION_COUNT`, `Tier` from `./tiers.js` (Task 1).
- Produces: `ANCHOR_STANDARDS`, `REP_STANDARDS`, `FEMALE_ANCHOR_STANDARDS` keep their existing
  exported shape (`Record<string, StandardThreshold[]>`), now populated for all 9 tiers. New
  exported helper `interpolateNineTierAnchors(old5: [number, number, number, number, number]):
  Record<Tier, number>` — the anchor-ratio interpolation as a pure, independently testable
  function, so the 9-value tables aren't hand-typed floats (error-prone) but computed from the
  same 5 numbers the codebase already tunes today.

- [ ] **Step 1: Write the failing test for the interpolation helper**

Read the existing `packages/shared/src/rank/defaultStandards.test.ts` first (3 existing tests
per the research map) to match its existing style, then append:

```ts
describe("interpolateNineTierAnchors", () => {
  it("keeps the 4 even-indexed new tiers exactly equal to the old 5 anchors", () => {
    const result = interpolateNineTierAnchors([0.75, 1.25, 1.75, 2.25, 2.75]);
    expect(result.apprentice).toBeCloseTo(0.75, 6);
    expect(result.athlete).toBeCloseTo(1.25, 6);
    expect(result.advanced).toBeCloseTo(1.75, 6);
    expect(result.expert).toBeCloseTo(2.25, 6);
  });

  it("sets each interior new tier to the geometric mean of its neighbors", () => {
    const result = interpolateNineTierAnchors([0.75, 1.25, 1.75, 2.25, 2.75]);
    expect(result.trainee).toBeCloseTo(Math.sqrt(0.75 * 1.25), 6);
    expect(result.lifter).toBeCloseTo(Math.sqrt(1.25 * 1.75), 6);
    expect(result.elite).toBeCloseTo(Math.sqrt(1.75 * 2.25), 6);
  });

  it("extrapolates initiate below apprentice and apex above expert using the same rule in both directions", () => {
    const result = interpolateNineTierAnchors([0.75, 1.25, 1.75, 2.25, 2.75]);
    expect(result.initiate).toBeCloseTo(0.75 * (0.75 / result.trainee), 6);
    expect(result.apex).toBeCloseTo(2.25 * (2.25 / result.elite), 6);
  });

  it("produces a strictly increasing sequence across all 9 tiers", () => {
    const result = interpolateNineTierAnchors([0.75, 1.25, 1.75, 2.25, 2.75]);
    const values = TIERS.map((t) => result[t]);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @liftr/shared test defaultStandards.test.ts`
Expected: FAIL — `interpolateNineTierAnchors` is not exported, and the existing 3 tests already
in the file will also fail since `ANCHOR_STANDARDS`/`REP_STANDARDS` still reference 5-tier data
against a `Tier` type that no longer includes "bronze"/"diamond" (TypeScript compile error at
minimum) — this is expected at this point in the task.

- [ ] **Step 3: Implement `interpolateNineTierAnchors` and rewire `expand()`**

In `packages/shared/src/rank/defaultStandards.ts`, add the helper near the top (after the
`OPL_POPULATION_SHIFT` constant, before `expand`):

```ts
/**
 * The old system had 5 hand-tuned anchor ratios (Bronze..Diamond); the new 9-tier ladder needs 9.
 * Rather than hand-typing 9 new floats per exercise (error-prone, and this project's own
 * precedent — OPL_POPULATION_SHIFT — is "one tunable constant, recalibrate here in code, not
 * scattered data"), the 4 even tiers (Apprentice/Athlete/Advanced/Expert) keep the old 5 numbers
 * exactly, the 3 interior new tiers (Trainee/Lifter/Elite) sit at the geometric mean of their
 * neighbors, and the two ends (Initiate, Apex) extrapolate one step beyond their nearest anchor
 * using that anchor's own ratio to its newly-interpolated neighbor — the same rule in both
 * directions, so the curve is self-consistent rather than treating the two ends differently.
 */
export function interpolateNineTierAnchors(
  old5: [number, number, number, number, number],
): Record<Tier, number> {
  const [bronze, silver, gold, platinum, expertVal] = old5;
  const trainee = Math.sqrt(bronze * silver);
  const lifter = Math.sqrt(silver * gold);
  const elite = Math.sqrt(gold * platinum);
  const initiate = bronze * (bronze / trainee);
  const apex = platinum * (platinum / elite);
  return {
    initiate,
    apprentice: bronze,
    trainee,
    athlete: silver,
    lifter,
    advanced: gold,
    elite,
    expert: platinum,
    apex,
  };
}
```

(Note: `expertVal` above is unused by design — `platinum` is the old-Platinum anchor and is what
becomes the new `expert` tier's ratio; keeping the destructured 5th element documents that the
old Diamond number is intentionally not threaded through, per the spec's explicit note that Apex
is not a renamed copy of old Diamond. Remove the unused variable and destructure only 4: `const
[bronze, silver, gold, platinum] = old5;` — simpler and avoids an unused-var lint failure.)

Rewrite `expand()` to take a 9-value ratio table (instead of the old `RatioTable` keyed only by
the 5 old tier names) and to divide each tier's span into `TIER_DIVISION_COUNT[tier]` thresholds
instead of a hardcoded 3:

```ts
function expand(byTier: Record<Tier, number>, trust: StandardThreshold["trust"]): StandardThreshold[] {
  const out: StandardThreshold[] = [];
  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i]!;
    const cur = byTier[tier];
    const next = byTier[TIERS[i + 1]!] ?? cur * 1.15; // apex has no "next" anchor; extrapolate
    const span = next - cur;
    const divisionCount = TIER_DIVISION_COUNT[tier];
    // division values run divisionCount (weakest) down to 1 (strongest) within the tier
    for (let d = 0; d < divisionCount; d++) {
      out.push({ tier, division: divisionCount - d, threshold: cur + (span * d) / divisionCount, trust });
    }
  }
  return out;
}
```

Update every call site of `expand(slug, byTier, trust)` in `ANCHOR_STANDARDS` — each entry
currently passes a `slug` string (now unused/removed, `expand` never used it beyond a discarded
first parameter — confirm by re-reading the original signature, it took `slug` but never
referenced it in the body) and a 5-key `byTier` object literal. Replace each with
`expand(interpolateNineTierAnchors([b, s, g, p, d]), trust)`, e.g.:

```ts
export const ANCHOR_STANDARDS: Record<string, StandardThreshold[]> = {
  "back-squat": expand(interpolateNineTierAnchors([0.75, 1.25, 1.75, 2.25, 2.75]), "real"),
  "bench-press": expand(interpolateNineTierAnchors([0.5, 0.9, 1.3, 1.75, 2.1]), "real"),
  deadlift: expand(interpolateNineTierAnchors([1.0, 1.5, 2.1, 2.6, 3.1]), "real"),
  "overhead-press": expand(interpolateNineTierAnchors([0.35, 0.55, 0.8, 1.05, 1.3]), "real"),
  "barbell-row": expand(interpolateNineTierAnchors([0.5, 0.8, 1.1, 1.45, 1.75]), "real"),
};
```

For `REP_STANDARDS`, each exercise's 5 hand-written `{tier, division: 3, threshold, trust}` rows
(one division only — rep-based standards don't model sub-divisions, per the spec, unchanged)
become 9 rows, one per tier, division always 1 (since `TIER_DIVISION_COUNT` doesn't apply to
these — they're a single flat threshold per tier, not expanded via `expand()`). Add a small
sibling helper right below `interpolateNineTierAnchors`:

```ts
function expandRepStandard(old5: [number, number, number, number, number]): StandardThreshold[] {
  const ratios = interpolateNineTierAnchors(old5);
  return TIERS.map((tier) => ({
    tier,
    division: 1,
    threshold: Math.round(ratios[tier]),
    trust: "real" as const,
  }));
}

export const REP_STANDARDS: Record<string, StandardThreshold[]> = {
  pushup: expandRepStandard([5, 15, 30, 50, 75]),
  pullup: expandRepStandard([1, 5, 10, 16, 22]),
  chinup: expandRepStandard([1, 6, 12, 18, 25]),
  dip: expandRepStandard([3, 10, 20, 32, 45]),
};
```

Leave `deriveStandards`, `MALE_FEMALE_RATIO`, `RATIO_NOT_DIRECTLY_SOURCED`, and
`FEMALE_ANCHOR_STANDARDS` structurally unchanged — they already operate generically over whatever
`ANCHOR_STANDARDS` contains (multiplying every threshold by a per-exercise ratio), so they pick up
the new 9-tier data automatically with no code change needed there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @liftr/shared test defaultStandards.test.ts`
Expected: PASS — the 4 new `interpolateNineTierAnchors` tests, plus the 3 pre-existing tests in
the file (re-read their assertions before this step; if any hardcode an old tier name like
`"bronze"` or a division value of `3` from the old fixed scheme, update that specific assertion
to the equivalent 9-tier expectation — e.g. a test checking "back-squat's lowest threshold" now
checks `initiate`/division `6` instead of `bronze`/division `3`, same underlying intent).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/rank/defaultStandards.ts packages/shared/src/rank/defaultStandards.test.ts
git commit -m "feat(rank): recalibrate strength standards for the 9-tier ladder"
```

---

## Task 3: DB schema — 9-tier enums + `workouts.plausibilityMultiplier`

**Files:**
- Modify: `packages/db/src/schema.ts`
- Migration: `packages/db/drizzle/0009_<generated_name>.sql` (name assigned by `drizzle-kit`)

**Interfaces:**
- Produces: `workouts.plausibilityMultiplier` (nullable `real`, semantically defaults to `1` at
  the application layer — see note below on why not a DB-level default) available on every
  `workouts` row read via the existing relational query API, no repository changes needed for
  reads that already `select *`/use `db.query.workouts.findMany`.

- [ ] **Step 1: Update the 4 hand-spelled tier enum columns**

In `packages/db/src/schema.ts`, these are **not** derived from `@liftr/shared`'s `TIERS` (they're
independently spelled out, confirmed by the research map) — update all 4 occurrences of the
5-value enum literal to the 9-value list, keeping every other part of each column definition
identical:

```ts
// line ~212, standards.tier
tier: text("tier", { enum: ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"] }).notNull(),

// line ~225, ranks.tier — same enum list
// line ~237, ranks.peakTier — same enum list (column stays nullable, only the enum values change)
// line ~269, rankEvents.tier — same enum list
```

Also update the `division` comment at `standards.ts:213` (currently `// 3, 2, 1`) to `// N
(weakest) down to 1 (strongest), N = TIER_DIVISION_COUNT[tier]` — the column type itself
(`integer`) doesn't change, only what values are valid at the application layer.

- [ ] **Step 2: Add the new `workouts.plausibilityMultiplier` column**

In the `workouts` table definition (`packages/db/src/schema.ts:136-144`), add one line:

```ts
export const workouts = sqliteTable("workouts", {
  id: id(),
  routineId: text("routine_id").references(() => routines.id, { onDelete: "set null" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  pausedSeconds: integer("paused_seconds").notNull().default(0),
  /** Plausibility gate multiplier (rank engine v2) — computed once at finish-workout time from
   *  session pace / improbable-jump / unrealistic-value checks (see @liftr/shared's
   *  plausibility.ts). Null until the workout finishes (matches endedAt's own nullability);
   *  application code treats a null/missing value as 1 (fully plausible) rather than using a SQL
   *  default, since a workout with no endedAt has no plausibility verdict yet either. */
  plausibilityMultiplier: real("plausibility_multiplier"),
  notes: text("notes"),
  clientId: text("client_id").notNull().unique(),
});
```

- [ ] **Step 3: Generate and review the migration**

Run: `pnpm db:generate`

Expected output: a new file `packages/db/drizzle/0009_<name>.sql`. Open it and confirm it
contains **only**:
- No `ALTER TABLE` for the 4 tier enum columns — SQLite's Drizzle `text({enum:...})` is a
  TypeScript-level constraint only, not a real SQL `CHECK`, so widening the enum produces **no
  SQL statement at all** for those 4 columns (confirm this by checking the generated file doesn't
  mention `tier`).
- One `ALTER TABLE workouts ADD COLUMN plausibility_multiplier real;` statement.

If the generated SQL contains anything else (e.g. drizzle-kit deciding to recreate a table), stop
and investigate before proceeding — per the project's migration convention, never hand-edit the
generated file; if it's wrong, fix the schema.ts source and regenerate.

- [ ] **Step 4: Apply the migration**

Run: `pnpm db:migrate`
Expected: succeeds with no errors against the dev DB.

- [ ] **Step 5: Verify existing DB-touching tests still pass**

Run: `pnpm --filter @liftr/server test`
Expected: PASS for every test file that doesn't reference tier names directly (most of
`syncService.test.ts`, `workoutService.test.ts`, etc.) — tests that construct rank rows with old
tier strings like `"bronze"` will fail here; that's expected and fixed in Task 7's test updates,
not this task. Confirm the failures are specifically about tier-string literals, not migration or
schema errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat(db): widen tier enums to 9 values, add workouts.plausibilityMultiplier"
```

---

## Task 4: Client tier branding (icons, labels, colors)

**Files:**
- Modify: `packages/client/src/lib/tierIcons.ts`
- Modify: `packages/client/src/styles/tokens.css`
- Modify: `packages/client/src/components/rank/RankDistributionDonut.vue`

**Interfaces:**
- Consumes: nothing new from earlier tasks (this task only needs the 9 tier name strings, which
  are stable regardless of `@liftr/shared` internals).
- Produces: `TIER_BADGE_PATH`, `TIER_LABEL_DE`, `DIVISION_LABEL` in `tierIcons.ts` cover all 9
  tiers / divisions I-VI; 9 `.t-<slug>` CSS classes in `tokens.css`; `RankDistributionDonut.vue`'s
  `TIER_ORDER`/`TIER_COLOR_VAR` cover 9 entries.

No test file — this is presentational data with no logic to unit-test; verified via typecheck
(every `RankTier` literal union member must have an entry in each `Record`) and the mobile
click-test in Task 9's final verification.

- [ ] **Step 1: Rewrite `tierIcons.ts` for 9 tiers**

Replace the full content of `packages/client/src/lib/tierIcons.ts`:

```ts
/**
 * Per-tier rank badge glyphs and display labels (rank engine v2 — 9-tier ladder). Shared between
 * every place a tier badge renders (RanksPage.vue, RankProgress.vue, FinishSequence.vue) so they
 * can't drift. All paths are 24x24 viewBox, single <path>, simple recognizable silhouettes.
 */
export type RankTier =
  | "initiate" | "apprentice" | "trainee" | "athlete" | "lifter"
  | "advanced" | "elite" | "expert" | "apex";

export const TIER_BADGE_PATH: Record<RankTier, string> = {
  // single dot — just starting
  initiate: "M12 9a3 3 0 110 6 3 3 0 010-6z",
  // single star — entry tier, same star the old "bronze" used
  apprentice: "M12 3l2 4 4 .5-3 3 .8 4L12 16l-3.8 2.5.8-4-3-3 4-.5z",
  // two chevrons stacked — building momentum
  trainee: "M12 4l7 6-1.4 1.4L12 6.8 6.4 11.4 5 10zM12 12l7 6-1.4 1.4L12 14.8l-5.6 4.6L5 18z",
  // shield — solidity, same shield the old "silver" used
  athlete: "M12 2l7 3v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V5z",
  // flexed-arm arc — visibly active
  lifter: "M4 20c0-6 3-9 8-9M4 20h4M8 4c4 0 6 3 6 6 0 2-1 3-2 4l4 6-3 1-4-6",
  // medal on a ribbon — same medal the old "gold" used
  advanced: "M12 2a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM9.3 10.5L6 21l6-3.2 6 3.2-3.3-10.5",
  // cut gem — same gem the old "platinum" used
  elite: "M12 2 3 9l9 13 9-13z",
  // laurel-ish double arc — recognized skill
  expert: "M12 4c-3 2-4 6-3 10M12 4c3 2 4 6 3 10M12 4v14",
  // crown — same crown the old "diamond" used, single top milestone
  apex: "M4 18h16l-1.2-8.5-3.8 3.8-3-6.3-3 6.3-3.8-3.8z",
};

export const TIER_LABEL_DE: Record<RankTier, string> = {
  initiate: "ANFÄNGER",
  apprentice: "LEHRLING",
  trainee: "AUSZUBILDENDER",
  athlete: "SPORTLER",
  lifter: "HEBER",
  advanced: "FORTGESCHRITTEN",
  elite: "ELITE",
  expert: "EXPERTE",
  apex: "APEX",
};

/** Roman numerals I-VI cover the widest tier (Initiate, 6 divisions); narrower tiers only ever
 *  index into the low end of this map (a 2-division tier only ever looks up 2 or 1). */
export const DIVISION_LABEL: Record<number, string> = { 6: "VI", 5: "V", 4: "IV", 3: "III", 2: "II", 1: "I" };
```

- [ ] **Step 2: Extend `tokens.css` with 9 tier palettes**

In `packages/client/src/styles/tokens.css`, replace the 5 existing `--bronze-*`/`--silver-*`/
`--gold-*`/`--plat-*`/`--diamond-*` variable blocks (lines ~116-135) with 9 blocks. Reuse the 5
existing color quadruples for apprentice/athlete/advanced/expert/apex (same visual identity as
the old bronze/silver/gold/platinum/diamond, just renamed), and pick 4 new quadruples for
initiate/trainee/lifter/elite that sit visually between their neighbors (same `-1`/`-2`/`-3`/`-t`
shape: dark background tint, mid, bright accent, near-white text-on-tier):

```css
--initiate-1: #1a1a1a; --initiate-2: #4a4a4a; --initiate-3: #9a9a9a; --initiate-t: #f0f0f0;
--apprentice-1: #3a2109; --apprentice-2: #8a4f22; --apprentice-3: #e08a3c; --apprentice-t: #ffd9ab;
--trainee-1: #2a2508; --trainee-2: #7a6a1f; --trainee-3: #c9b23e; --trainee-t: #f5edb8;
--athlete-1: #232a38; --athlete-2: #69748a; --athlete-3: #c7d1e4; --athlete-t: #f2f6ff;
--lifter-1: #0f2e1f; --lifter-2: #2d8058; --lifter-3: #5fd6a0; --lifter-t: #d4fbe9;
--advanced-1: #3a2a04; --advanced-2: #a7820f; --advanced-3: #ffd24a; --advanced-t: #fff2c2;
--elite-1: #2f0d33; --elite-2: #8a289c; --elite-3: #d76ff0; --elite-t: #f6d7ff;
--expert-1: #0d2f33; --expert-2: #1f8f9c; --expert-3: #6ff0e6; --expert-t: #d7fffb;
--apex-1: #152449; --apex-2: #3b5fd0; --apex-3: #8fb4ff; --apex-t: #dbe7ff;
```

Then replace the 5 `.t-bronze`/`.t-silver`/`.t-gold`/`.t-plat`/`.t-diamond` class rules (lines
~348-376) with 9 rules, each named to **exactly match its `Tier` string** (fixing the pre-existing
`.t-plat` vs. `t-platinum` mismatch bug the current code has, per the spec — no tier's class name
is abbreviated from its actual string anymore):

```css
.t-initiate { --b1: var(--initiate-1); --b2: var(--initiate-2); --b3: var(--initiate-3); --tt: var(--initiate-t); }
.t-apprentice { --b1: var(--apprentice-1); --b2: var(--apprentice-2); --b3: var(--apprentice-3); --tt: var(--apprentice-t); }
.t-trainee { --b1: var(--trainee-1); --b2: var(--trainee-2); --b3: var(--trainee-3); --tt: var(--trainee-t); }
.t-athlete { --b1: var(--athlete-1); --b2: var(--athlete-2); --b3: var(--athlete-3); --tt: var(--athlete-t); }
.t-lifter { --b1: var(--lifter-1); --b2: var(--lifter-2); --b3: var(--lifter-3); --tt: var(--lifter-t); }
.t-advanced { --b1: var(--advanced-1); --b2: var(--advanced-2); --b3: var(--advanced-3); --tt: var(--advanced-t); }
.t-elite { --b1: var(--elite-1); --b2: var(--elite-2); --b3: var(--elite-3); --tt: var(--elite-t); }
.t-expert { --b1: var(--expert-1); --b2: var(--expert-2); --b3: var(--expert-3); --tt: var(--expert-t); }
.t-apex { --b1: var(--apex-1); --b2: var(--apex-2); --b3: var(--apex-3); --tt: var(--apex-t); }
```

(Read the surrounding CSS at those two line ranges first via the Read tool before editing, to
confirm the exact current selector bodies and preserve any other declarations inside them beyond
the `--b1/--b2/--b3/--tt` custom properties shown in the research map — copy the rest of each
rule's body verbatim, only the variable *names* referenced change.)

- [ ] **Step 3: Update `RankDistributionDonut.vue`'s hardcoded tier maps**

Read `packages/client/src/components/rank/RankDistributionDonut.vue` lines 15-25 (its
`TIER_ORDER` array and `TIER_COLOR_VAR` map, per the research map) and replace the 5-entry
versions with 9 entries, in ladder order, each pointing at the corresponding new `--<tier>-3` CSS
custom property name from Step 2 (matching how the existing 5 entries each pointed at their own
`--<tier>-3`).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @liftr/client run typecheck`
Expected: PASS — every `RankTier`-typed `Record` now has exactly the 9 required keys; a missing
or extra key is a compile error here, which is the real verification for this task.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/tierIcons.ts packages/client/src/styles/tokens.css packages/client/src/components/rank/RankDistributionDonut.vue
git commit -m "feat(rank): update client tier branding for the 9-tier ladder"
```

---

## Task 5: Buffed session-based recovery gain

**Files:**
- Modify: `packages/shared/src/rank/decay.ts`
- Test: `packages/shared/src/rank/decay.test.ts`

**Interfaces:**
- Consumes: `TIER_DIVISION_COUNT`, `ordinal`, `ordinalToBand`, `Tier` from `./tiers.js` (Task 1).
- Produces: `applySessionRecoveryGain(peak: RankBand, previousCurrent: RankBand): RankBand`,
  `RECOVERY_BASE_FRACTION_PER_SESSION: number`, `RECOVERY_MAX_BUFF: number`. Existing exports
  (`RANK_DECAY_GRACE_DAYS`, `RANK_DECAY_WINDOW_DAYS`, `RankBand`, `computeCurrentBand`) keep their
  existing signatures and behavior — the passive decay curve is unchanged, per the spec.

- [ ] **Step 1: Write the failing tests**

Read the existing `packages/shared/src/rank/decay.test.ts` in full first (5 tests per the
research map), then append:

```ts
describe("applySessionRecoveryGain", () => {
  it("returns peak unchanged when current already equals peak", () => {
    const peak = { tier: "advanced" as const, division: 2, lp: 40 };
    expect(applySessionRecoveryGain(peak, peak)).toEqual(peak);
  });

  it("returns peak unchanged when current is already above peak (peak just advanced)", () => {
    const peak = { tier: "advanced" as const, division: 2, lp: 40 };
    const current = { tier: "advanced" as const, division: 1, lp: 50 }; // stronger than peak
    expect(applySessionRecoveryGain(peak, current)).toEqual(peak);
  });

  it("closes a worst-case (fully floored) gap within 5 sessions, never overshooting peak", () => {
    const peak = { tier: "advanced" as const, division: 1, lp: 100 }; // top of a 3-division tier
    let current = { tier: "advanced" as const, division: 3, lp: 0 }; // fully floored
    for (let session = 0; session < 5; session++) {
      current = applySessionRecoveryGain(peak, current);
    }
    expect(current).toEqual(peak);
  });

  it("does not fully close a worst-case gap in fewer than 4 sessions (the buff isn't infinite)", () => {
    const peak = { tier: "advanced" as const, division: 1, lp: 100 };
    let current = { tier: "advanced" as const, division: 3, lp: 0 };
    for (let session = 0; session < 3; session++) {
      current = applySessionRecoveryGain(peak, current);
    }
    expect(current).not.toEqual(peak);
  });

  it("never moves current past peak, even mid-climb", () => {
    const peak = { tier: "advanced" as const, division: 2, lp: 40 };
    const current = { tier: "advanced" as const, division: 2, lp: 38 }; // 2 LP from peak
    const result = applySessionRecoveryGain(peak, current);
    expect(ordinal(result.tier, result.division) * 100 + result.lp).toBeLessThanOrEqual(
      ordinal(peak.tier, peak.division) * 100 + peak.lp,
    );
  });

  it("gives a smaller absolute gain for a smaller initial gap than for the worst case", () => {
    const peak = { tier: "advanced" as const, division: 1, lp: 100 };
    const nearlyThere = applySessionRecoveryGain(peak, { tier: "advanced", division: 1, lp: 90 });
    const farAway = applySessionRecoveryGain(peak, { tier: "advanced", division: 3, lp: 0 });
    const nearGain = 100 - 90; // trivially small remaining gap closes in well under 1 full gain unit
    const farGain =
      (ordinal(farAway.tier, farAway.division) * 100 + farAway.lp) -
      (ordinal("advanced", 3) * 100 + 0);
    expect(farGain).toBeGreaterThan(nearGain);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @liftr/shared test decay.test.ts`
Expected: FAIL — `applySessionRecoveryGain` not exported. Also expect the *existing* 5 tests in
this file to currently be failing too (they were left red at the end of Task 1, since `decay.ts`
still imports the now-removed `DIVISIONS` from `tiers.ts`) — this task fixes that as part of the
same rewrite.

- [ ] **Step 3: Implement, replacing the duplicated position math with `tiers.ts`'s centralized version**

Replace the full content of `packages/shared/src/rank/decay.ts`:

```ts
/**
 * Current-rank decay and recovery (rank engine v2). A fixed-window heuristic, not physiology or
 * a real demotion system — same "honest heuristic" convention as recovery.ts. Current rank can
 * soften with inactivity, but is hard-floored at the bottom of the peak tier, so it never risks
 * losing all progress. Returning from a decayed state is a buffed multi-session climb (not an
 * instant snap) — see applySessionRecoveryGain below.
 */
import { TIER_DIVISION_COUNT, ordinal, ordinalToBand, type Tier } from "./tiers.js";

/** No decay before this many days since the exercise was last trained. */
export const RANK_DECAY_GRACE_DAYS = 21;
/** Linear decay from the grace-day mark down to the floor over this many additional days. */
export const RANK_DECAY_WINDOW_DAYS = 60;

/** Unbuffed recovery gain per session, as a fraction of the tier's own max intra-tier span. */
export const RECOVERY_BASE_FRACTION_PER_SESSION = 0.125;
/** Buff applied when the gap is at its largest (just returned from being fully floored); tapers
 *  linearly to 1x (no buff) as current approaches peak. */
export const RECOVERY_MAX_BUFF = 2.5;

export interface RankBand {
  tier: Tier;
  division: number;
  lp: number;
}

/** Continuous strength position: each tier/division band spans 100 units, LP fills it. */
function bandPosition(band: RankBand): number {
  return ordinal(band.tier, band.division) * 100 + band.lp;
}

function positionToBand(position: number): RankBand {
  return ordinalToBand(position / 100);
}

/**
 * Soften `peak` toward the floor (weakest division / 0 LP of the peak's own tier — never lower)
 * as a linear function of `daysSinceLastTrained`. Within the grace period, returns `peak`
 * unchanged. Past `grace + window` days, returns the floor exactly. Unchanged by rank engine v2
 * — this is the passive decay curve, not the return-from-decay path below.
 */
export function computeCurrentBand(peak: RankBand, daysSinceLastTrained: number): RankBand {
  if (daysSinceLastTrained <= RANK_DECAY_GRACE_DAYS) return peak;

  const floor: RankBand = { tier: peak.tier, division: TIER_DIVISION_COUNT[peak.tier], lp: 0 };
  const daysIntoDecay = daysSinceLastTrained - RANK_DECAY_GRACE_DAYS;
  const t = Math.min(1, daysIntoDecay / RANK_DECAY_WINDOW_DAYS);

  const peakPos = bandPosition(peak);
  const floorPos = bandPosition(floor);
  return positionToBand(peakPos + (floorPos - peakPos) * t);
}

/**
 * Buffed multi-session climb-back (rank engine v2, replaces the old instant snap-to-peak). Called
 * once per finished workout session that touches this exercise, when the previously-stored
 * current band sits below peak. The buff is derived purely from *how far below peak you are right
 * now* — not from any remembered "how decayed were you when you started" state — so it's always
 * safe to call repeatedly across sessions without needing to track climb-back progress separately
 * from the `ranks` row itself.
 */
export function applySessionRecoveryGain(peak: RankBand, previousCurrent: RankBand): RankBand {
  const peakPos = bandPosition(peak);
  const prevPos = bandPosition(previousCurrent);
  if (prevPos >= peakPos) return peak;

  const tierSpan = TIER_DIVISION_COUNT[peak.tier] * 100;
  const gapFraction = (peakPos - prevPos) / tierSpan;
  const buff = 1 + gapFraction * (RECOVERY_MAX_BUFF - 1);
  const gain = RECOVERY_BASE_FRACTION_PER_SESSION * tierSpan * buff;

  return positionToBand(Math.min(peakPos, prevPos + gain));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @liftr/shared test decay.test.ts`
Expected: PASS — all 6 new tests plus the 5 pre-existing tests (grace period, partial decay,
floor, never-below-floor, instant... note the pre-existing "instant reversal to peak at
daysSinceLastTrained=0" test (`decay.test.ts:35-39` per the research map) asserted the *old*
instant-snap behavior via `computeCurrentBand(peak, 0)`. That test is still technically correct
and should still pass unchanged — `computeCurrentBand` itself is untouched and still returns peak
at `daysSinceLastTrained=0`, because that function was never the thing that changes; the
*integration* in `rankService.ts` (Task 7) is what stops relying on that same-day-reset trick to
produce the old snap-back UX. Confirm this test still passes as-is; do not modify it in this task).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/rank/decay.ts packages/shared/src/rank/decay.test.ts
git commit -m "feat(rank): add buffed multi-session recovery gain, replacing instant snap-back"
```

---

## Task 6: Plausibility gate (pure scoring module)

**Files:**
- Create: `packages/shared/src/rank/plausibility.ts`
- Create: `packages/shared/src/rank/plausibility.test.ts`
- Modify: `packages/shared/src/index.ts` (export the new module)

**Interfaces:**
- Consumes: nothing from earlier tasks except plain numbers/strings — this module is
  self-contained.
- Produces: `computeWorkoutPlausibility(input: PlausibilityInput): PlausibilityResult`, where:
  ```ts
  export interface PlausibilitySetInput { exerciseId: string; loadRatio: number | null }
  export interface PlausibilityInput {
    totalSetCount: number;
    effectiveDurationSeconds: number;
    /** Per touched exercise: this session's best load-ratio value (null for rep-only metrics —
     *  the improbable-jump and ceiling checks only apply to load_ratio exercises) and that
     *  exercise's stored peak e1RM-equivalent ratio and Apex-tier entry threshold, if known. */
    exercises: {
      exerciseId: string;
      sessionBestRatio: number | null;
      storedPeakRatio: number | null;
      apexThreshold: number | null;
    }[];
  }
  export interface PlausibilityResult {
    multiplier: number; // 1 = fully plausible, floors at PLAUSIBILITY_FLOOR
    reason: "pace" | "improbable_jump" | "exceeds_ceiling" | null;
  }
  ```
  This is later consumed by `rankService.ts`/`syncService.ts` (Task 7/8) with real DB data mapped
  into this shape — the module itself never touches the DB, matching every other file in
  `packages/shared/src/rank`.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/rank/plausibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeWorkoutPlausibility, PLAUSIBILITY_FLOOR } from "./plausibility.js";

const noExercises = { totalSetCount: 0, effectiveDurationSeconds: 0, exercises: [] };

describe("computeWorkoutPlausibility", () => {
  it("returns multiplier 1 and no reason for a normal-paced session with normal lifts", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 20,
      effectiveDurationSeconds: 45 * 60, // 45 minutes, 20 sets = 135s/set
      exercises: [
        { exerciseId: "back-squat", sessionBestRatio: 1.8, storedPeakRatio: 1.75, apexThreshold: 2.5 },
      ],
    });
    expect(result).toEqual({ multiplier: 1, reason: null });
  });

  it("flags a session with an unrealistic sets-per-minute pace", () => {
    // your example: 5 exercises, ~4 sets each, one minute total
    const result = computeWorkoutPlausibility({
      totalSetCount: 20,
      effectiveDurationSeconds: 60,
      exercises: [],
    });
    expect(result.reason).toBe("pace");
    expect(result.multiplier).toBeLessThan(1);
  });

  it("does not flag pace at or above the 12s/set floor", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 10,
      effectiveDurationSeconds: 120, // exactly 12s/set
      exercises: [],
    });
    expect(result.reason).not.toBe("pace");
  });

  it("floors pace severity to the minimum multiplier at or below 4s/set", () => {
    const at4s = computeWorkoutPlausibility({ totalSetCount: 15, effectiveDurationSeconds: 60, exercises: [] });
    const at1s = computeWorkoutPlausibility({ totalSetCount: 60, effectiveDurationSeconds: 60, exercises: [] });
    expect(at4s.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
    expect(at1s.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it("flags an improbable jump vs. stored peak (>40%)", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 2.0, storedPeakRatio: 1.3, apexThreshold: 5 }],
    });
    expect(result.reason).toBe("improbable_jump");
  });

  it("does not flag a jump under 40%", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 1.6, storedPeakRatio: 1.3, apexThreshold: 5 }],
    });
    expect(result.reason).not.toBe("improbable_jump");
  });

  it("does not flag improbable_jump when there is no stored peak yet (first-ever set)", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 3.0, storedPeakRatio: null, apexThreshold: 5 }],
    });
    expect(result.reason).not.toBe("improbable_jump");
  });

  it("flags a value exceeding 1.5x the apex threshold outright", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 8.0, storedPeakRatio: 1.3, apexThreshold: 5 }],
    });
    expect(result.reason).toBe("exceeds_ceiling");
    expect(result.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it("combines checks by taking the worst (lowest) resulting multiplier, not an average", () => {
    // pace is borderline-fine, but the value ceiling check is maximally severe
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 300, // 60s/set, fine
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 8.0, storedPeakRatio: 1.3, apexThreshold: 5 }],
    });
    expect(result.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it("returns multiplier 1 for a workout with zero sets (nothing to evaluate)", () => {
    expect(computeWorkoutPlausibility(noExercises)).toEqual({ multiplier: 1, reason: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @liftr/shared test plausibility.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `packages/shared/src/rank/plausibility.ts`:

```ts
/**
 * Per-workout plausibility gate (rank engine v2). Three independent, cheap heuristics — not a
 * fraud verdict, an honest heuristic in the same spirit as recovery.ts/decay.ts. Never used to
 * discard a workout or its sets, only to discount their XP/LP/peak contribution: computed once
 * per finished workout and applied by the caller (rankService.ts, syncService.ts).
 */

/** Below this many seconds/set, pace severity starts rising; at or below this floor, severity
 *  is maximal. */
const PACE_FINE_THRESHOLD_S = 12;
const PACE_MAX_SEVERITY_THRESHOLD_S = 4;

/** A same-session e1RM jump over this fraction above stored peak starts rising in severity. */
const JUMP_FINE_THRESHOLD = 0.4;
const JUMP_MAX_SEVERITY_THRESHOLD = 1.0;

/** A load-ratio value beyond this multiple of the Apex entry threshold is maximally severe
 *  outright (not a gradient — this is a hard sanity ceiling, not a soft pace/jump signal). */
const CEILING_MULTIPLE = 1.5;

/** Never fully zero a session's contribution — a token amount still credits, same "still earns
 *  *something*, just progressively less" precedent as xp.ts's REPEAT_XP_FLOOR_MULTIPLIER. */
export const PLAUSIBILITY_FLOOR = 0.05;

export interface PlausibilityExerciseInput {
  exerciseId: string;
  sessionBestRatio: number | null;
  storedPeakRatio: number | null;
  apexThreshold: number | null;
}

export interface PlausibilityInput {
  totalSetCount: number;
  effectiveDurationSeconds: number;
  exercises: PlausibilityExerciseInput[];
}

export type PlausibilityReason = "pace" | "improbable_jump" | "exceeds_ceiling";

export interface PlausibilityResult {
  multiplier: number;
  reason: PlausibilityReason | null;
}

/** Maps a "fine at `fineAt`, maximally severe at `maxAt`" linear ramp to a [0,1] severity. */
function severityRamp(value: number, fineAt: number, maxAt: number): number {
  if (value <= maxAt) return 1;
  if (value >= fineAt) return 0;
  return (fineAt - value) / (fineAt - maxAt);
}

function paceSeverity(input: PlausibilityInput): number {
  if (input.totalSetCount === 0 || input.effectiveDurationSeconds <= 0) return 0;
  const secondsPerSet = input.effectiveDurationSeconds / input.totalSetCount;
  return severityRamp(secondsPerSet, PACE_FINE_THRESHOLD_S, PACE_MAX_SEVERITY_THRESHOLD_S);
}

function jumpSeverity(input: PlausibilityInput): number {
  let worst = 0;
  for (const ex of input.exercises) {
    if (ex.sessionBestRatio == null || ex.storedPeakRatio == null || ex.storedPeakRatio <= 0) continue;
    const jumpFraction = (ex.sessionBestRatio - ex.storedPeakRatio) / ex.storedPeakRatio;
    if (jumpFraction <= 0) continue;
    const severity = severityRamp(-jumpFraction, -JUMP_FINE_THRESHOLD, -JUMP_MAX_SEVERITY_THRESHOLD);
    worst = Math.max(worst, severity);
  }
  return worst;
}

function ceilingSeverity(input: PlausibilityInput): number {
  for (const ex of input.exercises) {
    if (ex.sessionBestRatio == null || ex.apexThreshold == null || ex.apexThreshold <= 0) continue;
    if (ex.sessionBestRatio > ex.apexThreshold * CEILING_MULTIPLE) return 1;
  }
  return 0;
}

export function computeWorkoutPlausibility(input: PlausibilityInput): PlausibilityResult {
  const pace = paceSeverity(input);
  const jump = jumpSeverity(input);
  const ceiling = ceilingSeverity(input);

  const worst = Math.max(pace, jump, ceiling);
  if (worst === 0) return { multiplier: 1, reason: null };

  const reason: PlausibilityReason = ceiling === worst ? "exceeds_ceiling" : jump === worst ? "improbable_jump" : "pace";
  const multiplier = Math.max(PLAUSIBILITY_FLOOR, 1 - worst);
  return { multiplier, reason };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @liftr/shared test plausibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the package root**

Open `packages/shared/src/index.ts`, find where other `rank/*` modules are re-exported (e.g. `export * from "./rank/tiers.js";`, `export * from "./rank/decay.js";`), add the same pattern:

```ts
export * from "./rank/plausibility.js";
```

- [ ] **Step 6: Run full shared package test suite and typecheck**

Run: `pnpm --filter @liftr/shared test && pnpm --filter @liftr/shared run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/rank/plausibility.ts packages/shared/src/rank/plausibility.test.ts packages/shared/src/index.ts
git commit -m "feat(rank): add per-workout plausibility gate (pace, jump, ceiling checks)"
```

---

## Task 7: Wire recovery gain + plausibility into `rankService.ts`

**Files:**
- Modify: `packages/server/src/services/rankService.ts`
- Modify: `packages/server/src/repositories/rankRepository.ts`
- Test: `packages/server/src/services/rankService.test.ts`

**Interfaces:**
- Consumes: `applySessionRecoveryGain` (Task 5), `computeWorkoutPlausibility`,
  `PlausibilityResult` (Task 6), the 9-tier `ordinal`/`ratchetPeak` (Task 1).
- Produces: `recomputeRankForExercise(db, exerciseId, plausibilityMultiplier = 1)` — new optional
  3rd parameter, default `1` (fully plausible) so every existing call site
  (`recompute.ts`, `workoutService.ts`) that doesn't pass one keeps working unchanged. When
  `plausibilityMultiplier < 1`, peak advancement is blocked entirely below a floor and the
  recovery-gain amount is scaled down proportionally, per the spec's §3.3.

- [ ] **Step 1: Update existing tests to the 9-tier names, confirming current behavior is preserved**

Read `packages/server/src/services/rankService.test.ts` in full (281 lines per the research map).
Every test that constructs standards/rank rows with old tier strings (`"bronze"`, `"silver"`,
etc.) needs updating to the new equivalents. Since `TIER_DIVISION_COUNT` for most tests' relevant
tiers now has more than 3 divisions, also check any test asserting a specific `division` number
against the old fixed `3/2/1` — update to the tier's actual division count where the test's intent
was "the weakest division" or "the strongest division," not a literal `3` or `1`.

Concretely: replace `"bronze"` → `"apprentice"`, `"silver"` → `"athlete"`, `"gold"` → `"advanced"`,
`"platinum"` → `"expert"`, `"diamond"` → `"apex"` throughout the file (these are the 5 tiers that
kept the old anchor ratios exactly, per Task 2 — using them keeps the test's original numeric
assumptions valid). Do not change the test *assertions* about behavior (decay still floors,
peak still ratchets, rank-up still fires once per genuine change) — only the tier-name literals
and any division-count-dependent numbers.

- [ ] **Step 2: Run the updated test suite to confirm it's red only where expected**

Run: `pnpm --filter @liftr/server test rankService.test.ts`
Expected: the renamed-tier tests should now pass (or reveal genuine mismatches to fix); this step
is a checkpoint, not the final green state — new recovery-gain/plausibility tests come next.

- [ ] **Step 3: Write the new failing tests for recovery-gain and plausibility integration**

Append to `packages/server/src/services/rankService.test.ts` (inside the existing
`describe("recomputeRankForExercise", ...)` block, using the file's existing `logSet` helper):

```ts
it("returning after decay climbs gradually, not instantly, toward peak", async () => {
  const exerciseId = "back-squat";
  await logSet(exerciseId, 140, 5); // establishes a peak
  const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
  await logSet(exerciseId, 140, 5, longAgo); // re-log old to trigger decay math via daysSinceLastTrained path
  const decayed = await recomputeRankForExercise(db, exerciseId);
  expect(decayed).not.toBeNull();

  // now return: log a fresh, unremarkable set (same weight as before, not a new peak)
  const afterReturn = await recomputeRankForExercise(db, exerciseId);
  expect(afterReturn).not.toBeNull();
  // current should have moved toward peak but not necessarily reached it in one session
  const decayedRank = await findRankByExerciseId(db, exerciseId);
  expect(decayedRank).not.toBeNull();
});

it("a flagged (implausible) workout is blocked from advancing peak", async () => {
  const exerciseId = "back-squat";
  await logSet(exerciseId, 100, 5); // establish a normal peak
  await logSet(exerciseId, 400, 5); // a huge, implausible jump
  const result = await recomputeRankForExercise(db, exerciseId, 0.02); // simulated flagged multiplier, below the peak-eligibility floor
  expect(result).not.toBeNull();
  const rank = await findRankByExerciseId(db, exerciseId);
  // peak must not have advanced to reflect the 400kg set
  expect(rank!.peakE1rm).toBeLessThan(300);
});

it("a flagged workout still contributes a heavily-discounted recovery gain", async () => {
  const exerciseId = "back-squat";
  await logSet(exerciseId, 100, 5);
  const result = await recomputeRankForExercise(db, exerciseId, 0.5);
  expect(result).not.toBeNull(); // still recomputes, just discounted — never a no-op/error
});
```

(These tests are intentionally light on exact numeric assertions where the underlying pure
functions already have precise unit tests in Task 5/6 — this file's job is confirming the
*integration* wires the parameter through correctly, not re-proving the math.)

- [ ] **Step 4: Run tests to verify the new ones fail**

Run: `pnpm --filter @liftr/server test rankService.test.ts`
Expected: FAIL — `recomputeRankForExercise` doesn't yet accept a 3rd parameter, and current-rank
recovery still uses the old instant-decay-to-zero-days trick.

- [ ] **Step 5: Add a repository helper to read a stored peak's e1RM-equivalent for the plausibility jump check**

`rankRepository.ts` already has `findRankByExerciseId` returning the full row including
`peakE1rm`/`peakTier`/`peakDivision`. Confirm this by reading the file (no new repository
function needed — the existing read already has everything Task 8's plausibility-input assembly
needs per exercise). No code change in this file for this task; this step is a verification-only
checkpoint, not a code step.

- [ ] **Step 6: Update `recomputeRankForExercise`'s signature and integrate both mechanics**

In `packages/server/src/services/rankService.ts`, change the function signature (was line 78):

```ts
export async function recomputeRankForExercise(
  db: LiftrDb,
  exerciseId: string,
  plausibilityMultiplier = 1,
): Promise<RecomputeResult | null> {
```

Immediately after the existing peak-ratchet block (was lines 130-153, unchanged except the
`1 | 2 | 3` casts on `division`/`peakDivision` become plain `number` — remove those `as 1 | 2 | 3`
casts entirely now that `Division = number`), add a peak-eligibility floor before calling
`ratchetPeak`:

```ts
// Plausibility gate (rank engine v2): a badly-flagged session's sets are excluded from peak
// advancement entirely, not just discounted — the peak ratchet is the one thing in this system
// meant to be un-fakeable. PEAK_ELIGIBILITY_FLOOR intentionally matches the plausibility module's
// own PLAUSIBILITY_FLOOR-adjacent low end; a session has to be quite badly flagged to lose peak
// eligibility outright, since most flagged sessions should still discount rather than block.
const PEAK_ELIGIBILITY_FLOOR = 0.3;
const peakEligible = plausibilityMultiplier >= PEAK_ELIGIBILITY_FLOOR;

const peak = peakEligible
  ? ratchetPeak(
      { tier: rank.tier, division: rank.division, lp: rank.lp, e1rm: bestE1rm },
      bestSet.loggedAt.getTime(),
      storedPeak,
    )
  : (storedPeak ?? { tier: rank.tier, division: rank.division, lp: rank.lp, e1rm: bestE1rm, achievedAt: bestSet.loggedAt.getTime() });
```

(The `storedPeak ?? {...}` fallback on the ineligible branch handles the "brand-new exercise,
first-ever recompute, and that first session happens to be flagged" edge case — there's no
existing peak to fall back to, so the flagged value still seeds peak once, since there's nothing
more honest to show; this only ever under-credits, never over-credits, a flagged first session.)

Replace the current-rank block (was lines 163-172, the "current-rank decay" comment and the two
lines computing `daysSinceLastTrained` and calling `computeCurrentBand`) with:

```ts
// Current-rank recovery (rank engine v2). Two paths, applied in sequence:
//  1. Passive decay (unchanged pure day-based curve) always runs first, using the same
//     daysSinceLastTrained this function already computes below.
//  2. If this recompute was triggered by a session logged *today* (daysSinceLastTrained === 0 —
//     true for every call from the finish-workout path, since it only touches exercises trained
//     in that same session), a buffed recovery gain is applied on top of whatever was already
//     climbed in prior sessions (the *previously stored* current band), not on top of the
//     freshly-passively-decayed value — discounted by this session's plausibility multiplier.
// `pnpm recompute`'s maintenance/rebuild path also calls this function and will also apply
// path 2 whenever it happens to run on the same day an exercise was trained — an accepted,
// precedented simplification (the peak ratchet already has the same "not fully re-derivable
// from a single from-scratch pass" property, see spec §2.2).
const lastTrainedAtMs = loggedSets.reduce((max, s) => Math.max(max, s.loggedAt.getTime()), 0);
const daysSinceLastTrained = Math.floor((Date.now() - lastTrainedAtMs) / (24 * 60 * 60 * 1000));

const previousCurrentBand = previousRank
  ? { tier: previousRank.tier, division: previousRank.division, lp: previousRank.lp }
  : null;
const passivelyDecayedBand = previousCurrentBand
  ? computeCurrentBand(peak, daysSinceLastTrained)
  : peak;

let currentBand: { tier: typeof peak.tier; division: number; lp: number };
if (previousCurrentBand && daysSinceLastTrained === 0) {
  const rawGainBand = applySessionRecoveryGain(peak, previousCurrentBand);
  const prevPos = ordinal(previousCurrentBand.tier, previousCurrentBand.division) * 100 + previousCurrentBand.lp;
  const rawGainPos = ordinal(rawGainBand.tier, rawGainBand.division) * 100 + rawGainBand.lp;
  const scaledPos = prevPos + (rawGainPos - prevPos) * plausibilityMultiplier;
  currentBand = ordinalToBand(scaledPos / 100);
} else {
  currentBand = passivelyDecayedBand;
}
```

This replaces the original `lastTrainedAtMs`/`daysSinceLastTrained`/`currentBand` block in full
(was lines 163-172) — `loggedSets` is already in scope from earlier in the function (the same
array the best-set search loop uses). Add `applySessionRecoveryGain` and `ordinalToBand` to the
existing `@liftr/shared` import list at the top of the file (alongside `estimateE1rm,
resolveRank, nextLoadTarget, computeCurrentBand, ...` — keep `computeCurrentBand` in that list,
it's still used above for the passive-decay path).

- [ ] **Step 7: Run tests, fix any remaining failures, then verify green**

Run: `pnpm --filter @liftr/server test rankService.test.ts`
Expected: PASS — all renamed-tier tests, all pre-existing decay/peak tests, and the 3 new tests
from Step 3. If a pre-existing test's exact numeric expectation no longer holds because recovery
now climbs gradually instead of snapping instantly (the decay-reversal test, `rankService.test.ts:
205-222` per the research map, explicitly asserted "instant snap back" as its whole point), update
that specific test's assertion to check gradual movement toward peak instead of exact equality —
this is an intentional, spec'd behavior change, not a regression, so the test's *intent* changes
from "snaps instantly" to "moves toward peak, faster than normal, not instantly."

- [ ] **Step 8: Typecheck the whole server package**

Run: `pnpm --filter @liftr/server run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/services/rankService.ts packages/server/src/services/rankService.test.ts
git commit -m "feat(rank): integrate buffed recovery gain and plausibility-gated peak eligibility"
```

---

## Task 8: Compute and persist plausibility at finish-workout time

**Files:**
- Modify: `packages/server/src/services/syncService.ts`
- Modify: `packages/server/src/repositories/workoutRepository.ts`
- Test: `packages/server/src/services/syncService.test.ts`

**Interfaces:**
- Consumes: `computeWorkoutPlausibility`, `PlausibilityInput` (Task 6),
  `recomputeRankForExercise(db, exerciseId, plausibilityMultiplier)` (Task 7),
  `findWorkoutWithExercisesAndSets` (already exists, `workoutRepository.ts`).
- Produces: `RankVerdict` gains an optional `plausibilityReason: "pace" | "improbable_jump" |
  "exceeds_ceiling" | null` field; `patchWorkout` accepts an optional `plausibilityMultiplier`
  patch field.

- [ ] **Step 1: Write the failing test**

Read `packages/server/src/services/syncService.test.ts` in full first to match its existing style
(it already has 2 plausibility-adjacent tests for the per-set ceiling check, per the research
map — this task adds workout-level ones). Append:

```ts
it("flags a workout with an unrealistic sets-per-minute pace and discounts its rank verdicts", async () => {
  const workoutId = await startWorkout(/* ...existing test helper... */);
  // log ~20 sets across the workout within a ~60-second window (use the test's existing
  // logSet-equivalent helper, stamping loggedAt close together)
  // ...
  const result = await applyFinishWorkout(db, {
    clientId: "finish-1",
    type: "finish_workout",
    payload: { workoutId, endedAt: /* startedAt + 60s */ new Date(), pausedSeconds: 0 },
  });
  expect(result.status).toBe("created");
  expect(result.ranks?.some((r) => r.plausibilityReason === "pace")).toBe(true);
});

it("does not flag a normally-paced workout", async () => {
  const workoutId = await startWorkout(/* ... */);
  // log a handful of sets spread across a realistic duration
  const result = await applyFinishWorkout(db, {
    clientId: "finish-2",
    type: "finish_workout",
    payload: { workoutId, endedAt: /* startedAt + 30 minutes */ new Date(), pausedSeconds: 0 },
  });
  expect(result.ranks?.every((r) => r.plausibilityReason == null)).toBe(true);
});
```

(Fill in the exact test-setup calls by matching whatever helper functions this test file already
uses for `start_workout`/`log_set` sync items earlier in the file — read those existing tests
first and reuse their exact helper signatures rather than inventing new ones.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @liftr/server test syncService.test.ts`
Expected: FAIL — `RankVerdict` has no `plausibilityReason` field yet, and `applyFinishWorkout`
doesn't compute plausibility.

- [ ] **Step 3: Add a `patchWorkout` field and a plausibility-input assembly helper**

In `packages/server/src/repositories/workoutRepository.ts`, extend `patchWorkout`'s patch type
(was line 59):

```ts
export function patchWorkout(
  db: LiftrDb,
  id: string,
  patch: { endedAt?: Date; pausedSeconds?: number; notes?: string; plausibilityMultiplier?: number },
) {
  return db.update(workouts).set(patch).where(eq(workouts.id, id));
}
```

- [ ] **Step 4: Wire plausibility computation into `applyFinishWorkout`**

In `packages/server/src/services/syncService.ts`, add imports:

```ts
import { computeWorkoutPlausibility, type PlausibilityInput } from "@liftr/shared";
import { findWorkoutWithExercisesAndSets } from "../repositories/workoutRepository.js";
import { findRankByExerciseId } from "../repositories/rankRepository.js";
import { findStandardsForExercise } from "../repositories/rankRepository.js";
```

Extend `RankVerdict` (was lines 64-72):

```ts
export interface RankVerdict {
  exerciseId: string;
  rankedUp: boolean;
  newPr: { kind: string; value: number } | null;
  tier: string;
  division: number;
  lp: number;
  prevLp: number;
  plausibilityReason: "pace" | "improbable_jump" | "exceeds_ceiling" | null;
}
```

Rewrite `applyFinishWorkout` (was lines 137-160):

```ts
async function applyFinishWorkout(db: LiftrDb, item: FinishWorkoutItem): Promise<SyncResult> {
  const existing = await findWorkoutById(db, item.payload.workoutId);
  if (existing?.endedAt) return { clientId: item.clientId, status: "already_synced", serverId: existing.id };

  await patchWorkout(db, item.payload.workoutId, { endedAt: item.payload.endedAt, pausedSeconds: item.payload.pausedSeconds });

  const dateStr = item.payload.endedAt.toISOString().slice(0, 10);
  await creditStreak(db, dateStr, "workout");

  // Plausibility gate (rank engine v2): computed once per finished workout, before the
  // per-exercise recompute loop, from the full set of sets just logged in this session. The
  // jump/ceiling checks need a load-ratio value in the same units as `apexThreshold`/
  // `storedPeakRatio` (both load-ratio = e1RM/bodyweight) — using raw weight-kg directly would
  // compare the wrong units, so this divides by current bodyweight via the same
  // `getCurrentBodyweightKg` rankService.ts itself uses, without duplicating its full per-set
  // e1RM loop (this is deliberately a coarse sanity gate, not a precise recompute).
  const workoutWithSets = await findWorkoutWithExercisesAndSets(db, item.payload.workoutId);
  const touched = await findTouchedExerciseIds(db, item.payload.workoutId);

  let plausibility = { multiplier: 1, reason: null as "pace" | "improbable_jump" | "exceeds_ceiling" | null };
  if (workoutWithSets) {
    const allSets = workoutWithSets.workoutExercises.flatMap((we) => we.sets);
    const effectiveDurationSeconds =
      (item.payload.endedAt.getTime() - workoutWithSets.startedAt.getTime()) / 1000 - item.payload.pausedSeconds;
    const bodyweightKg = await getCurrentBodyweightKg(db);

    const exerciseInputs: PlausibilityInput["exercises"] = [];
    for (const { exerciseId } of touched) {
      const rank = await findRankByExerciseId(db, exerciseId);
      const exerciseSets = workoutWithSets.workoutExercises
        .filter((we) => we.exerciseId === exerciseId)
        .flatMap((we) => we.sets)
        .filter((s) => !s.isWarmup);
      const sessionBestWeight = exerciseSets.reduce((max, s) => Math.max(max, s.weightKg ?? 0), 0);
      const sessionBestRatio = sessionBestWeight > 0 ? sessionBestWeight / bodyweightKg : null;
      const standards = await findStandardsForExercise(db, exerciseId, "male");
      const apexThreshold = standards.find((s) => s.tier === "apex")?.threshold ?? null;
      exerciseInputs.push({
        exerciseId,
        sessionBestRatio,
        storedPeakRatio: rank?.peakE1rm ?? null,
        apexThreshold,
      });
    }

    plausibility = computeWorkoutPlausibility({
      totalSetCount: allSets.filter((s) => !s.isWarmup).length,
      effectiveDurationSeconds,
      exercises: exerciseInputs,
    });
    await patchWorkout(db, item.payload.workoutId, { plausibilityMultiplier: plausibility.multiplier });
  }

  const ranks: RankVerdict[] = [];
  for (const { exerciseId } of touched) {
    const result = await recomputeRankForExercise(db, exerciseId, plausibility.multiplier);
    if (result) ranks.push({ exerciseId, ...result, plausibilityReason: plausibility.reason });
  }

  return { clientId: item.clientId, status: "created", serverId: item.payload.workoutId, ranks };
}
```

Add `getCurrentBodyweightKg` to this file's existing `import { recomputeRankForExercise } from
"./rankService.js"` line (it's already exported from `rankService.ts`, confirmed in the research
map) alongside the other new repository imports listed at the start of this step.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @liftr/server test syncService.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full server test suite and typecheck**

Run: `pnpm --filter @liftr/server test && pnpm --filter @liftr/server run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/services/syncService.ts packages/server/src/repositories/workoutRepository.ts packages/server/src/services/syncService.test.ts
git commit -m "feat(rank): compute and persist per-workout plausibility at finish time"
```

---

## Task 9: XP discounting for flagged workouts

**Files:**
- Modify: `packages/shared/src/math/xp.ts`
- Modify: `packages/shared/src/math/xp.test.ts`
- Modify: `packages/server/src/repositories/xpRepository.ts`
- Modify: `packages/server/src/services/xpService.ts`
- Modify: `packages/server/src/services/historyService.ts`

**Interfaces:**
- Produces: `computeSetXp(weightKg, reps, tier, repeatOccurrence, plausibilityMultiplier = 1)` —
  new optional 5th parameter, defaults to 1 (no existing call site needs updating unless it wants
  the discount). `XpSetInput` gains an optional `plausibilityMultiplier?: number` field, applied
  by `computeTotalXp`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/src/math/xp.test.ts`:

```ts
it("discounts XP by the plausibility multiplier when given one", () => {
  const full = computeSetXp(100, 5, "athlete", 1, 1);
  const discounted = computeSetXp(100, 5, "athlete", 1, 0.5);
  expect(discounted).toBeCloseTo(full * 0.5, 6);
});

it("defaults the plausibility multiplier to 1 (no discount) when omitted", () => {
  expect(computeSetXp(100, 5, "athlete", 1)).toBeCloseTo(computeSetXp(100, 5, "athlete", 1, 1), 6);
});

it("computeTotalXp applies each set's own plausibilityMultiplier field", () => {
  const total = computeTotalXp([
    { exerciseId: "e", weightKg: 100, reps: 5, tier: "athlete", loggedAt: 1, plausibilityMultiplier: 0.5 },
  ]);
  const undiscounted = computeTotalXp([
    { exerciseId: "e", weightKg: 100, reps: 5, tier: "athlete", loggedAt: 1 },
  ]);
  expect(total).toBeCloseTo(undiscounted * 0.5, 6);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @liftr/shared test xp.test.ts`
Expected: FAIL — `computeSetXp` doesn't accept a 5th parameter yet. (Also expect this file's
pre-existing tier-multiplier tests to be red until the tier literal used in them, if any, is
updated to a 9-tier name — check and fix if needed, same as Task 7's approach.)

- [ ] **Step 3: Implement**

In `packages/shared/src/math/xp.ts`, update `TIER_XP_MULTIPLIER` to all 9 tiers (values chosen to
keep the same overall shape — a modest, increasing multiplier from entry to top tier — spread
across 9 steps instead of 5):

```ts
export const TIER_XP_MULTIPLIER: Record<Tier, number> = {
  initiate: 0.9,
  apprentice: 1,
  trainee: 1.05,
  athlete: 1.15,
  lifter: 1.2,
  advanced: 1.3,
  elite: 1.4,
  expert: 1.5,
  apex: 1.75,
};
```

Update `computeSetXp` and `XpSetInput`/`computeTotalXp`:

```ts
export function computeSetXp(
  weightKg: number | null,
  reps: number,
  tier: Tier | null,
  repeatOccurrence = 1,
  plausibilityMultiplier = 1,
): number {
  const load = weightKg ?? BODYWEIGHT_NOMINAL_LOAD_KG;
  const multiplier = tier ? TIER_XP_MULTIPLIER[tier] : 1;
  return load * reps * multiplier * repeatSetMultiplier(repeatOccurrence) * plausibilityMultiplier;
}

export interface XpSetInput {
  exerciseId: string;
  weightKg: number | null;
  reps: number;
  tier: Tier | null;
  loggedAt: number;
  /** Defaults to 1 (no discount) when omitted — most callers don't have a flagged workout. */
  plausibilityMultiplier?: number;
}

export function computeTotalXp(sets: XpSetInput[]): number {
  const sorted = [...sets].sort((a, b) => a.loggedAt - b.loggedAt);
  const occurrenceByKey = new Map<string, number>();
  let total = 0;
  for (const s of sorted) {
    const key = `${s.exerciseId}|${s.weightKg ?? "bw"}|${s.reps}`;
    const occurrence = (occurrenceByKey.get(key) ?? 0) + 1;
    occurrenceByKey.set(key, occurrence);
    total += computeSetXp(s.weightKg, s.reps, s.tier, occurrence, s.plausibilityMultiplier ?? 1);
  }
  return total;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @liftr/shared test xp.test.ts`
Expected: PASS.

- [ ] **Step 5: Join `workouts.plausibilityMultiplier` in `findAllSetsForXp`**

In `packages/server/src/repositories/xpRepository.ts`:

```ts
import { sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { eq } from "drizzle-orm";

export function findAllSetsForXp(db: LiftrDb) {
  return db
    .select({
      weightKg: sets.weightKg,
      reps: sets.reps,
      isWarmup: sets.isWarmup,
      loggedAt: sets.loggedAt,
      exerciseId: workoutExercises.exerciseId,
      plausibilityMultiplier: workouts.plausibilityMultiplier,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id));
}
```

- [ ] **Step 6: Pass the multiplier through in `xpService.ts`**

In `packages/server/src/services/xpService.ts`, update the `.map(...)` inside `getXpSummary`:

```ts
  const totalXp = Math.round(
    computeTotalXp(
      rows
        .filter((s) => !s.isWarmup)
        .map((s) => ({
          exerciseId: s.exerciseId,
          weightKg: s.weightKg,
          reps: s.reps,
          tier: tierByExercise.get(s.exerciseId) ?? null,
          loggedAt: s.loggedAt.getTime(),
          plausibilityMultiplier: s.plausibilityMultiplier ?? 1,
        })),
    ),
  );
```

- [ ] **Step 7: Pass the multiplier through in `historyService.ts`**

In `packages/server/src/services/historyService.ts`, update the per-workout XP reduce inside
`getHistoryPage` (was line 46-48):

```ts
      const xp = allSets
        .filter((s) => !s.isWarmup)
        .reduce(
          (sum, s) => sum + computeSetXp(s.weightKg, s.reps, tierByExercise.get(s.exerciseId) ?? null, 1, w.plausibilityMultiplier ?? 1),
          0,
        );
```

(`w` here is the finished-workout row from `findFinishedWorkoutsPage`, which already includes
`plausibilityMultiplier` automatically since it's a relational `db.query.workouts.findMany` full-
row read — no repository change needed for this specific read, confirmed in the research phase.)

- [ ] **Step 8: Run the full server test suite and typecheck**

Run: `pnpm --filter @liftr/server test && pnpm --filter @liftr/server run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/math/xp.ts packages/shared/src/math/xp.test.ts packages/server/src/repositories/xpRepository.ts packages/server/src/services/xpService.ts packages/server/src/services/historyService.ts
git commit -m "feat(rank): discount XP for flagged workouts, extend tier XP multipliers to 9 tiers"
```

---

## Task 10: Client UI — recovery caption and plausibility note

**Files:**
- Modify: `packages/client/src/components/rank/RankProgress.vue`
- Modify: `packages/client/src/pages/WorkoutPage.vue` (or wherever the finish-workout sync result
  is consumed — confirm the exact call site by reading how `ranks` from `SyncResult` is currently
  handled client-side before editing)

**Interfaces:**
- Consumes: `RankVerdict.plausibilityReason` (Task 8) from the finish-workout sync response.
- No new exports — this is leaf UI wiring.

- [ ] **Step 1: Add an optional recovery-bonus display to `RankProgress.vue`**

The existing `decayCaption` computed property (was `RankProgress.vue:41-47`) already shows
"Bestleistung: X" when current is below peak. Add a sibling prop for an optional recovery-gain
note, passed by the caller when a session just applied one:

```ts
const props = withDefaults(
  defineProps<{
    // ...existing props unchanged...
    /** Rank engine v2: set by the caller right after a workout that applied a buffed recovery
     *  gain to this exercise (e.g. "+18 LP"). Purely a one-time celebratory caption, not
     *  persisted — the caller (RanksPage.vue or the finish-sequence flow) is responsible for
     *  only passing this immediately after the relevant recompute, not on every render. */
    recoveryGainLabel?: string | null;
    /** Rank engine v2: a short, honest note when this exercise's rank/XP gain from the most
     *  recent session was reduced by the plausibility gate. Never shows exact thresholds. */
    plausibilityNote?: string | null;
  }>(),
  { /* ...existing defaults..., */ recoveryGainLabel: null, plausibilityNote: null },
);
```

Add to the template, right after the existing `v-if="decayCaption"` line:

```html
<div v-if="recoveryGainLabel" class="rp-recovery">{{ recoveryGainLabel }}</div>
<div v-if="plausibilityNote" class="rp-plausibility">{{ plausibilityNote }}</div>
```

Add matching styles near the existing `.rp-decay` rule:

```css
.rp-recovery {
  font-size: 11px;
  color: var(--blue-hi, var(--dim));
  font-weight: 600;
}
.rp-plausibility {
  font-size: 11px;
  color: var(--dim);
  opacity: 0.75;
  font-style: italic;
}
```

- [ ] **Step 2: Wire the plausibility note from the finish-workout response**

Read the client file that currently consumes `SyncResult.ranks` after a finish-workout sync
(search for `.ranks` on the sync result type client-side — likely `WorkoutPage.vue` or a
`useWorkoutFinish` composable, per the W8 notes referencing `useWorkoutFinish.ts`). Find where
each `RankVerdict` is turned into UI state, and add a mapping from `plausibilityReason` to a
German-language note string:

```ts
const PLAUSIBILITY_NOTE_DE: Record<string, string> = {
  pace: "Diese Session wirkte ungewöhnlich schnell — Rang- und XP-Gewinn wurden reduziert.",
  improbable_jump: "Dieser Sprung wirkte ungewöhnlich groß — Rang- und XP-Gewinn wurden reduziert.",
  exceeds_ceiling: "Dieser Wert wirkte unrealistisch — Rang- und XP-Gewinn wurden reduziert.",
};
```

Pass `PLAUSIBILITY_NOTE_DE[verdict.plausibilityReason] ?? null` into the relevant `RankProgress`
call site's new `plausibilityNote` prop (the finish-sequence beat and/or `RanksPage.vue`, matching
wherever `newPr`/`rankedUp` are already surfaced from the same verdict object today — read that
existing call site's current props before adding the new one, to match its existing pattern
rather than inventing a new one).

- [ ] **Step 3: Typecheck and manual mobile click-test**

Run: `pnpm --filter @liftr/client run typecheck`
Expected: PASS.

Per this project's mobile-viewport-check convention: start the dev server (`pnpm dev`), open the
app at a ~390×844 viewport, log a workout with a rank-up, and confirm the existing "Bestleistung"
caption still renders correctly (regression check — the new optional props default to `null` and
render nothing when absent, so normal, unflagged sessions must look identical to before this
task).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/rank/RankProgress.vue packages/client/src/pages/WorkoutPage.vue
git commit -m "feat(rank): surface recovery-gain and plausibility notes in the rank UI"
```

(Adjust the second file path in the commit if Step 2 found the actual consuming file to be a
composable rather than `WorkoutPage.vue` directly — stage whatever file was actually edited.)

---

## Task 11: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full workspace test suite**

Run: `pnpm test`
Expected: every test file across every package passes, including all files touched in Tasks 1-10.

- [ ] **Step 2: Full workspace typecheck**

Run: `pnpm typecheck`
Expected: clean across `@liftr/shared`, `@liftr/db`, `@liftr/server`, `@liftr/client`,
`@liftr/ingest`.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Grep guards**

Run: `grep -rn "\"bronze\"\|\"silver\"\|\"platinum\"\|\"diamond\"" packages/shared/src packages/server/src packages/client/src --include="*.ts" --include="*.vue"`
Expected: no hits outside of comments/docs referencing the *old* system for historical context
(e.g. this plan file itself, or code comments explaining the migration) — every functional
reference to a tier name uses one of the 9 new strings. `"gold"` is deliberately excluded from
this grep since it's a common English word likely to appear in unrelated contexts; spot-check it
separately if needed.

Run: `grep -rn "DIVISIONS\b" packages/shared/src packages/server/src packages/client/src --include="*.ts"`
Expected: no hits — the old fixed-length `DIVISIONS` array export was fully removed in Task 1 and
never re-introduced.

- [ ] **Step 5: Migration review**

Run: `cat packages/db/drizzle/0009_*.sql`
Expected: contains only the single `plausibility_multiplier` column addition (per Task 3, Step 3's
verification — re-confirm here as part of final sign-off).

- [ ] **Step 6: Mobile click-test walkthrough**

Per this project's binding convention (mobile is primary, desktop is the adapted view): start
`pnpm dev`, open the client at ~390×844, and walk through:
1. `RanksPage.vue` — tier badges render for all visible exercises with correct new names/colors,
   division roman numerals display correctly for tiers with more than 3 divisions (e.g. an
   Initiate-tier exercise shows up to VI).
2. Log a set on a never-before-ranked exercise, finish the workout — confirm a normal rank-up
   celebration still fires with no plausibility note (baseline regression check).
3. `OverviewPage.vue`'s Gesamtrang/Overall Rank tile still renders a plausible tier name (spot-
   check `computeOverallRank`/`computeOverallPeak` from `aggregate.ts` — these were **not**
   modified in this plan, since `aggregate.ts` already only depends on `ordinal`/`TIERS` generically,
   confirmed working via Task 1's tests; this is a final visual sanity check only, not new code).

- [ ] **Step 7: Update `liftr-audit.md`**

Add a short §7.4 entry (following the existing §7.1-7.3 pattern) documenting the rank engine v2
work as shipped, with commit references, mirroring how §7.3 documents R1-R3 today. This keeps the
project's single whole-project reference document current, per its own established convention.
