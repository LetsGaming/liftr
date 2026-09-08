import { z } from "zod";
import type { AppDb } from "../db.js";
import { NotFoundError } from "../lib/errors.js";
import {
  findWorkoutById,
  findWorkoutByClientId,
  findWorkoutWithExercisesAndSets,
  insertWorkout,
  insertWorkoutExercises,
  patchWorkout,
} from "../repositories/workoutRepository.js";
import { deleteWorkoutAndRecomputeRanks } from "../services/workoutService.js";
import type { ZodFastifyInstance } from "../types.js";

const startWorkoutInput = z.object({
  clientId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  startedAt: z.coerce.date(),
  exerciseIds: z.array(z.string()).default([]), // snapshot of the routine's order at session time
});

const patchWorkoutInput = z.object({
  endedAt: z.coerce.date().optional(),
  pausedSeconds: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

const workoutIdParams = z.object({ id: z.string() });
const okResponse = z.object({ ok: z.literal(true) });

export function registerWorkoutRoutes(app: ZodFastifyInstance, db: AppDb) {
  // POST /api/workouts — start a session. Idempotent on clientId, same as /api/sync.
  app.post("/api/workouts", { schema: { body: startWorkoutInput } }, async (req, reply) => {
    const body = req.body;

    const existing = await findWorkoutByClientId(db, req.userId, body.clientId);
    if (existing) return existing;

    const workout = await insertWorkout(db, req.userId, {
      clientId: body.clientId,
      routineId: body.routineId ?? null,
      startedAt: body.startedAt,
      pausedSeconds: 0,
    });

    await insertWorkoutExercises(
      db,
      body.exerciseIds.map((exerciseId, orderIndex) => ({ workoutId: workout.id, exerciseId, orderIndex })),
    );
    reply.code(201);
    return workout;
  });

  // PATCH /api/workouts/:id — finish / pause-seconds / notes.
  app.patch(
    "/api/workouts/:id",
    { schema: { params: workoutIdParams, body: patchWorkoutInput, response: { 200: okResponse } } },
    async (req) => {
      const existing = await findWorkoutById(db, req.userId, req.params.id);
      if (!existing) throw new NotFoundError();
      await patchWorkout(db, req.userId, req.params.id, req.body);
      return { ok: true as const };
    },
  );

  // GET /api/workouts/:id — full detail for the history detail view and share cards.
  app.get("/api/workouts/:id", { schema: { params: workoutIdParams } }, async (req) => {
    const workout = await findWorkoutWithExercisesAndSets(db, req.userId, req.params.id);
    if (!workout) throw new NotFoundError();
    // Collapse the joined `prs` rows (fetched only to detect existence) into a boolean per set,
    // matching the isPr flag FinishSequence.vue already shows for the live finish flow.
    return {
      ...workout,
      workoutExercises: workout.workoutExercises.map((we) => ({
        ...we,
        sets: we.sets.map(({ prs, ...set }) => ({ ...set, isPr: prs.length > 0 })),
      })),
    };
  });

  // DELETE /api/workouts/:id — see services/workoutService.ts for the cascade+recompute this triggers.
  app.delete(
    "/api/workouts/:id",
    { schema: { params: workoutIdParams, response: { 200: okResponse } } },
    async (req) => {
      await deleteWorkoutAndRecomputeRanks(db, req.userId, req.params.id);
      return { ok: true as const };
    },
  );
}
