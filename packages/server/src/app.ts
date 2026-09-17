import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { existsSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { requireAuth } from "./auth.js";
import { db } from "./db.js";
import { env } from "./env.js";
import { dbErrorReporter, fileErrorReporter } from "./lib/errorReporters.js";
import { reportError, type ErrorReporter } from "./lib/errorReporting.js";
import { ConflictError, NotFoundError } from "./lib/errors.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDiagnosticsRoutes } from "./routes/diagnostics.js";
import { registerBodyweightRoutes } from "./routes/bodyweight.js";
import { registerExerciseRoutes } from "./routes/exercises.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerMemberRoutes } from "./routes/members.js";
import { registerMesocycleRoutes } from "./routes/mesocycles.js";
import { registerOverallRankRoutes } from "./routes/overallRank.js";
import { registerPlannedRouteRoutes } from "./routes/plannedRoutes.js";
import { registerPrRoutes } from "./routes/prs.js";
import { registerRankEventsRoutes } from "./routes/rankEvents.js";
import { registerRankRoutes } from "./routes/ranks.js";
import { registerReadinessRoutes } from "./routes/readiness.js";
import { registerRoutineRoutes } from "./routes/routines.js";
import { registerRoutineSuggestionRoutes } from "./routes/routineSuggestions.js";
import { registerOverallRunnerRankRoutes } from "./routes/runOverallRank.js";
import { registerRunPrRoutes } from "./routes/runPrs.js";
import { registerRunRankRoutes } from "./routes/runRanks.js";
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
/** Called only for the genuinely-unexpected (500) branch below — every typed/expected error above
 *  it (validation, not-found, conflict, rate-limit, oversized-body) returns before reaching this,
 *  same as it never reaching `request.log.error`. Defaults to a no-op so every test file that
 *  builds its own bare `configureApp(Fastify())` (see this function's own doc comment) keeps
 *  working unchanged; `buildApp` below is the only caller that passes a real one. */
/** The native app's WebView origin is Capacitor's own localhost (android: https, ios: capacitor:),
 *  never the deployment's domain — so a locked-down LIFTR_ALLOWED_ORIGINS would otherwise silently
 *  break every APK. Safe to always allow: auth is a bearer header out of localStorage, which no
 *  other origin can read regardless of CORS. */
export const NATIVE_APP_ORIGINS = ["https://localhost", "capacitor://localhost"];

export function corsOrigin(allowed: string[] | null): string[] | true {
  return allowed ? [...allowed, ...NATIVE_APP_ORIGINS] : true;
}

export function configureApp(
  app: FastifyInstance,
  opts?: { onUnexpectedError?: (error: FastifyError, request: FastifyRequest) => void },
) {
  const onUnexpectedError = opts?.onUnexpectedError ?? (() => {});
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
    if (error.statusCode === 429) {
      // Thrown by @fastify/rate-limit (see routes/auth.ts's per-route config) — a real client
      // condition, not a server failure, so it must not fall through to the generic 500 below.
      return reply.code(429).send({ error: "rate_limited" });
    }
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      // Thrown by Fastify itself before routing/Zod ever run, once a request exceeds the
      // `bodyLimit` set on the Fastify() constructor — a real client condition (oversized
      // payload), not a server failure, so it must not fall through to the generic 500 below.
      return reply.code(413).send({ error: "payload_too_large" });
    }
    request.log.error(error);
    onUnexpectedError(error, request);
    return reply.code(500).send({ error: "internal_error" });
  });

  return typedApp;
}

export async function buildApp() {
  // Both reporters are free (no external service): a capped DB table (backs the owner-only
  // Diagnostics panel, routes/diagnostics.ts) and a JSON-lines file in the same persistent volume
  // as the DB (see errorReporters.ts). See lib/errorReporting.ts's doc comment for how a future
  // self-hosted Sentry-compatible sink would slot into this same array.
  const errorReporters: ErrorReporter[] = [
    dbErrorReporter(db),
    fileErrorReporter(path.join(path.dirname(path.resolve(process.cwd(), env.dbPath)), "logs", "errors.log")),
  ];

  // Fastify's built-in per-request logging (incoming + completed, both at 'info') logs
  // unconditionally regardless of status code — fine in production, but it turns a dev/seed run
  // into a log line per asset/API call. Muted by default (env.verboseLogging): disable the
  // built-in logging and replace it with a targeted onResponse hook that only logs 4xx/5xx, so a
  // real failure still shows up without the noise of every 200.
  const app = configureApp(
    Fastify({
      logger: env.verboseLogging ? true : { level: "warn" },
      disableRequestLogging: !env.verboseLogging,
      // 1MB — Fastify's own default, made explicit rather than implicit so an oversized request
      // cleanly 413s instead of surfacing as a bare, unexplained 500.
      bodyLimit: 1_048_576,
    }),
    {
      onUnexpectedError: (error, request) => {
        void reportError(
          errorReporters,
          error,
          { method: request.method, url: request.url, statusCode: 500 },
          (err) => request.log.error({ err }, "error reporter failed"),
        );
      },
    },
  );
  if (!env.verboseLogging) {
    app.addHook("onResponse", async (request, reply) => {
      if (reply.statusCode >= 400) {
        request.log.warn({ statusCode: reply.statusCode, method: request.method, url: request.url }, "request failed");
      }
    });
  }

  await app.register(cors, { origin: corsOrigin(env.allowedOrigins) });
  await app.register(helmet, {
    // This server also directly serves the built client PWA as static files (see the
    // clientDistRoot wiring below) — helmet's default CSP would block that app's own inline
    // styles/scripts if left at full strictness. contentSecurityPolicy: false here keeps the
    // scope of this task to the two headers the audit specifically flagged as missing
    // (X-Content-Type-Options, X-Frame-Options) plus HSTS; a hand-tuned CSP for the client bundle
    // is a separate, larger task if wanted later.
    contentSecurityPolicy: false,
    // Helmet's default CORP ("same-origin") would block the native/Capacitor client from loading
    // exercise-catalog images, which it fetches from this server's own absolute (cross-origin, from
    // the app's point of view) URL — see apiBase() in packages/client/src/lib/api.ts. Auth here is
    // a bearer header, not cookies, so CORP's ambient-credential protection doesn't apply anyway.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  await app.register(rateLimit, { global: false }); // opt-in per route below, not applied by default
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
    // /api/auth/{status,setup,login,register} must be reachable with no session yet — they're
    // how a token is obtained in the first place. /api/health must also stay public: Docker
    // healthchecks, the CI boot-smoke test, and external monitoring all need to reach it with no
    // credentials, the same as any other health-check endpoint's usual contract.
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

  registerAuthRoutes(app, db);
  registerMemberRoutes(app, db);
  registerDiagnosticsRoutes(app, db);
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
  registerRunRankRoutes(app, db);
  registerRunPrRoutes(app, db);
  registerOverallRunnerRankRoutes(app, db);
  registerPlannedRouteRoutes(app, db);
  registerExportRoutes(app, db);
  registerXpRoutes(app, db);

  // `service: "liftr"` lets the native app's server-connection picker (ServerGate.vue) tell a
  // real Liftr instance apart from any other server that happens to answer on the same path.
  app.get("/api/health", async () => ({ ok: true, service: "liftr" }));

  return app;
}
