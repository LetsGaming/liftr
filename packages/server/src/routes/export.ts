import type { AppDb } from "../db.js";
import { buildExportZip } from "../services/exportService.js";
import type { ZodFastifyInstance } from "../types.js";

/**
 * Data export / backup — see services/exportService.ts for what's included and why. No response
 * schema here: this returns a binary zip, not JSON, so a Fastify JSON response schema doesn't
 * apply.
 */
export function registerExportRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/export.zip", async (req, reply) => {
    const zip = await buildExportZip(db, req.userId);
    const date = new Date().toISOString().slice(0, 10);
    reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="liftr-export-${date}.zip"`)
      .send(zip);
  });
}
