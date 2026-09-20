# 0010. Real per-person accounts, password auth, and session management

**Date:** documents behavior shipped across v1.0.0–v1.3.5 (initial release 2026-09-16 through the
session/account hardening that followed)
**Status:** Accepted
**Supersedes:** [0006](0006-multi-user-hardening.md)'s schema/backend groundwork — this is the
system that groundwork was preparing for

## Context

0006 hardened the schema and threaded `userId` scoping through the whole backend, but explicitly
did **not** add login, passwords, or per-user tokens — every request still resolved to one constant
`OWNER_USER_ID`, and `LIFTR_TOKEN` (0002) still gated the whole API as a single shared secret. That
was deliberate prep work done before any real deployment existed, not the multi-user system itself.

Real per-person accounts — an owner set up on first launch, who can invite other people, each
logging in with their own username/password — shipped starting with the v1.0.0 initial release and
was progressively hardened through v1.3.5: session revocation/listing, credential-change
auto-revocation, rate limiting, and username-enumeration resistance were added incrementally rather
than all at once. No ADR captured the resulting design; it existed only in `docs/SECURITY.md` and
`docs/reference/http-api.md#auth`. This ADR fills that gap, retrospectively, now that the system has
settled.

## Decision

Replace the single shared `LIFTR_TOKEN` entirely with real per-person accounts, password auth, and
server-side sessions, built on 0006's `users` table:

- **Accounts:** `users` gained `username`/`password_hash` columns; `role` is `owner | member`. The
  owner is provisioned on first launch (`POST /api/auth/setup`); an owner generates 8-character,
  24-hour, single-use invite codes for onboarding members (`POST /api/members/invite` /
  `POST /api/auth/register`), redemption enforced race-free via a conditional UPDATE.
- **Passwords:** scrypt hashing (`packages/server/src/lib/passwords.ts`), stored in a
  self-describing `scrypt:N:r:p:salt:hash` format so future parameter tuning doesn't invalidate
  existing hashes. An 8-128 character length policy plus a common-password blocklist rejects
  trivially guessable passwords even when they clear the length floor. Comparison is timing-safe,
  and login/setup pay a dummy-hash cost on a nonexistent username so a wrong-password and an
  unknown-username response are statistically indistinguishable — resisting username enumeration by
  timing.
- **Sessions:** a new `sessions` table stores only the SHA-256 hash of a 32-byte CSPRNG bearer
  token, so reading the database doesn't hand out usable tokens. A session has a 30-day idle expiry
  that slides forward on every authenticated request, clamped to a 90-day absolute cap that a
  sliding renewal can never push past — bounding how long a stolen-but-actively-used token stays
  valid. Sessions carry a UA-derived device label for multi-device display purposes only, never
  compared during auth (a UA string is trivially spoofable). Users can list and revoke their own
  sessions individually or all-but-current.
- **Self-service account management:** changing password or username re-verifies the current
  password and revokes every other session on success (a stolen token can be evicted just by
  changing credentials); changing display name needs no re-verification. Members can self-delete
  their own account; the owner is deliberately excluded from self-deletion — there is no hand-off or
  self-delete path for the owner role in this system.

## Consequences

- `LIFTR_TOKEN` is gone. Deployment secrets move from "one token pasted into Settings" to
  "per-person passwords stored hashed in the database" — there's no shared secret to manage or
  rotate anymore, but there is a real password-reset problem: since there's no email/SMTP anywhere
  in this app, forgotten-password recovery is a host-side CLI
  (`pnpm reset-password -- --user <username> --password '<new password>'`), trusting host
  filesystem access the same way `pnpm db:migrate` or editing `.env` already do.
- Every 0006-prepared `userId` scoping point now resolves to a real, distinct identity per person
  instead of one constant — the groundwork paid off exactly as 0006 intended: only
  `resolveCurrentUserId` (since merged into `auth.ts`'s `requireAuth`) needed to change from
  "return a constant" to "read a verified session."
- The reverse proxy is still treated as the outer perimeter and this login system as the inner gate
  — neither replaces the other, and the same "not a substitute for network-level security" posture
  0002 established for the single-token design carries forward here, now backed by real per-person
  credentials instead of one shared secret.
- Rate limiting and the dummy-hash timing decoy are now load-bearing in a way they weren't under
  0002's single-token model: guessing a password or invite code is a real attack surface once
  usernames and passwords exist to guess, not just an open LAN port to gate.
