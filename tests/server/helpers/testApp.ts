import Fastify from "fastify";
import { configureApp } from "~server/app.js";
import { createTestDb } from "./testDb.js";

/** Fresh in-memory-db Fastify instance per call — register only the route(s) under test on it,
 *  e.g. `const { app, db } = createTestApp(); registerXpRoutes(app, db);`. Real validation/
 *  error-handling (configureApp), no static files/CORS/auth wiring from the production app. */
export function createTestApp() {
  const app = configureApp(Fastify({ logger: false }));
  const db = createTestDb();
  return { app, db };
}
