import { z } from "zod";
import type { AppDb } from "../db.js";
import { advanceMesocycle, endMesocycle, startMesocycle } from "../services/mesocycleService.js";
import type { ZodFastifyInstance } from "../types.js";

const startMesocycleInput = z.object({
  totalWeeks: z.number().int().min(1).max(16),
});

const routineIdParams = z.object({ id: z.string() });

const mesocycleResponse = z.object({
  id: z.string(),
  routineId: z.string(),
  totalWeeks: z.number(),
  currentWeek: z.number(),
  weekPercents: z.array(z.number()),
  createdAt: z.date(),
});

const okResponse = z.object({ ok: z.literal(true) });

/** Periodization / mesocycle (plan §6.8): attach/advance/end a week-by-week intensity curve on a routine. */
export function registerMesocycleRoutes(app: ZodFastifyInstance, db: AppDb) {
  // POST /api/routines/:id/mesocycle — attach a new cycle, replacing any existing one for this routine.
  app.post(
    "/api/routines/:id/mesocycle",
    { schema: { params: routineIdParams, body: startMesocycleInput, response: { 200: mesocycleResponse } } },
    async (req) => {
      return startMesocycle(db, req.params.id, req.body.totalWeeks);
    },
  );

  // DELETE /api/routines/:id/mesocycle — end/detach the cycle; the routine reverts to plain behavior.
  app.delete(
    "/api/routines/:id/mesocycle",
    { schema: { params: routineIdParams, response: { 200: okResponse } } },
    async (req) => {
      await endMesocycle(db, req.params.id);
      return { ok: true as const };
    },
  );

  // POST /api/routines/:id/mesocycle/advance — called once a workout on this routine finishes;
  // capped at totalWeeks rather than looping, so a finished cycle needs a deliberate restart.
  app.post(
    "/api/routines/:id/mesocycle/advance",
    { schema: { params: routineIdParams, response: { 200: mesocycleResponse } } },
    async (req) => {
      return advanceMesocycle(db, req.params.id);
    },
  );
}
