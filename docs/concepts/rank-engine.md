# The rank engine

Liftr's founding bet is that **the rank system is the retention mechanism** — everything else
in the app exists to support logging sets fast enough that engaging with rank doesn't feel like
a chore (§1 of the app's original audit document, a point-in-time planning/audit doc that has
since been removed from the repo — this document reflects the current implementation directly).
This document explains how that system actually works today, and why it's shaped the way it is.

The engine lives almost entirely in `packages/shared/src/rank/` as pure, framework-free
TypeScript — no DB access, no hidden state. The client can recompute optimistically offline and
the server recomputes authoritatively after sync, and the two are guaranteed to agree because
they import the exact same functions.

> **A note on staleness**: this system went through a significant redesign on 2026-09-07 (the
> "XP/rank balancing redesign" — its design doc was a point-in-time planning document that has
> since been removed from the repo; this file reflects the current implementation directly).
> If you find older material describing 5 tiers (bronze→diamond) × 3 divisions = 15 bands, or a
> 9-tier ladder with 33 bands, that's history, not the current system. Always trust
> `packages/shared/src/rank/tiers.ts`'s own comments over prose elsewhere, including this file —
> constants are cross-referenced below rather than restated for exactly this reason.

## Why per-exercise, not global

Rank is computed **per exercise**, independently. There's no single "player level" driving
everything — a lifter can be strong at squat and mediocre at overhead press, and the app shows
that honestly rather than blending it into one number (the one exception is the aggregate
described in [Overall Lifter Rank](#overall-lifter-rank-the-one-aggregate) below, which is
additive, not primary).

This is a deliberate rejection of PvP-ranked-game conventions. Round 3 of the rank rework (§7.3 in
that same now-removed audit document) did a comparative study of seven competitive games' ranked
systems (League of Legends, Siege, Apex, Deadlock, VALORANT, CS2) specifically to see what
transfers to a single-player strength tracker. Conclusion: almost nothing — hidden MMR, opponent-relative
scoring, demotion, placement matches, entry costs, and smurf detection all solve
matchmaking-specific problems that don't exist with no opponents and no matches. What *does*
transfer is general progression psychology: transparency over hidden math, and boundary
crossings feeling earned.

## Tiers, divisions, and ordinals

Nine tiers, `packages/shared/src/rank/tiers.ts`:

```
initiate → apprentice → trainee → athlete → lifter → advanced → elite → expert → apex
```

Each tier has a different number of divisions — deliberately more at the bottom (frequent
rank-ups early) and fewer at the top (Apex has exactly 1 division: a single real milestone, not
another grind). The exact per-tier counts are `TIER_DIVISION_COUNT` in `tiers.ts` — don't
hardcode them here, they're a tuning knob that has already changed once (see that constant's own
doc comment for the full rationale, including why the original bottom-heavy 33-band ladder got
flattened to fewer, harder-won bands).

Within a tier, division numbers count **down** as you get stronger (division `N` = weakest/entry,
division `1` = closest to promotion) — the same convention the old fixed "III/II/I" divisions
used, generalized to a variable division count per tier.

To make comparison across tiers/divisions tractable, `ordinal(tier, division)` flattens the whole
ladder into one ascending integer — tier/division pairs become comparable with a single `<`. Its
inverse, `ordinalToBand`, is centralized in `tiers.ts` specifically so `decay.ts` and
`aggregate.ts` don't each reinvent the "fixed-length-array" inversion that broke once tiers
stopped having equal division counts.

## Resolving a value into a rank

`resolveRank(value, thresholds)` is the core primitive. Given a metric value and a
pre-sorted table of `StandardThreshold`s (tier/division/threshold/trust), it finds the highest
threshold at or below the value, and computes LP as the value's position between that threshold
and the next one up (normally 0–100). Below the lowest threshold, LP is measured as a raw
fraction of that first threshold rather than clamped to 0 — so a genuinely weak first set doesn't
just read as "0% of bottom tier" with no signal.

Above the *top* threshold (i.e. once you're in Apex, which has no threshold above it), LP no
longer freezes at 100 — it keeps growing, logarithmically, so continued genuine strength gains at
the top of the ladder still register as real progress instead of going invisible the moment Apex
is reached. Let `previous` be the division just below the top one and `intervalWidth` the gap
between their thresholds; `x` measures how far past the top threshold `value` sits, in units of
`intervalWidth`. Then `lp = 100 * (1 + log2(1 + x))`. At `x = 0` (right at the top threshold) this
is exactly `100`, so there's no discontinuity at the old hard cap — each doubling of `(1 + x)`
past that point is worth another flat +100 LP, with real diminishing returns per unit of raw
overshoot. `positionToBand` (`tiers.ts`) is the corresponding inverse — given a continuous
`ordinal * 100 + lp` position, it recovers tier/division/lp, and (unlike the ordinal-only
`ordinalToBand`) preserves LP past Apex's ordinal instead of clamping it to 100. `decay.ts` and
`aggregate.ts` both import it rather than keeping their own copies, so post-Apex LP survives
decay, recovery-gain, and the overall-rank aggregate instead of being silently erased the moment
it passes through any of them.

The `value` fed into `resolveRank` is one of two things depending on the exercise's `metric`:

- **`load_ratio`**: a skill-score / bodyweight ratio (see [Skill score](#skill-score-not-raw-e1rm)
  below) for loaded lifts.
- **`reps`**: a raw rep count, for bodyweight movements with a published rep-norm table
  (push-up, pull-up, chin-up, dip).

## Rank is computed from your all-time best, not a recent window

`recomputeRankForExercise` (`packages/server/src/services/rankService.ts`) scans a lifter's
*full* set history for an exercise and tracks the running best. This makes the naively-resolved
rank **structurally monotonic** — it can never decrease just from logging a worse set later.

That monotonicity used to be a real bug for bodyweight-relative exercises: because the ratio is
`load / bodyweight`, and bodyweight is read live at recompute time, a legitimate bodyweight
*increase* alone (no strength loss) could silently shrink the ratio and look like a demotion. The
fix — a permanent, ratchet-only **peak** snapshot decoupled from any retroactive bodyweight
recompute — is the subject of the next section.

## Trust tiers: being honest about the numbers

Every threshold carries a `trust` tier, and the UI is expected to never claim more precision than
that tier warrants (the `≈` marker on `RankProgress.vue` for anything below `real`):

- **`real`** — calibrated against a real external dataset. The five "anchor" lifts
  (back-squat, bench-press, deadlift, overhead-press, barbell-row) use OpenPowerlifting-derived
  ratios shifted by `OPL_POPULATION_SHIFT` (competition-population data reads strong for a
  recreational lifter, so the percentile mapping is shifted down); the four rep-based bodyweight
  anchors (push-up, pull-up, chin-up, dip) use published rep-norm tables. See
  `packages/shared/src/rank/defaultStandards.ts`'s `ANCHOR_STANDARDS`/`REP_STANDARDS`.
- **`derived`** — a close variant of an anchor, expressed as `deriveStandards(anchorThresholds,
  ratio, "derived")`: the anchor's own threshold table scaled by a per-exercise ratio.
- **`synthetic`** — the long tail of isolation/accessory exercises, same derivation mechanism,
  `trust: "synthetic"`. A derived exercise is *never* more trustworthy than its own derivation —
  `deriveStandards` always downgrades trust regardless of what the anchor's trust was.

The per-exercise anchor + ratio assignment lives in `tools/catalog/curated.yaml`, not in code —
see [catalog-and-equipment.md](./catalog-and-equipment.md) for how that file is structured and
ingested. Sex-specific standards (`FEMALE_ANCHOR_STANDARDS`) are derived the same way, via
`MALE_FEMALE_RATIO`, sourced per-lift (see that constant's doc comment for citations) and capped
at `derived`/`synthetic` trust depending on how directly a ratio is sourced.

### From 5 hand-tuned numbers to 9 tiers, in code

Historically each exercise had 5 hand-tuned anchor ratios (bronze→diamond). Rather than
hand-typing 9 new floats per exercise for the current 9-tier ladder,
`interpolateNineTierAnchors` derives all 9 from the original 5: the 4 tiers that map cleanly onto
old anchors keep those exact numbers, the 3 new interior tiers sit at the geometric mean of their
neighbors, and the two new ends extrapolate one step beyond their nearest anchor using that
anchor's own ratio to its interpolated neighbor. The single tunable source per exercise stays 5
numbers — see the function's doc comment in `defaultStandards.ts` for the full reasoning.

A second, separate preprocessing step, `widenAnchorSpread`, stretches the gap between each tier
and the bottom (bronze/apprentice never moves) on a log scale, so climbing further up the ladder
requires proportionally more real strength — not just more divisions. This exists specifically
to fix a reported failure mode: a first-ever set on an easy synthetic-standard exercise could
clear 3–4 tiers at once. `TIER_DIVISION_COUNT`'s reduction (33→27 bands) and this widening are
described as two independent fixes for the same complaint, applied together.

## Skill score, not raw e1RM

Rank scoring does **not** feed Epley directly. `rankSkillScore` (`packages/shared/src/math/e1rm.ts`)
is a separate three-zone piecewise curve:

- **1–12 reps**: identical slope to Epley (`1 + reps/30`) — the well-evidenced, low-ambiguity zone.
- **12–20 reps**: a steeper slope (`RANK_REP_ZONE_2_SLOPE_FACTOR`) — real credit for harder
  higher-rep work that Epley's flat linear slope underweights.
- **past 20 reps**: the zone-2 slope damped by `RANK_REP_ZONE_3_DAMPING` — reps still earn credit
  (this is *not* a reintroduction of the debunked "12-rep cliff"), just at a heavily reduced
  marginal rate, because effort/failure-proximity gets progressively less verifiable from rep
  count alone the further out this goes.

This exists because a fact-check during the balancing redesign found no real "12-rep cliff" in
the hypertrophy literature, but did find that failure-dependency is asymmetric by load — a heavy
low-rep set's true value barely depends on whether it was taken to failure, while a high-rep
set's value depends on it heavily. Since a logged set carries no failure signal, unverified
high-rep credit is structurally more exploitable than low-rep credit; the three-zone shape is the
compromise (see `e1rm.ts`'s doc comment above `RANK_REP_BASE_SLOPE` for the full citation trail).
Epley itself (`epley`, `estimateE1rm`) is **unchanged** and stays the honest 1RM estimate for PR
tracking and UI display — the two curves are allowed to diverge (a high-rep set can be the
rank-best set while a different, heavier set holds the Epley PR) and that's expected, not a bug.

`nextLoadTarget` (`tiers.ts`) inverts `rankRepMultiplier` to suggest a concrete "next: 10 kg × 6"
target — it has to invert the *same* curve rank scoring uses, or the suggested weight wouldn't
actually cross the threshold it came from.

## Peak vs. current rank

`ranks` stores two related-but-distinct positions per exercise, both in `packages/db/src/schema.ts`:

- **Peak** (`peakTier`/`peakDivision`/`peakLp`/`peakE1rm`/`peakAchievedAt`) — a permanent,
  ratchet-only "best ever" snapshot. Compared via the pure `ratchetPeak()` in `tiers.ts`, which
  either keeps the stored peak or replaces it with a genuinely stronger result — it never
  recomputes retroactively against today's bodyweight, which is what makes it immune to the
  bodyweight-ratio bug described above.
- **Current** — the *displayed* rank, which can be softer than peak due to inactivity (see
  [decay](#decay-and-the-buffed-climb-back) below).

### Peak requires corroboration

A raw `ratchetPeak` call takes an `isCorroborated` boolean. As of the balancing redesign, a
result only gets to become — or replace — the stored peak once the same tier/division/LP position
(or better) has been reached on at least one *other* calendar day, not just the single best-ever
set. Without this, one outlier (a mistyped weight, a fluke rep, an unusually good day) could
permanently define a lifter's rank for that exercise.

The corroboration check itself lives in `recomputeRankForExercise`
(`packages/server/src/services/rankService.ts`): while scanning full set history for the best
value, it also tracks each calendar day's own best value, resolves *that* against the same
thresholds, and checks whether any other day's resolved position meets or beats the candidate's.
`ratchetPeak` stays a pure comparison and doesn't know about "days" at all — it just does what
it's told via the boolean.

Corroboration is strictly a **delay**, never a demotion — an uncorroborated result never takes an
existing peak away, and a first-ever set still shows a real *current* rank immediately even
though it isn't peak yet (`recomputeRankForExercise`'s `peak == null` branch).

### Decay and the buffed climb-back

Current rank can soften with inactivity — a documented heuristic, not physiology or a real
demotion system, same spirit as the recovery-heuristic module. `computeCurrentBand`
(`packages/shared/src/rank/decay.ts`):

- No decay for `RANK_DECAY_GRACE_DAYS` days since the exercise was last trained.
- Past that, linear decay over `RANK_DECAY_WINDOW_DAYS` more days toward a floor.
- The floor is hard-capped at the **bottom division of the peak's own tier, 0 LP** — decay can
  never erase a peak entirely, only soften the display.

Returning from a decayed state is a **buffed multi-session climb**, not an instant snap back to
peak (that was the previous behavior, superseded here). `applySessionRecoveryGain` grants a base
fraction of the tier's own span per session (`RECOVERY_BASE_FRACTION_PER_SESSION`), multiplied by
a buff that's largest (`RECOVERY_MAX_BUFF`, 2.5×) right after being maximally decayed and tapers
to 1× (no buff) as current position nears peak. The buff is derived purely from *how far below
peak you currently are*, not from any remembered "how decayed were you when the climb started"
state — so it's safe to call once per finished workout without tracking climb-back progress
separately. A real bug found and fixed during implementation: the buff calculation must compare
against the lifter's *old* peak, not one freshly advanced in the same recompute pass, or a
same-day genuine PR with no decay backlog would display as throttled — see the function's own
comment for the guard.

The climb-back itself is also scaled by the session's own plausibility multiplier:
`scaledPos = prevPos + (rawGainPos - prevPos) * plausibilityMultiplier`
(`packages/server/src/services/rankAlgorithm.ts`). So a session flagged by the plausibility gate
below doesn't just get discounted XP/PR/peak-eligibility — if it's also a comeback session
recovering from decay, its climb-back is proportionally smaller too.

## The plausibility gate

`computeWorkoutPlausibility` (`packages/shared/src/rank/plausibility.ts`) scores a finished
workout on three independent, cheap heuristics — never a fraud verdict, an honest heuristic in
the same spirit as decay:

- **pace** — seconds-per-set averaged across the whole session; below
  `PACE_FINE_THRESHOLD_S`/`PACE_MAX_SEVERITY_THRESHOLD_S`, severity rises.
- **improbable jump** — a same-session skill-score ratio far above the exercise's *own* stored
  peak ratio (`JUMP_FINE_THRESHOLD`/`JUMP_MAX_SEVERITY_THRESHOLD`).
- **exceeds ceiling** — a value beyond `CEILING_FINE_MULTIPLE`× the Apex entry threshold starts
  rising in severity, reaching maximal severity at `CEILING_MAX_SEVERITY_MULTIPLE`× — a continuous
  ramp (via the same `severityRamp` helper the other two heuristics use), not the old hard binary
  cutoff. That hard cutoff used to sit right on top of where genuine post-Apex LP growth (above)
  now lives, so a real lifter climbing past Apex could get flagged as maximally implausible for
  simply getting stronger; the ramp lets legitimate post-Apex values register as only partially
  discounted instead.

The **worst** of the three (not an average) determines the multiplier, so one badly-flagged
signal can't be diluted by two clean ones. The multiplier floors at `PLAUSIBILITY_FLOOR` (never
zero — a flagged session still credits *something*, discouraging without fully punishing).

A subtlety worth knowing if you touch this: the jump/ceiling checks are unit-agnostic ratio
comparisons (session value vs. same-exercise stored peak / apex threshold), so they work
identically for `load_ratio` and `reps`-metric exercises — a real prior bug had `syncService.ts`
passing `null` for these fields on every rep-based exercise (pull-ups, push-ups) to avoid
comparing a load ratio against a raw rep count, which over-corrected into skipping jump/ceiling
protection for that whole exercise class. The fix wires rep counts through the *same* two
heuristics rather than adding a rep-specific one — see `plausibility.ts`'s module doc comment.

The gate is computed once per finished workout (`syncService.ts`'s `applyFinishWorkout`) and its
`multiplier`/`reason` feed three separate, deliberately different-strictness gates:

| Gate | Floor | Effect when failed |
|---|---|---|
| XP/LP discount | `PLAUSIBILITY_FLOOR` | XP and LP contribution scaled down, never to zero |
| Peak eligibility | `PEAK_ELIGIBILITY_FLOOR` (0.3) | Peak cannot advance this session at all |
| PR eligibility | `PR_ELIGIBILITY_FLOOR` (0.5) | Stricter — PRs are individually-displayed, permanent claims |

PR eligibility is deliberately the strictest of the three: a PR is a permanent, high-stakes claim
("you hit X on this exact date"), not a continuously-recomputable derived value the way peak and
current rank are — see `rankService.ts`'s comment above `PR_ELIGIBILITY_FLOOR` for the exact
math this works out to. That comment describes the ceiling check's *practical effect* on the PR
floor as "a hard 0/1, not a gradient" — `computeWorkoutPlausibility` doesn't literally special-case
it that way in code; `ceilingSeverity` is the same continuous ramp shape as the pace and
improbable-jump heuristics (see [above](#the-plausibility-gate)). It just reaches a severity of 0.5
(enough to fail the 0.5 PR-eligibility floor) once a session's best ratio clears roughly 1.9x the
Apex threshold — well before the ramp's own maximal-severity point at 2.5x — so in effect, once a
session is flagged badly enough to matter for PRs at all, it's already lost PR eligibility outright
rather than being partially discounted.

## Overall Lifter Rank: the one aggregate

`computeOverallRank`/`computeOverallPeak` (`packages/shared/src/rank/aggregate.ts`) are the one
genuinely new idea to survive the Round 3 competitive-games study: a single account-level "how
good a lifter am I, overall" number, since Liftr otherwise only has independent per-exercise
ladders. It's a trust-weighted average of continuous ordinal position (`ordinal(tier, division) *
100 + lp`) across every exercise that has a rank — `real`/`derived` count fully, `synthetic` at
half weight (`TRUST_WEIGHT`), so the long-tail synthetic catalog can't dilute or inflate the
headline number. Exercises with no rank yet are excluded entirely, not counted as zero, so adding
a new catalog entry can't drag the aggregate down the moment it's added. Computed on-demand via
`GET /api/overall-rank` — no new derived-cache table, consistent with the "every derived value
must be reconstructible from raw data" invariant.

## Cardio ranks (running, walking, hiking)

Cardio activities get the same tier/division/LP treatment as lifts, computed **per activity type
and rank bucket** rather than per exercise — parity with the section above, not a bolt-on. Which
activities exist, how each one ranks, and its trust/XP is declared in one registry,
[`packages/shared/src/rank/cardioActivities.ts`](../../packages/shared/src/rank/cardioActivities.ts)
— see `docs/adr/0011-cardio-activity-registry-and-single-speed-ladders.md` for why. The engine
itself lives in
[`packages/shared/src/rank/runStandards.ts`](../../packages/shared/src/rank/runStandards.ts) and
[`packages/shared/src/math/riegel.ts`](../../packages/shared/src/math/riegel.ts), server-side
recompute in `packages/server/src/services/runRankService.ts`'s `recomputeRunRank`.

Two rank shapes, per the registry entry's `rank.mode`:

- **`"distance-ladder"` (running only): five fixed categories** — Mile, 5K, 10K, Half Marathon,
  Marathon (`RUN_CATEGORIES` in `riegel.ts`). Every run is bucketed into whichever category its
  distance is *nearest* to (`nearestRunCategory`) — a category is derived from distance at
  read/recompute time, never persisted as its own column. A run's actual (distance, duration) is
  essentially never exactly a category's canonical distance, so `riegelPredictedTimeS` predicts
  the equivalent finish time *at* the assigned category's exact distance before ranking it, using
  Riegel's power-law race-time-equivalence formula. The exponent is **not uniform across
  categories** — see `riegel.ts`'s own doc comment for the current numbers and the Daniels'-VDOT
  validation behind picking a different exponent for Mile than for the rest.
- **`"single-speed"` (walking, hiking): one bucket, no Riegel normalization.** The rank-comparable
  speed is the activity's own raw `distanceM / durationS` — no category, no distance adjustment.
  Additionally gated on `isRankEligible` (a minimum distance AND duration per activity — see
  `cardioActivities.ts`): below the floor, an activity still earns XP/streak, it just never enters
  the rank aggregate. This design replaced an earlier five-category walking ladder whose own
  Riegel exponent contradicted its own anchor data (see ADR 0011) — walking/hiking pace is ranked
  on quality (speed) alone, with XP already covering volume (distance).

In both shapes, the resulting speed (m/s, higher = better) is what gets resolved against
`resolveRank`'s thresholds — the same primitive lifts use, just fed a speed instead of a skill
score/load ratio. Every rank bucket ("distance-ladder" or the single "all" bucket) is stored keyed
by `(userId, activityType, category)`, where `category` is a `RunCategory` or the literal `"all"`.

- **Standards data**: each registry entry's anchors (running's `RUN_ANCHOR_STANDARDS`,
  walking's/hiking's single `SexedAnchors`) run through the *exact same* `widenAnchorSpread` ->
  `interpolateNineTierAnchors` -> `expand` pipeline described above for strength — no new
  interpolation math, only new anchor data. Running's anchors are `trust: "derived"` (independently
  cross-validated against Daniels' VDOT); walking's and hiking's are `trust: "synthetic"`
  (grounded in gait-speed research and a terrain-discount estimate respectively, neither
  independently cross-validated) — see `cardioActivities.ts`'s own doc comments for the sourcing.
- **Manual runs never earn rank.** `recomputeRunRank` only runs for GPS-tracked activities with
  points (`services/runImportService.ts`'s `persistRun` gates the whole rank step on
  `source !== "manual"` and the activity's `rank.mode !== "none"` — see
  [Runs](../reference/http-api.md#runs-runsts) in the HTTP API reference). A manual entry has
  no `run_points` to independently corroborate distance against, so it's XP-only, same idea as the
  plausibility gate below being unable to run against it either. This mirrors the general "trust
  what can be independently checked" spirit of the whole rank engine.
- **Peak, corroboration, decay, PR eligibility, and the plausibility floors** all reuse the exact
  same primitives lifts use (`ratchetPeak`, `computeCurrentBand`, `applySessionRecoveryGain`,
  `PEAK_ELIGIBILITY_FLOOR`/`PR_ELIGIBILITY_FLOOR` from `rankService.ts`) — cardio doesn't fork any
  of that machinery, only the metric (speed) and the recompute's data source (a bucket's activity
  history instead of an exercise's set history) differ. A single-speed activity's PR is
  speed-only — there's no fixed category distance for a "time" PR to divide by.
- **A cardio-specific plausibility gate**: `computeRunPlausibility`
  (`packages/shared/src/rank/runPlausibility.ts`) is the cardio-side sibling of
  `computeWorkoutPlausibility` above — same "discount, never discard" spirit and the same
  `PLAUSIBILITY_FLOOR`, but two genuinely different heuristics: a **sustained-speed** check (a
  same-activity average pace faster than is physically sustainable, with a lower threshold for
  walking/hiking than running) and a **distance-mismatch** check (the stored `distanceM`
  disagreeing with an independent straight-line recomputation over the activity's own GPS points,
  `pathDistanceM`). Deliberately has no knowledge of `source` — the call site is responsible for
  only ever invoking it for GPS-tracked activities, since a manual entry has nothing to check
  `distanceM` against.
- **Overall Runner Rank is a separate aggregate from Overall Lifter Rank** — it is *not* merged
  into the one aggregate described above, and only counts activities whose registry entry sets
  `countsTowardOverallRunnerRank` (running only, today — walking and hiking are excluded, both
  because their standards are synthetic and because effort that takes no specific fitness
  shouldn't move a number read as being about running; the client states this exclusion rather
  than leaving it implicit). `getOverallRunnerRank`
  (`packages/server/src/services/overallRunnerRankService.ts`) reuses the exact same
  `computeOverallRank`/`computeOverallPeak` math, just averaged over the counted activities'
  `runRanks` rows instead of `ranks` (one row per exercise). Exposed via
  [`GET /api/runs/overall-rank`](../reference/http-api.md#run-overall-rank-runoverallrankts).
  There is no separate "Overall Walker/Hiker Rank" — each single-speed activity has exactly one
  bucket, so that bucket's own rank card already is the aggregate.

## Further reading

- The 9-tier ladder/decay/plausibility-gate design doc (2026-08-31), the level-curve rescale/
  skill-score/peak-corroboration/tier-widening design doc (2026-09-06), and the narrative history
  across all four rework rounds (§4 and §7 of the app's original audit document) were all
  point-in-time planning/audit documents that have since been removed from the repo; this document
  reflects the current implementation directly.
- [xp-and-streaks.md](./xp-and-streaks.md) — how rank tier feeds into per-set XP, and how
  `computeRunXp` parallels it for running.
