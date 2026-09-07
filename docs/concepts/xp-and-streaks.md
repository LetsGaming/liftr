# XP, levels, and streaks

Rank ([rank-engine.md](./rank-engine.md)) is the primary reward in Liftr. XP and levels are
**flavour on top of it, never a gate or a replacement** — the audit is explicit about this: "no
new reward currencies... don't add a third, fourth, fifth thing to track, deepen what exists."
Everything in this document computes client-side too (all of it lives in
`packages/shared/src/math/xp.ts` and `packages/shared/src/streak/streak.ts`, pure functions with
no DB access), specifically so it works with no round trip while offline.

## Per-set XP

`computeSetXp(weightKg, reps, tier, repeatOccurrence, plausibilityMultiplier)` in `xp.ts` computes
one set's XP. Three things worth knowing that aren't obvious from the signature:

**It no longer scales with the weight you typed.** Every set uses a nominal
`BODYWEIGHT_NOMINAL_LOAD_KG` (30) as its base load, regardless of what you actually lifted — XP
magnitude comes from `reps × tier multiplier × repeat-decay × plausibility`, not from load. The
`weightKg` parameter is still there and still matters, but only indirectly: see the anti-cheat
note below.

**It scales with the exercise's current rank tier** (`TIER_XP_MULTIPLIER`, 0.9× at Initiate up to
1.75× at Apex), so grinding light accessory work forever doesn't out-earn a lifter actually
climbing a demanding lift's tiers.

**It decays toward a floor, not to zero, on repetition.** `repeatSetMultiplier(occurrence)`
computes `1 / (1 + REPEAT_XP_DECAY_STEP * (occurrence - 1))`, floored at
`REPEAT_XP_FLOOR_MULTIPLIER` (0.5). Doing the exact same exercise/weight/reps combo repeatedly
still earns *something* — just progressively less — which nudges a lifter toward more weight or
more reps rather than punishing them for training the same exercise at all.

### The load-bucket anti-cheat

Since XP magnitude no longer depends on typed weight, a naive implementation would let someone
dodge `repeatSetMultiplier`'s decay forever by nudging the typed weight by a fraction of a kg
between otherwise-identical sets — each "new" weight would look like a first-ever occurrence.
`quantizeLoadForDecay` closes this by bucketing weight in **log space** (fixed-width bands in
`ln(weightKg)`, not a naive `weightKg / step`, which is a no-op — see the function's own comment
for why the naive version always collapses to the same constant). This gives a genuinely
load-proportional bucket width: 0.5kg is a big jump on a 10kg lift but negligible on a 200kg one.
The bucket only feeds the repeat-decay *occurrence key* in `computeTotalXp`, never the XP
magnitude itself.

### Summing a full history: `computeTotalXp`

`computeTotalXp(sets)` is the **single source of truth** for "how much XP has this person earned,
total" — it sorts sets chronologically, tracks per-`exerciseId|loadBucket|reps` occurrence counts,
and applies `computeSetXp` with the right occurrence number. `GET /api/xp` and anything else
computing a total must go through this rather than re-summing `computeSetXp` directly, or the
repeat-decay silently stops applying.

## Session-level bonuses

Two bonuses fire **once per finished workout**, computed in `syncService.ts`'s
`applyFinishWorkout` and frozen onto the `workouts` row (`consistencyBonusXp`/`varietyBonusXp`) —
same "freeze a derived value once at finish-time" convention `plausibilityMultiplier` already
established, rather than re-deriving it on every later read.

### Consistency bonus

`computeConsistencyBonus(streakDays)` = `CONSISTENCY_BASE + CONSISTENCY_SCALE * sqrt(min(streakDays,
CONSISTENCY_STREAK_CAP))`. `Math.sqrt` of a capped streak length is deliberate: it rises fast
early (day 1 already feels like a real reward) and flattens smoothly, **never dips**, and has no
threshold to "reset and re-farm" — this is what guarantees maintaining a streak is always at
least as good as breaking and rebuilding one. The cap (`CONSISTENCY_STREAK_CAP`, ~75 days) keeps
the term visibly climbing through a beginner's entire early habit-forming period rather than
plateauing over years.

Structurally un-fabricable by construction: it requires genuine, calendar-spread finished
workouts via the same token-protected `computeStreak` mechanism described below — there's no
separate "consistency counter" to fake independently of actually training.

### Variety bonus

`computeVarietyBonus(newMuscleCount)` = `VARIETY_PER_MUSCLE × min(newMuscleCount,
VARIETY_MAX_MUSCLES_PER_SESSION)`. `newMuscleCount` is a plain factual diff: primary-role muscles
trained *this* session that weren't trained in the immediately-preceding *finished* session
(computed in `syncService.ts` via `findPrimaryMuscleSlugsForWorkout`, comparing against
`findPreviousFinishedWorkout`). A user's first-ever finished session counts every trained muscle
as "new" since there's nothing to compare against yet.

This is additive-only by construction (`newMuscleCount` can never be negative), so it never reads
as a penalty, and it's a diff against the user's *own* prior session, never a full-body checklist
— it never punishes specialization. `syncService.ts` also returns the actual `newMuscleSlugs` list
(not just the count) so the client's finish sequence can name them ("Schultern zum ersten Mal seit
letztem Training") rather than showing a bare number.

## Level curve

`computeLevel(totalXp)` in `xp.ts`: `level = floor((totalXp / LEVEL_XP_SCALE) ^
LEVEL_CURVE_EXPONENT)`. This replaced an older `floor(sqrt(totalXp / 100))` curve, and the reason
why is a good illustration of how these systems can silently drift out of calibration: the old
curve was calibrated back when total XP was *only* the per-set sum. The 2026-09-04 streak/XP
redesign then stacked the two session-level bonuses above it (up to ~4000 XP combined per
session) **without rescaling the curve**, so a single first session (~4600 XP) blew straight past
level 6's threshold, and the curve ran away to level 69 by month 6.

`LEVEL_XP_SCALE` (4600) is sized to roughly one first session's total XP, which is what pins day 1
to exactly level 1. `LEVEL_CURVE_EXPONENT` (0.8) sits between 1.0 (a pure "one level per session"
line that never decelerates) and the old curve's implicit deceleration — early sessions still
grant close to a level each, then growth visibly slows. `xpAtLevel(level)` is the exact inverse,
exported as the single source of truth for "how much XP does level N require" rather than
re-deriving it at each call site. `computeLevel` re-establishes the defining invariant
(`xpAtLevel(level) <= xp < xpAtLevel(level + 1)`) via small correction loops after the initial
`Math.pow`-based guess, guarding against a floating-point round-trip landing a hair under an
integer level boundary. See the worked sizing table at the bottom of `xp.ts` for the full pacing
comparison against the old curve.

## Streaks and protection

`computeStreak(activityDates, now, workoutsPerWeek)` in `packages/shared/src/streak/streak.ts` is
computed **fresh from a set of activity dates on every read**, not incrementally maintained — so
it's always self-consistent with whatever's actually logged, with no separate counter that can
drift out of sync.

It walks backward day-by-day from today (or yesterday, if today has no activity yet — that's not
treated as a break, just "the day isn't over"), counting consecutive active days. A gap day
doesn't necessarily break the streak: it consumes one **protection token** from a pool instead,
as long as tokens remain.

### Where the pool size comes from

The pool isn't a flat constant. `tokenPoolFor(workoutsPerWeek)` derives it from the lifter's own
stated training frequency (an onboarding answer): the longest gap a stated frequency implies
within a week, plus one. A lifter who trains 2×/week has, by design, roughly 5 non-training days
a week — without this, a flat small pool exhausts mid-week and reports a "broken" streak for
someone perfectly on their own schedule. The pool is clamped between `DEFAULT_TOKEN_POOL` (2, the
fallback for anyone who hasn't answered the onboarding question) and `MAX_TOKEN_POOL` (6), so a
very low stated frequency doesn't inflate the pool to where "streak" stops meaning anything.

### Known simplification

The module's own header comment is upfront about this: protection is **a fresh pool per
computation**, not a true weekly-accrual bank ("1 token per week, max 2 banked" was the original
plan-level idea, never actually implemented that way). Every walk starts over with a full pool
rather than tracking token balance across time. Close enough in practice for "a missed day
doesn't wreck a streak" — flagged directly in the source rather than silently overclaiming
precision.

The backward walk is bounded by the single earliest logged activity date, so a lone logged day
doesn't burn through the whole protection pool walking into calendar history that predates the
app being used at all.

## How it all connects at finish time

`syncService.ts`'s `applyFinishWorkout` is where XP, streaks, and rank intersect for a single
finished workout, in this order:

1. `creditStreak` records today's date.
2. `computeStreak` (now reflecting the just-recorded date) feeds `computeConsistencyBonus` — the
   caller does **not** add +1 manually, since the streak function already sees today's credit.
3. `computeVarietyBonus` runs off a plain muscle-slug diff against the prior finished session.
4. The [plausibility gate](./rank-engine.md#the-plausibility-gate) is computed once for the whole
   session and its multiplier is passed into `computeSetXp` as `plausibilityMultiplier` — a
   badly-flagged session's XP is discounted the same way its rank contribution is, never zeroed
   outright (both floor at a nonzero value, `PLAUSIBILITY_FLOOR` in `plausibility.ts`).
5. Rank recompute runs once per exercise touched this session — see
   [rank-engine.md](./rank-engine.md) for what that does.

Notably, `computeStreak` is called with `item.payload.endedAt` as "now," not `new Date()` —
unlike the live `GET /api/streak` route — so a delayed or replayed sync flush computes the streak
the user actually earned on the day they finished the workout, not whatever day the batch
happened to reach the server.

## Further reading

- `docs/superpowers/specs/2026-09-04-streak-xp-mechanics-design.md` — the original consistency/
  variety bonus design.
- `docs/superpowers/specs/2026-09-06-xp-rank-balancing-design.md` §1 — the level-curve rescale
  rationale and worked before/after table.
- [rank-engine.md](./rank-engine.md) — the tier system that `TIER_XP_MULTIPLIER` reads from, and
  the plausibility gate whose multiplier flows into `computeSetXp`.
- [sync-and-offline.md](./sync-and-offline.md) — how a finished workout actually reaches the
  server (and why streak/XP computation happens inside that same sync handler).
