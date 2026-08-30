import { z } from "zod";
import type { AppDb } from "../db.js";
import {
  archiveRoutine,
  deleteRoutineExercises,
  findActiveRoutinesWithExercises,
  findMesocyclesByRoutineIds,
  insertRoutine,
  insertRoutineExercises,
  updateRoutineMeta,
} from "../repositories/routineRepository.js";
import type { ZodFastifyInstance } from "../types.js";

const setTargetInput = z.object({
  reps: z.number().int().min(1),
  // null = no weight target for this set (plain bodyweight); 0/positive = tracked, including
  // "extra kg" added on top of bodyweight (weighted dips/pull-ups) — see schema.ts's comment
  // on routineExercises.targetSets for the null-vs-0 distinction.
  weightKg: z.number().nullable(),
  // Feature: pre-plan a set's kind (warmup/normal/failure/dropset) when building the routine,
  // not just live during logging (SetKindPicker.vue). Optional/absent = "normal", purely
  // additive to the JSON-stored targetSets column — no migration, no change for old routines.
  kind: z.enum(["normal", "warmup", "failure", "dropset"]).optional(),
});

const routineExerciseInput = z.object({
  exerciseId: z.string(),
  orderIndex: z.number().int().default(0),
  // One {reps, weightKg} target per set (e.g. a 10/8/6 pyramid, optionally with weight targets
  // too) — replaced the reps-only targetRepsPerSet per feedback that there was no way to plan
  // a weight target (or added weight for a bodyweight movement) at all. Set count is this
  // array's length.
  targetSets: z.array(setTargetInput).min(1).default([{ reps: 8, weightKg: null }, { reps: 8, weightKg: null }, { reps: 8, weightKg: null }]),
  supersetGroup: z.number().int().nullable().optional(),
  // Per-exercise rest overrides (feedback: adjustable pause per set / per exercise). Null = fall
  // back to RestTimer's built-in default, same as before either column existed. 0 is a real,
  // legitimate value ("no rest") — the wizard's steppers (ArrangeStep.vue) allow reaching it, so
  // this must accept it too; `.positive()` (>0) rejected a value the client UI itself produces,
  // silently failing the whole routine save (BUG-02).
  restBetweenSetsSeconds: z.number().int().nonnegative().nullable().optional(),
  restAfterExerciseSeconds: z.number().int().nonnegative().nullable().optional(),
});

const routineInput = z.object({
  name: z.string().min(1),
  orderIndex: z.number().int().default(0),
  exercises: z.array(routineExerciseInput).default([]),
});

const routineIdParams = z.object({ id: z.string() });
const okResponse = z.object({ ok: z.literal(true) });

export function registerRoutineRoutes(app: ZodFastifyInstance, db: AppDb) {
  // GET /api/routines — list, with their exercises + any active mesocycle (plan §6.8), for the
  // routine builder + "start today's routine".
  app.get("/api/routines", async () => {
    const rows = await findActiveRoutinesWithExercises(db);
    const mesoRows = await findMesocyclesByRoutineIds(db, rows.map((r) => r.id));
    const mesoByRoutine = new Map(mesoRows.map((m) => [m.routineId, m]));

    return rows.map((r) => ({
      ...r,
      mesocycle: mesoByRoutine.get(r.id) ?? null,
    }));
  });

  // POST /api/routines — create a routine + its exercise list in one call (routine builder, plan 1.4).
  app.post("/api/routines", { schema: { body: routineInput } }, async (req, reply) => {
    const routine = await insertRoutine(db, req.body.name, req.body.orderIndex);
    await insertRoutineExercises(db, routine.id, req.body.exercises);
    reply.code(201);
    return routine;
  });

  // PATCH /api/routines/:id — edit name/order, or replace the exercise list wholesale.
  app.patch(
    "/api/routines/:id",
    { schema: { params: routineIdParams, body: routineInput.partial(), response: { 200: okResponse } } },
    async (req) => {
      const { id } = req.params;
      const body = req.body;
      if (body.name !== undefined || body.orderIndex !== undefined) {
        await updateRoutineMeta(db, id, { name: body.name, orderIndex: body.orderIndex });
      }
      if (body.exercises) {
        await deleteRoutineExercises(db, id);
        await insertRoutineExercises(db, id, body.exercises);
      }
      return { ok: true as const };
    },
  );

  // DELETE /api/routines/:id — soft delete (archive), so past workouts keep a valid routineId.
  app.delete(
    "/api/routines/:id",
    { schema: { params: routineIdParams, response: { 200: okResponse } } },
    async (req) => {
      await archiveRoutine(db, req.params.id);
      return { ok: true as const };
    },
  );
}
