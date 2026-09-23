import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import helmet from "@fastify/helmet";
import { configureApp, corsOrigin, NATIVE_APP_ORIGINS } from "~server/app.js";
import { requireAuth } from "~server/auth.js";
import { registerRunRoutes } from "~server/routes/runs.js";
import { createTestApp } from "./helpers/testApp.js";
import { createTestDb } from "./helpers/testDb.js";

describe("cors origin", () => {
  it("reflects any origin when LIFTR_ALLOWED_ORIGINS is unset", () => {
    expect(corsOrigin(null)).toBe(true);
  });

  it("always allows the native app's WebView origins alongside a configured allow-list", () => {
    const result = corsOrigin(["https://liftr.example.com"]);
    expect(result).toEqual(["https://liftr.example.com", ...NATIVE_APP_ORIGINS]);
  });
});

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

describe("validation error responses", () => {
  it("collapses a repeated array-item issue (e.g. a stringified 'ele' on every route point) into a single count", async () => {
    const { app } = await createTestApp();
    registerRunRoutes(app, createTestDb());
    await app.ready();

    const points = Array.from({ length: 50 }, (_, i) => ({ t: "2026-09-21T14:23:52.477Z", lat: 52.5, lon: 13.4, ele: `${i}` }));
    const res = await app.inject({
      method: "POST",
      url: "/api/runs/healthconnect",
      payload: { platformId: "hc-1", workoutType: "WALKING", points },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.detail).toContain("(x50)");
    expect(body.detail.length).toBeLessThan(500);
  });
});

describe("public routes", () => {
  // Mirrors app.ts's onRequest hook (the real allowlist), same pattern as
  // tests/server/routes/auth.test.ts's buildApp helper — avoids depending on the production db
  // singleton buildApp() itself pulls in.
  function appWithAuthHook() {
    const db = createTestDb();
    const app = configureApp(Fastify({ logger: false }));
    app.addHook("onRequest", async (request, reply) => {
      const isPublicRoute =
        request.url === "/api/auth/status" ||
        request.url === "/api/auth/setup" ||
        request.url === "/api/auth/login" ||
        request.url === "/api/auth/register" ||
        request.url === "/api/health";
      if (request.url.startsWith("/api/") && !isPublicRoute) {
        await requireAuth(db)(request, reply);
      }
    });
    app.get("/api/health", async () => ({ ok: true, service: "liftr" }));
    app.get("/api/workouts", async () => ({ workouts: [] }));
    return app;
  }

  it("serves /api/health with no Authorization header — health checks (Docker, CI) need this", async () => {
    const app = appWithAuthHook();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, service: "liftr" });
  });

  it("still requires auth on an ordinary /api/* route", async () => {
    const app = appWithAuthHook();
    const res = await app.inject({ method: "GET", url: "/api/workouts" });
    expect(res.statusCode).toBe(401);
  });
});
