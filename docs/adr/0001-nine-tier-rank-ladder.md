# 0001. Nine-tier rank ladder with variable divisions

**Date:** 2026-08-31 (design), shipped through 2026-09-07
**Status:** Accepted

## Context

Liftr originally ranked every exercise on a 5-tier Bronze→Diamond ladder (`bronze`, `silver`,
`gold`, `platinum`, `diamond`), each split into a fixed III/II/I. In practice this made climbing
too fast and too flat: the bottom tiers were bunched close together, so a single first-ever
logged set could clear 3-4 tiers at once regardless of which exercise it was — nowhere near
"honest" progression, the app's stated design goal (see `README.md`'s "Why it's built this way").

A first pass (2026-08-31, "rank engine v2") expanded to 9 tiers — Initiate through Apex — with
more divisions at the bottom (originally 6/5/5/4/4/3/3/2/1, 33 bands) tapering to a single
division at Apex, so early rank-ups stay frequent while the top becomes a genuine milestone. A
later audit (2026-09-07, part of the XP/rank balancing redesign) found this still let a worked
example — Hammer Curl, 12.5kg×5 @ 52.5kg bodyweight — resolve to Athlete off one first-ever set,
so the division counts were tightened further to 5/4/4/3/3/3/2/2/1 (27 bands), combined with
`widenAnchorSpread` pushing each tier above the entry level proportionally further away on a log
scale (Athlete needs ~13% more real strength than before, Expert ~32% more).

## Decision

Replace the fixed 5-tier/3-division ladder with a 9-tier ladder (`initiate` → `apprentice` →
`trainee` → `athlete` → `lifter` → `advanced` → `elite` → `expert` → `apex`) where each tier has
its own division count, declining from 5 at the bottom to 1 at Apex. Tier/division pairs flatten
to a single ascending `ordinal` for comparison (`packages/shared/src/rank/tiers.ts`), since a
fixed-length array no longer works once division counts vary per tier. Standards data for the old
5 tiers is generated into 9 via `interpolateNineTierAnchors` (geometric mean for the 3 new
interior tiers, extrapolation for the two new ends) rather than hand-typing new floats per
exercise.

## Consequences

- Every place that stored or compared a `Tier` string had to migrate — including existing DB
  rows holding old 5-tier strings (`packages/db/drizzle/0010_remap_legacy_tier_strings.sql`),
  a gap the original migration didn't anticipate and had to be caught after the fact.
- `Division` becomes a plain `number` instead of a `1|2|3` union; all division-position math
  routes through the shared `ordinal`/`ordinalToBand` helpers instead of each caller
  (`decay.ts`, `aggregate.ts`) duplicating its own inversion logic.
- Climbing is now deliberately harder and slower, by design — this is a direct, traceable
  response to the "too easy to climb" complaint, not a default that crept in gradually.
- Two tuning knobs (division counts, `widenAnchorSpread`) now exist as the levers for future
  difficulty adjustments instead of hand-editing standards data per exercise.
