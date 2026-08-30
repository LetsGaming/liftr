import { z } from "zod";
import type { AppDb } from "../db.js";
import { NotFoundError } from "../lib/errors.js";
import { deleteRun, findRecentRuns, findRunById, findRunPoints } from "../repositories/runRepository.js";
import {
  importHealthConnectRun,
  importRunFile,
  logManualRun,
  RunParseError,
  UnsupportedFileFormatError,
} from "../services/runImportService.js";
import type { ZodFastifyInstance } from "../types.js";

/**
 * Running (plan Phase 4): import a GPX you own, or log a run manually with no file. Both
 * paths converge on the same `runs` + `run_points` tables and the same history/streak
 * plumbing — a manual entry and an imported one are indistinguishable downstream (plan 4.4).
 * See services/runImportService.ts for the shared write path all three creation routes share.
 */

const manualRunInput = z.object({
  name: z.string().nullable().optional(),
  startedAt: z.coerce.date(),
  distanceM: z.number().positive(),
  durationS: z.number().positive(),
});

// Health Connect import (plan Phase 5): the client (capacitor-health's queryWorkouts, called
// from the app itself — no separate companion app needed) already resolved a workout's route +
// HR samples into this shape. `platformId` is Health Connect's own record id, reused as the
// idempotency key (same clientId-uniqueness pattern as every other write path) so re-checking
// on app resume never creates duplicate runs for a workout already imported.
const healthConnectRunInput = z.object({
  platformId: z.string().min(1),
  name: z.string().nullable().optional(),
  points: z
    .array(
      z.object({
        t: z.coerce.date(),
        lat: z.number(),
        lon: z.number(),
        ele: z.number().nullable().optional(),
        hr: z.number().nullable().optional(),
      }),
    )
    .min(1),
});

const runIdParams = z.object({ id: z.string() });
const okResponse = z.object({ ok: z.literal(true) });

const runResponse = z.object({
  id: z.string(),
  source: z.enum(["gpx", "fit", "manual", "healthconnect"]),
  name: z.string().nullable(),
  startedAt: z.date(),
  distanceM: z.number(),
  durationS: z.number(),
  avgPaceSPerKm: z.number().nullable(),
  avgHr: z.number().nullable(),
  elevationGainM: z.number().nullable(),
  clientId: z.string(),
});

const runPointResponse = z.object({
  runId: z.string(),
  idx: z.number(),
  t: z.date(),
  lat: z.number(),
  lon: z.number(),
  ele: z.number().nullable(),
  hr: z.number().nullable(),
  cadence: z.number().nullable(),
});

export function registerRunRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/runs", { schema: { response: { 200: z.array(runResponse) } } }, async () => {
    return findRecentRuns(db);
  });

  // GET /api/runs/:id — includes the full point array, needed for both the route map and replay.
  app.get(
    "/api/runs/:id",
    { schema: { params: runIdParams, response: { 200: runResponse.extend({ points: z.array(runPointResponse) }) } } },
    async (req) => {
      const run = await findRunById(db, req.params.id);
      if (!run) throw new NotFoundError();
      const points = await findRunPoints(db, req.params.id);
      return { ...run, points };
    },
  );

  // POST /api/runs/import — multipart GPX or FIT file upload. Multipart bodies aren't JSON, so
  // this can't carry a `schema.body` the way the JSON routes do — validation happens inline.
  app.post("/api/runs/import", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no_file" });
    const buffer = await file.toBuffer();

    try {
      const run = await importRunFile(db, file.filename, buffer);
      reply.code(201);
      return run;
    } catch (err) {
      if (err instanceof UnsupportedFileFormatError) {
        return reply.code(400).send({ error: "unsupported_format", detail: err.message });
      }
      if (err instanceof RunParseError) {
        return reply.code(400).send({ error: "parse_failed", detail: err.message });
      }
      throw err;
    }
  });

  // POST /api/runs/healthconnect — native in-app import via capacitor-health (plan Phase 5).
  app.post(
    "/api/runs/healthconnect",
    { schema: { body: healthConnectRunInput } },
    async (req) => {
      return importHealthConnectRun(db, req.body.platformId, req.body.name ?? null, req.body.points);
    },
  );

  /**
   * DELETE /api/runs/:id (feedback: "not possible to delete past workout/runs"). Cascades to
   * run_points via FK (`PRAGMA foreign_keys = ON`, db/src/client.ts). Runs don't feed XP/LP —
   * only logged sets do (see services/rankService.ts / routes/xp.ts) — so unlike workout
   * deletion there's no rank recompute needed here. Deliberately leaves that date's streak
   * credit alone even if this was the day's only run: the streak's own math (streak.ts) is a
   * simple "was there activity on this date" walk with no per-source undo, and streak wasn't
   * part of the "XP and LP" ask this closes — flagged here rather than silently deciding it for
   * the user.
   */
  app.delete(
    "/api/runs/:id",
    { schema: { params: runIdParams, response: { 200: okResponse } } },
    async (req) => {
      const existing = await findRunById(db, req.params.id);
      if (!existing) throw new NotFoundError();
      await deleteRun(db, req.params.id);
      return { ok: true as const };
    },
  );

  // POST /api/runs — manual fallback for runs without a file (plan 4.4).
  app.post("/api/runs", { schema: { body: manualRunInput } }, async (req, reply) => {
    const run = await logManualRun(db, {
      name: req.body.name ?? null,
      startedAt: req.body.startedAt,
      distanceM: req.body.distanceM,
      durationS: req.body.durationS,
    });
    reply.code(201);
    return run;
  });
}
