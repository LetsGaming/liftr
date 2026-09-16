import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import type { LiftrDb } from "@liftr/db";
import { OWNER_USER_ID } from "@liftr/db";
import { configureApp } from "~server/app.js";
import { registerDiagnosticsRoutes } from "~server/routes/diagnostics.js";
import { insertErrorLog } from "~server/repositories/errorLogRepository.js";
import { createTestDb } from "../helpers/testDb.js";

let db: LiftrDb;

function buildApp(db: LiftrDb, role: "owner" | "member" = "owner") {
  const app = configureApp(Fastify({ logger: false }));
  app.addHook("onRequest", async (request) => {
    request.userId = OWNER_USER_ID;
    request.role = role;
  });
  registerDiagnosticsRoutes(app, db);
  return app;
}

beforeEach(() => {
  db = createTestDb();
});

describe("GET /api/diagnostics/errors", () => {
  it("lists recorded errors, newest first", async () => {
    await insertErrorLog(db, { method: "GET", url: "/api/first", statusCode: 500, message: "boom 1" });
    await insertErrorLog(db, { method: "POST", url: "/api/second", statusCode: 500, message: "boom 2" });
    const app = buildApp(db);
    const res = await app.inject({ method: "GET", url: "/api/diagnostics/errors" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0].message).toBe("boom 2");
    expect(body[1].message).toBe("boom 1");
  });

  it("403s for a non-owner", async () => {
    const app = buildApp(db, "member");
    const res = await app.inject({ method: "GET", url: "/api/diagnostics/errors" });
    expect(res.statusCode).toBe(403);
  });
});
