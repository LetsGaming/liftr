import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { existsSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { requireAuth } from "./auth.js";
import { db } from "./db.js";
import { env } from "./env.js";
import { ConflictError, NotFoundError } from "./lib/errors.js";
import { registerUserContext } from "./userContext.js";
import { registerBodyweightRoutes } from "./routes/bodyweight.js";
import { registerExerciseRoutes } from "./routes/exercises.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerMesocycleRoutes } from "./routes/mesocycles.js";
import { registerOverallRankRoutes } from "./routes/overallRank.js";
import { registerPlannedRouteRoutes } from "./routes/plannedRoutes.js";
import { registerPrRoutes } from "./routes/prs.js";
import { registerRankEventsRoutes } from "./routes/rankEvents.js";
import { registerRankRoutes } from "./routes/ranks.js";
import { registerReadinessRoutes } from "./routes/readiness.js";
import { registerRoutineRoutes } from "./routes/routines.js";
import { registerRoutineSuggestionRoutes } from "./routes/routineSuggestions.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerStreakRoutes } from "./routes/streak.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerWorkoutRoutes } from "./routes/workouts.js";
import { registerXpRoutes } from "./routes/xp.js";

/**
 * Validation/serialization + the one error handler: typed failures map to responses here,
 * nothing else leaks internals. Factored out of buildApp() so tests can get a real, isolated app
 * instance (`registerXRoutes(app, testDb)` on a bare Fastify()) that exercises the same
 * validation/error behavior as production, without the singleton db/static-file wiring below.
 */
export function configureApp(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  typedApp.setValidatorCompiler(validatorCompiler);
  typedApp.setSerializerCompiler(serializerCompiler);

  // Zod validation failures (now thrown by the compiler above instead of each route's own
  // `.parse()`) and the service layer's typed NotFoundError/ConflictError map to a clean status
  // + body; anything else is a genuinely unexpected failure, logged with its real stack
  // server-side but returned to the client as a bare 500 with no internal detail.
  typedApp.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ZodError || error.code === "FST_ERR_VALIDATION") {
      return reply.code(400).send({ error: "invalid_request", detail: error.message });
    }
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (error instanceof ConflictError) {
      return reply.code(409).send({ error: "conflict", detail: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });

  registerUserContext(typedApp);
  return typedApp;
}

export async function buildApp() {
  const app = configureApp(Fastify({ logger: true }));

  await app.register(cors, { origin: env.allowedOrigins ?? true });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }); // GPX files are small text; 20MB is generous

  // Paths in env.ts are resolved relative to process.cwd() (the package's own directory when
  // run via `pnpm --filter @liftr/server dev/start`), matching how LIFTR_DB_PATH already
  // works — NOT relative to this file's location, which differs between tsx (src/) and the
  // built output (dist/) and previously produced wrong double-nested paths.
  const imagesRoot = path.resolve(process.cwd(), env.imagesDir);
  const clientDistRoot = path.resolve(process.cwd(), env.clientDistDir);

  // Mirrored catalog images — never hotlink third parties at runtime.
  // Missing in a fresh checkout until `pnpm ingest --images` has run — don't fail startup.
  if (existsSync(imagesRoot)) {
    await app.register(staticFiles, { root: imagesRoot, prefix: "/images/", decorateReply: false });
  } else {
    app.log.warn(`images dir ${imagesRoot} does not exist yet — run \`pnpm ingest --images\``);
  }

  // serves the built PWA client in production (single self-hosted origin). In dev, the client
  // runs on its own Vite server and proxies /api here instead — this dir won't exist yet.
  if (existsSync(clientDistRoot)) {
    await app.register(staticFiles, { root: clientDistRoot, prefix: "/", decorateReply: true });
  } else {
    app.log.warn(`client dist ${clientDistRoot} does not exist yet — run \`pnpm --filter @liftr/client build\``);
  }

  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      await requireAuth(request, reply);
    }
  });

  registerExerciseRoutes(app, db, imagesRoot);
  registerRoutineRoutes(app, db);
  registerRoutineSuggestionRoutes(app, db);
  registerMesocycleRoutes(app, db);
  registerWorkoutRoutes(app, db);
  registerSyncRoutes(app, db);
  registerHistoryRoutes(app, db);
  registerRankRoutes(app, db);
  registerRankEventsRoutes(app, db);
  registerOverallRankRoutes(app, db);
  registerPrRoutes(app, db);
  registerReadinessRoutes(app, db);
  registerBodyweightRoutes(app, db);
  registerStreakRoutes(app, db);
  registerSettingsRoutes(app, db);
  registerRunRoutes(app, db);
  registerPlannedRouteRoutes(app, db);
  registerExportRoutes(app, db);
  registerXpRoutes(app, db);

  app.get("/api/health", async () => ({ ok: true }));

  return app;
}
