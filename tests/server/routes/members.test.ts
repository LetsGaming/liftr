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
