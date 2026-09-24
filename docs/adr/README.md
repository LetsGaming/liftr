# Architecture Decision Records

An ADR is a short, dated write-up of one significant technical decision: what problem forced the
choice, what was decided, and what it costs. The point isn't ceremony — it's so that six months
from now, nobody has to reverse-engineer *why* the code looks the way it does from commit
messages alone, and nobody proposes "just add user accounts" without knowing that was already
weighed and rejected on purpose.

These are **retrospective**: written after the fact, documenting decisions Liftr already made and
shipped, sourced from the actual commit history and code comments rather than invented for the sake
of having ADRs. New decisions of comparable weight (anything that would be
painful or awkward to reverse later) should get a new one going forward.

## Format

Each ADR is a short file, `NNNN-title-in-kebab-case.md`, numbered sequentially. Terse — a
paragraph or two per section, not an essay:

```markdown
# NNNN. Title

**Date:** YYYY-MM-DD
**Status:** Accepted

## Context
What problem or constraint forced a decision here?

## Decision
What was decided, in a sentence or two.

## Consequences
What does this cost or foreclose? What does it buy?
```

## Index

| # | Title |
|---|---|
| [0001](0001-nine-tier-rank-ladder.md) | Nine-tier rank ladder with variable divisions |
| [0002](0002-single-bearer-token-auth.md) | Single bearer token instead of user accounts |
| [0003](0003-offline-first-outbox-sync.md) | Offline-first sync via an IndexedDB outbox queue |
| [0004](0004-peak-current-rank-split-with-decay.md) | Peak/current rank split with decay |
| [0005](0005-corroboration-required-for-peak.md) | Corroboration required before a result becomes peak |
| [0006](0006-multi-user-hardening.md) | Harden the schema and backend for multi-user, ahead of building it |
| [0007](0007-openrouteservice-external-routing-exception.md) | OpenRouteService as a narrow, opt-in exception to "no third party in the loop" |
| [0008](0008-heading-aware-loop-closure.md) | Heading-aware circular arc for closing a running loop |
| [0009](0009-street-aware-loop-closure-via-avoid-polygons.md) | Street-aware loop closure via OpenRouteService's `avoid_polygons`, no live-edit API traffic |
| [0010](0010-real-per-person-auth-and-sessions.md) | Real per-person accounts, password auth, and session management |
| [0011](0011-cardio-activity-registry-and-single-speed-ladders.md) | Cardio activity registry, with walking/hiking on a single-speed rank |
| [0012](0012-component-tiers.md) | Tier the client component tree: base -> patterns -> feature -> pages |
