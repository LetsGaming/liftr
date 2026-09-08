# 0002. Single bearer token instead of user accounts

**Date:** initial build
**Status:** Accepted
**Superseded by:** [0006](0006-multi-user-hardening.md)'s revision of this decision's "single user,
forever" framing — the bearer-token mechanism itself is unchanged and still accurately described
below.

## Context

Liftr is explicitly a single-user, self-hosted app — no multi-tenancy, no social features, no
leaderboards (`audit/finished/liftr-audit.md` §1: "Single user, forever"). It's meant to run on a
home server or homelab box, reachable only through the owner's own reverse proxy. Building a real
accounts system — user table, password hashing, sessions, login UI, password reset — is real,
ongoing complexity that only pays for itself at multi-user scale, which is explicitly out of
scope forever.

But an open LAN port (or a proxy misconfiguration exposing it further) with zero auth is still an
unnecessary risk for what is, in effect, a personal API with someone's health/fitness data behind
it.

## Decision

Gate the whole API behind a single shared bearer token (`LIFTR_TOKEN`), checked in
`packages/server/src/auth.ts`. No accounts table, no sessions, no login flow. The check is skipped
entirely when `LIFTR_TOKEN` is unset (local dev). The comparison uses `timingSafeEqual` rather
than `!==`, since naive string comparison exits early on the first mismatched byte and leaks the
secret's length and prefix through response timing — the length check itself has to happen first
(a length mismatch can't be fed into `timingSafeEqual`, which requires equal-length buffers), but
that only leaks length, not any byte of the actual token.

## Consequences

- Deployment needs exactly one secret to manage (`LIFTR_TOKEN`), stored in the client as a
  token the owner pastes into Settings, not a username/password pair.
- The reverse proxy is treated as the real outer perimeter; this token is "enough to stop an open
  LAN port being an open API," per the code's own comment — not a substitute for network-level
  security.
- Any future multi-user pivot would require a genuinely new auth layer, not an extension of this
  one.
