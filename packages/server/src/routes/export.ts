import type { AppDb } from "../db.js";
import { buildExportZip } from "../services/exportService.js";
import type { ZodFastifyInstance } from "../types.js";

/**
 * Data export / backup (plan Phase 6.5) — see services/exportService.ts for what's included and
 * why. No response schema here: this returns a binary zip, not JSON, so a Fastify JSON response
 * schema doesn't apply.
 */
export function registerExportRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/export.zip", async (_req, reply) => {
    const zip = await buildExportZip(db);
    const date = new Date().toISOString().slice(0, 10);
    reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="liftr-export-${date}.zip"`)
      .send(zip);
  });
}
