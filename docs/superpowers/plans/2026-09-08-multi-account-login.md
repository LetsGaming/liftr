# Multi-account login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Liftr's single shared `LIFTR_TOKEN` bearer auth with real per-person accounts —
username/password login, owner-generated invite codes, session tokens, and an owner/member role
split — on top of the already-shipped per-user data scoping from ADR 0006.

**Architecture:** A `sessions` table maps a hashed bearer token to a user row; one merged Fastify
`onRequest` hook replaces today's separate `requireAuth` + `userContext.ts` hook, looking the
token up once and setting `request.userId`/`request.role` from the real session. New `/api/auth/*`
routes (status, setup, login, logout, register, me) and owner-only `/api/members/*` routes
(invite, list, delete) sit alongside the existing route modules, registered the same way. The
client's existing `AuthGate.vue` (already the single blocking-on-401 entry point) is rewritten in
place to drive setup/login/join instead of a raw token paste.

**Tech Stack:** Node's built-in `crypto` (`scrypt`, `randomBytes`, `createHash`) — no new
dependency. Drizzle ORM / better-sqlite3 (existing). Fastify + Zod (existing). Vue 3 + Pinia
(existing).

**Spec:** `docs/superpowers/specs/2026-09-08-multi-account-login-design.md`

## Global Constraints

- Username: `^[a-z0-9-]{3,24}$`, normalized to lowercase before storage/comparison.
- Password: 8 characters minimum, no other complexity rule.
- Invite code: exactly 8 characters, uppercase letters + digits, excluding `0`, `O`, `1`, `I`;
  24-hour expiry; case-insensitive on redemption.
- Session tokens: `crypto.randomBytes(32).toString("hex")`, stored as their SHA-256 hex digest —
  never store or log a raw token server-side.
- Passwords: `crypto.scrypt` with a random 16-byte salt per password; stored as `salt:hash` hex,
  colon-joined; compared with `crypto.timingSafeEqual`.
- `LIFTR_TOKEN` / `env.token` is deleted, not kept as a fallback. No dev-mode auth bypass.
- Migrations are a single squashed baseline (`packages/db/drizzle/0000_initial_schema.sql`,
  regenerated via `pnpm db:generate` after every `schema.ts` change) — see ADR 0006 and
  `docs/CONTRIBUTING.md`'s "pre-v1, no legacy" policy. Never write an incremental ALTER migration.
- Comments follow this session's established style: explain the current, present-tense reason for
  something; never cite an internal process/plan/audit label as the justification.

---

### Task 1: Schema — users/sessions/invite_codes

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/drizzle/0000_initial_schema.sql` (regenerated, not hand-edited except the
  owner-seed `INSERT`, per existing convention at the top of that file)
- Test: `tests/db/schema.test.ts`
- Test: `tests/db/migrations.test.ts`

**Interfaces:**
- Produces: `users.username: string`, `users.passwordHash: string | null`; `sessions` table
  (`id`, `userId`, `tokenHash`, `createdAt`, `lastUsedAt`); `inviteCodes` table (`id`, `code`,
  `createdByUserId`, `expiresAt`, `usedByUserId`, `createdAt`); all exported from
  `packages/db/src/schema.ts` and re-exported via `packages/db/src/index.ts`'s existing
  `export * from "./schema.js"`.

- [ ] **Step 1: Add `username`/`passwordHash` to the `users` table and a unique index**

In `packages/db/src/schema.ts`, find the existing `users` table definition:

```ts
export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  role: text("role", { enum: ["owner", "member"] }).notNull(),
  createdAt: createdAt(),
});
```

Replace it with:

```ts
export const users = sqliteTable(
  "users",
  {
    id: id(),
    /** Login handle, distinct from `name` (the display name shown in the UI). Lowercase-only,
     *  enforced by the route layer's validation, not a DB-level CHECK. */
    username: text("username").notNull(),
    /** `salt:hash` hex, both scrypt-derived. Null until first-run setup (the owner) or invite
     *  redemption (a member) sets it — a user row can briefly exist without a usable password
     *  mid-invite-flow. */
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_username_idx").on(t.username)],
);
```

- [ ] **Step 2: Add the `sessions` table**

Directly below the `users` table definition in the same file, add:

```ts
export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 hex digest of the bearer token — the raw token is never stored, only ever held
     *  by the client and hashed on arrival to look this row up. */
    tokenHash: text("token_hash").notNull(),
    createdAt: createdAt(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash)],
);
```

- [ ] **Step 3: Add the `inviteCodes` table**

Directly below `sessions`, add:

```ts
export const inviteCodes = sqliteTable(
  "invite_codes",
  {
    id: id(),
    /** Stored uppercase; redemption normalizes the submitted code to uppercase before lookup. */
    code: text("code").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    /** Null until redeemed. A code is single-use: the register route checks this is null before
     *  accepting it, then sets it in the same operation that creates the new user. */
    usedByUserId: text("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invite_codes_code_idx").on(t.code)],
);
```

- [ ] **Step 4: Regenerate the squashed migration**

```bash
rm -rf packages/db/drizzle
mkdir -p packages/db/drizzle
cd packages/db && npx drizzle-kit generate --name initial_schema && cd ../..
```

Open the new `packages/db/drizzle/0000_initial_schema.sql`. Find the `CREATE TABLE \`users\`` block
and re-add the owner-seed `INSERT` immediately after it (drizzle-kit's generator does not carry
seed data — this is hand-added every time the baseline is regenerated, same as the existing
convention):

```sql
--> statement-breakpoint
INSERT INTO `users` (`id`, `username`, `name`, `role`, `created_at`) VALUES ('00000000-0000-4000-8000-000000000001', 'owner', 'Owner', 'owner', unixepoch('subsec') * 1000);
```

(`password_hash` is omitted from the column list, so it defaults to `NULL` — this is what makes
`GET /api/auth/status` report `needsSetup: true` on a fresh install.)

- [ ] **Step 5: Clear any stale local dev database**

The dev server's on-disk sqlite file (resolved relative to `process.cwd()` — check
`packages/server/src/env.ts`'s `dbPath` default and `path.resolve` against your actual shell's
cwd) holds the *previous* schema's migration history and will collide with the fresh baseline.
Delete it (and its `-shm`/`-wal` siblings) before running anything that opens it:

```bash
rm -f data/liftr.db data/liftr.db-shm data/liftr.db-wal
```

If unsure of the resolved path, run `node -e "console.log(require('path').resolve(process.cwd(), '../../data/liftr.db'))"` from `packages/server` first and delete that exact path instead.

- [ ] **Step 6: Write/update schema tests**

In `tests/db/schema.test.ts`, add (matching the file's existing style — read the file first for
the exact import list and `describe` structure already there):

```ts
it("enforces a unique username", async () => {
  await db.insert(users).values({ username: "alice", name: "Alice", role: "member" });
  await expect(
    db.insert(users).values({ username: "alice", name: "Alice Two", role: "member" }),
  ).rejects.toThrow();
});

it("cascades session deletion when the owning user is deleted", async () => {
  const [user] = await db.insert(users).values({ username: "bob", name: "Bob", role: "member" }).returning();
  await db.insert(sessions).values({ userId: user!.id, tokenHash: "abc" });
  await db.delete(users).where(eq(users.id, user!.id));
  const remaining = await db.query.sessions.findMany({ where: eq(sessions.userId, user!.id) });
  expect(remaining).toEqual([]);
});

it("sets usedByUserId to null (not deleting the invite row) when the redeeming user is deleted", async () => {
  const [member] = await db.insert(users).values({ username: "carol", name: "Carol", role: "member" }).returning();
  const [invite] = await db
    .insert(inviteCodes)
    .values({ code: "ABCD2345", createdByUserId: OWNER_USER_ID, expiresAt: new Date(Date.now() + 86_400_000), usedByUserId: member!.id })
    .returning();
  await db.delete(users).where(eq(users.id, member!.id));
  const row = await db.query.inviteCodes.findFirst({ where: eq(inviteCodes.id, invite!.id) });
  expect(row?.usedByUserId).toBeNull();
});
```

Add `sessions`, `inviteCodes`, `users` to the file's existing `@liftr/db` import if not already
present.

- [ ] **Step 7: Update the owner-seed migration test**

In `tests/db/migrations.test.ts`, find the test asserting exactly one owner user
(`toMatchObject({ id: OWNER_USER_ID, role: "owner" })` or similar) and extend the assertion to also
check `username: "owner"` and `passwordHash: null`.

- [ ] **Step 8: Run the db test suite**

```bash
pnpm vitest run tests/db
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle tests/db/schema.test.ts tests/db/migrations.test.ts
git commit -m "feat(db): add username/passwordHash, sessions, invite_codes tables"
```

---

### Task 2: Password hashing helper

**Files:**
- Create: `packages/server/src/lib/passwords.ts`
- Test: `tests/server/lib/passwords.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, stored: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/lib/passwords.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "~server/lib/passwords.js";

describe("hashPassword / verifyPassword", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt), even for the same password", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("stores the hash as salt:hash hex, colon-joined", async () => {
    const hash = await hashPassword("whatever");
    const parts = hash.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^[0-9a-f]+$/);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/server/lib/passwords.test.ts
```

Expected: FAIL — `~server/lib/passwords.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `packages/server/src/lib/passwords.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/** Hashes a password with a fresh random salt, returned as `salt:hash` hex. scrypt is Node's
 *  built-in memory-hard KDF — no external dependency needed for this. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Constant-time comparison against a stored `salt:hash` — `timingSafeEqual` requires equal-length
 *  buffers, so a malformed/foreign-length stored hash is treated as a mismatch rather than thrown. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/server/lib/passwords.test.ts
```

Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/lib/passwords.ts tests/server/lib/passwords.test.ts
git commit -m "feat(server): add scrypt-based password hashing helper"
```

---

### Task 3: Session token helper

**Files:**
- Create: `packages/server/src/lib/sessionTokens.ts`
- Test: `tests/server/lib/sessionTokens.test.ts`

**Interfaces:**
- Produces: `generateSessionToken(): string`, `hashSessionToken(token: string): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/lib/sessionTokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "~server/lib/sessionTokens.js";

describe("generateSessionToken", () => {
  it("returns a 64-character hex string (32 random bytes)", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different token on each call", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });
});

describe("hashSessionToken", () => {
  it("is deterministic for the same input", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("returns a 64-character hex string (SHA-256)", () => {
    expect(hashSessionToken("whatever")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashSessionToken("a")).not.toBe(hashSessionToken("b"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/server/lib/sessionTokens.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `packages/server/src/lib/sessionTokens.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

/** A fresh bearer token — 32 random bytes, hex-encoded. Handed to the client once at login/setup/
 *  register time and never stored server-side in this form (see `hashSessionToken`). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 of a bearer token, hex-encoded — this, not the raw token, is what `sessions.tokenHash`
 *  stores and what an incoming request's `Authorization` header is compared against. A plain hash
 *  (not scrypt) is fine here: the input space is already a full 256 bits of randomness, so there's
 *  no brute-force-a-weak-password concern the way there is for `passwords.ts`. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/server/lib/sessionTokens.test.ts
```

Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/lib/sessionTokens.ts tests/server/lib/sessionTokens.test.ts
git commit -m "feat(server): add session token generate/hash helpers"
```

---

### Task 4: Invite code generator

**Files:**
- Create: `packages/server/src/lib/inviteCode.ts`
- Test: `tests/server/lib/inviteCode.test.ts`

**Interfaces:**
- Produces: `generateInviteCode(): string` — 8 chars, uppercase letters + digits, excluding `0OI1`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/lib/inviteCode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateInviteCode } from "~server/lib/inviteCode.js";

describe("generateInviteCode", () => {
  it("returns an 8-character code", () => {
    expect(generateInviteCode()).toHaveLength(8);
  });

  it("only uses uppercase letters and digits, excluding 0/O/1/I", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateInviteCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("returns different codes across calls (not a fixed sequence)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/server/lib/inviteCode.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `packages/server/src/lib/inviteCode.ts`:

```ts
import { randomInt } from "node:crypto";

/** Excludes 0/O and 1/I — the pair each is easy to misread when copied by hand from one device
 *  to another, which is the realistic way an invite code travels in this app. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/server/lib/inviteCode.test.ts
```

Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/lib/inviteCode.ts tests/server/lib/inviteCode.test.ts
git commit -m "feat(server): add invite code generator"
```

---

### Task 5: Auth repository

**Files:**
- Create: `packages/server/src/repositories/authRepository.ts`
- Test: `tests/server/repositories/authRepository.test.ts`

**Interfaces:**
- Consumes: `users`, `sessions`, `inviteCodes` from `@liftr/db` (Task 1).
- Produces:
  - `findUserByUsername(db, username: string): Promise<UserRow | undefined>`
  - `findUserById(db, id: string): Promise<UserRow | undefined>`
  - `findOwnerUser(db): Promise<UserRow | undefined>`
  - `setUserPassword(db, userId: string, passwordHash: string): Promise<void>`
  - `insertUser(db, values: { username: string; name: string; role: "owner" | "member"; passwordHash: string }): Promise<UserRow>`
  - `listUsers(db): Promise<UserRow[]>`
  - `deleteUser(db, userId: string): Promise<void>`
  - `createSession(db, userId: string, tokenHash: string): Promise<void>`
  - `findSessionByTokenHash(db, tokenHash: string): Promise<{ userId: string; role: "owner" | "member" } | undefined>` (joined to `users`)
  - `touchSession(db, tokenHash: string): Promise<void>` (updates `lastUsedAt`)
  - `deleteSessionByTokenHash(db, tokenHash: string): Promise<void>`
  - `createInviteCode(db, values: { code: string; createdByUserId: string; expiresAt: Date }): Promise<void>`
  - `findValidInviteCode(db, code: string): Promise<{ id: string } | undefined>` (unexpired, unused)
  - `redeemInviteCode(db, id: string, usedByUserId: string): Promise<void>`
  - `UserRow` type: `{ id: string; username: string; passwordHash: string | null; name: string; role: "owner" | "member"; createdAt: Date }`

- [ ] **Step 1: Write the failing tests**

Create `tests/server/repositories/authRepository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import {
  createInviteCode,
  createSession,
  deleteSessionByTokenHash,
  deleteUser,
  findOwnerUser,
  findSessionByTokenHash,
  findUserByUsername,
  findUserById,
  findValidInviteCode,
  insertUser,
  listUsers,
  redeemInviteCode,
  setUserPassword,
  touchSession,
} from "~server/repositories/authRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("findOwnerUser", () => {
  it("returns the seeded owner", async () => {
    const owner = await findOwnerUser(db);
    expect(owner?.id).toBe(OWNER_USER_ID);
    expect(owner?.role).toBe("owner");
  });
});

describe("findUserByUsername / findUserById", () => {
  it("returns undefined for an unknown username", async () => {
    expect(await findUserByUsername(db, "nobody")).toBeUndefined();
  });

  it("finds a user by username after insertion", async () => {
    const created = await insertUser(db, { username: "alice", name: "Alice", role: "member", passwordHash: "x:y" });
    const found = await findUserByUsername(db, "alice");
    expect(found?.id).toBe(created.id);
    expect(await findUserById(db, created.id)).toMatchObject({ username: "alice" });
  });
});

describe("setUserPassword", () => {
  it("updates the passwordHash for an existing user", async () => {
    await setUserPassword(db, OWNER_USER_ID, "newsalt:newhash");
    const owner = await findUserById(db, OWNER_USER_ID);
    expect(owner?.passwordHash).toBe("newsalt:newhash");
  });
});

describe("listUsers / deleteUser", () => {
  it("lists every user, including the seeded owner", async () => {
    await insertUser(db, { username: "bob", name: "Bob", role: "member", passwordHash: "x:y" });
    const all = await listUsers(db);
    expect(all.map((u) => u.username).sort()).toEqual(["bob", "owner"]);
  });

  it("removes a user", async () => {
    const created = await insertUser(db, { username: "carol", name: "Carol", role: "member", passwordHash: "x:y" });
    await deleteUser(db, created.id);
    expect(await findUserById(db, created.id)).toBeUndefined();
  });
});

describe("sessions", () => {
  it("finds a session by token hash, joined to its user's role", async () => {
    await createSession(db, OWNER_USER_ID, "hash-1");
    const found = await findSessionByTokenHash(db, "hash-1");
    expect(found).toMatchObject({ userId: OWNER_USER_ID, role: "owner" });
  });

  it("returns undefined for an unknown token hash", async () => {
    expect(await findSessionByTokenHash(db, "does-not-exist")).toBeUndefined();
  });

  it("touchSession does not throw for an existing session", async () => {
    await createSession(db, OWNER_USER_ID, "hash-2");
    await expect(touchSession(db, "hash-2")).resolves.not.toThrow();
  });

  it("deleteSessionByTokenHash removes the session", async () => {
    await createSession(db, OWNER_USER_ID, "hash-3");
    await deleteSessionByTokenHash(db, "hash-3");
    expect(await findSessionByTokenHash(db, "hash-3")).toBeUndefined();
  });
});

describe("invite codes", () => {
  it("finds a valid (unexpired, unused) invite code", async () => {
    await createInviteCode(db, { code: "ABCD2345", createdByUserId: OWNER_USER_ID, expiresAt: new Date(Date.now() + 86_400_000) });
    const found = await findValidInviteCode(db, "ABCD2345");
    expect(found).toBeDefined();
  });

  it("does not return an expired code", async () => {
    await createInviteCode(db, { code: "EXPIRED1", createdByUserId: OWNER_USER_ID, expiresAt: new Date(Date.now() - 1000) });
    expect(await findValidInviteCode(db, "EXPIRED1")).toBeUndefined();
  });

  it("does not return an already-redeemed code", async () => {
    await createInviteCode(db, { code: "USEDCODE", createdByUserId: OWNER_USER_ID, expiresAt: new Date(Date.now() + 86_400_000) });
    const found = await findValidInviteCode(db, "USEDCODE");
    const member = await insertUser(db, { username: "dave", name: "Dave", role: "member", passwordHash: "x:y" });
    await redeemInviteCode(db, found!.id, member.id);
    expect(await findValidInviteCode(db, "USEDCODE")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/server/repositories/authRepository.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `packages/server/src/repositories/authRepository.ts`:

```ts
import { and, eq, gt, isNull } from "drizzle-orm";
import { inviteCodes, sessions, users, type LiftrDb } from "@liftr/db";

export type UserRow = typeof users.$inferSelect;

export function findUserByUsername(db: LiftrDb, username: string) {
  return db.query.users.findFirst({ where: eq(users.username, username) });
}

export function findUserById(db: LiftrDb, id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

export function findOwnerUser(db: LiftrDb) {
  return db.query.users.findFirst({ where: eq(users.role, "owner") });
}

export async function setUserPassword(db: LiftrDb, userId: string, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function insertUser(
  db: LiftrDb,
  values: { username: string; name: string; role: "owner" | "member"; passwordHash: string },
): Promise<UserRow> {
  const [row] = await db.insert(users).values(values).returning();
  if (!row) throw new Error("user insert failed");
  return row;
}

export function listUsers(db: LiftrDb) {
  return db.query.users.findMany();
}

export async function deleteUser(db: LiftrDb, userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

export async function createSession(db: LiftrDb, userId: string, tokenHash: string): Promise<void> {
  await db.insert(sessions).values({ userId, tokenHash });
}

/** Joined to the owning user's role, since every call site needs both the identity and the role
 *  to authorize a request — a single lookup instead of two round-trips per request. */
export async function findSessionByTokenHash(
  db: LiftrDb,
  tokenHash: string,
): Promise<{ userId: string; role: "owner" | "member" } | undefined> {
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, tokenHash),
    with: { user: { columns: { role: true } } },
  });
  return row ? { userId: row.userId, role: row.user.role } : undefined;
}

export async function touchSession(db: LiftrDb, tokenHash: string): Promise<void> {
  await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteSessionByTokenHash(db: LiftrDb, tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function createInviteCode(
  db: LiftrDb,
  values: { code: string; createdByUserId: string; expiresAt: Date },
): Promise<void> {
  await db.insert(inviteCodes).values(values);
}

export function findValidInviteCode(db: LiftrDb, code: string) {
  return db.query.inviteCodes.findFirst({
    where: and(eq(inviteCodes.code, code), gt(inviteCodes.expiresAt, new Date()), isNull(inviteCodes.usedByUserId)),
  });
}

export async function redeemInviteCode(db: LiftrDb, id: string, usedByUserId: string): Promise<void> {
  await db.update(inviteCodes).set({ usedByUserId }).where(eq(inviteCodes.id, id));
}
```

**Note:** `findSessionByTokenHash`'s `with: { user: ... }` requires a `sessions`-to-`users`
relation to exist in `packages/db/src/schema.ts`'s `relations(...)` exports. Check the bottom of
`schema.ts` for the existing `relations()` pattern (e.g. how `prs`/`sets` declare their
`references`) and add, alongside the `sessions`/`users`/`inviteCodes` table definitions from
Task 1:

```ts
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
```

If this relation is missing, `db.query.sessions.findFirst({ with: { user: ... } })` fails at
runtime with an unclear Drizzle error — add it as part of this task's Step 3, in
`packages/db/src/schema.ts`, and re-run `pnpm --filter @liftr/db exec tsc --noEmit` to confirm.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/server/repositories/authRepository.test.ts
```

Expected: PASS (all 13 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/server/src/repositories/authRepository.ts tests/server/repositories/authRepository.test.ts
git commit -m "feat(server): add auth repository (users, sessions, invite codes)"
```

---

### Task 6: Merged auth + user-context middleware

**Files:**
- Modify: `packages/server/src/auth.ts` (rewritten)
- Delete: `packages/server/src/userContext.ts`
- Modify: `packages/server/src/types/fastify.d.ts`
- Delete: `tests/server/services/` — no, do not delete tests; see below
- Test: `tests/server/auth.test.ts` (new — the old file, if any, tested only `requireAuth`'s
  token-compare; replace its contents)

**Interfaces:**
- Consumes: `findSessionByTokenHash`, `touchSession` from Task 5's `authRepository.ts`.
- Produces: `requireAuth(db: LiftrDb)` returns a Fastify `onRequest` hook function
  `(request, reply) => Promise<void>` that sets `request.userId: string` and
  `request.role: "owner" | "member"` on success, or replies 401 and does not call `next`.

- [ ] **Step 1: Update the Fastify type augmentation**

Replace the contents of `packages/server/src/types/fastify.d.ts`:

```ts
import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by auth.ts's requireAuth hook once the bearer token resolves to a real session. */
    userId: string;
    role: "owner" | "member";
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/server/auth.test.ts`:

```ts
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import type { LiftrDb } from "@liftr/db";
import { hashSessionToken, generateSessionToken } from "~server/lib/sessionTokens.js";
import { createSession } from "~server/repositories/authRepository.js";
import { requireAuth } from "~server/auth.js";
import { createTestDb } from "./helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

function buildApp(db: LiftrDb) {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", requireAuth(db));
  app.get("/protected", async (request) => ({ userId: request.userId, role: request.role }));
  return app;
}

describe("requireAuth", () => {
  it("401s a request with no Authorization header", async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
  });

  it("401s a request with an unknown token", async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer nonsense" } });
    expect(res.statusCode).toBe(401);
  });

  it("sets userId and role from a valid session", async () => {
    const token = generateSessionToken();
    await createSession(db, "00000000-0000-4000-8000-000000000001", hashSessionToken(token));
    const app = buildApp(db);
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: "00000000-0000-4000-8000-000000000001", role: "owner" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run tests/server/auth.test.ts
```

Expected: FAIL — `requireAuth` still has its old `(request, reply)` single-shared-token signature,
not a `(db) => hook` factory.

- [ ] **Step 4: Rewrite `auth.ts`**

Replace the full contents of `packages/server/src/auth.ts`:

```ts
import type { FastifyReply, FastifyRequest } from "fastify";
import type { LiftrDb } from "@liftr/db";
import { findSessionByTokenHash, touchSession } from "./repositories/authRepository.js";
import { hashSessionToken } from "./lib/sessionTokens.js";

/**
 * Every `/api/*` request carries a bearer token; this looks it up against `sessions` and, on a
 * hit, sets `request.userId`/`request.role` for the rest of the request to use. Replaces the old
 * single-shared-token check and the separate `userContext.ts` hook that used to run after it —
 * those were two hooks doing halves of the same lookup; this is the one place identity gets
 * resolved now.
 */
export function requireAuth(db: LiftrDb) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const tokenHash = hashSessionToken(token);
    const session = await findSessionByTokenHash(db, tokenHash);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    request.userId = session.userId;
    request.role = session.role;
    await touchSession(db, tokenHash);
  };
}
```

- [ ] **Step 5: Delete `userContext.ts`**

```bash
rm packages/server/src/userContext.ts
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run tests/server/auth.test.ts
```

Expected: PASS (all 3 tests).

- [ ] **Step 7: Commit**

(App wiring is Task 8 — `app.ts` still references the old `requireAuth`/`registerUserContext`
signatures at this point and will not typecheck until then. Commit anyway; the next task fixes it
immediately.)

```bash
git add packages/server/src/auth.ts packages/server/src/types/fastify.d.ts tests/server/auth.test.ts
git rm packages/server/src/userContext.ts
git commit -m "feat(server): merge auth + user-context into one session-backed hook"
```

---

### Task 7: Auth routes (status/setup/login/logout/register/me)

**Files:**
- Create: `packages/server/src/routes/auth.ts`
- Test: `tests/server/routes/auth.test.ts`

**Interfaces:**
- Consumes: everything from Task 5 (`authRepository.ts`), Task 2 (`passwords.ts`), Task 3
  (`sessionTokens.ts`), Task 6 (`requireAuth` — for the authenticated `/logout` and `/me` routes).
- Produces: `registerAuthRoutes(app: ZodFastifyInstance, db: LiftrDb)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/server/routes/auth.test.ts`:

```ts
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import type { LiftrDb } from "@liftr/db";
import { configureApp } from "~server/app.js";
import { registerAuthRoutes } from "~server/routes/auth.js";
import { requireAuth } from "~server/auth.js";
import { createTestDb, insertTestUser } from "../helpers/testDb.js";
import { hashPassword } from "~server/lib/passwords.js";
import { createInviteCode, setUserPassword } from "~server/repositories/authRepository.js";

let db: LiftrDb;

function buildApp(db: LiftrDb) {
  const app = configureApp(Fastify({ logger: false }));
  registerAuthRoutes(app, db);
  // /me and /logout need requireAuth wired the same way app.ts wires it in production.
  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/api/auth/me" || request.url === "/api/auth/logout") {
      await requireAuth(db)(request, reply);
    }
  });
  return app;
}

beforeEach(() => {
  db = createTestDb();
});

describe("GET /api/auth/status", () => {
  it("reports needsSetup: true on a fresh install (owner has no password)", async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: "GET", url: "/api/auth/status" });
    expect(res.json()).toEqual({ needsSetup: true });
  });

  it("reports needsSetup: false once the owner has a password", async () => {
    await setUserPassword(db, "00000000-0000-4000-8000-000000000001", await hashPassword("ownerpass"));
    const app = buildApp(db);
    const res = await app.inject({ method: "GET", url: "/api/auth/status" });
    expect(res.json()).toEqual({ needsSetup: false });
  });
});

describe("POST /api/auth/setup", () => {
  it("sets the owner's password and returns a usable token", async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "ownerpass1" } });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe("string");
  });

  it("rejects a password shorter than 8 characters", async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "short" } });
    expect(res.statusCode).toBe(400);
  });

  it("refuses to run again once setup is already done", async () => {
    const app = buildApp(db);
    await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "ownerpass1" } });
    const res = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "different1" } });
    expect(res.statusCode).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with the correct password", async () => {
    await setUserPassword(db, "00000000-0000-4000-8000-000000000001", await hashPassword("ownerpass1"));
    const app = buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "owner", password: "ownerpass1" } });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe("string");
  });

  it("rejects a wrong password", async () => {
    await setUserPassword(db, "00000000-0000-4000-8000-000000000001", await hashPassword("ownerpass1"));
    const app = buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "owner", password: "wrong" } });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an unknown username", async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "nobody", password: "whatever1" } });
    expect(res.statusCode).toBe(401);
  });

  it("rejects login before setup has ever run (null passwordHash)", async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "owner", password: "whatever1" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/auth/register", () => {
  it("redeems a valid invite code and creates a member", async () => {
    const app = buildApp(db);
    await createInviteCode(db, { code: "ABCD2345", createdByUserId: "00000000-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 86_400_000) });
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "ABCD2345", username: "newmember", password: "memberpass1" } });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe("string");
  });

  it("rejects an unknown code", async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "NOTREAL1", username: "newmember", password: "memberpass1" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a code that's already been used", async () => {
    const app = buildApp(db);
    await createInviteCode(db, { code: "ABCD2345", createdByUserId: "00000000-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 86_400_000) });
    await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "ABCD2345", username: "first", password: "memberpass1" } });
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "ABCD2345", username: "second", password: "memberpass1" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a duplicate username", async () => {
    const app = buildApp(db);
    await createInviteCode(db, { code: "ABCD2345", createdByUserId: "00000000-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 86_400_000) });
    await createInviteCode(db, { code: "EFGH6789", createdByUserId: "00000000-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 86_400_000) });
    await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "ABCD2345", username: "dupe", password: "memberpass1" } });
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "EFGH6789", username: "dupe", password: "memberpass1" } });
    expect(res.statusCode).toBe(409);
  });
});

describe("GET /api/auth/me and POST /api/auth/logout", () => {
  it("me returns the current user's identity", async () => {
    const app = buildApp(db);
    const setupRes = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "ownerpass1" } });
    const token = setupRes.json().token;
    const res = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.json()).toMatchObject({ username: "owner", role: "owner" });
  });

  it("logout invalidates the token", async () => {
    const app = buildApp(db);
    const setupRes = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "ownerpass1" } });
    const token = setupRes.json().token;
    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { authorization: `Bearer ${token}` } });
    const res = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/server/routes/auth.test.ts
```

Expected: FAIL — `~server/routes/auth.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `packages/server/src/routes/auth.ts`:

```ts
import { z } from "zod";
import type { LiftrDb } from "@liftr/db";
import { hashPassword, verifyPassword } from "../lib/passwords.js";
import { generateSessionToken, hashSessionToken } from "../lib/sessionTokens.js";
import {
  createSession,
  deleteSessionByTokenHash,
  findOwnerUser,
  findUserByUsername,
  findUserById,
  findValidInviteCode,
  insertUser,
  redeemInviteCode,
  setUserPassword,
} from "../repositories/authRepository.js";
import type { ZodFastifyInstance } from "../types.js";

const USERNAME_PATTERN = /^[a-z0-9-]{3,24}$/;
const usernameSchema = z.string().regex(USERNAME_PATTERN, "3-24 lowercase letters, digits, or hyphens");
const passwordSchema = z.string().min(8, "at least 8 characters");

const setupInput = z.object({ password: passwordSchema });
const loginInput = z.object({ username: usernameSchema, password: z.string() });
const registerInput = z.object({ code: z.string().length(8), username: usernameSchema, password: passwordSchema });

const tokenResponse = z.object({ token: z.string() });
const statusResponse = z.object({ needsSetup: z.boolean() });
const meResponse = z.object({ id: z.string(), username: z.string(), name: z.string(), role: z.enum(["owner", "member"]) });
const okResponse = z.object({ ok: z.literal(true) });

async function issueSession(db: LiftrDb, userId: string) {
  const token = generateSessionToken();
  await createSession(db, userId, hashSessionToken(token));
  return token;
}

/** No auth is required on setup/login/register — they're how a bearer token is obtained in the
 *  first place. `/me` and `/logout` need one, wired via `app.ts`'s auth hook. */
export function registerAuthRoutes(app: ZodFastifyInstance, db: LiftrDb) {
  app.get("/api/auth/status", { schema: { response: { 200: statusResponse } } }, async () => {
    const owner = await findOwnerUser(db);
    return { needsSetup: owner?.passwordHash == null };
  });

  app.post(
    "/api/auth/setup",
    { schema: { body: setupInput, response: { 200: tokenResponse } } },
    async (req, reply) => {
      const owner = await findOwnerUser(db);
      if (!owner) return reply.code(500).send({ error: "no_owner" });
      if (owner.passwordHash != null) return reply.code(409).send({ error: "already_set_up" });
      await setUserPassword(db, owner.id, await hashPassword(req.body.password));
      return { token: await issueSession(db, owner.id) };
    },
  );

  app.post(
    "/api/auth/login",
    { schema: { body: loginInput, response: { 200: tokenResponse } } },
    async (req, reply) => {
      const user = await findUserByUsername(db, req.body.username);
      if (!user?.passwordHash || !(await verifyPassword(req.body.password, user.passwordHash))) {
        return reply.code(401).send({ error: "invalid_credentials" });
      }
      return { token: await issueSession(db, user.id) };
    },
  );

  app.post(
    "/api/auth/register",
    { schema: { body: registerInput, response: { 200: tokenResponse } } },
    async (req, reply) => {
      const invite = await findValidInviteCode(db, req.body.code.toUpperCase());
      if (!invite) return reply.code(400).send({ error: "invalid_invite_code" });
      const existing = await findUserByUsername(db, req.body.username);
      if (existing) return reply.code(409).send({ error: "username_taken" });
      const user = await insertUser(db, {
        username: req.body.username,
        name: req.body.username,
        role: "member",
        passwordHash: await hashPassword(req.body.password),
      });
      await redeemInviteCode(db, invite.id, user.id);
      return { token: await issueSession(db, user.id) };
    },
  );

  app.get("/api/auth/me", { schema: { response: { 200: meResponse } } }, async (req, reply) => {
    const user = await findUserById(db, req.userId);
    if (!user) return reply.code(404).send({ error: "not_found" });
    return { id: user.id, username: user.username, name: user.name, role: user.role };
  });

  app.post("/api/auth/logout", { schema: { response: { 200: okResponse } } }, async (req) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (token) await deleteSessionByTokenHash(db, hashSessionToken(token));
    return { ok: true as const };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/server/routes/auth.test.ts
```

Expected: PASS (all 14 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/auth.ts tests/server/routes/auth.test.ts
git commit -m "feat(server): add /api/auth/{status,setup,login,register,me,logout} routes"
```

---

### Task 8: Members routes (owner-only)

**Files:**
- Create: `packages/server/src/lib/requireOwner.ts`
- Create: `packages/server/src/routes/members.ts`
- Test: `tests/server/lib/requireOwner.test.ts`
- Test: `tests/server/routes/members.test.ts`

**Interfaces:**
- Consumes: `listUsers`, `deleteUser`, `createInviteCode`, `findUserById` from Task 5;
  `generateInviteCode` from Task 4; `requireAuth` from Task 6.
- Produces: `requireOwner(request, reply): Promise<void>` (a second `onRequest`-style hook, layered
  after `requireAuth` on owner-only routes); `registerMemberRoutes(app: ZodFastifyInstance, db: LiftrDb)`.

- [ ] **Step 1: Write the failing test for `requireOwner`**

Create `tests/server/lib/requireOwner.test.ts`:

```ts
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { requireOwner } from "~server/lib/requireOwner.js";

describe("requireOwner", () => {
  it("403s when request.role is member", async () => {
    const app = Fastify({ logger: false });
    app.addHook("onRequest", async (request) => {
      request.userId = "u1";
      request.role = "member";
    });
    app.addHook("onRequest", requireOwner);
    app.get("/owner-only", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/owner-only" });
    expect(res.statusCode).toBe(403);
  });

  it("allows the request through when request.role is owner", async () => {
    const app = Fastify({ logger: false });
    app.addHook("onRequest", async (request) => {
      request.userId = "u1";
      request.role = "owner";
    });
    app.addHook("onRequest", requireOwner);
    app.get("/owner-only", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/owner-only" });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/server/lib/requireOwner.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `requireOwner`**

Create `packages/server/src/lib/requireOwner.ts`:

```ts
import type { FastifyReply, FastifyRequest } from "fastify";

/** Layered after `requireAuth` on routes only the owner may call — assumes `request.role` is
 *  already set, so this must never be the only auth hook on a route. */
export async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  if (request.role !== "owner") {
    return reply.code(403).send({ error: "owner_only" });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/server/lib/requireOwner.test.ts
```

Expected: PASS (both tests).

- [ ] **Step 5: Write the failing tests for the members routes**

Create `tests/server/routes/members.test.ts`:

```ts
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import type { LiftrDb } from "@liftr/db";
import { OWNER_USER_ID } from "@liftr/db";
import { configureApp } from "~server/app.js";
import { registerMemberRoutes } from "~server/routes/members.js";
import { insertUser } from "~server/repositories/authRepository.js";
import { createTestDb } from "../helpers/testDb.js";

let db: LiftrDb;

function buildApp(db: LiftrDb, role: "owner" | "member" = "owner") {
  const app = configureApp(Fastify({ logger: false }));
  app.addHook("onRequest", async (request) => {
    request.userId = OWNER_USER_ID;
    request.role = role;
  });
  registerMemberRoutes(app, db);
  return app;
}

beforeEach(() => {
  db = createTestDb();
});

describe("POST /api/members/invite", () => {
  it("generates an 8-character code with a 24h expiry", async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/members/invite" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("403s for a non-owner", async () => {
    const app = buildApp(db, "member");
    const res = await app.inject({ method: "POST", url: "/api/members/invite" });
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /api/members", () => {
  it("lists every user", async () => {
    await insertUser(db, { username: "alice", name: "Alice", role: "member", passwordHash: "x:y" });
    const app = buildApp(db);
    const res = await app.inject({ method: "GET", url: "/api/members" });
    expect(res.json().map((u: { username: string }) => u.username).sort()).toEqual(["alice", "owner"]);
  });

  it("403s for a non-owner", async () => {
    const app = buildApp(db, "member");
    const res = await app.inject({ method: "GET", url: "/api/members" });
    expect(res.statusCode).toBe(403);
  });
});

describe("DELETE /api/members/:id", () => {
  it("removes a member", async () => {
    const member = await insertUser(db, { username: "bob", name: "Bob", role: "member", passwordHash: "x:y" });
    const app = buildApp(db);
    const res = await app.inject({ method: "DELETE", url: `/api/members/${member.id}` });
    expect(res.statusCode).toBe(200);
  });

  it("refuses to delete the owner", async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: "DELETE", url: `/api/members/${OWNER_USER_ID}` });
    expect(res.statusCode).toBe(400);
  });

  it("403s for a non-owner", async () => {
    const member = await insertUser(db, { username: "carol", name: "Carol", role: "member", passwordHash: "x:y" });
    const app = buildApp(db, "member");
    const res = await app.inject({ method: "DELETE", url: `/api/members/${member.id}` });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
pnpm vitest run tests/server/routes/members.test.ts
```

Expected: FAIL — `~server/routes/members.js` does not exist.

- [ ] **Step 7: Write the implementation**

Create `packages/server/src/routes/members.ts`:

```ts
import { z } from "zod";
import type { LiftrDb } from "@liftr/db";
import { generateInviteCode } from "../lib/inviteCode.js";
import { requireOwner } from "../lib/requireOwner.js";
import { createInviteCode, deleteUser, findUserById, listUsers } from "../repositories/authRepository.js";
import type { ZodFastifyInstance } from "../types.js";

const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000;

const inviteResponse = z.object({ code: z.string(), expiresAt: z.string() });
const memberResponse = z.object({ id: z.string(), username: z.string(), name: z.string(), role: z.enum(["owner", "member"]), createdAt: z.date() });
const memberIdParams = z.object({ id: z.string() });
const okResponse = z.object({ ok: z.literal(true) });

/** Every route here is owner-only — `requireOwner` runs as a route-level `onRequest`, layered on
 *  top of the app-wide `requireAuth` hook that already resolved `request.role`. */
export function registerMemberRoutes(app: ZodFastifyInstance, db: LiftrDb) {
  app.post(
    "/api/members/invite",
    { onRequest: requireOwner, schema: { response: { 200: inviteResponse } } },
    async (req) => {
      const code = generateInviteCode();
      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);
      await createInviteCode(db, { code, createdByUserId: req.userId, expiresAt });
      return { code, expiresAt: expiresAt.toISOString() };
    },
  );

  app.get(
    "/api/members",
    { onRequest: requireOwner, schema: { response: { 200: z.array(memberResponse) } } },
    async () => listUsers(db),
  );

  app.delete(
    "/api/members/:id",
    { onRequest: requireOwner, schema: { params: memberIdParams, response: { 200: okResponse } } },
    async (req, reply) => {
      if (req.params.id === req.userId) return reply.code(400).send({ error: "cannot_delete_self" });
      const target = await findUserById(db, req.params.id);
      if (target?.role === "owner") return reply.code(400).send({ error: "cannot_delete_owner" });
      await deleteUser(db, req.params.id);
      return { ok: true as const };
    },
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
pnpm vitest run tests/server/routes/members.test.ts
```

Expected: PASS (all 6 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/lib/requireOwner.ts packages/server/src/routes/members.ts tests/server/lib/requireOwner.test.ts tests/server/routes/members.test.ts
git commit -m "feat(server): add owner-only /api/members routes"
```

---

### Task 9: Wire everything into `app.ts`; remove `LIFTR_TOKEN`

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/env.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 6), `registerAuthRoutes` (Task 7), `registerMemberRoutes`
  (Task 8).

- [ ] **Step 1: Update `env.ts`**

In `packages/server/src/env.ts`, remove the `token` field and its production-required check:

```ts
export const env = {
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.LIFTR_DB_PATH ?? "../../data/liftr.db",
  imagesDir: process.env.LIFTR_IMAGES_DIR ?? "../../data/images",
  clientDistDir: process.env.LIFTR_CLIENT_DIST ?? "../../packages/client/dist",
  allowedOrigins: process.env.LIFTR_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? null,
};
```

(Delete the `if (!env.token && process.env.NODE_ENV === "production") throw ...` block along with
it — there is no more optional-vs-required token to gate.)

- [ ] **Step 2: Update `app.ts`**

In `packages/server/src/app.ts`:
- Keep `import { requireAuth } from "./auth.js";` as-is (same import path) — only the call site
  changes, since `requireAuth` is now `(db) => hook` instead of a bare hook function.
- Remove `import { registerUserContext } from "./userContext.js";` entirely (deleted in Task 6).
- Remove the `registerUserContext(typedApp);` call inside `configureApp`.
- Find the existing:
  ```ts
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      await requireAuth(request, reply);
    }
  });
  ```
  and replace with:
  ```ts
  app.addHook("onRequest", async (request, reply) => {
    // /api/auth/{status,setup,login,register} must be reachable with no session yet — they're
    // how a token is obtained in the first place.
    const isPublicAuthRoute =
      request.url === "/api/auth/status" ||
      request.url === "/api/auth/setup" ||
      request.url === "/api/auth/login" ||
      request.url === "/api/auth/register";
    if (request.url.startsWith("/api/") && !isPublicAuthRoute) {
      await requireAuth(db)(request, reply);
    }
  });
  ```
- Add `registerAuthRoutes(app, db);` and `registerMemberRoutes(app, db);` alongside the other
  `register*Routes(app, db)` calls in `buildApp()`, importing both from `./routes/auth.js` and
  `./routes/members.js`.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @liftr/server exec tsc --noEmit
```

Expected: clean. Fix any remaining reference to the deleted `userContext.ts` or the old
`requireAuth(request, reply)` call signature if the compiler flags one.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/env.ts
git commit -m "feat(server): wire auth/members routes, drop LIFTR_TOKEN"
```

---

### Task 10: Update `createTestApp()` for real sessions

**Files:**
- Modify: `tests/server/helpers/testApp.ts`
- Modify: `tests/server/helpers/testDb.ts`

**Interfaces:**
- Produces: `createTestApp()` still returns `{ app, db }`, but `app.inject(...)` now
  transparently authenticates as the owner unless the caller's own `headers.authorization` says
  otherwise.

**Context:** every existing route test in `tests/server/routes/*.test.ts` calls
`createTestApp()` and then `app.inject({ ... })` with no `Authorization` header, relying on the
old hardcoded `OWNER_USER_ID` constant. Once routes actually require a valid session (this only
matters for routes that call `requireAuth` themselves via `app.ts`'s pattern — most existing route
test files register their route module directly on a bare `configureApp()` instance and never add
the auth hook at all, so they're already unaffected). The tests genuinely at risk are Task 7/8's
own new route tests (which set up their own auth deliberately) and any *future* test that composes
`buildApp()`'s full hook chain. This task exists so a test CAN opt into real auth easily going
forward, not because every existing test needs it today — confirm this by running the full
existing suite before making any change here.

- [ ] **Step 1: Run the full server test suite as a baseline**

```bash
pnpm vitest run tests/server
```

Expected: PASS (same count as before this plan's Task 6-9 changes — if anything newly fails here,
stop and investigate before proceeding; it means some test file registers routes against the real
`app.ts`-style hook chain and needs the helper below immediately, not by choice).

- [ ] **Step 2: Add `insertTestUserWithSession` to `testDb.ts`**

In `tests/server/helpers/testDb.ts`, add (alongside the existing `insertTestUser`):

```ts
import { createSession } from "~server/repositories/authRepository.js";
import { generateSessionToken, hashSessionToken } from "~server/lib/sessionTokens.js";

/** Inserts a user (or reuses the seeded owner) and a matching session row, returning the raw
 *  token a test can put straight into an `Authorization: Bearer` header. */
export async function insertTestUserWithSession(
  db: LiftrDb,
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<{ user: Awaited<ReturnType<typeof insertTestUser>>; token: string }> {
  const user = await insertTestUser(db, overrides);
  const token = generateSessionToken();
  await createSession(db, user.id, hashSessionToken(token));
  return { user, token };
}
```

- [ ] **Step 3: Add an authenticated app builder to `testApp.ts`**

In `tests/server/helpers/testApp.ts`, add a second export alongside the existing `createTestApp`:

```ts
import { requireAuth } from "~server/auth.js";
import { insertTestUserWithSession } from "./testDb.js";

/** Same as `createTestApp`, but also wires the real `requireAuth` hook and seeds an owner session
 *  — for tests exercising the full `app.ts`-style auth chain rather than registering a route
 *  module directly on a bare instance. Returns the owner's token so a test can override it with a
 *  member's own token when it needs to check role-gating or cross-user isolation. */
export async function createAuthenticatedTestApp() {
  const { app, db } = createTestApp();
  const { token } = await insertTestUserWithSession(db, { role: "owner" });
  app.addHook("onRequest", requireAuth(db));
  return { app, db, ownerToken: token };
}
```

- [ ] **Step 4: Typecheck and run the full server suite again**

```bash
pnpm --filter @liftr/server exec tsc --noEmit
pnpm vitest run tests/server
```

Expected: both clean/passing, identical count to Step 1's baseline (this task adds a helper,
it doesn't change any existing test's behavior).

- [ ] **Step 5: Commit**

```bash
git add tests/server/helpers/testApp.ts tests/server/helpers/testDb.ts
git commit -m "test(server): add authenticated test-app helper for real session-backed tests"
```

---

### Task 11: Client — rewrite `AuthGate.vue`

**Files:**
- Modify: `packages/client/src/components/ui/AuthGate.vue`
- Test: `tests/client/components/ui/AuthGate.test.ts`

**Interfaces:**
- Consumes: `api`, `getToken`, `setToken` from `../../lib/api.js` (unchanged).
- Produces: no external interface change — still a slot-wrapping gate component with the same
  `<AuthGate><slot content/></AuthGate>` usage in `App.vue` (no change needed there).

- [ ] **Step 1: Read the existing test file for conventions**

```bash
cat tests/client/components/ui/AuthGate.test.ts 2>/dev/null || echo "no existing test file"
```

If a file exists, note its mounting pattern (`mountWithProviders`) and `api` mocking approach
before writing Step 2 — match it exactly rather than introducing a second style.

- [ ] **Step 2: Write the failing tests**

Create (or replace) `tests/client/components/ui/AuthGate.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthGate from "~client/components/ui/AuthGate.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";
import * as api from "~client/lib/api";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthGate", () => {
  it("renders the slot immediately when /api/auth/status succeeds and a session is already valid", async () => {
    vi.spyOn(api.api, "get").mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      if (path === "/api/health") return Promise.resolve({ ok: true });
      return Promise.reject(new Error("unexpected path"));
    });
    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div id='inner'>inner</div>" } });
    await vi.waitFor(() => expect(wrapper.find("#inner").exists()).toBe(true));
  });

  it("shows the setup form when needsSetup is true", async () => {
    vi.spyOn(api.api, "get").mockResolvedValue({ needsSetup: true });
    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div id='inner'>inner</div>" } });
    await vi.waitFor(() => expect(wrapper.find('input[type="password"]').exists()).toBe(true));
    expect(wrapper.find("#inner").exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Benutzername"]').exists()).toBe(false);
  });

  it("shows the join form when the URL has an invite query param", async () => {
    window.history.pushState({}, "", "/?invite=ABCD2345");
    vi.spyOn(api.api, "get").mockResolvedValue({ needsSetup: false });
    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div id='inner'>inner</div>" } });
    await vi.waitFor(() => expect(wrapper.find('input[aria-label="Benutzername"]').exists()).toBe(true));
    window.history.pushState({}, "", "/");
  });

  it("shows the login form by default when a session is missing/invalid", async () => {
    vi.spyOn(api.api, "get").mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      return Promise.reject(Object.assign(new api.ApiError("unauthorized", 401), { status: 401 }));
    });
    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div id='inner'>inner</div>" } });
    await vi.waitFor(() => expect(wrapper.find('input[aria-label="Benutzername"]').exists()).toBe(true));
  });

  it("submitting login stores the token and reveals the slot", async () => {
    vi.spyOn(api.api, "get").mockImplementation((path: string) => {
      if (path === "/api/auth/status") return Promise.resolve({ needsSetup: false });
      return Promise.reject(Object.assign(new api.ApiError("unauthorized", 401), { status: 401 }));
    });
    vi.spyOn(api.api, "post").mockResolvedValue({ token: "new-token" });
    const wrapper = mountWithProviders(AuthGate, { slots: { default: "<div id='inner'>inner</div>" } });
    await vi.waitFor(() => expect(wrapper.find('input[aria-label="Benutzername"]').exists()).toBe(true));
    await wrapper.find('input[aria-label="Benutzername"]').setValue("owner");
    await wrapper.find('input[type="password"]').setValue("ownerpass1");
    await wrapper.find("button.btn-primary").trigger("click");
    await vi.waitFor(() => expect(wrapper.find("#inner").exists()).toBe(true));
    expect(api.getToken()).toBe("new-token");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run tests/client/components/ui/AuthGate.test.ts
```

Expected: FAIL — the component still shows a raw token-paste field, not username/password forms.

- [ ] **Step 4: Rewrite the component**

Replace the full contents of `packages/client/src/components/ui/AuthGate.vue`:

```vue
<script setup lang="ts">
/**
 * Auth entry screen. Blocks the app behind one of three states depending on server/URL state:
 * setup (fresh install, no owner password yet), join (URL carries `?invite=CODE`), or login
 * (default). All three exchange credentials for a bearer token via `setToken`, then re-check.
 */
import { onMounted, ref } from "vue";
import { ApiError, api, setToken } from "../../lib/api";
import AppIcon from "./AppIcon.vue";

type Status = "checking" | "ok" | "setup" | "join" | "login" | "offline";

const status = ref<Status>("checking");
const username = ref("");
const password = ref("");
const inviteCode = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);
const passwordVisible = ref(false);

function getInviteCodeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("invite");
}

async function check() {
  status.value = "checking";
  try {
    const { needsSetup } = await api.get<{ needsSetup: boolean }>("/api/auth/status");
    if (needsSetup) {
      status.value = "setup";
      return;
    }
    await api.get("/api/health");
    status.value = "ok";
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      inviteCode.value = getInviteCodeFromUrl() ?? "";
      status.value = inviteCode.value ? "join" : "login";
    } else {
      // Offline on first load with no cached auth state — let the app through; the PWA shell +
      // cached catalog still work, and API calls retry once online.
      status.value = "offline";
    }
  }
}

onMounted(check);

async function submitSetup() {
  submitting.value = true;
  error.value = null;
  try {
    const { token } = await api.post<{ token: string }>("/api/auth/setup", { password: password.value });
    setToken(token);
    status.value = "ok";
  } catch {
    error.value = "Einrichtung fehlgeschlagen.";
  } finally {
    submitting.value = false;
  }
}

async function submitLogin() {
  submitting.value = true;
  error.value = null;
  try {
    const { token } = await api.post<{ token: string }>("/api/auth/login", {
      username: username.value.trim().toLowerCase(),
      password: password.value,
    });
    setToken(token);
    status.value = "ok";
  } catch {
    error.value = "Benutzername oder Passwort falsch.";
  } finally {
    submitting.value = false;
  }
}

async function submitJoin() {
  submitting.value = true;
  error.value = null;
  try {
    const { token } = await api.post<{ token: string }>("/api/auth/register", {
      code: inviteCode.value.trim().toUpperCase(),
      username: username.value.trim().toLowerCase(),
      password: password.value,
    });
    setToken(token);
    status.value = "ok";
  } catch {
    error.value = "Einladungscode ungültig oder Benutzername bereits vergeben.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div v-if="status === 'setup' || status === 'login' || status === 'join'" class="gate">
    <div class="card surface-hybrid">
      <h1>Liftr</h1>
      <p v-if="status === 'setup'">Richte dein Besitzer-Konto ein.</p>
      <p v-else-if="status === 'join'">Tritt mit deinem Einladungscode bei.</p>
      <p v-else>Melde dich an.</p>

      <input v-if="status === 'join'" v-model="inviteCode" type="text" placeholder="Einladungscode" aria-label="Einladungscode" />
      <input v-if="status !== 'setup'" v-model="username" type="text" placeholder="Benutzername" aria-label="Benutzername" autocomplete="username" />
      <div class="password-row">
        <input
          v-model="password"
          :type="passwordVisible ? 'text' : 'password'"
          placeholder="Passwort"
          aria-label="Passwort"
          autocomplete="current-password"
          @keyup.enter="status === 'setup' ? submitSetup() : status === 'join' ? submitJoin() : submitLogin()"
        />
        <button
          type="button"
          class="btn-secondary"
          :aria-label="passwordVisible ? 'Passwort verbergen' : 'Passwort anzeigen'"
          @click="passwordVisible = !passwordVisible"
        >
          <AppIcon :name="passwordVisible ? 'eye-off' : 'eye'" />
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <button
        class="btn-primary btn-lg btn-block"
        :disabled="submitting || !password.trim() || (status !== 'setup' && !username.trim()) || (status === 'join' && !inviteCode.trim())"
        @click="status === 'setup' ? submitSetup() : status === 'join' ? submitJoin() : submitLogin()"
      >
        {{ submitting ? "…" : status === "setup" ? "Einrichten" : status === "join" ? "Beitreten" : "Anmelden" }}
      </button>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
/* No background here: an opaque fill would sit in front of tokens.css's body::before cosmic
   sweep, which paints behind body's children and gets hidden by any opaque child on top of it —
   this is the first screen a locked-down server shows, so it needs to let the sweep show through
   like every other screen. */
.gate {
  min-height: 100vh;
  display: grid;
  place-items: center;
}
/* .surface-hybrid (tokens.css) instead of a flat --surface-2 fill + --line border, so this card
   reads as a translucent object floating over the sweep instead of an opaque box painted over it. */
.card {
  border-radius: var(--r-xl);
  padding: var(--sp8);
  width: min(320px, 100% - 2 * var(--sp4));
  text-align: center;
}
.card h1 {
  font-size: 22px;
  margin-bottom: var(--sp2);
}
.card p {
  color: var(--dim);
  font-size: 13px;
  margin-bottom: var(--sp4);
}
.card input[type="text"] {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
  margin-bottom: var(--sp2);
}
.password-row {
  display: flex;
  gap: var(--sp2);
  margin-bottom: var(--sp3);
}
.password-row input {
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
}
.error {
  color: var(--red);
}
</style>
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run tests/client/components/ui/AuthGate.test.ts
```

Expected: PASS (all 5 tests). If the "renders the slot immediately" case fails because
`/api/health` is no longer called in the `ok` path before this rewrite's `check()` (it still is —
double-check the mock in that test matches both `/api/auth/status` and `/api/health` paths), fix
the test mock rather than the component.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/ui/AuthGate.vue tests/client/components/ui/AuthGate.test.ts
git commit -m "feat(client): replace token-paste gate with real setup/login/join forms"
```

---

### Task 12: Client — Members section + logout on `ProfilePage.vue`; remove raw token field

**Files:**
- Modify: `packages/client/src/pages/ProfilePage.vue`
- Create: `packages/client/src/services/authService.ts`
- Test: `tests/client/pages/ProfilePage.test.ts` (extend existing — read it first for conventions)

**Interfaces:**
- Produces: `getMe(): Promise<{ id: string; username: string; name: string; role: "owner" | "member" }>`,
  `logout(): Promise<void>`, `createInvite(): Promise<{ code: string; expiresAt: string }>`,
  `listMembers(): Promise<Member[]>`, `removeMember(id: string): Promise<void>` from
  `authService.ts`.

- [ ] **Step 1: Create the client auth service**

Create `packages/client/src/services/authService.ts`:

```ts
import { api, setToken } from "../lib/api";

export interface Me {
  id: string;
  username: string;
  name: string;
  role: "owner" | "member";
}

export interface Member {
  id: string;
  username: string;
  name: string;
  role: "owner" | "member";
  createdAt: string;
}

export function getMe(): Promise<Me> {
  return api.get<Me>("/api/auth/me");
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout", {});
  setToken("");
}

export function createInvite(): Promise<{ code: string; expiresAt: string }> {
  return api.post("/api/members/invite", {});
}

export function listMembers(): Promise<Member[]> {
  return api.get<Member[]>("/api/members");
}

export function removeMember(id: string): Promise<void> {
  return api.del(`/api/members/${id}`);
}
```

- [ ] **Step 2: Read `ProfilePage.vue`'s existing token section and its test file**

```bash
grep -n "API-Token\|tokenInput\|saveToken\|token-row" packages/client/src/pages/ProfilePage.vue
cat tests/client/pages/ProfilePage.test.ts 2>/dev/null | head -40
```

Note the exact line ranges of the existing "API-Token" `<script>` block (the `tokenInput`,
`tokenVisible`, `saveToken` declarations) and its `<template>` section (the `.token-row` markup) —
both are deleted in Step 3/4. Note the test file's mounting/mocking conventions before Step 5.

- [ ] **Step 3: Remove the raw token field from the script block**

Delete the `tokenInput`, `tokenVisible`, and `saveToken` declarations, and the
`getToken`/`setToken` import if nothing else in the file uses it (check first — if
`getToken`/`setToken` are used elsewhere in this file, keep the import and only remove the
now-dead declarations).

Add, in their place:

```ts
import { onMounted, ref } from "vue"; // merge with existing Vue imports if already present
import { createInvite, getMe, listMembers, logout, removeMember, type Me, type Member } from "../services/authService";

const me = ref<Me | null>(null);
const members = ref<Member[]>([]);
const inviteCode = ref<string | null>(null);
const inviteBusy = ref(false);

onMounted(async () => {
  me.value = await getMe();
  if (me.value.role === "owner") {
    members.value = await listMembers();
  }
});

async function generateInvite() {
  inviteBusy.value = true;
  try {
    const invite = await createInvite();
    inviteCode.value = invite.code;
  } finally {
    inviteBusy.value = false;
  }
}

async function removeMemberAndRefresh(id: string) {
  await removeMember(id);
  members.value = await listMembers();
}

async function handleLogout() {
  await logout();
  window.location.reload();
}
```

- [ ] **Step 4: Replace the template's "API-Token" section**

Find the `<h2 class="eyebrow">API-Token</h2>` block and everything through its closing `</div>`
for `.token-row` — replace it with:

```vue
<div v-if="me?.role === 'owner'" class="card surface-hybrid">
  <h2 class="eyebrow">Mitglieder</h2>
  <ul v-if="members.length" class="member-list">
    <li v-for="member in members" :key="member.id" class="member-row">
      <span>{{ member.name }} ({{ member.username }})</span>
      <button v-if="member.role !== 'owner'" class="btn-secondary" @click="removeMemberAndRefresh(member.id)">
        Entfernen
      </button>
    </li>
  </ul>
  <button class="btn-primary" :disabled="inviteBusy" @click="generateInvite">
    {{ inviteBusy ? "…" : "Einladungscode erstellen" }}
  </button>
  <p v-if="inviteCode" class="invite-code">Code: <strong>{{ inviteCode }}</strong> (24h gültig)</p>
</div>
<div class="card surface-hybrid">
  <button class="btn-secondary btn-block" @click="handleLogout">Abmelden</button>
</div>
```

Add matching scoped styles (`.member-list`, `.member-row`, `.invite-code`) following the file's
existing `<style scoped>` conventions for spacing/typography tokens (`var(--sp2)`, `var(--dim)`,
etc. — match whatever the rest of the file already uses for similar list rows).

- [ ] **Step 5: Update/extend the page test**

In `tests/client/pages/ProfilePage.test.ts`, remove any test asserting the old token-save
behavior (`saveToken`, the "API-Token" heading) and add, matching the file's existing mock/mount
conventions:

```ts
it("shows the members section and lets the owner generate an invite code", async () => {
  vi.spyOn(authService, "getMe").mockResolvedValue({ id: "u1", username: "owner", name: "Owner", role: "owner" });
  vi.spyOn(authService, "listMembers").mockResolvedValue([]);
  vi.spyOn(authService, "createInvite").mockResolvedValue({ code: "ABCD2345", expiresAt: new Date().toISOString() });
  const wrapper = mountWithProviders(ProfilePage);
  await flushPromises();
  await wrapper.find("button:has-text('Einladungscode erstellen')").trigger("click");
  // adjust selector to whatever this test file's existing convention uses for button lookup
  await flushPromises();
  expect(wrapper.text()).toContain("ABCD2345");
});

it("hides the members section for a non-owner", async () => {
  vi.spyOn(authService, "getMe").mockResolvedValue({ id: "u2", username: "member1", name: "Member", role: "member" });
  const wrapper = mountWithProviders(ProfilePage);
  await flushPromises();
  expect(wrapper.text()).not.toContain("Mitglieder");
});
```

(Adjust the button-lookup selector to whatever pattern this specific test file already uses
elsewhere — `find('button.btn-primary')`, a `data-testid`, or similar; read Step 2's file dump to
match it exactly rather than guessing a Playwright-style `:has-text` selector Vue Test Utils may
not support.)

- [ ] **Step 6: Run the test suite**

```bash
pnpm vitest run tests/client/pages/ProfilePage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @liftr/client exec vue-tsc --noEmit
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/pages/ProfilePage.vue packages/client/src/services/authService.ts tests/client/pages/ProfilePage.test.ts
git commit -m "feat(client): add member management + logout, remove raw token field"
```

---

### Task 13: Full-repo verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

```bash
pnpm typecheck
```

Expected: clean across all 6 packages.

- [ ] **Step 2: Full test suite**

```bash
pnpm test
```

Expected: all green except the pre-existing, unrelated `rankService.test.ts` `computeRankEventsByWeekday`
tie-break flake (documented in this session's history — a `findLoggedSetsForExercise` ordering
issue, out of scope for this feature).

- [ ] **Step 3: Full lint**

```bash
pnpm lint
```

Expected: no new warnings/errors beyond the pre-existing ones already present before this plan
(`ReviewStep.vue`'s unused `computed` import, `.remember/tmp/last-ndc.ts`).

- [ ] **Step 4: Grep for leftover references to the removed token system**

```bash
grep -rn "LIFTR_TOKEN\|env\.token\|userContext" packages/ tests/ --include=*.ts --include=*.vue
```

Expected: zero hits (aside from historical mentions inside `docs/adr/` — those describe a past
decision and are correct to keep referencing it).

- [ ] **Step 5: Manual smoke test**

Start the dev server and client (`pnpm --filter @liftr/server dev`, `pnpm --filter @liftr/client dev`
in separate terminals), open the app in a browser:
1. Confirm the setup screen appears (fresh `data/liftr.db` from Task 1 Step 5).
2. Set an owner password, confirm the app loads.
3. In Settings, generate an invite code.
4. Open a private/incognito window, navigate to `<dev-url>/?invite=<code>`, confirm the join form
   appears, register a member account, confirm the app loads as that member.
5. As the member, confirm the Members section is absent from Settings.
6. Log out as the member; confirm the login form reappears and the member can log back in.
7. As the owner, confirm the new member appears in the Members list and can be removed.

- [ ] **Step 6: Commit the spec/plan docs if not already committed**

```bash
git add docs/superpowers/specs/2026-09-08-multi-account-login-design.md docs/superpowers/plans/2026-09-08-multi-account-login.md
git commit -m "docs: add multi-account login design + implementation plan"
```
