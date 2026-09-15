# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 5 actionable findings from the 2026-09-14 API security pentest — auth
rate-limiting/password-strength, CSV formula injection, sync error-message leakage, missing body
size limits, and missing security headers — without touching anything the audit found already
correct (BOLA, session handling, SQL/XSS injection, at-rest hashing all passed).

**Architecture:** Each fix is additive and localized to the file the finding named — no shared
new abstraction is needed across findings. Rate limiting uses `@fastify/rate-limit` (the standard
Fastify-ecosystem plugin, not a hand-rolled token bucket) scoped per-route via that plugin's
per-route `config.rateLimit` override, since only the three unauthenticated auth routes need it.
The common-password check is a small embedded array checked in the existing `passwordSchema`
Zod refinement — no new dependency, no network call. The sync error-message fix threads the
route's existing `req.log` into `applySyncBatch` as an optional parameter. CSV escaping and body
limits are single-function/single-line changes in existing files.

**Tech Stack:** Fastify 5, Zod 3, `fastify-type-provider-zod`, vitest, `@fastify/rate-limit`
(new), `@fastify/helmet` (new).

**Spec:** `audit/2026-09-14-security-pentest.md`

## Global Constraints

- `pnpm typecheck && pnpm lint && pnpm test` must stay green after every task.
- All UI-facing copy is German (CLAUDE.md) — not applicable here, this plan touches only
  `packages/server`, no client-facing strings change.
- Never hand-edit files under `packages/db/drizzle/` — no task in this plan touches the schema or
  migrations.
- Finding #6 (CORS default) and finding #7 (no password-rotation endpoint) from the audit are
  **intentionally not tasks in this plan** — #6 is a product decision (flip the CORS default to
  fail-closed) that needs an explicit go-ahead since it's a behavior change to how the client
  itself talks to the server, not a pure bug fix; #7 is a scope call (a full change-password flow)
  bigger than a hardening pass. Both are called out again at the end of this plan for a decision.

---

## Phase 1: Authentication hardening (finding #1 — High)

### Task 1: Reject common passwords at setup/register time

**Files:**
- Modify: `packages/server/src/routes/auth.ts`
- Create: `packages/server/src/lib/commonPasswords.ts`
- Test: `tests/server/lib/commonPasswords.test.ts`
- Test: `tests/server/routes/auth.test.ts` (extend existing file)

**Interfaces:**
- Produces: `isCommonPassword(password: string): boolean` from `lib/commonPasswords.ts`, consumed
  by `routes/auth.ts`'s `passwordSchema`.

- [ ] **Step 1: Write the failing test for the common-password list**

```typescript
// tests/server/lib/commonPasswords.test.ts
import { describe, expect, it } from "vitest";
import { isCommonPassword } from "~server/lib/commonPasswords.js";

describe("isCommonPassword", () => {
  it("flags well-known weak passwords, case-insensitively", () => {
    expect(isCommonPassword("password")).toBe(true);
    expect(isCommonPassword("Password")).toBe(true);
    expect(isCommonPassword("PASSWORD1")).toBe(true);
    expect(isCommonPassword("aaaaaaaa")).toBe(true);
    expect(isCommonPassword("12345678")).toBe(true);
    expect(isCommonPassword("qwertyui")).toBe(true);
  });

  it("does not flag a reasonably random password", () => {
    expect(isCommonPassword("Xk9$mQ2vLp7z")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/lib/commonPasswords.test.ts`
Expected: FAIL — `Cannot find module '~server/lib/commonPasswords.js'`

- [ ] **Step 3: Write `lib/commonPasswords.ts`**

```typescript
// packages/server/src/lib/commonPasswords.ts
/** A small, deliberately short list of the most-guessed passwords (top entries from public
 *  breach-frequency lists, plus keyboard-walk patterns and this app's own name) — not a
 *  comprehensive breach-corpus check (that would need an external API/large wordlist this
 *  self-hosted app has no business depending on), just enough to block the handful of guesses
 *  that would be tried first in any real attack. Matched case-insensitively so "Password1"
 *  doesn't sneak past "password1". */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "12345678", "123456789", "qwertyui", "qwerty123",
  "letmein1", "admin1234", "welcome1", "changeme", "aaaaaaaa", "11111111",
  "abc12345", "iloveyou", "liftrapp", "liftr123", "trustno1", "football",
  "baseball", "dragon12", "monkey12", "shadow12", "master12", "superman",
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/lib/commonPasswords.test.ts`
Expected: PASS

- [ ] **Step 5: Wire it into `passwordSchema`**

In `packages/server/src/routes/auth.ts`, add the import and change the schema:

```typescript
import { isCommonPassword } from "../lib/commonPasswords.js";
```

```typescript
const passwordSchema = z
  .string()
  .min(8, "at least 8 characters")
  .refine((pw) => !isCommonPassword(pw), { message: "too common, choose a different password" });
```

- [ ] **Step 6: Write the failing route-level test**

Add to `tests/server/routes/auth.test.ts` (inside the existing `describe("POST /api/auth/setup"`
block, matching the file's existing style — see the file's current owner-setup tests for the
`buildApp(db)` + `app.inject` pattern already used there):

```typescript
it("rejects a common password even when it meets the length minimum", async () => {
  const app = buildApp(db);
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    payload: { password: "aaaaaaaa" },
  });
  expect(res.statusCode).toBe(400);
});
```

- [ ] **Step 7: Run test to verify it fails, then passes**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/routes/auth.test.ts`
Expected: FAIL first (schema not yet wired if Step 5 was skipped), PASS after Step 5's edit is in
place.

- [ ] **Step 8: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/lib/commonPasswords.ts packages/server/src/routes/auth.ts tests/server/lib/commonPasswords.test.ts tests/server/routes/auth.test.ts
git commit -m "fix(server): reject common passwords at setup/login/register"
```

### Task 2: Rate-limit the auth endpoints

**Files:**
- Modify: `packages/server/package.json` (add `@fastify/rate-limit`)
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/routes/auth.ts`
- Test: `tests/server/routes/auth.test.ts` (extend)

**Interfaces:**
- Consumes: `@fastify/rate-limit`'s Fastify plugin API (`app.register(rateLimit, opts)`, and the
  per-route `config: { rateLimit: {...} }` override).
- Produces: `/api/auth/login`, `/api/auth/setup`, and `/api/auth/register` reject with `429` after
  10 requests per 15 minutes from the same IP.

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @liftr/server add @fastify/rate-limit`

- [ ] **Step 2: Write the failing test**

Add to `tests/server/routes/auth.test.ts`. This needs the plugin registered on the test app, so
extend the file's `buildApp` helper to also register `@fastify/rate-limit` with a tiny limit for
the test, or (simpler, matching how this file already builds a minimal app per describe block)
add a dedicated test-local app builder:

```typescript
import rateLimit from "@fastify/rate-limit";

// ...

describe("POST /api/auth/login rate limiting", () => {
  it("returns 429 after exceeding the attempt limit", async () => {
    const app = configureApp(Fastify({ logger: false }));
    await app.register(rateLimit, { global: false });
    registerAuthRoutes(app, db);
    await app.ready();

    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "owner", password: "wrong" },
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/routes/auth.test.ts`
Expected: FAIL — every attempt still returns `401`, none `429`, since the route has no
`config.rateLimit` yet (registering the plugin with `global: false` alone doesn't rate-limit
anything without an explicit per-route `config`).

- [ ] **Step 4: Register the plugin in `app.ts`**

In `packages/server/src/app.ts`, alongside the existing `cors`/`multipart` registration:

```typescript
import rateLimit from "@fastify/rate-limit";
```

```typescript
await app.register(cors, { origin: env.allowedOrigins ?? true });
await app.register(rateLimit, { global: false }); // opt-in per route below, not applied by default
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
```

- [ ] **Step 5: Add per-route limits in `routes/auth.ts`**

Add a shared config object and apply it to the three unauthenticated, credential-guessable routes:

```typescript
/** 10 attempts per 15 minutes per IP — generous enough that a real user fat-fingering their
 *  password a few times never gets blocked, tight enough to make scripted guessing impractical
 *  even parallelized across a handful of connections. Scoped to these three routes only: they're
 *  the ones an attacker can use to guess a credential (password or invite code); every other
 *  route already requires a valid session. */
const authRateLimit = { rateLimit: { max: 10, timeWindow: "15 minutes" } };
```

Add `config: authRateLimit` to each of the three route options objects:

```typescript
app.post(
  "/api/auth/setup",
  { config: authRateLimit, schema: { body: setupInput, response: { 200: tokenResponse, 409: errorResponse, 500: errorResponse } } },
  async (req, reply) => { /* unchanged */ },
);

app.post(
  "/api/auth/login",
  { config: authRateLimit, schema: { body: loginInput, response: { 200: tokenResponse, 401: errorResponse } } },
  async (req, reply) => { /* unchanged */ },
);

app.post(
  "/api/auth/register",
  { config: authRateLimit, schema: { body: registerInput, response: { 200: tokenResponse, 400: errorResponse, 409: errorResponse } } },
  async (req, reply) => { /* unchanged */ },
);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/routes/auth.test.ts`
Expected: PASS

- [ ] **Step 7: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green — check specifically that no *other* existing auth test now fails from
crossing the new limit (the existing tests each build a fresh `app`/`db` per test via `beforeEach`,
so a fresh rate-limit counter per test should already avoid this, but confirm).

- [ ] **Step 8: Commit**

```bash
git add packages/server/package.json packages/server/src/app.ts packages/server/src/routes/auth.ts tests/server/routes/auth.test.ts
git commit -m "fix(server): rate-limit auth endpoints against credential guessing"
```

---

## Phase 2: Information disclosure (findings #2, #3 — Medium, Low-Medium)

### Task 3: Neutralize CSV formula/DDE injection in exports

**Files:**
- Modify: `packages/server/src/csv.ts`
- Create: `tests/server/csv.test.ts`

**Interfaces:**
- Produces: `toCsv`'s existing signature is unchanged — only `escape()`'s internal behavior
  changes, so `exportService.ts` needs no edit.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/csv.test.ts
import { describe, expect, it } from "vitest";
import { toCsv } from "~server/csv.js";

describe("toCsv", () => {
  it("prefixes a leading-formula-character value with a single quote", () => {
    const csv = toCsv(["notes"], [['=HYPERLINK("http://evil.example")']]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toBe(`"'=HYPERLINK(""http://evil.example"")"`);
  });

  it("prefixes +, -, and @ leads the same way", () => {
    expect(toCsv(["n"], [["+1+1"]]).split("\r\n")[1]).toBe("'+1+1");
    expect(toCsv(["n"], [["-1-1"]]).split("\r\n")[1]).toBe("'-1-1");
    expect(toCsv(["n"], [["@SUM(1)"]]).split("\r\n")[1]).toBe("'@SUM(1)");
  });

  it("leaves an ordinary value untouched", () => {
    expect(toCsv(["n"], [["Bein Tag"]]).split("\r\n")[1]).toBe("Bein Tag");
  });

  it("still quotes a value containing a comma, independent of the formula prefix", () => {
    expect(toCsv(["n"], [["a,b"]]).split("\r\n")[1]).toBe('"a,b"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/csv.test.ts`
Expected: FAIL on the three formula-prefix cases (no `'` prefix yet).

- [ ] **Step 3: Fix `escape()` in `csv.ts`**

```typescript
/** RFC 4180-ish CSV encoding for the data export. CRLF line endings, quote
 * only fields that need it — keeps small exports readable when opened as plain text too. */
export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const escape = (v: string | number | boolean | null | undefined) => {
    if (v == null) return "";
    let s = String(v);
    // Formula/DDE injection: a spreadsheet app (Excel/Sheets/LibreOffice) treats a cell starting
    // with =, +, -, or @ as a formula to evaluate on open. A leading `'` forces text-literal
    // interpretation in every one of those apps without changing the visible value. Must run
    // before the quote-wrapping below so the prefix survives being wrapped in quotes.
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return lines.join("\r\n") + "\r\n";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/csv.test.ts`
Expected: PASS

- [ ] **Step 5: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green — spot-check that no existing export-service test asserted the old unescaped
behavior for a leading-`=`/`+`/`-`/`@` field (unlikely, since none of the seeded/test fixtures use
those, but confirm `tests/server/services/exportService.test.ts` if it exists still passes).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/csv.ts tests/server/csv.test.ts
git commit -m "fix(server): neutralize CSV formula/DDE injection in data export"
```

### Task 4: Stop leaking raw exception messages from `/api/sync`

**Files:**
- Modify: `packages/server/src/services/syncService.ts`
- Modify: `packages/server/src/routes/sync.ts`
- Test: `tests/server/services/syncService.test.ts` (extend)

**Interfaces:**
- Consumes: Fastify's `request.log` (a pino logger instance, already used elsewhere in the
  codebase via `request.log.warn`/`request.log.error` — see `app.ts`'s `onResponse` hook and
  central error handler for the existing pattern).
- Produces: `applySyncBatch(db, userId, items, logger?)` — `logger` is optional (defaults to a
  no-op) so every existing call site/test that doesn't pass one keeps compiling and behaving the
  same for the *expected*-error paths (`"unknown_workout_exercise"`, `"implausible_set"`, etc. are
  unaffected — this only changes the truly-unexpected-exception branch).

- [ ] **Step 1: Write the failing test**

Add to `tests/server/services/syncService.test.ts`, using the file's existing `startWorkoutItem()`
helper. `workouts.routineId` (`schema.ts:235`) has a foreign key against `routines.id` with no
pre-check in `applyStartWorkout` — a nonexistent `routineId` reaches the DB insert unvalidated and
throws a real foreign-key-constraint error, which is exactly the "genuinely unexpected exception"
path this fix targets:

```typescript
it("does not leak the raw exception message to the client on an unexpected error", async () => {
  const item = startWorkoutItem({
    clientId: "fk-violation",
    payload: {
      id: "workout-fk-violation",
      routineId: "not-a-real-routine-id",
      startedAt: new Date("2026-01-01T10:00:00Z"),
      exercises: [{ id: "we-fk-1", exerciseId, orderIndex: 0 }],
    },
  });
  const [result] = await applySyncBatch(db, OWNER_USER_ID, [item]);
  expect(result!.status).toBe("error");
  expect(result!.error).not.toMatch(/SQLITE|FOREIGN KEY|constraint/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/services/syncService.test.ts`
Expected: FAIL — `result.error` currently contains the raw driver message (something like
`FOREIGN KEY constraint failed`), which the `not.toMatch` assertion catches.

- [ ] **Step 3: Add the optional logger parameter and swap the leaked message**

In `packages/server/src/services/syncService.ts`:

```typescript
import type { FastifyBaseLogger } from "fastify";
```

```typescript
export async function applySyncBatch(
  db: LiftrDb,
  userId: string,
  items: SyncItem[],
  logger?: Pick<FastifyBaseLogger, "error">,
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const item of items) {
    try {
      results.push(await applySyncItem(db, userId, item));
    } catch (err) {
      logger?.error(err, "applySyncBatch: unexpected error applying sync item");
      results.push({ clientId: item.clientId, status: "error", error: "internal_error" });
    }
  }
  return results;
}
```

- [ ] **Step 4: Pass the route's logger through**

In `packages/server/src/routes/sync.ts`:

```typescript
app.post("/api/sync", { schema: { body: syncBody } }, async (req) => {
  const results = await applySyncBatch(db, req.userId, req.body.items, req.log);
  return { results };
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/services/syncService.test.ts`
Expected: PASS

- [ ] **Step 6: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/services/syncService.ts packages/server/src/routes/sync.ts tests/server/services/syncService.test.ts
git commit -m "fix(server): stop leaking raw exception messages from /api/sync"
```

---

## Phase 3: Defense-in-depth (findings #4, #5 — Low/Low-Medium)

### Task 5: Add a request body size limit and free-text field length caps

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/routes/routines.ts`
- Modify: `packages/server/src/routes/sync.ts`
- Modify: `packages/server/src/routes/workouts.ts`
- Test: `tests/server/routes/routines.test.ts` (extend)

**Interfaces:**
- Produces: `Fastify({ bodyLimit: 1_048_576, ... })` in `app.ts` — a 1MB default cap (Fastify's own
  documented default, made explicit rather than implicit); `routine.name`, `workouts.notes`, and
  `sets.notes` schemas each gain a `.max(500)` (generous for a genuinely typed note, far below
  anything that could bloat storage).

- [ ] **Step 1: Write the failing test**

Add to `tests/server/routes/routines.test.ts`, following the file's existing
`buildApp(db)`/`app.inject` pattern:

```typescript
it("rejects a routine name over the length cap with 400, not 500", async () => {
  const app = buildApp(db);
  const res = await app.inject({
    method: "POST",
    url: "/api/routines",
    payload: { name: "A".repeat(501), exerciseIds: [] },
  });
  expect(res.statusCode).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/routes/routines.test.ts`
Expected: FAIL — currently accepted (`201`).

- [ ] **Step 3: Add the explicit `bodyLimit` in `app.ts`**

```typescript
const app = configureApp(
  Fastify({
    logger: env.verboseLogging ? true : { level: "warn" },
    disableRequestLogging: !env.verboseLogging,
    bodyLimit: 1_048_576, // 1MB — Fastify's own default, made explicit rather than implicit so an
    // oversized request cleanly 413s instead of surfacing as a bare, unexplained 500.
  }),
);
```

- [ ] **Step 4: Add `.max(500)` to the free-text fields**

In `packages/server/src/routes/routines.ts`, find the routine-name schema (currently
`name: z.string().min(1)`, per the codebase's existing shape) and change it to:

```typescript
name: z.string().min(1).max(500),
```

In `packages/server/src/routes/sync.ts`, update `finishWorkoutPayload` and `logSetPayload`:

```typescript
const finishWorkoutPayload = z.object({
  workoutId: z.string(),
  endedAt: z.coerce.date(),
  pausedSeconds: z.number().int().min(0).default(0),
  notes: z.string().max(500).nullable().optional(),
});
```

```typescript
const logSetPayload = z.object({
  workoutExerciseId: z.string(),
  setIndex: z.number().int().min(0),
  weightKg: z.number().min(0).nullable(),
  reps: z.number().int().min(0),
  rpe: z.number().nullable().optional(),
  kind: z.enum(["normal", "warmup", "failure", "dropset"]).default("normal"),
  notes: z.string().max(500).nullable().optional(),
  loggedAt: z.coerce.date(),
});
```

In `packages/server/src/routes/workouts.ts`, update `patchWorkoutInput`:

```typescript
const patchWorkoutInput = z.object({
  endedAt: z.coerce.date().optional(),
  pausedSeconds: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/routes/routines.test.ts`
Expected: PASS

- [ ] **Step 6: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green — check no existing seed/fixture data in `scripts/seed-mock-data.ts` or test
fixtures uses a name/notes value over 500 characters (unlikely, but the seed script's own realistic
mock content is the one place worth a quick grep).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/routes/routines.ts packages/server/src/routes/sync.ts packages/server/src/routes/workouts.ts tests/server/routes/routines.test.ts
git commit -m "fix(server): cap request body size and free-text field lengths"
```

### Task 6: Add security response headers

**Files:**
- Modify: `packages/server/package.json` (add `@fastify/helmet`)
- Modify: `packages/server/src/app.ts`
- Test: `tests/server/app.test.ts` (create, or extend if a general app-level test file already
  exists — check first)

**Interfaces:**
- Produces: every response gains `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and
  (over HTTPS) `Strict-Transport-Security`. CSP is left at helmet's own conservative default rather
  than a hand-tuned policy — this is an API-only server (no HTML views to scope a CSP against
  except the static client build it also serves), so helmet's default is the correct minimal
  choice here, not a placeholder for later tuning.

- [ ] **Step 1: Check for an existing app-level test file**

Run: `ls tests/server/app.test.ts 2>/dev/null || echo "none"` — if one exists, extend it; if not,
create it fresh per Step 2 below.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/server/app.test.ts (new, or append to existing)
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import helmet from "@fastify/helmet";
import { configureApp } from "~server/app.js";

describe("security headers", () => {
  it("sets X-Content-Type-Options and X-Frame-Options on every response", async () => {
    const app = configureApp(Fastify({ logger: false }));
    await app.register(helmet);
    app.get("/test", async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/app.test.ts`
Expected: FAIL — `@fastify/helmet` isn't installed yet, so this errors on the import.

- [ ] **Step 4: Add the dependency and register it in `app.ts`**

Run: `pnpm --filter @liftr/server add @fastify/helmet`

In `packages/server/src/app.ts`:

```typescript
import helmet from "@fastify/helmet";
```

```typescript
await app.register(cors, { origin: env.allowedOrigins ?? true });
await app.register(helmet, {
  // This server also directly serves the built client PWA as static files (see the
  // clientDistRoot wiring below) — helmet's default CSP would block that app's own inline
  // styles/scripts if left at full strictness. contentSecurityPolicy: false here keeps the
  // scope of this task to the two headers the audit specifically flagged as missing
  // (X-Content-Type-Options, X-Frame-Options) plus HSTS; a hand-tuned CSP for the client bundle
  // is a separate, larger task if wanted later.
  contentSecurityPolicy: false,
});
await app.register(rateLimit, { global: false });
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/app.test.ts`
Expected: PASS

- [ ] **Step 6: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 7: Manual smoke check**

Per CLAUDE.md, start an isolated session and confirm the client PWA still loads/functions
normally with helmet active (its default headers shouldn't affect a same-origin static-file
serve, but confirm rather than assume):

```bash
node scripts/dev-up.mjs --id helmet-smoke-check
```

Open the dashboard URL it prints, confirm the app loads and login/dashboard render normally, then:

```bash
node scripts/dev-down.mjs --id helmet-smoke-check
```

- [ ] **Step 8: Commit**

```bash
git add packages/server/package.json packages/server/src/app.ts tests/server/app.test.ts
git commit -m "fix(server): add security response headers via @fastify/helmet"
```

---

## Deferred decisions (not tasks in this plan)

- **Finding #6 — CORS default.** Flipping `env.allowedOrigins`'s default from "reflect any origin"
  to "deny by default, require `LIFTR_ALLOWED_ORIGINS`" is a behavior change that could break an
  existing deployment's client if applied silently. Needs an explicit decision before it becomes a
  task — ask whether to make this change, and if so, whether it should be a hard default flip or a
  loud startup warning first.
- **Finding #7 — self-service password change/reset.** Out of scope for a hardening pass; track as
  a future feature if wanted (would need its own spec: whether "forgot password" makes sense at
  all for a homelab-scale app where the owner can already remove+re-invite a locked-out member).

## Post-plan verification

After all 6 tasks are merged, re-run the exact dynamic pentest checks from
`audit/2026-09-14-security-pentest.md` against a fresh `dev-up.mjs` session to confirm each finding
is actually closed live, not just covered by a unit test:
1. 20 rapid failed logins against a real username → expect `429` well before attempt 20.
2. `aaaaaaaa` as a setup password → expect `400`.
3. A workout note starting with `=` → export it, confirm the CSV cell starts with `'=`.
4. Force a `/api/sync` item into the unexpected-error path → confirm the response no longer
   contains a raw driver message.
5. A 2MB JSON POST body → expect `413`, not `500`.
6. `curl -i` any endpoint → confirm `x-content-type-options: nosniff` and `x-frame-options` are
   present.
