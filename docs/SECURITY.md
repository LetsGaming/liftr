# Security

Liftr's security posture is scoped to what it actually is today: a self-hosted tracker meant to
sit behind your own reverse proxy on your own network, currently with one shared identity for
every request. This document describes what's actually implemented, not an aspirational threat
model.

## Auth model

There are no per-person accounts and no sessions yet. Access is gated by a single bearer token,
`LIFTR_TOKEN`, checked on every `/api/*` request (`packages/server/src/app.ts`'s `onRequest`
hook calls `requireAuth`, `packages/server/src/auth.ts`), and every authenticated request
resolves to the same owner identity (`packages/server/src/userContext.ts`). The schema and every
repository/service/route are already scoped by `user_id` in preparation for real per-person login
(see [ADR 0006](adr/0006-multi-user-hardening.md)) — but that scoping has nothing to differentiate
yet, since only one identity currently exists.

- The token is compared with `crypto.timingSafeEqual`, not `!==` — a plain string comparison
  exits as soon as one byte differs, so a closer-matching guess takes measurably longer to reject,
  leaking information through timing. `timingSafeEqual` compares in constant time instead. It
  requires equal-length buffers, so a length check has to run first; that check isn't
  constant-time, but it only leaks the token's *length*, not any byte of its content.
- If `LIFTR_TOKEN` is unset, auth is skipped entirely — this is the local-dev default.
  `packages/server/src/env.ts` refuses to start in production (`NODE_ENV=production`) without a
  token set, specifically so "the homelab reverse proxy is my auth" can't happen by accident.
- This is deliberately minimal: the design bet (`auth.ts`'s own doc comment) is that the reverse
  proxy in front of Liftr is the outer perimeter, and the bearer token exists "just enough to stop
  an open LAN port being an open API" — not to defend against a hostile network. If you're
  exposing Liftr beyond your own trusted network, put real auth (e.g. your reverse proxy's own
  access control, a VPN) in front of it rather than relying on the token alone.

## CORS

`packages/server/src/app.ts` registers `@fastify/cors` with `origin: env.allowedOrigins ?? true`.
Unset (`LIFTR_ALLOWED_ORIGINS`, the default), CORS reflects any origin. `env.ts`'s own comment
explains why that's an acceptable default rather than an oversight: auth here is a bearer token
sent in a header, not a cookie, so a malicious page gaining CORS "permission" to call the API
still can't read the token out of another origin's `localStorage` — cookie-based auth would make
an open CORS policy a real CSRF risk, but a header-based token doesn't have that failure mode the
same way.

Set `LIFTR_ALLOWED_ORIGINS` (a comma-separated allow-list, e.g.
`https://liftr.example.com,capacitor://localhost`) once the server is reachable beyond the
reverse proxy's own trusted network, to lock CORS down to known origins for real.

## File upload handling

Run imports (GPX/FIT) come in via `@fastify/multipart`, registered in `app.ts` with a blanket
`limits: { fileSize: 20 * 1024 * 1024 }` (20MB) — generous headroom for what are normally small
text/binary route files, and a hard ceiling on the size of any uploaded body regardless of route.

Format validation (`packages/server/src/services/runImportService.ts`, `importRunFile`) is by
filename extension (`.gpx` / `.fit`) — anything else is rejected as
`UnsupportedFileFormatError` before parsing. The actual GPX/FIT parsers
(`packages/server/src/gpx.ts`, `packages/server/src/fit.ts`) are the real content-validation
boundary: malformed content throws `RunParseError`, which the route handler
(`packages/server/src/routes/runs.ts`) maps to a `400` rather than a `500` or an unhandled crash.
There's no separate magic-byte/MIME sniff ahead of the parser — the parser itself is what decides
whether the bytes are a valid file. This is proportionate for a single-user, self-hosted upload
path (you're importing your own workout files), not a multi-tenant file-ingestion service.

The `/api/export.zip` route (`packages/server/src/routes/export.ts`) is a read-only backup
export, not an upload path — see `packages/server/src/services/exportService.ts` for what it
includes.

## Outbound requests (OpenRouteService)

With `LIFTR_ORS_API_KEY` configured, planned-route creation/update/preview
(`packages/server/src/routes/plannedRoutes.ts`) sends every waypoint coordinate set to
OpenRouteService (`LIFTR_ORS_BASE_URL`, default `https://api.openrouteservice.org`) — or to a
self-hosted ORS instance, if `LIFTR_ORS_BASE_URL` points there instead — to resolve road-snapped
distance and elevation. This is the first outbound runtime request this server makes anywhere;
every other feature is either self-hosted or entirely offline (see
[docs/features.md](features.md)'s "PWA / offline" section, whose "no third party in the loop"
framing for self-hosting carries the same caveat as this section).

The key is opt-in: unset by default, and unset is a fully supported state (straight-line distance,
no elevation), not a degraded error path. Self-hosting your own ORS instance and pointing
`LIFTR_ORS_BASE_URL` at it removes the third party from this feature entirely. See
[ADR 0007](adr/0007-openrouteservice-external-routing-exception.md) for the full reasoning, and
[environment-variables.md](reference/environment-variables.md) for all three `LIFTR_ORS_*`
variables.

## Where secrets live

- `LIFTR_TOKEN` — the API bearer token (see above). Set as an environment variable on whatever
  host runs the server; never committed.
- `LIFTR_ORS_API_KEY` — the OpenRouteService API key (see above), if configured. Same handling as
  `LIFTR_TOKEN`: environment variable only, never committed.
- Android release-signing secrets (the release keystore and its passwords, used by
  `.github/workflows/release.yml`) — see
  [`docs/operations/android-release-signing.md`](operations/android-release-signing.md) for how
  those are generated, stored as GitHub Actions repo secrets, and rotated. Not duplicated here.

## Reporting a security issue

Liftr is a personal, self-hosted, single-maintainer project — there's no formal disclosure
program, bug bounty, or CVE process, and setting one up wouldn't match the size or shape of the
project. If you find a security issue, the practical options are:

- Open a GitHub issue (fine for anything that isn't immediately exploitable against a live
  deployment other than your own — since each install is self-hosted, most findings only affect
  the reporter's own instance).
- Or contact the maintainer directly if you'd rather not post details publicly first.

Either way is genuinely fine for a project this size — don't hold back a report waiting for a
process that doesn't exist here.
