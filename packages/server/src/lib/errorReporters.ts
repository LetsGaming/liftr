import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { LiftrDb } from "@liftr/db";
import { insertErrorLog, pruneErrorLogs } from "../repositories/errorLogRepository.js";
import type { ErrorReporter } from "./errorReporting.js";

/** Backs the owner-only Diagnostics panel (routes/diagnostics.ts) — "has this broken recently",
 *  visible from inside the app itself, no server/log access needed. */
export function dbErrorReporter(db: LiftrDb): ErrorReporter {
  return {
    async report(error, context) {
      await insertErrorLog(db, { ...context, message: error.message, stack: error.stack });
      await pruneErrorLogs(db);
    },
  };
}

/** One JSON line per error, appended to a file under the same persistent volume as the SQLite
 *  DB — durable across container restarts, greppable, and swept up for free by the `tar`-the-
 *  whole-volume backup docs/operations/docker-deployment.md already documents. Deliberately not
 *  rotated: this app's error volume (unexpected 500s only, not routine request logging) makes
 *  unbounded growth a non-issue for years of uptime.
 *  ponytail: no rotation — if this instance ever produces enough errors for that to matter,
 *  something much bigger is already wrong; add rotation (or point this at pino instead) then. */
export function fileErrorReporter(logFilePath: string): ErrorReporter {
  return {
    async report(error, context) {
      await mkdir(path.dirname(logFilePath), { recursive: true });
      const line = JSON.stringify({ time: new Date().toISOString(), ...context, message: error.message, stack: error.stack });
      await appendFile(logFilePath, line + "\n");
    },
  };
}
