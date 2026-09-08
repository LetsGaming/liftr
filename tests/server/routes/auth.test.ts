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
