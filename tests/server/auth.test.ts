import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sessions, type LiftrDb } from "@liftr/db";
import { hashSessionToken, generateSessionToken } from "~server/lib/sessionTokens.js";
import { createSession, findSessionByTokenHash } from "~server/repositories/authRepository.js";
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

  it("401s and deletes a session past its expiresAt", async () => {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    await createSession(db, "00000000-0000-4000-8000-000000000001", tokenHash);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.tokenHash, tokenHash));

    const app = buildApp(db);
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    expect(await findSessionByTokenHash(db, tokenHash)).toBeUndefined();
  });

  it("slides expiresAt forward on a valid request", async () => {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    await createSession(db, "00000000-0000-4000-8000-000000000001", tokenHash);
    const before = (await findSessionByTokenHash(db, tokenHash))!.expiresAt.getTime();
    await db.update(sessions).set({ expiresAt: new Date(before - 60_000) }).where(eq(sessions.tokenHash, tokenHash));

    const app = buildApp(db);
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const after = (await findSessionByTokenHash(db, tokenHash))!.expiresAt.getTime();
    expect(after).toBeGreaterThan(before - 60_000);
  });
});
