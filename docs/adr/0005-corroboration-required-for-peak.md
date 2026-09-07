# 0005. Corroboration required before a result becomes peak

**Date:** 2026-09-07
**Status:** Accepted

## Context

Even with the peak/current split (ADR 0004) protecting earned progress from decay, peak itself
was still vulnerable to a single outlier: one typo'd weight, one fluke rep, or unusually good form
on one specific day could permanently define a lifter's rank for that exercise, since `ratchetPeak`
previously accepted any result stronger than the stored peak the moment it was logged — including
an exercise's very first-ever set.

## Decision

`ratchetPeak` (`packages/shared/src/rank/tiers.ts`) now takes an `isCorroborated` flag. A result
only gets to become — or replace — the peak once it has been reached on a second, distinct
calendar day, not just as the single best-ever set. When `isCorroborated` is false, the function
returns the stored peak unchanged (which may be `null` if no peak is confirmed yet) — strictly a
delay, never a demotion. This applies even to an exercise's very first peak, not just later
promotions: a lucky first set doesn't get to define a lifter's rank any more than a lucky later
one gets to override an established peak.

Corroboration is computed statelessly in `rankService.ts`'s existing full-history loop — no new
DB columns — by re-scanning history for another day whose own resolved tier/division/LP band
meets or beats the candidate's. `tiers.ts` itself stays a pure comparison function and doesn't
know about "days" or set history.

The live/current rank shown before any peak is confirmed is unaffected — a first-ever set still
shows a real rank immediately, per `resolveRank`'s ordinary path. Only the decay-protected,
PR-adjacent "peak" value waits for confirmation.

## Consequences

- A new PR now visibly shows up as a rank *display* immediately but doesn't lock in as peak
  (and therefore doesn't get decay-protected) until repeated on a second day — a small UX
  nuance that has to be communicated correctly rather than looking like a bug ("why didn't my
  PR count").
- `rankService.ts` needed a second history scan per candidate peak to check corroboration,
  rather than a single pass — a real, accepted cost for correctness.
- This was shipped as part of the broader 2026-09-06/07 XP/rank balancing redesign alongside the
  tighter tier ladder (ADR 0001) and a reworked skill-score formula — together, the two changes
  are what fixed the reported "single first-ever set reaches Athlete" bug from two independent
  angles (tier spacing, and now peak eligibility).
