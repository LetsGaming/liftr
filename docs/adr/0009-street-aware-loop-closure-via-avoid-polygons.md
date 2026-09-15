# 0009. Street-aware loop closure via OpenRouteService's `avoid_polygons`, no live-edit API traffic

**Date:** 2026-09-15
**Status:** Accepted

## Context

ADR-0008 fixed the return-leg arc's *shape* (heading-derived, not a blind sine hump), but not its
blindness: `generateLoopWaypoints` (`packages/shared/src/math/loop.ts`) is deliberately pure,
synchronous, local-plane geometry with zero knowledge of real streets. Its own module doc says so.
The arc points it produces are sent to OpenRouteService (ORS, see ADR-0007) as via-points, and ORS
snaps them to the real road graph — but since the points are geometric guesses, ORS often has to
detour or backtrack to connect them, which is the residual complaint behind
`docs/reference/loop-findings.md`'s finding A6 ("the loop function just sends me backwards"):
heading-continuity narrowed the arc's error, but the arc is still placed blind, and the router
still has to reach it however it can.

Separately, the wizard fired an ORS-backed preview request
(`POST /api/planned-routes/preview`, `RouteWizard.vue`'s `schedulePreview`) on every single
waypoint add/move/remove and on every loop-toggle flip, debounced at 400ms. On a free-tier ORS key
this is a real rate-limit hazard, and it buys a line the user is frequently about to change anyway.

## Decision

**Street-aware closing leg.** A closed loop (waypoints ending within 25m of where they started) is
now routed as two ORS calls instead of one, only at actual save/preview-of-real-geometry time:

1. Route the outbound leg exactly as an ordinary route (unchanged from before this ADR).
2. Buffer the outbound leg's *returned, snapped* geometry (not the raw taps) into a corridor of
   rectangles (`packages/shared/src/math/corridor.ts`'s `buildAvoidCorridor`), and route the
   closing leg (last outbound point → first) with that corridor passed as ORS's
   `options.avoid_polygons`. The router — not blind arc geometry — now decides where the return
   streets are, and it's explicitly told not to just walk back the way it came. Generated (`gen`)
   arc points from `loop.ts` are excluded from what actually gets routed; they remain ordinary,
   persisted waypoints so the wizard's editable markers and offline line are unaffected.
3. If ORS rejects the closing leg with a 4xx while the corridor was applied (a dead-end street, the
   one bridge out of a valley), retry once without it before falling through to the existing
   straight-line degrade. Any other failure (network/timeout/5xx) degrades the *whole* route to
   straight-line immediately, same as before this ADR — `computeGeometry`'s contract is one honest
   `geometrySource` per result, never half-ORS-half-straight.

A single-call version (avoid the corridor for the whole route in one request) does not work:
`avoid_polygons` deletes graph edges before snapping, so the outbound waypoints themselves would
sit on deleted edges and fail to route. Two calls, only for loops, only when real geometry is
actually being computed, is the shape that routes at all.

**No network call while editing.** `RouteWizard.vue` no longer calls the preview endpoint from
`onAdd`/`onMove`/`onRemove`/the loop toggle. Every edit now only recomputes the local
straight-line/geometric-arc rendering that `RouteMapEditor.vue` already had as its fallback for
"ORS unavailable" — that fallback is now the permanent live-editing view. The real, avoidance-aware
ORS geometry is computed once, at Save (create/update), which already funnels through the server's
single `computeGeometry` convergence point. The one exception: seeding a brand-new route from an
already-recorded run's GPS track (`RunDetail.vue`'s "Als Strecke speichern") still fires one
one-time preview call — a real-data enrichment, not per-edit spam.

## Consequences

- A loop save/preview-of-real-geometry costs two ORS calls instead of one; a non-loop route is
  completely unaffected (one call, unchanged body). Total request volume still falls sharply
  overall, since the dominant source — one call per live waypoint edit — is gone entirely.
- Corridor width (30m default) and end-trim (120m default) are tuning constants with real failure
  modes at both extremes: too narrow and ORS can "avoid" the outbound street by using its own
  opposite sidewalk (the same street, the exact complaint this fixes); too wide and the
  retry-without-avoidance path becomes the normal path instead of a rare escape hatch.
- The saved `waypoints` column still contains `gen` arc points when a loop was closed with a real
  ORS key available — the routed geometry ignores them, so the map's markers and its drawn line can
  visibly disagree on a loop's shape. That is the intended trade: the markers stay editable/
  informative, the line is what the router actually found.
- While editing, the shown distance/line is always the local straight-line "≈" approximation, never
  a live-snapped one — a real UX regression traded deliberately for eliminating per-edit API
  traffic. A self-hosted ORS instance (see ADR-0007) has no rate-limit reason to want this trade
  and could get live previews back behind a future opt-in flag — not built now (YAGNI).
- Terrain/water blindness (loop-findings finding A5) is unchanged — the corridor only ever says
  "not here," never "there is land here." A loop can still legitimately route across open water if
  that's the only street-graph-connected way to close it.

See also: ADR-0007 (the ORS integration this extends), ADR-0008 (the arc geometry whose blindness
this works around rather than further refines).
