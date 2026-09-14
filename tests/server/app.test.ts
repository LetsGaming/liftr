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

  // Helmet defaults Cross-Origin-Resource-Policy to "same-origin", which would block the
  // native/Capacitor client from loading exercise-catalog images served from this same API (see
  // app.ts's helmet registration comment). Must be explicitly overridden to "cross-origin".
  it("sets Cross-Origin-Resource-Policy to cross-origin, not helmet's same-origin default", async () => {
    const app = configureApp(Fastify({ logger: false }));
    await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } });
    app.get("/test", async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});
