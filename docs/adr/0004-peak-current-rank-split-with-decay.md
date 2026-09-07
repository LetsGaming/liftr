# 0004. Peak/current rank split with decay

**Date:** 2026-08-31 (rank engine v1/v2)
**Status:** Accepted

## Context

A single rank number is either too generous (it can rise on a fluke and never come back down,
which stops feeling earned) or too punishing (any dip in training frequency costs you a rank you
genuinely worked for, which kills motivation — the opposite of the app's stated purpose). Liftr's
one design rule is that the rank system is the retention mechanism, so both failure modes were
treated as real problems rather than edge cases.

## Decision

Split rank into two values per exercise: a **peak** (ratchet-only "best ever," never recomputed
retroactively — e.g. against today's bodyweight) and a **current** rank that can soften with
inactivity but is hard-floored at the bottom of the peak's own tier, so it can never fall further
than that. `computeCurrentBand` (`packages/shared/src/rank/decay.ts`) applies no decay for the
first 21 days since an exercise was last trained (`RANK_DECAY_GRACE_DAYS`), then decays linearly
toward the floor over the next 60 days (`RANK_DECAY_WINDOW_DAYS`).

Returning from a decayed state is a **buffed multi-session climb**, not an instant snap back to
peak (v1's original behavior) — `applySessionRecoveryGain` grants a gain per finished session
proportional to how far below peak the lifter currently sits, buffed up to 2.5x at the largest
gap and tapering to 1x (no buff) as current approaches peak. The buff is derived purely from the
current gap, not from any remembered "how decayed were you when this climb started" state, so
it's safe to call on every qualifying session without separate progress tracking.

## Consequences

- Ranks now need two stored values per exercise instead of one, plus a "days since last trained"
  computation to drive decay.
- A bodyweight fluctuation or a miscalibrated standard being corrected later can't take back a
  peak that was legitimately earned — only current, decay-softened rank moves.
- The instant-snap recovery from v1 was explicitly replaced because it gave "no re-climbing, no
  second grind" too cheaply; the buffed multi-session version still guarantees recovery happens
  faster than the original climb, just not instantly.
- `nextTargetAtOrdinal` had to be added so next-target predictions stay consistent with a
  *decayed* current band rather than the freshly-resolved naive value.
