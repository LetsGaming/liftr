import { z } from "zod";
import type { LiftrDb } from "@liftr/db";
import { requireOwner } from "../lib/requireOwner.js";
import { findRecentErrorLogs } from "../repositories/errorLogRepository.js";
import type { ZodFastifyInstance } from "../types.js";

const errorLogResponse = z.object({
  id: z.string(),
  occurredAt: z.date(),
  method: z.string(),
  url: z.string(),
  statusCode: z.number(),
  message: z.string(),
  stack: z.string().nullable(),
});

/** Owner-only, mirrors routes/members.ts's `requireOwner` gating — same reasoning as the
 *  in-app self-hosted Sentry-alternative doc comment in lib/errorReporting.ts: the last N
 *  unexpected-error occurrences, visible from inside the app, no server/log access needed. */
export function registerDiagnosticsRoutes(app: ZodFastifyInstance, db: LiftrDb) {
  app.get(
    "/api/diagnostics/errors",
    { onRequest: requireOwner, schema: { response: { 200: z.array(errorLogResponse) } } },
    async () => findRecentErrorLogs(db),
  );
}
