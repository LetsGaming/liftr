# 0007. OpenRouteService as a narrow, opt-in exception to "no third party in the loop"

**Date:** 2026-09-08
**Status:** Accepted

## Context

Every feature Liftr has shipped so far is self-hosted or entirely offline: the server has made
zero outbound runtime requests to anything until now (see `docs/features.md`'s "no third party in
the loop" framing, and `docs/SECURITY.md`'s auth model, both written against that reality).

Planned routes (Strecken) need real road-snapped distance and elevation for a set of waypoints a
user places on a map. Nothing already in this app can produce that — there's no road network or
elevation data anywhere in Liftr's own database, and computing accurate elevation gain along an
arbitrary path requires a real routing/elevation service, not just great-circle math between
points. A straight-line distance between waypoints is trivial to compute locally, but it's a
materially different (and usually much shorter) number than the actual distance someone will
run, and it can't produce elevation gain at all.

OpenRouteService (ORS) was chosen because a single call returns both a road-snapped geometry and
elevation for that geometry — one round trip covers both numbers this feature needs, rather than
requiring two separate integrations.

## Decision

Allow this one feature to make an outbound HTTP call to OpenRouteService, scoped as narrowly as
possible:

- Only planned-route creation, update (when waypoints change), and preview
  (`packages/server/src/routes/plannedRoutes.ts`, `services/plannedRouteService.ts`) call out —
  no other route or background job does.
- Only when `LIFTR_ORS_API_KEY` is set. Unset is not a degraded error state — it's the default,
  fully supported configuration: geometry falls back to a straight-line path between waypoints,
  `elevationGainM` is `null`, and `geometrySource` is reported as `"straight"` instead of `"ors"`
  so the client can be honest about which kind of number it's showing. The same graceful fallback
  applies if the key is set but the ORS call itself fails or times out (network error, rate limit,
  self-hosted instance down) — a routing hiccup degrades the numbers, it never fails the request.
- Self-hostable: `LIFTR_ORS_BASE_URL` (default `https://api.openrouteservice.org`) points at
  whichever ORS instance to call. Running your own ORS instance and pointing this at it removes
  the third party from this feature entirely, with no code change — see
  [environment-variables.md](../reference/environment-variables.md).

## Consequences

- Liftr is no longer accurately described as making zero outbound runtime requests,
  unconditionally — `docs/SECURITY.md` and `docs/features.md`'s "no third party in the loop" line
  now carry a footnote pointing here, and `README.md` carries the same asterisk.
- A self-hoster who wants zero third parties, full stop, gets that for free by leaving
  `LIFTR_ORS_API_KEY` unset — no feature is unusable without it, only the routing/elevation
  numbers are less precise (straight-line distance, no elevation).
- Waypoint coordinates leave the server whenever the key is set and a route is created, updated,
  or previewed. This is opt-in and disclosed (`docs/SECURITY.md`), and self-hosting ORS removes
  even that exposure.
- If OpenRouteService changes its terms, pricing, or availability, only this one feature is
  affected, and only for installs that opted in — the rest of the app has no dependency on it,
  unlike (for example) the run-import feature's deliberate rejection of a Strava API integration
  for exactly this kind of third-party fragility (see `docs/features.md`'s Running section).
