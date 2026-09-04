# Rank Engine v2 — 9-tier ladder, buffed climb-back, plausibility gate

**STATUS: SHIPPED**, implemented per `docs/superpowers/plans/2026-08-31-rank-engine-v2.md` (itself STATUS: SHIPPED). **Correction (2026-09-04):** §3.2's plausibility threshold numbers below are stale — they describe the values as first specified, not as shipped. The shipped `packages/shared/src/rank/plausibility.ts` was later tightened by an "engagement-audit-v3" pass: pace fine/max is **15s/6s** per set (not 12s/4s), jump max-severity is **75%** (not 100%), and the ceiling multiple is **1.3x** (not 1.5x). The mechanic and worst-of combination rule described below are still accurate; only these three numbers are superseded. (Evidence: `audit/verify/agent-5.md`.)

**Status:** approved design, ready for implementation planning.
**Supersedes:** the 5-tier Bronze-Diamond system shipped in R1-R3 (`liftr-audit.md` §7.3).

## 0. Why

Three requests, decided together because they touch the same code paths:

1. **9 tiers instead of 5**, with more divisions in the lower tiers than the higher ones, so a
   new or returning lifter gets the "rank up" feeling more often early on, and the top tier is a
   single real milestone rather than another grind.
2. **No instant snap-back** after rank decay. Coming back from a break should feel like a
   genuine, buffed climb — faster than earning it fresh, but not free — with the buff strongest
   right after you return and tapering to nothing as you approach peak again.
3. **A plausibility gate** on finished workouts. A workout that's structurally impossible (e.g.
   20 sets logged in one minute) shouldn't be thrown out, but its XP and rank contribution
   should be drastically reduced, and the user should see an honest, specific note about why.

## 1. The 9-tier ladder

Full replacement of `TIERS` in `packages/shared/src/rank/tiers.ts`, framed around a believable
fitness journey rather than "power level" names — explicitly avoiding names that read as combat
or domination, and avoiding implying the top tier requires superhuman ability:

| # | Tier | Divisions | Rough meaning |
|---|---|---|---|
| 1 | Initiate | 6 | Just starting out, learning exercises and gym habits |
| 2 | Apprentice | 5 | Some experience, building consistency |
| 3 | Trainee | 5 | Regularly training, noticeable progress |
| 4 | Athlete | 4 | Decent general fitness, not necessarily a dedicated gym-goer |
| 5 | Lifter | 4 | Above average — "yeah, they definitely go to the gym" |
| 6 | Advanced | 3 | Clearly experienced, good strength and technique |
| 7 | Elite | 3 | Very strong relative to the general population |
| 8 | Expert | 2 | Extremely skilled/experienced, not "mythical" |
| 9 | Apex | 1 | Pinnacle — extraordinary but still realistic human achievement |

33 total bands, up from today's 15. Apex having exactly 1 division means there's no internal
climb once you reach it — you're Apex or you're not, matching "a single real milestone."

**Division numbering convention preserved:** within a tier of N divisions, division values run
`N` (weakest, entry) down to `1` (strongest, closest to promotion) — same "higher tier number
inside a band = weaker" convention as today's `III → II → I`, just generalized to N divisions
instead of always 3. Initiate's divisions display as VI→I, Expert's as II→I, Apex has no
division suffix shown (a single band needs no roman numeral).

### 1.1 Structural changes this requires

`DIVISIONS` stops being one fixed `[3, 2, 1]` array shared by every tier. Replace with:

```ts
export const TIER_DIVISION_COUNT: Record<Tier, number> = {
  initiate: 6, apprentice: 5, trainee: 5, athlete: 4, lifter: 4,
  advanced: 3, elite: 3, expert: 2, apex: 1,
};
```

`ordinal(tier, division)` generalizes from `TIERS.indexOf(tier) * DIVISIONS.length + ...` to a
cumulative-offset scheme:

```ts
function cumulativeDivisionsBefore(tier: Tier): number {
  return TIERS.slice(0, TIERS.indexOf(tier)).reduce((sum, t) => sum + TIER_DIVISION_COUNT[t], 0);
}
export function ordinal(tier: Tier, division: number): number {
  return cumulativeDivisionsBefore(tier) + (TIER_DIVISION_COUNT[tier] - division);
}
```

This is a strict generalization — plugging in the old constant-3-per-tier table reproduces
today's `ordinal` exactly, so existing callers that don't care about tier count keep working.

**New: `ordinalToBand(ordinal): { tier, division }`**, the inverse lookup. Today this inversion
is hand-duplicated in both `decay.ts`'s `positionToBand` and `aggregate.ts`'s `positionToBand`
(identical code, `Math.floor(bandIndex / DIVISIONS.length)` etc.) — with variable per-tier
division counts that fixed-length math no longer works, so this is the point to centralize the
inversion once in `tiers.ts` and have both callers use it instead of each re-deriving it. `Division`
becomes a plain `number` (validated at 1..N per tier by callers, not a `1|2|3` literal union).

`MAX_ORDINAL` becomes `sum(TIER_DIVISION_COUNT) - 1` (= 32), computed once from the table.

### 1.2 Standards data (threshold recalibration)

`defaultStandards.ts`'s `expand()` currently divides the span between a tier's entry ratio and
the next tier's entry ratio into exactly 3 evenly-spaced thresholds. It generalizes to divide
into `TIER_DIVISION_COUNT[tier]` thresholds instead — no change in spirit, just parameterized.

The real content change is the **entry-ratio table itself**: today's 5 anchor points (Bronze
through Diamond) become 9. Rather than inventing new numbers from nothing, the new 9-point curve
is built by inserting one interpolated tier between each pair of adjacent old tiers, and
extrapolating one tier beyond old Diamond:

`Initiate(new) → Apprentice(=old Bronze) → Trainee(new) → Athlete(=old Silver) → Lifter(new) → Advanced(=old Gold) → Elite(new) → Expert(=old Platinum) → Apex(new, beyond old Platinum)`

- The 4 "new" middle tiers (Trainee, Lifter, Elite) each sit at the **geometric mean** of their
  two neighbors' ratios (geometric, not linear, because the existing 5-point curve is itself
  roughly geometric — each old tier is a roughly-constant multiplier on the previous one).
- **Initiate** and **Apex** are the two ends, each extrapolated one step beyond their nearest
  anchor using that anchor's own ratio to its newly-interpolated neighbor — the same rule applied
  in both directions, so the curve stays self-consistent rather than treating the two ends
  differently: `Initiate = Apprentice × (Apprentice / Trainee)`, `Apex = Expert × (Expert / Elite)`.

Example for `back-squat` (old: bronze 0.75, silver 1.25, gold 1.75, platinum 2.25, diamond 2.75):

| Tier | Ratio | How derived |
|---|---|---|
| Initiate | 0.58 | `0.75 × (0.75 / 0.97)` — one step below Apprentice, at Apprentice→Trainee's own ratio |
| Apprentice | 0.75 | = old Bronze |
| Trainee | 0.97 | geometric mean of 0.75, 1.25 |
| Athlete | 1.25 | = old Silver |
| Lifter | 1.48 | geometric mean of 1.25, 1.75 |
| Advanced | 1.75 | = old Gold |
| Elite | 1.99 | geometric mean of 1.75, 2.25 |
| Expert | 2.25 | = old Platinum |
| Apex | 2.54 | `2.25 × (2.25 / 1.99)` — one step above Expert, at Elite→Expert's own ratio |

Note this deliberately does **not** reuse old Diamond's exact number (2.75) for Apex — Apex is a
new single-division tier extrapolated from the new 9-point curve's own internal ratios, not a
renamed copy of the old top tier. The curve stays internally consistent rather than being forced
through a historical anchor that no longer has a structural role.

This methodology (and the exact resulting numbers per exercise) is implemented and unit-tested
directly in code rather than hand-copied into this doc for all 9 lifts — see Phase 2 of the
implementation plan. Same treatment applies to `REP_STANDARDS` (pushup/pullup/chinup/dip), each
of which today only has one division's worth of thresholds (division 3) per tier — those get
the same 9-point interpolation, still one threshold per tier (rep-based standards don't
currently model sub-divisions within a tier at all; that's unchanged by this redesign).

Per this project's own established precedent (`OPL_POPULATION_SHIFT` is explicitly documented
as "a single tunable constant, recalibrate here"), this interpolation is a starting point, not
a claim of authoritative sports-science calibration — same honesty standard as the rest of the
standards data.

### 1.3 Display / branding updates

- `packages/client/src/lib/tierIcons.ts`: 9 entries in `TIER_BADGE_PATH` (4 new simple
  silhouette glyphs, consistent with the existing "distinct silhouette, not pixel-perfect icon"
  convention), 9 in `TIER_LABEL_DE` (German display labels for the new English names — the app's
  UI language stays German-only per existing project convention), and `DIVISION_LABEL` extends
  from `{3,2,1}` to roman numerals I through VI.
- `packages/client/src/styles/tokens.css`: 9 tier color palettes (`--initiate-1/2/3/-t` through
  `--apex-1/2/3/-t`), 9 `.t-<slug>` classes. This redesign also fixes the existing `.t-plat` vs.
  `t-platinum` class-name mismatch bug (flagged in the current tokens.css comments) by making
  every new class name match its `Tier` string exactly — no repeat of that bug for the new tiers.
- `packages/client/src/components/rank/RankDistributionDonut.vue`'s own hardcoded `TIER_ORDER`
  and `TIER_COLOR_VAR` maps extend to 9 entries.
- Four DB schema enum columns (`standards.tier`, `ranks.tier`, `ranks.peakTier`,
  `rank_events.tier`) are hand-spelled tier lists in `packages/db/src/schema.ts`, not derived
  from `TIERS` — each updated by hand to the new 9-value list, migration generated and reviewed.

## 2. Buffed climb-back (replaces instant snap-back)

Today: `computeCurrentBand(peak, daysSinceLastTrained)` is a pure function of days since the
exercise was last trained, and logging a new set resets that to 0 — which, fed back through the
same pure function, always yields exactly `peak` (instant). The downward decay curve (grace
period, then linear decay to the floor) is **unchanged by this redesign** — only what happens
when you resume training changes.

### 2.1 New mechanic

A new pure function, `applySessionRecoveryGain`, in `packages/shared/src/rank/decay.ts`:

```ts
export const RECOVERY_BASE_FRACTION_PER_SESSION = 0.125; // 1/8 of the tier's max intra-tier span
export const RECOVERY_MAX_BUFF = 2.5;

export function applySessionRecoveryGain(peak: RankBand, previousCurrent: RankBand): RankBand {
  const peakPos = bandPosition(peak);
  const prevPos = bandPosition(previousCurrent);
  if (prevPos >= peakPos) return peak; // already caught up (or peak just advanced past it)

  const tierSpan = TIER_DIVISION_COUNT[peak.tier] * 100; // this tier's max intra-tier position range
  const gapFraction = (peakPos - prevPos) / tierSpan;
  const buff = 1 + gapFraction * (RECOVERY_MAX_BUFF - 1);
  const gain = RECOVERY_BASE_FRACTION_PER_SESSION * tierSpan * buff;

  return positionToBand(Math.min(peakPos, prevPos + gain));
}
```

Simulated worst case (starting fully floored, `gapFraction = 1`, buff starts at 2.5×): closes
in **5 sessions** — session 1 recovers ~31% of the gap, tapering down to a final small top-up on
session 5. A lifter who returns after only a mild decay (small `gapFraction`) closes the smaller
gap in proportionally fewer sessions, at a proportionally smaller buff, because the buff itself
scales with how far below peak they currently are — never needing to remember "how decayed were
you when you started," only "how decayed are you right now."

### 2.2 Integration into `recomputeRankForExercise`

The current recompute flow computes `currentBand` purely from `computeCurrentBand(peak,
daysSinceLastTrained)`. This becomes two steps:

1. `computeCurrentBand(peak, daysSinceLastTrained)` still runs first — this is the passive
   "how much has this decayed since it was last touched" calculation, unchanged.
2. **If this recompute was triggered by a newly-logged session** for this exercise (true every
   time `recomputeRankForExercise` is called from the finish-workout path, since it only fires
   for exercises touched in that workout) **and** the previously-stored current band (read from
   `previousRank`, already fetched for the peak ratchet) was below peak, call
   `applySessionRecoveryGain(peak, previousStoredCurrentBand)` and use that as the new current
   band instead of step 1's result.

This makes the climb-back genuinely session-by-session: the *stored* `ranks.tier/division/lp`
row becomes the anchor for "how far into the climb-back are you," not something re-derived from
raw set history alone on every call.

**Trade-off, stated explicitly:** this weakens (for this one field only) the project's stated
principle that "every derived table must stay reconstructible from raw data"
(`liftr-audit.md` §9.6) — a full `pnpm recompute` rebuild-from-scratch would apply pure
day-based decay with no session-catch-up memory, which can differ from the live incrementally-
updated value for someone currently mid-climb-back. This exact class of trade-off already exists
today for the peak ratchet itself (peak is compared against *stored* peak, not literally
re-derived by replaying full history through today's bodyweight, because bodyweight isn't
tracked per-historical-set) — this extends the same accepted precedent to current-rank recovery.
`pnpm recompute` remains a maintenance tool, not part of normal operation, so this is judged an
acceptable, precedented trade-off rather than a new architectural risk.

### 2.3 UI

`RankProgress.vue`'s existing "Bestleistung: X" (peak) caption, shown when current is below
peak, gets a small addition when a session-recovery gain just applied: something like "+18 LP
(Rückkehr-Bonus)" so the buff is visible and honest, not a silently different number — consistent
with the app's transparency principle. Exact copy/placement is a Phase-4 (client) implementation
detail, not a design blocker.

## 3. Plausibility gate

### 3.1 What exists today

`packages/shared/src/math/setLimits.ts` already hard-rejects any individual set over 500kg or
200 reps at log time (`syncService.ts`'s `applyLogSet`) — a ceiling check, not a pattern check.
Nothing today looks at session duration, set-count pacing, or a set's plausibility relative to
the lifter's own history. `workouts.startedAt`/`endedAt`/`pausedSeconds` are persisted but never
read by anything rank/XP-related.

### 3.2 New: per-workout plausibility score

New pure module `packages/shared/src/rank/plausibility.ts`, three independent checks, each
returning a severity in `[0, 1]` (0 = fine, 1 = maximally implausible):

1. **Session pace** — `totalSets / effectiveDurationSeconds` where `effectiveDuration =
   (endedAt - startedAt)/1000 - pausedSeconds`. Below **12 seconds/set average** starts scoring
   severity > 0, scaling to severity 1 at or below **4 seconds/set** (your example: 20 sets in
   60 seconds = 3s/set, solidly in the max-severity zone).
2. **Improbable jump vs. own history** — for each exercise touched, compare this session's best
   e1RM (or rep count) against that exercise's *stored* peak e1RM. A jump of more than **40%** in
   one session starts scoring severity > 0, scaling to severity 1 at a **100%+** jump (bodyweight
   changes are already excluded from this comparison since peak e1RM is bodyweight-ratchet-locked,
   not recomputed against today's bodyweight — see §1 of the R1 design).
3. **Exceeds realistic ceiling** — a load-ratio value beyond **1.5×** the Apex tier's own entry
   threshold for that exercise scores severity 1 outright (Apex is already calibrated as
   "extraordinary but human"; anything past 1.5× that is almost certainly bad data, not a
   generational outlier).

**Combination rule:** overall plausibility multiplier = `1 - max(severity_1, severity_2,
severity_3)`, i.e. the worst-failing check dominates rather than averaging out with two passing
checks. A workout with multiplier 1.0 is unaffected; a workout at severity-1 on any check gets
multiplier 0 (or a small non-zero floor — see open question below) for XP/LP purposes on the
touched exercises, though the sets themselves are still recorded and visible in history exactly
as logged.

### 3.3 Where it applies

Computed once per finished workout, in `applyFinishWorkout` (`syncService.ts`), **before** the
per-exercise `recomputeRankForExercise` loop:

- **XP**: the multiplier is persisted on the `workouts` row (new nullable `plausibilityMultiplier
  real` column, default `1`) so `historyService.ts`/`xpService.ts` can apply it per set via a
  join to the parent workout, without needing to re-run the plausibility check at read time.
  `computeSetXp` gains an optional multiplier parameter (defaults to 1, backward compatible with
  existing tests).
- **Current-rank recovery**: `recomputeRankForExercise` receives the workout's plausibility
  multiplier and scales the session-recovery gain (§2.1) by it before applying — a flagged
  session contributes proportionally less climb-back progress.
- **Peak**: per your decision, a flagged workout's sets are **excluded from `ratchetPeak`
  entirely** for that recompute call — `bestValue`/`bestE1rm` computed for peak-comparison
  purposes only considers sets from workouts whose multiplier is above a small floor (proposed:
  **0.3** — below that, treat as "not eligible for peak" outright rather than a token allowance).
- **Rank events / celebration**: unaffected structurally — since a fully-blocked session can't
  advance peak, `rankedUp` simply won't fire for it, no special-casing needed there.

### 3.4 UI

The finish-workout response already returns per-exercise `rankedUp`/`newPr`/`lp` data to the
client. It gains one more field when a workout was flagged: a short, honest, specific reason
string (client renders it as a plain note, not a popup or accusation) — e.g. *"Diese Session
wirkte ungewöhnlich schnell — Rang- und XP-Gewinn wurden reduziert."* The exact numeric
thresholds are not shown (avoids trivially reverse-engineering the gate), but the *fact* and
*general reason category* (pace / improbable jump / unrealistic value) always is, per the
project's transparency principle.

### 3.5 Open question flagged for the implementer, not blocking

Should the plausibility multiplier floor at exactly 0 (fully zero XP/LP contribution) or at a
small non-zero floor (e.g. 0.05) so a maximally-flagged session still credits a token amount
rather than feeling like the workout vanished entirely? Leaning toward a small non-zero floor
(consistent with `xp.ts`'s own `REPEAT_XP_FLOOR_MULTIPLIER` precedent of "still earns *something*,
just progressively less" rather than a hard zero) — final call during implementation, low-risk
either way, easy to tune.

## 4. Anti-patterns to avoid (carried from the project's established conventions)

- Do not add a second rank-history table for recovery-gain events — this is derived state on the
  existing `ranks` row, not a new mechanic needing its own audit trail.
- Do not let the plausibility gate silently discard a workout or its sets — always recorded,
  always visible in history, only the XP/LP/peak *contribution* is discounted.
- Do not expose exact plausibility thresholds in the UI or API response.
- Do not touch the passive decay curve (§2, unchanged) — only the return-from-decay path changes.
- Do not add a chart library, a new celebration/animation system, or any UI beyond what's
  strictly needed to surface the new tier count and the plausibility note — matches this
  project's repeated "deepen existing signals, don't invent new reward currencies" rule.

## 5. Files at a glance

**Rewritten:** `packages/shared/src/rank/tiers.ts` (9-tier ladder, variable divisions, centralized
`ordinalToBand`) · `packages/shared/src/rank/defaultStandards.ts` (9-point interpolation) ·
`packages/shared/src/rank/decay.ts` (adds `applySessionRecoveryGain`, keeps existing decay curve) ·
`packages/client/src/lib/tierIcons.ts` (9 tiers) · `packages/client/src/styles/tokens.css` (9
palettes, fixes the plat/platinum class-name bug) · `packages/db/src/schema.ts` (4 enum columns +
1 new `workouts.plausibilityMultiplier` column)

**New:** `packages/shared/src/rank/plausibility.ts` (+ `.test.ts`) · a DB migration (next number
`0009`)

**Modified:** `packages/server/src/services/rankService.ts` (recovery-gain integration,
plausibility-aware peak eligibility) · `packages/server/src/services/syncService.ts`
(plausibility computation at finish-workout time) · `packages/shared/src/math/xp.ts`
(`computeSetXp` gains optional multiplier param) · `packages/server/src/services/historyService.ts`
/ `xpService.ts` (join workout multiplier when summing XP) · `packages/client/src/components/rank/
RankProgress.vue` (recovery-bonus + plausibility-note display) · `packages/client/src/components/
rank/RankDistributionDonut.vue` (9-tier maps) · all existing rank/decay/xp test files (extended,
not broken — every existing test case's assertion still holds under the generalized code, since
the generalization reproduces old behavior when division-count-per-tier is held constant, and the
new mechanics are purely additive).
