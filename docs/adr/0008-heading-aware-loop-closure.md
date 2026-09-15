# 0008. Heading-aware circular arc for closing a running loop

**Date:** 2026-09-15
**Status:** Accepted

## Context

"Schleife schließen" generated its return leg as a symmetric sine hump across the chord from the
route's end back to its start, bulging away from the centroid of all waypoints, with a fixed
fallback side whenever the centroid sat within 5% of the chord. A five-agent bug hunt
(`docs/reference/loop-findings.md`) found this failed on both of the commonest route shapes: every
2-waypoint out-and-back hit the fallback (the centroid of two points is on the chord by
definition, so tap order decided which side of a coastal path the return leg landed on), and
ordinary gently-bent routes flipped sides for a 10 m nudge of a mid-route waypoint, halving or
doubling the enclosed area. Separately and more fundamentally, the function never read
`waypoints[length-2]` at all, so it had no notion of the runner's approach direction — proven
structurally: two routes with final approaches 90° apart, identical start and end, produced
byte-identical arcs. The first generated point could sit 99° off the runner's heading, which ORS
can only reach by routing them backwards — the concrete mechanism behind "the loop function just
sends me backwards".

## Decision

Derive the approach heading from the last real segment of the path and use it for both the side
and the shape: the return leg is the arc of the unique circle through the route's end and start
that departs the end along that heading. Its excursion from the chord is `(chord/2)·tan(φ/2)` for
tangent–chord angle φ, clamped into a band that is a plain ratio of the chord below a 5 km knee
and a square root above it. Side selection cascades heading → centroid → a fixed,
tap-order-invariant compass convention, with no "is the signal strong enough" threshold — a sign
is ambiguous only at zero, where the two sides are mirror images. The public signature is
unchanged.

## Consequences

- Loops get bigger for routes ending away from the start — worst case ~2.8x the chord versus
  ~1.3x before — and that is the point, but it will surprise anyone used to the old, tighter
  bulge.
- `MAX_BULGE_RATIO = 1.0` is a deliberate trade and tightening it toward the old 0.35 re-breaks the
  roundabout continuation the redesign exists to fix.
- The return leg may now self-intersect the outbound path, which a lollipop-shaped loop
  legitimately does.
- `opts.bulgeRatio` now applies only to the no-heading case, and `0` now means zero rather than
  the old floor.
- Terrain and water are still invisible to the generator, and no amount of geometry fixes that —
  the Chiemsee and Lauterbrunnen cases from the findings report stand, which is why generated
  points remain ordinary editable waypoints and why a "flip the loop" affordance in the wizard is
  the outstanding real fix for the two-waypoint case.
- Sampling the arc adaptively (more points for a bigger sweep) was deliberately deferred because
  it spends the server's 50-waypoint budget the wizard is already rationing.
- The heading estimate itself is a single-chord approximation, not a true tangent — accurate for
  closely-spaced waypoints, increasingly approximate for sparse ones (a 3-tap, 60°-spaced
  synthetic roundabout test shows a measured ~69m ring deviation on a 40m circle); fitting a local
  curve through more points would improve this but was judged out of scope for this redesign.
