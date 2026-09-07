# Overview

This is the "why" document — what Liftr believes and why it's built the way it is. For *what it
does*, see [`docs/features.md`](features.md). For *where it's headed*, see
[`docs/ROADMAP.md`](ROADMAP.md). This document doesn't duplicate either — it's the design
philosophy that both of those sit on top of.

## The one design rule

> The rank system is the retention mechanism, and everything else exists to support logging sets
> fast enough that using it doesn't feel like a chore.

Every other decision in the app is downstream of this. The rank engine (nine tiers, divisions,
peak/current, Overall Rank) is the thing users are meant to actually care about coming back for.
The logging flow — a routine's next set already on screen with last time's weight and reps next to
the input, one or two taps to log — exists purely so that caring about the rank system doesn't
require fighting the app to feed it data. When a feature proposal doesn't clearly serve one of
those two things, it's out of scope by default, not a missing "nice to have."

## Honesty in progression

Progression only stays motivating if it's honest. A rank that goes up for reasons a user doesn't
understand, or that can be taken away for reasons outside their control, stops feeling like a game
and starts feeling like noise. Two concrete mechanisms enforce this:

**Peak vs. current.** Once a rank is reached, it's locked in as a lifter's peak
(`packages/shared/src/rank/decay.ts`) and the app never quietly takes it back — not for a
bodyweight fluctuation, not for a recalibrated standard. *Current* rank is a separate, softer
number: it decays toward the floor of the peak's own tier after a grace period of inactivity
(never below it — no progress is ever fully lost), and recovers with a buffed multi-session climb
once training resumes, rather than an instant snap back. The floor guarantee and the buffed
recovery both exist for the same reason: decay should read as "you've been away," never as
punishment severe enough to make someone stop checking the app altogether.

**Trust markers on estimated numbers.** Not every exercise has a directly-sourced strength
standard (barbell classics like squat/bench/deadlift do; most of the catalog doesn't).
`packages/shared/src/rank/defaultStandards.ts` tracks a `trust` tier per threshold —
`"real"` (a citable, sourced standard), `"derived"` (computed from a real standard via a
ratio to a related exercise), or `"synthetic"` (a ratio that isn't itself directly sourced). A
derived exercise is never treated as more trustworthy than the standard it was derived from — the
code's own rule is that trust only ever downgrades along a derivation chain, never upgrades. The
UI surfaces this directly: when an estimate is doing the guessing, it's marked with a small `≈`
instead of presenting a guess with the same confidence as a sourced number. Pretending precision
that isn't there is exactly the kind of thing that erodes trust in the rank system over time — so
the app doesn't do it, even where a plain number would look cleaner.

The tier ladder itself follows the same honesty principle in a different direction: divisions are
deliberately front-loaded (more of them at the bottom, tapering to a single division at Apex — see
`TIER_DIVISION_COUNT`'s doc comment in `tiers.ts`), so early rank-ups come often and the one
top-tier milestone stays a genuine, rare achievement rather than another grind — climbing is
supposed to get harder, not just take longer.

## Self-hosted, no accounts, offline-first

Liftr runs on hardware the user owns, keeps its data in a single SQLite file, and works offline as
an installable PWA. This isn't a technical constraint that happened to shape the product — it's
the point:

- **Privacy.** Workout and body data is personal. There's no reason a set logged in a home gym
  needs to leave that gym's network, sit in a third party's database, or feed an analytics
  pipeline. Self-hosting means the only copy of your data is the one you control.
- **No accounts, ever.** There's nothing to sign up for and nothing to lose access to. Auth is a
  single bearer token gating API access on a network you already trust (see
  [`docs/SECURITY.md`](SECURITY.md) for the actual mechanism) — not an identity system, because
  there's no multi-user problem to solve here.
- **No third parties in the loop.** Run imports read GPX/FIT files you already have from any
  watch or app — no Strava account or third-party API required to get your own data into your own
  tracker. Catalog images are mirrored at ingest time rather than hotlinked at runtime, so the app
  doesn't silently depend on an external service staying up.
- **Offline-first isn't a bonus feature.** A basement gym with zero signal is a normal place to
  train, so it has to be a normal place to log a set — the PWA queues writes locally and syncs
  once connectivity returns, rather than treating connectivity as a given.

Taken together: Liftr optimizes for being *yours* — your data, your server, your rank system that
doesn't answer to anyone else's roadmap. That stance is a filter on every future decision, not
just a launch-time pitch; see [`docs/ROADMAP.md`](ROADMAP.md) for how it plays out going forward.
