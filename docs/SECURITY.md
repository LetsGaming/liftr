# Security

Liftr's security posture is scoped to what it actually is today: a self-hosted tracker meant to
sit behind your own reverse proxy on your own network, with real per-person accounts (an owner
plus any invited members) rather than one shared identity. This document describes what's
actually implemented, not an aspirational threat model. (The 2026-09-14 pentest audit and its
hardening implementation plan that this posture was originally verified against have since been
removed from the repo; this document reflects the current, post-hardening state directly.)

## Auth model

Every `/api/*` request (other than `/api/auth/{status,setup,login,register}`, which have to be
reachable before a session exists) carries a session bearer token, checked against the `sessions`
table (`packages/server/src/app.ts`'s `onRequest` hook calls `requireAuth`,
`packages/server/src/auth.ts`), resolving to a real per-person `userId`/`role` set on
`request.userId`/`request.role` for the rest of the request to use (this used to live in a
separate `userContext.ts` module; it's since been merged into `auth.ts`'s `requireAuth` — see
[ADR 0006](adr/0006-multi-user-hardening.md) for the schema/scoping groundwork this login system
was built on).

- **First-run setup**: `POST /api/auth/setup` sets the owner's password once
  (`GET /api/auth/status` reports `needsSetup` so the client knows whether to show setup or login).
  A second attempt after setup is done returns `409`.
- **Invite-based onboarding**: the owner generates a time-limited (24h) invite code
  (`POST /api/members/invite`, owner-only), which a new person redeems via
  `POST /api/auth/register` to create a `member`-role account. Redemption is a conditional DB
  update, safe under concurrent registration attempts against the same code
  (`packages/server/src/repositories/authRepository.ts`'s `redeemInviteCode`).
- **Passwords**: hashed with scrypt (`packages/server/src/lib/passwords.ts`), stored as
  `scrypt:N:r:p:salt:hash`, never plaintext. Minimum 8 characters, plus a small embedded
  common-password blocklist (`packages/server/src/lib/commonPasswords.ts`) rejecting trivially
  guessable passwords like `password1` or `aaaaaaaa` even when they meet the length floor.
- **Sessions**: a login/setup/register success issues a 32-byte random session token
  (Node's CSPRNG); only its SHA-256 hash is stored server-side (`packages/server/src/lib/
  sessionTokens.ts`), so reading the database doesn't hand out usable tokens. Logging out, or an
  owner removing a member, invalidates the token immediately — no stale-session window.
- **Session lifetime — idle window + absolute cap**: every session row carries two independent
  expiries (`packages/db/src/schema.ts`'s `sessions.expiresAt`/`absoluteExpiresAt`). `expiresAt` is
  a 30-day idle window that slides forward on every authenticated request
  (`authRepository.ts`'s `touchSession`), so a session in regular use never hits it.
  `absoluteExpiresAt` is a 90-day hard ceiling set once at creation and never renewed —
  `touchSession` clamps the sliding window so it can never push a session past this cap. This
  bounds how long a *stolen* token stays valid even under continuous active use by whoever stole
  it, which a purely-sliding expiry (the pre-hardening design) could not.
- **Session visibility and revocation**: `GET /api/auth/sessions` lists every active session for
  the current user (a coarse device label derived from the session's stored `User-Agent` — display
  only, never compared during auth, since a UA string is trivially spoofed by whoever already has
  the token), with `DELETE /api/auth/sessions/:id` (scoped to the caller's own sessions — another
  user's session id 404s) and `DELETE /api/auth/sessions` (revoke everything but the current
  session) alongside it. This is the "see and sign out other devices" UI a Discord/WhatsApp user
  would expect, and the previously-missing half of session hardening: revocation existed (logout,
  member removal) but nothing let a user see or kill a *specific other* session.
- **Credential changes auto-revoke other sessions**: `PATCH /api/auth/me/password` and
  `PATCH /api/auth/me/username` both call `deleteOtherSessionsForUser` on success, signing out
  every session but the one that made the change. A stolen token can therefore be evicted by
  changing the password/username from any still-trusted device, without needing to enumerate or
  individually revoke the attacker's session.
- **Rate limiting**: `/api/auth/{setup,login,register}` — the only *unauthenticated* routes an
  attacker can use to guess a credential or invite code — are all limited to 10 attempts per 15
  minutes via `@fastify/rate-limit`, but not all keyed the same way. `setup` and `login` are keyed
  on the request's `username` field (falling back to IP for a malformed body) rather than IP alone,
  since this app's documented reverse-proxy deployment (see
  [docker-deployment.md](operations/docker-deployment.md)) would otherwise collapse every real user
  behind one shared IP-based bucket. `register` is deliberately keyed on IP alone instead: an
  attacker guessing an invite code can pick a fresh throwaway username on every attempt, which
  would make a username-keyed bucket never actually engage for that route. The two password-gated
  PATCH routes above carry the same 10/15-minute budget, keyed on the authenticated `userId`
  instead (`lib/rateLimit.ts`'s `userRateLimit`) since there's no IP-collapse concern once a
  session already exists.
- **Username enumeration resistance**: a nonexistent username still pays the full scrypt cost
  against a dummy hash before returning `401`, so a wrong-password check and an unknown-username
  check take statistically indistinguishable time (`routes/auth.ts`'s `dummyPasswordHashPromise`).
  The credential-change routes don't need this: the caller is already authenticated, so there's no
  username to enumerate.
- This is still deliberately minimal for a homelab-scale app: the design bet is that the reverse
  proxy in front of Liftr is the outer perimeter, real per-person login is the inner gate, and
  neither replaces the other. If you're exposing Liftr beyond your own trusted network, put real
  auth (e.g. your reverse proxy's own access control, a VPN) in front of it too rather than relying
  on the login system alone.
- **Forgotten-password recovery**: there is still no email/SMTP anywhere in this app, so recovery
  is a host-side CLI, `pnpm reset-password -- --user <username> --password '<new password>'`
  (`packages/server/src/resetPassword.ts`), which hashes the new password and signs the user out
  everywhere. Host filesystem access to the server's SQLite file is the root of trust here — the
  same bargain as any other self-hosted admin task (`pnpm db:migrate`, editing `.env`). The owner
  account is deliberately excluded from both self-deletion routes (`DELETE /api/auth/me` and
  `DELETE /api/members/:id`) — this is unchanged by the CLI, which only ever resets a password,
  never deletes an account.

## CORS

`packages/server/src/app.ts` registers `@fastify/cors` with `origin: corsOrigin(env.allowedOrigins)`.
Unset (`LIFTR_ALLOWED_ORIGINS`, the default), CORS reflects any origin. `env.ts`'s own comment
explains why that's an acceptable default rather than an oversight: auth here is a session bearer
token sent in a header, not a cookie, so a malicious page gaining CORS "permission" to call the API
still can't read the token out of another origin's `localStorage` — cookie-based auth would make
an open CORS policy a real CSRF risk, but a header-based token doesn't have that failure mode the
same way. This calculus is re-flagged (not changed) in the pentest audit as a "should the default
flip to fail-closed now" product decision, since real per-person passwords raise the stakes of a
leaked token compared to the original single shared `LIFTR_TOKEN` — `LIFTR_ALLOWED_ORIGINS`
already exists and works when set.

Set `LIFTR_ALLOWED_ORIGINS` (a comma-separated allow-list, e.g. `https://liftr.example.com`) once
the server is reachable beyond the reverse proxy's own trusted network, to lock CORS down to known
origins for real. `corsOrigin` always appends the native app's own WebView origins
(`NATIVE_APP_ORIGINS` in `app.ts`: `https://localhost` and `capacitor://localhost`) on top of
whatever you list — those are the Capacitor app itself, not your deployment domain, so don't add
them by hand and don't worry that a locked-down allow-list will lock the app out.

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
includes. Its CSV output (`packages/server/src/csv.ts`) escapes a leading `=`, `+`, `-`, or `@`
with a `'` prefix to prevent formula/DDE injection when a note field is opened in a spreadsheet
app.

## Request limits and error handling

- `Fastify({ bodyLimit: 1_048_576, ... })` caps every request body at 1MB (Fastify's own default,
  made explicit); free-text fields (`routine.name`, `workouts.notes`, `sets.notes`) additionally
  cap at 500 characters via their Zod schemas, so an oversized request cleanly `400`s/`413`s
  instead of surfacing as a bare `500`.
- Every response carries security headers via `@fastify/helmet` (`X-Content-Type-Options`,
  `X-Frame-Options`, `Strict-Transport-Security` over HTTPS) — `contentSecurityPolicy` is left
  off since this server also serves the client PWA as static files and a hand-tuned CSP for that
  bundle is a separate, larger task.
- `/api/sync`'s per-item error handling logs unexpected exceptions server-side and returns a fixed
  `internal_error` string to the client, rather than the raw driver/constraint message — the same
  posture every other route's central error handler already had (see
  [http-api.md](reference/http-api.md#error-shapes)).

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

- Per-person passwords and session tokens (see [Auth model](#auth-model) above) — stored hashed in
  the SQLite database itself, not as environment/config secrets. There's no `LIFTR_TOKEN` or
  similar shared secret to manage anymore.
- `LIFTR_ORS_API_KEY` — the OpenRouteService API key (see above), if configured. Environment
  variable only, never committed.
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
