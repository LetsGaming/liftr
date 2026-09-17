import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { OWNER_USER_ID } from "@liftr/db";
import { configureApp } from "~server/app.js";
import { requireAuth } from "~server/auth.js";
import { createSession } from "~server/repositories/authRepository.js";
import { generateSessionToken, hashSessionToken } from "~server/lib/sessionTokens.js";
import { createTestDb } from "./testDb.js";

/** Fresh in-memory-db Fastify instance per call — register only the route(s) under test on it,
 *  e.g. `const { app, db } = createTestApp(); registerXpRoutes(app, db);`. Real validation/
 *  error-handling (configureApp), no static files/CORS wiring from the production app. Every
 *  route module under test reads `request.userId`/`request.role` (real session data in
 *  production), so this stands in for a resolved session the same way the old single-shared-
 *  token era did — every request here acts as the seeded owner unless the route under test
 *  layers its own auth hook (see `createAuthenticatedTestApp` for tests that need a real,
 *  session-backed hook chain instead).
 *
 *  Also registers @fastify/rate-limit (global: false, same as production's buildApp()) so a
 *  route's `config.rateLimit` is genuinely enforced here rather than silently inert — this is why
 *  the function is `async` and every caller must `await` it (a fire-and-forget `.register()`
 *  measurably does NOT engage the limiter before the first `app.inject()` in practice, despite
 *  Fastify's plugin loader nominally queuing registrations). Do NOT register @fastify/rate-limit
 *  again in an individual test file — registering the same plugin twice on one app instance
 *  throws a duplicate-decorator error. */
export async function createTestApp() {
  const app = configureApp(Fastify({ logger: false }));
  await app.register(rateLimit, { global: false });
  app.addHook("onRequest", async (request) => {
    request.userId = OWNER_USER_ID;
    request.role = "owner";
  });
  const db = createTestDb();
  return { app, db };
}

/** Same as `createTestApp`, but also wires the real `requireAuth` hook and seeds an owner session
 *  — for tests exercising the full `app.ts`-style auth chain rather than registering a route
 *  module directly on a bare instance. Returns the owner's token so a test can override it with a
 *  member's own token when it needs to check role-gating or cross-user isolation. */
export async function createAuthenticatedTestApp() {
  const app = configureApp(Fastify({ logger: false }));
  const db = createTestDb();
  // The migration already seeds the owner (OWNER_USER_ID) — this just gives that existing row a
  // session, rather than inserting a second, colliding user.
  const token = generateSessionToken();
  await createSession(db, OWNER_USER_ID, hashSessionToken(token));
  app.addHook("onRequest", requireAuth(db));
  return { app, db, ownerToken: token };
}
