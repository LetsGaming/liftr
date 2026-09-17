import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import type { LiftrDb } from "@liftr/db";
import { configureApp } from "~server/app.js";
import { registerAuthRoutes } from "~server/routes/auth.js";
import { requireAuth } from "~server/auth.js";
import { createTestDb } from "../helpers/testDb.js";
import { hashPassword } from "~server/lib/passwords.js";
import { createInviteCode, setUserPassword } from "~server/repositories/authRepository.js";

let db: LiftrDb;

async function buildApp(db: LiftrDb) {
  const app = configureApp(Fastify({ logger: false }));
  // Mirrors app.ts's registration (global: false — only routes with their own `config.rateLimit`,
  // set in routes/auth.ts, are actually limited). A fresh app per test gives each test its own
  // rate-limit counter, so this doesn't bleed between tests.
  await app.register(rateLimit, { global: false });
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
    const app = await buildApp(db);
    const res = await app.inject({ method: "GET", url: "/api/auth/status" });
    expect(res.json()).toEqual({ needsSetup: true });
  });

  it("reports needsSetup: false once the owner has a password", async () => {
    await setUserPassword(db, "00000000-0000-4000-8000-000000000001", await hashPassword("ownerpass"));
    const app = await buildApp(db);
    const res = await app.inject({ method: "GET", url: "/api/auth/status" });
    expect(res.json()).toEqual({ needsSetup: false });
  });
});

describe("POST /api/auth/setup", () => {
  it("sets the owner's password and returns a usable token", async () => {
    const app = await buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "ownerpass1" } });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe("string");
  });

  it("rejects a password shorter than 8 characters", async () => {
    const app = await buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "short" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a common password even when it meets the length minimum", async () => {
    const app = await buildApp(db);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { password: "aaaaaaaa" },
    });
    expect(res.statusCode).toBe(400);
  });

  // DoS guard: scrypt's hashing cost scales with input length, so an unbounded password lets a
  // client force expensive hashing on every request.
  it("rejects a password over 128 characters", async () => {
    const app = await buildApp(db);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { password: "a".repeat(129) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses to run again once setup is already done", async () => {
    const app = await buildApp(db);
    await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "ownerpass1" } });
    const res = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "different1" } });
    expect(res.statusCode).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with the correct password", async () => {
    await setUserPassword(db, "00000000-0000-4000-8000-000000000001", await hashPassword("ownerpass1"));
    const app = await buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "owner", password: "ownerpass1" } });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe("string");
  });

  it("rejects a wrong password", async () => {
    await setUserPassword(db, "00000000-0000-4000-8000-000000000001", await hashPassword("ownerpass1"));
    const app = await buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "owner", password: "wrong" } });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an unknown username", async () => {
    const app = await buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "nobody", password: "whatever1" } });
    expect(res.statusCode).toBe(401);
  });

  it("rejects login before setup has ever run (null passwordHash)", async () => {
    const app = await buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "owner", password: "whatever1" } });
    expect(res.statusCode).toBe(401);
  });

  // Timing-side-channel fix: a nonexistent username must still hit the dummy-hash `verifyPassword`
  // call before returning 401, so it isn't measurably faster than a wrong-password check against a
  // real account. A reliable timing assertion in a unit test would be flaky, so this only checks
  // that both branches remain behavior-identical (same status + body) after the fix — the "dummy
  // verifyPassword is unconditionally reached" part is confirmed by reading the diff in
  // packages/server/src/routes/auth.ts, not by timing here.
  it("returns the identical invalid_credentials response for an unknown username and a wrong password on a real account", async () => {
    await setUserPassword(db, "00000000-0000-4000-8000-000000000001", await hashPassword("ownerpass1"));
    const app = await buildApp(db);
    const unknownRes = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "nobody", password: "whatever1" } });
    const wrongPasswordRes = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "owner", password: "wrong1234" } });
    expect(unknownRes.statusCode).toBe(401);
    expect(wrongPasswordRes.statusCode).toBe(401);
    expect(unknownRes.json()).toEqual(wrongPasswordRes.json());
    expect(unknownRes.json()).toEqual({ error: "invalid_credentials" });
  });
});

describe("POST /api/auth/register", () => {
  it("redeems a valid invite code and creates a member", async () => {
    const app = await buildApp(db);
    await createInviteCode(db, { code: "ABCD2345", createdByUserId: "00000000-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 86_400_000) });
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "ABCD2345", username: "newmember", password: "memberpass1" } });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe("string");
  });

  it("rejects an unknown code", async () => {
    const app = await buildApp(db);
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "NOTREAL1", username: "newmember", password: "memberpass1" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a code that's already been used", async () => {
    const app = await buildApp(db);
    await createInviteCode(db, { code: "ABCD2345", createdByUserId: "00000000-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 86_400_000) });
    await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "ABCD2345", username: "first", password: "memberpass1" } });
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "ABCD2345", username: "second", password: "memberpass1" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a duplicate username", async () => {
    const app = await buildApp(db);
    await createInviteCode(db, { code: "ABCD2345", createdByUserId: "00000000-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 86_400_000) });
    await createInviteCode(db, { code: "EFGH6789", createdByUserId: "00000000-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 86_400_000) });
    await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "ABCD2345", username: "dupe", password: "memberpass1" } });
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "EFGH6789", username: "dupe", password: "memberpass1" } });
    expect(res.statusCode).toBe(409);
  });
});

describe("GET /api/auth/me and POST /api/auth/logout", () => {
  it("me returns the current user's identity", async () => {
    const app = await buildApp(db);
    const setupRes = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "ownerpass1" } });
    const token = setupRes.json().token;
    const res = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.json()).toMatchObject({ username: "owner", role: "owner" });
  });

  it("logout invalidates the token", async () => {
    const app = await buildApp(db);
    const setupRes = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "ownerpass1" } });
    const token = setupRes.json().token;
    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { authorization: `Bearer ${token}` } });
    const res = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });
});

describe("DELETE /api/auth/me", () => {
  it("owner cannot self-delete", async () => {
    const app = await buildApp(db);
    const setupRes = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "ownerpass1" } });
    const token = setupRes.json().token;
    const res = await app.inject({ method: "DELETE", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "cannot_delete_owner" });
  });

  it("a member can delete their own account, invalidating their token", async () => {
    const app = await buildApp(db);
    await createInviteCode(db, { code: "ABCD2345", createdByUserId: "00000000-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 86_400_000) });
    const registerRes = await app.inject({ method: "POST", url: "/api/auth/register", payload: { code: "ABCD2345", username: "member1", password: "memberpass1" } });
    const token = registerRes.json().token;

    const deleteRes = await app.inject({ method: "DELETE", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toEqual({ ok: true });

    const meRes = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(meRes.statusCode).toBe(401);
  });
});

describe("POST /api/auth/login rate limiting", () => {
  it("returns 429 after exceeding the attempt limit", async () => {
    const app = await buildApp(db);

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

  // Regression test for the reverse-proxy IP-collapse finding: without a per-username
  // keyGenerator, every request in this test shares the same source IP (app.inject's default),
  // so exhausting one username's bucket would also lock out every other username sharing that
  // IP — exactly what happens for real users behind a reverse proxy with no trustProxy configured
  // (see authRateLimit's comment in routes/auth.ts). Two different usernames must get independent
  // buckets even though they share an IP.
  it(
    "keys the rate limit on username, not just IP — a second username from the same IP still gets its own bucket",
    // 11 failed logins each verify against a real scrypt hash (deliberately slow, see
    // lib/passwords.ts) — comfortably over vitest's 5000ms default on a loaded CI runner.
    async () => {
      const app = await buildApp(db);

      for (let i = 0; i < 10; i++) {
        await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "alice", password: "wrong" } });
      }
      const aliceLocked = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "alice", password: "wrong" } });
      expect(aliceLocked.statusCode).toBe(429);

      const bobFirstAttempt = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "bob", password: "wrong" } });
      expect(bobFirstAttempt.statusCode).not.toBe(429);
    },
    20000,
  );
});

describe("POST /api/auth/register rate limiting", () => {
  // Regression test: an attacker brute-forcing an invite code picks a fresh, never-before-seen
  // username on every attempt. If register were keyed on username (like login's authRateLimit),
  // each attempt would land in its own empty bucket and the limit would never engage. It must
  // instead be keyed on IP (registerRateLimit in routes/auth.ts) so repeated attempts from the
  // same source — all sharing app.inject's default IP — still get throttled.
  it("returns 429 after exceeding the attempt limit, even with a fresh username each time", async () => {
    const app = await buildApp(db);

    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { code: "NOTREAL1", username: `attempt${String(i).padStart(4, "0")}`, password: "memberpass1" },
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
  });
});
