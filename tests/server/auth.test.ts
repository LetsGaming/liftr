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
