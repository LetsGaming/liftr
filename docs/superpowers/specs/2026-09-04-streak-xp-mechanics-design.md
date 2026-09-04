# Streak/XP Mechanics Redesign — Design Spec

**STATUS: SPEC ONLY, NOT YET IMPLEMENTED** (confirmed 2026-09-04, `audit/verify/agent-8.md`: `packages/shared/src/math/xp.ts` still has the pre-redesign formula; no `consistencyBonusXp`/`varietyBonusXp` code exists anywhere in the repo). This is a forward-looking design, not a false completion claim — ready for a `superpowers:writing-plans` pass, referenced from `docs/superpowers/plans/2026-09-03-workstream-b-finish-progress.md`'s deferred Task 7.

## Status

Design brainstormed and approved by the product owner 2026-09-04, via `superpowers:brainstorming`.
This is the design Workstream B's Task 7 (`docs/superpowers/plans/2026-09-03-workstream-b-finish-progress.md`)
deferred, and the item `audit/workplan-v1.md`'s consolidated open questions tracks as item 10
("Streak/XP mechanics framing"). Ready for `superpowers:writing-plans` once the product owner
reviews this file.

## Problem statement

Two distinct complaints drove this redesign, both from the product owner directly:

1. **No meaning.** Today's XP/Level system (`packages/shared/src/math/xp.ts`) is "just: oh, number
   go up. But there is no message behind that." The Finish Sequence shows a rolled-up total with no
   explanation of what earned it.
2. **Trivially gameable.** XP is `weightKg × reps × tierMultiplier × repeatDecay × plausibilityMultiplier`
   summed per set (`computeSetXp`/`computeTotalXp`). A user can type an arbitrary, unfabricated-looking
   weight (e.g. "500kg × 10") and inflate XP hugely in seconds. The existing plausibility gate
   (`packages/shared/src/rank/plausibility.ts`) discounts *pace*/*improbable-jump* anomalies, but a
   first-ever entry for a brand-new exercise has no history to jump from, so an absurd first weight
   isn't caught by "improbable jump" — decoupling XP from weight entirely, not tightening the
   plausibility gate further, is the actual fix (see "Anti-cheese properties" below).

**Explicit non-goal:** the 9-tier rank ladder (`packages/shared/src/rank/tiers.ts`), peak/current
split, and decay-with-recovery math are **not in scope** — the product owner explicitly kept these
as-is (`audit/workplan-v1.md` §0's "Decided 2026-09-03" note). This spec only touches XP/Level and
the streak's *consequences* (not the streak-computation mechanism itself, `packages/shared/src/streak/streak.ts`,
which stays exactly as it is — token-protected, unbroken by a normal rest day).

## Design goals (in the product owner's own words, paraphrased)

- XP should mean something specific — "a real meaning for it... linked to the rank system, but not
  bound to it." Rank measures raw strength-vs-standard; XP should measure something else.
- The audience is beginners building a ~3×/week habit, not veterans — tune for the first weeks/months,
  not a multi-year plateau.
- The in-the-moment reward (the existing `+XP` chip on every logged set) must stay **felt**, not
  shrink to a token amount — "if the number is too low, it starts to become meaningless as well."
- **Never punish specialization.** A user training only arms/shoulders (the product owner's own
  current split) must never see a lower number, an implied judgment, or anything that reads as "you
  should be doing more," than a user training everything.
- **Never claim to know something the app can't know.** An earlier draft of this design scored
  sessions against the app's own muscle-recovery *estimate* (`readinessService`) — rejected during
  brainstorming: recovery is genuinely individual and unmeasurable from workout data alone, and
  anchoring a reward to an estimate turns every estimation error into a felt injustice ("the app
  punished me for something I didn't do"). No component of this design may use a *modeled/estimated*
  physiological state as a scoring input — only plain, verifiable facts about what was logged.
- **Never feel like a chore.** No loss/penalty mechanic on XP or Level from a broken streak, no
  streak-loss notifications, no urgency copy ("don't lose your streak!") — consistent with the
  product owner's pre-existing stance against manipulative patterns (`audit/workplan-v1.md` §6).
- **Streak-reset must never be the optimal play.** Verified explicitly during brainstorming: a smooth,
  monotonically-increasing, diminishing-returns curve with no separate milestone/threshold bonus makes
  deliberately breaking and rebuilding a streak strictly worse than maintaining it, at every point.
  This property must be preserved by any future addition — see "Guardrail for future work" below.

## The design

XP has three additive sources, all summed into the same total/level the app already shows
(`computeLevel`, unchanged — level = `floor(sqrt(totalXp / 100))`).

### 1. Per-set XP (small-per-event, unchanged trigger, changed formula)

Fires on every logged set exactly as today (the existing `+XP` chip, `useXpChip.ts`, unchanged
UI/trigger). The formula changes by exactly one term:

```ts
// packages/shared/src/math/xp.ts — computeSetXp, current:
export function computeSetXp(weightKg, reps, tier, repeatOccurrence = 1, plausibilityMultiplier = 1) {
  const load = weightKg ?? BODYWEIGHT_NOMINAL_LOAD_KG; // <-- the fabricable term
  const multiplier = tier ? TIER_XP_MULTIPLIER[tier] : 1;
  return load * reps * multiplier * repeatSetMultiplier(repeatOccurrence) * plausibilityMultiplier;
}
```

**Change:** always use `BODYWEIGHT_NOMINAL_LOAD_KG` (already defined, already used for bodyweight
sets today) regardless of whether `weightKg` is present or what value it holds. Every other term is
untouched — `reps`, `tierMultiplier` (rank tier still makes per-set XP grow as the user's *actual,
server-verified* rank climbs — this is the "linked but not bound" connection to rank), the existing
repeat-decay (`repeatSetMultiplier`, already discourages grinding an identical set), and the existing
plausibility discount.

This is a one-line change to an existing, well-tested pure function — not a new formula shape. It
keeps the felt, familiar magnitude the product owner asked for (nominal load is already calibrated
to feel like a real set, since it's the same constant bodyweight sets already use) while removing
the one fabricable input.

**Anti-cheese property:** typing an absurd weight no longer does anything to XP. Reps still matter,
but inflating reps for a single set is a smaller, more visible lie than a weight number, and the
session-level bonuses below (which dominate total XP for a consistent user, see "Relative
magnitudes") are structurally un-fabricable regardless.

### 2. Session consistency bonus (once per finished workout)

```ts
consistencyBonus = CONSISTENCY_BASE + CONSISTENCY_SCALE * Math.sqrt(Math.min(streakDays, CONSISTENCY_STREAK_CAP))
```

- `streakDays` = the existing `computeStreak(...).streak` value (`packages/shared/src/streak/streak.ts`),
  **unchanged** — still token-protected, still doesn't break on a normal rest day for the user's
  stated `workoutsPerWeek`.
- `CONSISTENCY_STREAK_CAP`: sized for **several months** of 3×/week training (concretely: pick a value
  around 60-90 — roughly 5-7.5 months at 3 sessions/week — not a multi-year figure), so the beginner
  audience sees this term visibly climbing through their entire early habit-forming period before it
  plateaus, per "tune for weeks/months, not a veteran's plateau."
- `CONSISTENCY_BASE`: sized so day-1 (`streakDays = 1`) already feels like a real reward, not a
  placeholder — the whole point of "never a chore" is that showing up once already earns something
  meaningful, not that showing up 90 times unlocks meaning retroactively.
- **No milestone/badge/threshold bonus of any kind is part of this design.** This is what makes the
  curve monotonic and reset-proof (see "Streak-reset must never be the optimal play" above) — do not
  add one without re-reading the guardrail section below.

**Never-a-chore property:** the streak's own token-protection already means a normal rest day never
lowers `streakDays` at all. If a streak genuinely breaks (beyond the protection pool), the *next*
session's consistency bonus is simply smaller going forward — **no past XP or Level is ever reduced,
no notification fires, no "you lost your streak" moment exists.** The bonus is forward-looking only.

### 3. Session variety bonus (once per finished workout, additive-only)

```ts
varietyBonus = VARIETY_PER_MUSCLE * min(countNewMuscles, VARIETY_MAX_MUSCLES_PER_SESSION)
```

Where `countNewMuscles` = the number of distinct muscles (via `exerciseMuscles`, primary role only —
see "Open question 1" below) trained in *this* session that were **not** trained in the single
immediately-preceding finished session. This is a plain factual comparison between two real,
logged sessions — **not** a model of recovery state, readiness, or whether the muscle "needed" it.

**Why this satisfies "never punish specialization":** the comparison is always against the user's own
immediately-preceding session, never against a full-body checklist or an idealized split. A user who
trains only arms and shoulders, alternating biceps/triceps/shoulders session to session, earns this
bonus whenever their own rotation happens to differ from their own last session — exactly as often as
their real rotation naturally produces variety, with zero reference to legs, back, or any muscle
group they've chosen not to train. A user who happens to run the identical routine back-to-back
(the "time constraints" scenario raised during brainstorming) simply scores 0 on this term for that
one session — **not a penalty relative to some baseline, since this term is purely additive** (see
next paragraph) — just no extra topping that time, matching what genuinely happened.

**This term must be implemented as additive-only, never a multiplier or a subtractor.** The
consistency bonus alone must already be calibrated to feel complete on its own (per "never a chore"
and "never punish specialization") — variety is icing, never a required ingredient.

### 4. Finish Sequence must show the breakdown

This is not optional polish — it is the actual fix for "there is no message behind that." Showing a
bigger, better-reasoned total number without surfacing *why* would leave the original complaint
unaddressed. The Finish Sequence (`packages/client/src/components/workout/FinishSequence.vue`) must
render each source as a separate, named line, e.g.:

> +8 XP (Sätze) · +45 XP (6 Tage Serie) · +12 XP (Schultern zum ersten Mal seit letztem Training)

Exact copy/layout is an implementation-plan concern, not this spec's — but the requirement that all
three sources are independently visible, not pre-summed, is binding.

## Data model

Following the existing precedent set by `workouts.plausibilityMultiplier` (a nullable value computed
once at finish-time and frozen, not recomputed live) — because unlike per-set XP (a pure function of
already-immutable set data, safe to recompute from raw tables on every read, exactly as
`getXpSummary` does today), the consistency and variety bonuses each depend on *that session's*
temporal context (streak-as-of-that-date, the *previous* session's muscle set) which is expensive and
awkward to re-derive on every read. Add two nullable columns to `workouts`
(`packages/db/src/schema.ts`), computed once in the `finish_workout` sync handler
(`packages/server/src/services/syncService.ts`), alongside the existing `plausibilityMultiplier`
computation:

```ts
consistencyBonusXp: real("consistency_bonus_xp"),
varietyBonusXp: real("variety_bonus_xp"),
```

`getXpSummary` (`packages/server/src/services/xpService.ts`) becomes: `sum(per-set XP via the
one-line formula change above, over all non-warmup sets, exactly as today)` + `sum(workouts.consistencyBonusXp)`
+ `sum(workouts.varietyBonusXp)` across all finished workouts. This preserves the existing
"reconstructible from raw tables" property for the total — the two new columns are themselves
derived/frozen values, not additional source-of-truth state that could drift, in the same sense
`plausibilityMultiplier` already isn't a drift risk today.

## Anti-cheese properties (summary)

- **Per-set XP**: no longer scales with a fabricated weight. Reps can still be exaggerated per set,
  but this is now a small, visible, per-event lie rather than an unbounded multiplier — and it's
  still subject to the existing plausibility discount and repeat-decay.
- **Consistency bonus**: requires genuine, calendar-spread, plausibility-gated finished workouts —
  cannot be accelerated by logging faster or fabricating data within a single session. A monotonic,
  milestone-free curve makes streak-breaking-and-restarting strictly dominated (always worse) than
  maintaining the streak, closing the exploit the product owner specifically asked about.
- **Variety bonus**: capped per session, requires actually training different exercises/muscles
  (which requires real equipment/time), and is a small enough term that even maximizing it every
  session doesn't approach the consistency bonus's magnitude for an established habit.

## Relative magnitudes (for the implementation plan to size constants against)

Not exact numbers — those are an implementation-plan concern once real data/telemetry can validate
them — but the *ordering* is binding: for a consistent 3×/week user past their first month, the
**consistency bonus should be the largest single contributor** to session XP, per-set XP should be
the smallest, and variety bonus should sit clearly between "noticeable" and "not dominant." This
ordering is what makes the whole system resistant to the original "level 100 in minutes" complaint —
the dominant term is the one that's structurally impossible to fabricate.

## Guardrail for future work

**Any future addition of a streak milestone, badge, or threshold reward** (e.g. "🎉 7-day streak!")
**must be a one-time, lifetime-first-achievement award — never a reward that re-fires on every streak
instance that reaches the threshold.** A repeatable per-instance milestone reward is exactly the kind
of reward a smooth continuous curve avoids, and re-introduces the "deliberately reset to farm the
bonus" exploit the product owner flagged and this design closes. This constraint applies regardless
of who implements such a feature or how much later — it should be re-read before any milestone/badge
feature touches streaks or XP.

## Explicitly out of scope

- The 9-tier rank ladder, peak/current split, decay-with-recovery math — untouched, per the product
  owner's own "keep as-is" instruction (`audit/workplan-v1.md` §0).
- Any recovery/readiness modeling as a scoring input, anywhere — rejected during brainstorming, not
  merely deferred. If a future designer is tempted to reintroduce "reward training a muscle that
  needed it," re-read the "Never claim to know something the app can't know" goal above first.
- Exact numeric constants (`CONSISTENCY_BASE`, `CONSISTENCY_SCALE`, `CONSISTENCY_STREAK_CAP`,
  `VARIETY_PER_MUSCLE`, `VARIETY_MAX_MUSCLES_PER_SESSION`) — sized during implementation, bound only
  by the ordering constraint in "Relative magnitudes" and the audience/cap guidance in the
  consistency-bonus section.
- Finish Sequence exact copy/layout for the breakdown line — implementation-plan concern, the
  requirement is only that all three sources are independently visible.
- Any change to how streak protection tokens work — untouched.
- Migrating/backfilling `consistencyBonusXp`/`varietyBonusXp` for already-finished historical
  workouts — Liftr is pre-v1 with no real user data to preserve; a new column defaulting to null
  (read as 0 in the sum) for pre-existing rows is ordinary hygiene, not a migration concern, per this
  codebase's own established convention (see any prior nullable-column addition in this project's
  history for precedent).

## Open questions for implementation-planning time (not blocking this spec's approval)

1. **Primary-only vs. primary+secondary muscles for the variety count.** Using only `role: "primary"`
   from `exerciseMuscles` is the more conservative, less-gameable choice (an exercise's secondary
   muscles are a looser signal); using both would count variety more generously. Pick one when
   writing the implementation plan — this spec doesn't mandate either, since it doesn't affect any of
   the design properties above.
2. **What counts as "the immediately-preceding session"** when a user has multiple routines/exercise
   types (e.g. lifting and running, if Liftr's run-tracking ever feeds into this) — likely just "the
   immediately-preceding finished `workouts` row by `endedAt`," but confirm against real data shape
   at implementation time.
