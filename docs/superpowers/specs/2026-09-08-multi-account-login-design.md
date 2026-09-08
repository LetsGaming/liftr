# Multi-account login — design

**Date:** 2026-09-08
**Status:** Approved (user directed autonomous continuation; design decisions below made per
established codebase conventions where not explicitly specified)

## Context

[ADR 0006](../../adr/0006-multi-user-hardening.md) scoped and shipped the schema/backend hardening
for multiple people sharing one Liftr instance (per-user `user_id` scoping everywhere, a `users`
table, `userContext.ts`'s `resolveCurrentUserId`) — but deliberately stopped short of real
per-person login: every request still resolves to one hardcoded `OWNER_USER_ID` constant, and the
whole API is gated by a single shared `LIFTR_TOKEN` bearer token pasted once into the client.

This spec is that follow-up: real accounts, real login, and an owner/member role split, replacing
the shared-token model entirely (pre-v1, no deployments — nothing to keep working alongside it).

## Decisions

- **Login:** username + password (Home Assistant's model), not PIN-only or passkeys.
- **Account creation:** the owner generates an invite code; a new person redeems it themselves
  (picks their own username/password) rather than the owner typing credentials for them.
- **Session transport:** a per-user bearer token, sent the same way `LIFTR_TOKEN` is sent today
  (`Authorization: Bearer <token>`) — not a cookie. This fits the PWA's existing offline-sync code,
  which already assumes an explicit header rather than an ambient cookie, and needs no CORS/
  SameSite changes.
- **Password hashing:** Node's built-in `crypto.scrypt`, not a new dependency — `packages/server/
  src/auth.ts` already has a `timingSafeEqual`-based constant-time comparison; this extends that
  same security posture rather than introducing a new library.
- **Tokens at rest:** session tokens are stored hashed (SHA-256), not plaintext — mirrors treating
  passwords the same way, and costs nothing extra (a hash lookup by indexed equality is exactly as
  fast as a plaintext one).
- **`LIFTR_TOKEN` is removed**, not kept as a fallback or dev bypass. Local dev goes through the
  same first-run owner setup as production; there is no second auth path to maintain.

## Data model

Three additions to `packages/db/src/schema.ts`:

```ts
export const users = sqliteTable("users", {
  id: id(),
  username: text("username").notNull(), // login handle, distinct from display `name`
  passwordHash: text("password_hash"),  // null until first-run setup / invite redemption completes
  name: text("name").notNull(),
  role: text("role", { enum: ["owner", "member"] }).notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_username_idx").on(t.username)]);

export const sessions = sqliteTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  createdAt: createdAt(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch('subsec') * 1000)`),
}, (t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash)]);

export const inviteCodes = sqliteTable("invite_codes", {
  id: id(),
  code: text("code").notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedByUserId: text("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("invite_codes_code_idx").on(t.code)]);
```

The seed migration's owner row gets `username: "owner"` and `passwordHash: null` — first boot after
this ships shows the owner a one-time "set your password" screen rather than a login form (see
Client below). Per `docs/CONTRIBUTING.md`'s "pre-v1, no legacy" policy, this is a fresh squashed
baseline migration regenerated from `schema.ts` (`pnpm db:generate`), not an incremental ALTER —
same approach ADR 0006 already established.

## Server

**`packages/server/src/auth.ts`** is rewritten: `requireAuth` no longer compares against
`env.token`. Instead it reads the bearer token, SHA-256-hashes it, looks it up in `sessions`
joined to `users`, and on a hit sets `request.userId`/`request.role` directly (touching `sessions.
lastUsedAt`) or 401s on a miss. This *replaces* `userContext.ts`'s hook entirely rather than
running alongside it — one hook does authentication and identity resolution together, since they're
now the same lookup. `userContext.ts` and its `resolveCurrentUserId` constant are deleted.

**New routes**, `packages/server/src/routes/auth.ts`:
- `GET /api/auth/status` → `{ needsSetup: boolean }` — true only when the owner has no
  `passwordHash` yet (fresh install). Unauthenticated (has to be, to bootstrap).
- `POST /api/auth/setup` `{ password }` — only succeeds while `needsSetup` is true; sets the
  owner's password, creates a session, returns the token. Unauthenticated.
- `POST /api/auth/login` `{ username, password }` — verifies via `scrypt` + `timingSafeEqual`,
  creates a session, returns the token. Unauthenticated.
- `POST /api/auth/logout` — deletes the current session row. Authenticated.
- `POST /api/auth/register` `{ code, username, password }` — validates the invite code (exists,
  unexpired, unused), creates a `role: "member"` user, marks the code used, creates a session,
  returns the token. Unauthenticated (the code itself is the credential to redeem).
- `GET /api/auth/me` → `{ id, username, name, role }`. Authenticated.

**New owner-only routes**, `packages/server/src/routes/members.ts`, gated by a small
`requireOwner` helper (checks `request.role === "owner"`, 403 otherwise):
- `POST /api/members/invite` → generates an 8-character code (uppercase letters + digits, excluding
  the visually ambiguous `0/O/1/I`), 24h expiry, returns `{ code, expiresAt }`.
- `GET /api/members` → list of `{ id, username, name, role, createdAt }`.
- `DELETE /api/members/:id` → removes a member (cascades their data per the existing per-user FK
  `onDelete: "cascade"` — no new cleanup logic needed); refuses to delete the owner or oneself.

`packages/server/src/env.ts`: `token`/`LIFTR_TOKEN` and its production-required check are removed.

## Client

**`packages/client/src/components/ui/AuthGate.vue`** already does exactly the right job — it
blocks the app on a 401 and prompts before rendering the `<slot>` — so it's rewritten in place
rather than replaced: on mount it calls `/api/auth/status` instead of `/api/health`, and renders
one of three states: **setup** (`needsSetup: true` — password field only, becomes the owner),
**join** (the URL has an `?invite=<code>` query param — username + password fields, redeems the
code), or **login** (default — username + password). All three call their respective endpoint and
`setToken()` the same way the current single-token flow already does — no change to `getToken`/
`setToken` or to `lib/api.ts`'s request wrapper.

**Settings**: a new "Mitglieder" section, rendered only when `GET /api/auth/me`'s `role` is
`"owner"` (fetched once and cached the same way other settings are). Lets the owner generate an
invite link (`<app-origin>?invite=<code>`, shown with a copy button) and lists/removes members.
A "Log out" action (calls `/api/auth/logout`, then clears the local token) is added for every
role, not just owner-only.

## Validation rules

- **Username:** 3-24 characters, lowercase letters/digits/hyphen (`^[a-z0-9-]{3,24}$`), normalized
  to lowercase before storage/comparison. Matches the existing `EXERCISE_SLUG_PATTERN` convention
  in `@liftr/shared` for "constrained identifier" fields.
- **Password:** 8 characters minimum, no other complexity rule — length is the meaningful defense
  against the realistic threat here (a shared homelab instance), and composition rules mostly push
  people toward predictable substitutions.
- **Invite code:** exactly 8 characters as specified above, case-insensitive on redemption.

## Test impact

`tests/server/helpers/testApp.ts`'s `createTestApp()` currently returns a bare `configureApp()`
instance with no auth wired at all (route tests call `app.inject` directly, with no Authorization
header, and previously got a free ride because `userContext.ts`'s hook set `request.userId` to a
hardcoded constant regardless of the request). Once the merged auth hook requires a real session,
every existing route test would 401. Fix: `createTestApp()` seeds a session row for the test
owner user (`insertTestUser`-style helper, already used elsewhere) and returns a wrapped `app`
whose `.inject` merges in that session's `Authorization` header by default when the caller didn't
supply one — a test that wants to exercise a *different* user, or an unauthenticated/wrong-role
case, still can by passing its own header explicitly. This keeps the ~40 existing route test files
working unchanged while making the auth path genuinely real rather than bypassed.

New test coverage: `packages/server/src/auth.ts`'s scrypt hash/verify round-trip; session
create/lookup/expiry-of-use (repository-level); route tests for setup/login/logout/register/me and
the owner-only member routes (including the 403-for-non-owner and can't-delete-self/owner cases);
a client `AuthGate.test.ts` covering all three states (setup/join/login) plus the existing
already-authenticated pass-through case.

## Out of scope

- Password reset / "forgot password" flow (a household member locked out asks the owner to remove
  and re-invite them — acceptable friction at this scale).
- Session expiry by time (sessions last until explicitly logged out) — revocation exists (logout,
  member removal cascades their sessions) but there's no idle/absolute timeout in this pass.
- Any UI/behavior change to what a member can or can't see of another member's data — the existing
  "shared catalog, per-user everything else, fully private" model from ADR 0006 is unchanged; owner
  gets no oversight capability over member workout data.
