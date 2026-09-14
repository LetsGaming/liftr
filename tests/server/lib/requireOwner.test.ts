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
