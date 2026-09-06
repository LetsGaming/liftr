# XP & Rank Balancing Redesign — Design Spec

## Status

Design brainstormed and approved by the product owner 2026-09-06, via `superpowers:brainstorming`.
Started as a review of the XP level curve (`packages/shared/src/math/xp.ts`) and expanded, per the
product owner's own follow-up questions, into a five-part rebalance touching both the XP level
curve and the rank engine's skill-score formula, peak model, per-exercise standard ratios, and tier
spacing (`packages/shared/src/rank/*.ts`, `tools/catalog/curated.yaml`). Ready for
`superpowers:writing-plans` once the product owner reviews this file.

This spec's rank-engine changes supersede the 2026-09-04 streak/XP design's stated non-goal ("the
9-tier rank ladder... peak/current split... are not in scope") — that boundary applied to the prior
XP/streak workstream specifically; the product owner has now explicitly asked to open the rank
engine itself for this workstream.

## Problem statement

Three distinct, product-owner-reported complaints drove this redesign:

1. **A single workout can jump multiple XP levels.** Concretely: a brand-new user's very first
   session already reaches level 6 (`computeLevel`'s worked table, `xp.ts`). Root cause: the level
   curve (`floor(sqrt(xp/100))`, a quadratic threshold) was calibrated when total XP was only
   per-set sums; the 2026-09-04 redesign then stacked two new one-time session bonuses
   (consistency, variety — up to ~4000xp combined) on top of every session without rescaling the
   curve, so one session's XP blows past several levels' thresholds at once.
2. **Rank climbs too easily on synthetic-standard (isolation) exercises.** Worked example: Hammer
   Curl, 12.5kg×5×3 @ 52.5kg bodyweight, resolves to **Athlete IV (~20 LP)** — tier 4 of 9 — off a
   single, first-ever-logged, fairly modest set. Two compounding causes:
   - Hammer curl (and most isolation arm exercises) uses a flat, unsourced `ratio: 0.5` against its
     anchor lift (`overhead-press`) in `curated.yaml` — a guess, not derived from real accessory-lift
     strength data (`trust: synthetic`).
   - Independent of that ratio, the tier ladder's low/mid tiers (Initiate→Athlete) sit close enough
     together, and cram enough divisions at the bottom, that a first-ever set can clear 3-4 tiers at
     once regardless of which exercise it is.
3. **Rank is weight-dominated in a way that doesn't reflect real skill.** The current per-set metric
   feeds Epley (`e1RM = weight × (1 + reps/30)`) into rank, which gives reps only a mild, near-linear
   bonus. A heavy, low-rep set can score higher than a genuinely harder, higher-rep set at real
   effort, even though the higher-rep set is arguably the better demonstration of skill at that
   exercise. Compounding this, `ratchetPeak` (`tiers.ts`) promotes a new peak off a single set — one
   outlier (lucky day, typo, favorable form) can permanently define a lifter's rank for that
   exercise.

## Design goals

- Leveling (XP) should feel like real, incremental progress — the first session should land at
  level 1, not mid-single-digits; growth should visibly decelerate over months rather than running
  away (the old curve reached level 69 by month 6 in the existing worked table).
- Rank should stay structurally more conservative than leveling: it already resists farming via
  reps/sessions (peak-based, not additive), but the actual *tiers reached* for a given real
  performance need to feel earned, not handed out on a first attempt.
- Rank's skill-score formula must reflect real exercise-science evidence about effort across the
  rep spectrum, not a bodybuilding-culture rule of thumb. A rank fact-check (see Section 2 below)
  confirmed there is no scientific "12-rep cliff" — the formula must not encode that myth.
- None of these changes may reintroduce a way to farm rank or level through repetition/frequency
  alone — every fix here should make the systems *more* resistant to that, never less.
- Keep the "reconstructible from raw tables" property the XP system already has where practical;
  new derived values (corroborated peak) should be clearly justified as frozen/derived state, not
  new untracked source-of-truth.

## The design

### 1. Level curve rescale (XP)

Replace `computeLevel`'s formula:

```ts
// current
level = floor(sqrt(xp / 100))
// proposed
level = floor((xp / K) ^ p)
```

with `p ≈ 0.8` (between linear and the old curve's implicit deceleration) and `K` sized to
approximately a first session's typical total XP (~4600, using the existing worked-table
assumptions in `xp.ts`'s own comment) — exact values tuned at implementation time against the same
kind of worked table already present in that file.

**Effect** (using the existing worked-table's session-count/XP assumptions):

| Point | Sessions | Old level | New level (p≈0.8) |
|---|---:|---:|---:|
| Day 1 | 1 | 6 | 1 |
| Week 2 | ~6 | 17 | ~4 |
| Month 1 | ~13 | 26 | ~8-9 |
| Month 3 | ~39 | 49 | ~24 |
| Month 6 | ~77 | 69 | ~41 |

Guarantees session 1 lands at exactly level 1, early sessions grant close to a level each, and the
curve decelerates smoothly without the old runaway. One-function change, same return shape
(`level`, `xpIntoLevel`, `xpForNextLevel`, `progressPercent`), no data-model change.

### 2. Rank skill-score formula: full-rep-range, tapered past ~20 reps (not capped at 12)

Replace Epley with a full-rep-range estimator (Wathan-family, non-linear — reps pull real weight in
the comparison well past ~15-20 reps) for rank's skill-score calculation specifically. This swap is
scoped to rank (`bestLoadRatio`, `resolveRank`'s input, and anywhere rank derives its e1RM-equivalent
from a set) — it does **not** need to change Epley's use elsewhere (e.g. an honest "estimated 1RM"
display for PR tracking), unless a future pass decides those should share the same number.

**Fact-check performed during this design** (two research passes, 2026-09-06 — a quick pass and a
deeper stress-test pass reading the primary meta-analyses in full and actively hunting for
counter-evidence; sources: Schoenfeld et al. 2014/2017, the 2021 *Med Sci Sports Exerc* network
meta-analysis PMC8126497, Carvalho et al. 2021/2022, the repetition-continuum re-examination
PMC7927075, Lasevicius et al.'s failure-vs-non-failure trial, Refalo et al.'s failure meta-analysis,
and a proximity-to-failure dose-response meta-regression). Combined verdict:

- The common "12 reps is the gold standard, steep diminishing returns past it" claim is a
  **myth/oversimplification** — not a finding replicated in modern controlled trials. Hypertrophy
  SMDs across load bins (including sets past 30 reps) are small and non-significant
  (PMC8126497: High vs Low 0.12 [−0.06, 0.29]), while *pure 1RM strength* clearly favors heavy/low-
  rep loading (High vs Low 0.60 [0.38, 0.82], p<0.001) — a load-specificity effect on strength, not
  a rep-count cliff on hypertrophy. This part of the quick pass holds up under deeper scrutiny.
- **But** the entire "hypertrophy is load-independent" literature base was built on protocols that
  forced training to true failure in every arm — effort was experimentally equalized, not left to
  chance. And the failure-dependency is asymmetric by load: Lasevicius et al. found training to
  failure vs. not made **no meaningful hypertrophy difference at heavy loads (80% 1RM)**, but a
  **~3x hypertrophy difference at light loads (30% 1RM: 7.8% failure vs 2.8% non-failure)**. A
  proximity-to-failure dose-response meta-regression corroborates this generally: hypertrophy scales
  with closeness to failure, while strength gains are comparatively insensitive to it.
- **Implication the app can't avoid:** a logged set (`weight × reps`) carries no signal about how
  close to failure it actually was. A heavy, low-rep set's true value barely depends on that missing
  information (failure vs. not barely moves the outcome at high load). A high-rep set's true value
  depends on it heavily (~3x swing at low load) — so the higher-rep end of an *unverified* formula is
  structurally more exploitable by low-effort logging than the low-rep end is. This is a distinct,
  narrower finding from the debunked 12-rep myth — it's about uncertainty/exploitability, not about
  hypertrophy actually stalling past 12 reps.

**Resulting formula shape:** do **not** hard-cap or flatten the reps bonus near 12 reps — that would
still encode the debunked myth. Instead, shape the curve in three zones: near-Epley-like scaling
through roughly 1-12 reps (well-supported, low failure-ambiguity zone regardless of load), the fuller
Wathan-style generosity through roughly 12-20 reps (still well-supported and reasonably
effort-robust per the evidence above), and a flattening/damping multiplier past ~20 reps so a 30-rep
set scores generously but not dramatically more than a well-executed 20-rep set — crediting reps for
their real skill value while discounting the added uncertainty that comes with unverifiable effort at
high volumes. Exact zone boundaries/taper shape: implementation-plan concern, but the three-zone
shape (not a single unbounded curve, not a 12-rep hard cap) is binding.

### 3. Peak requires corroboration, not a single set

`ratchetPeak` (`tiers.ts`) currently promotes a new stored peak the instant one fresh result beats
the old one. Change this so a new peak must be **corroborated across at least 2 separate sessions**
(e.g. matched or exceeded within some recent-session window — exact mechanism sized at
implementation time) before it locks in as the new peak. Still strictly ratchet/monotonic — this
never demotes an existing peak, it only delays *promotion* of a new one until it's demonstrated
more than once, so one outlier set (mis-typed weight, a fluke rep, unusually good form that day)
can't permanently define a lifter's rank for that exercise.

This is new derived state (a "candidate peak, pending corroboration" value distinct from the
confirmed peak) — data-model concern, sized at implementation time, following the same
"nullable/frozen column, no backfill needed" convention `workouts.consistencyBonusXp` already
established.

### 4. Isolation/synthetic ratio recalibration

The flat `ratio: 0.5` copied across most isolation arm exercises in `curated.yaml` (hammer curl,
dumbbell bicep curl, etc.) gets replaced with per-exercise values grounded in real accessory-lift
strength-standard data, raising the bar so the same real-world performance requires a genuinely
higher relative load to reach a given tier. Worked check: raising hammer curl's ratio from 0.5 to
~0.6 moves the spec's own worked example (12.5kg×5 @ 52.5kg BW) from Athlete IV down to **Trainee
(~22% in)** — a materially more credible placement for a first-ever set. Exact per-exercise ratios:
implementation-plan concern (audit `curated.yaml`'s isolation-lift entries against a real reference
source, e.g. strengthlevel.com-style population data, rather than hand-guessing each one).

### 5. Tier curve reshaping

Independent of any single exercise's ratio, widen the relative-strength multiplier between tiers
(steeper curve — affects every exercise, not just isolation ones) and reduce how many divisions
cluster at the bottom (`TIER_DIVISION_COUNT`, currently Initiate=6/Apprentice=5/Trainee=5) so that
climbing 3-4 tiers in a single first session becomes structurally impossible regardless of which
exercise or ratio is involved. This touches `interpolateNineTierAnchors` (`defaultStandards.ts`) and
`TIER_DIVISION_COUNT` (`tiers.ts`). Must preserve the existing design intent this ladder was already
built around — frequent rank-ups early, a genuinely rare single milestone at Apex — just recalibrated
so "early" no longer means "instantly." Exact spacing/division counts: implementation-plan concern.

## Anti-cheese / properties preserved

- Level curve rescale changes no inputs, only the level *readout* — doesn't affect any existing
  anti-cheese property of the XP sources themselves (repeat-decay, plausibility discount, weight-
  independent per-set formula all stay exactly as the 2026-09-04 spec left them).
- The Wathan-style skill-score formula is still a pure function of a single set's weight/reps — no
  new fabricable input introduced. It changes *how much* reps count, not *whether* the formula can
  be gamed differently than Epley already could (plausibility gating is unaffected, orthogonal).
- Peak corroboration makes rank **strictly harder** to fabricate than today (a single fabricated or
  lucky set is no longer enough), never easier.
- Ratio recalibration and tier reshaping both only ever raise the bar for reaching a given
  tier/division — no change makes any tier easier to reach than it is today.

## Explicitly out of scope

- The streak/consistency/variety XP bonus formulas themselves (`computeConsistencyBonus`,
  `computeVarietyBonus`) — unchanged, per the 2026-09-04 spec; only the level *readout* on top of
  their sum changes here.
- Rank decay/recovery mechanics (`decay.ts`) — unchanged. Peak corroboration is orthogonal to how
  current-vs-peak softens with inactivity.
- Overall Lifter Rank aggregation (`aggregate.ts`) — unaffected in mechanism; its inputs (per-
  exercise tier/division/LP) will simply reflect the recalibrated values once the above ships.
- Migrating/recomputing already-stored peaks or existing users' XP/levels retroactively — Liftr is
  pre-v1 with no real user data to preserve, consistent with the 2026-09-04 spec's own precedent.
- Changing Epley's use outside of rank (e.g. PR-tracking e1RM display), unless a future pass decides
  that display should share the new formula too.

## Open questions for implementation-planning time (not blocking this spec's approval)

1. Exact `K`/`p` for the level curve, exact Wathan-taper shape past ~30 reps, exact per-exercise
   isolation ratios, and exact tier-spacing/division-count changes — all deferred to implementation,
   consistent with this codebase's established "spec sizes the shape and ordering, plan sizes the
   numbers" convention (see the 2026-09-04 spec for precedent).
2. Exact corroboration mechanism for peak promotion (e.g. "matched/exceeded in ≥2 of the last N
   sessions" vs. some other window definition) and its data-model shape (candidate-peak column(s)
   on `ranks`, presumably) — implementation-plan concern.
3. Whether the Wathan-style formula swap should also apply to PR-tracking's e1RM display, or stay
   scoped to rank only, as this spec currently proposes — confirm at implementation time if it comes
   up, otherwise default to "rank only."
