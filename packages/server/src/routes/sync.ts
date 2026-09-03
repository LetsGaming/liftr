import { z } from "zod";
import type { AppDb } from "../db.js";
import { applySyncBatch } from "../services/syncService.js";
import type { ZodFastifyInstance } from "../types.js";

/**
 * The heart of offline (plan 1.1/1.3) — see services/syncService.ts for the actual per-item
 * decisions. This route is just: validate the batch shape, call the service, return its results.
 */

/**
 * `id` here is *client-generated* (crypto.randomUUID() on-device, plan 1.5) — not server-
 * assigned. This is what makes "start today's routine" itself offline-capable (audit §3
 * must-have): the client never needs a round-trip just to get an id back before it can start
 * logging sets against workout_exercise rows that reference it. The server upserts on this id.
 */
const startWorkoutPayload = z.object({
  id: z.string().min(1),
  routineId: z.string().nullable().optional(),
  startedAt: z.coerce.date(),
  exercises: z.array(z.object({ id: z.string().min(1), exerciseId: z.string(), orderIndex: z.number().int() })),
});

/**
 * `kind` replaces the old standalone `isWarmup` boolean on the wire (feedback: "not possible
 * to set what kind of set this is") — `isWarmup` is still the column every rank/XP/history
 * query filters on (see schema.ts's comment), but it's now derived from `kind` in
 * syncService.ts rather than sent independently, so client and server can't disagree about
 * whether a "warmup" kind counts as isWarmup.
 */
const logSetPayload = z.object({
  workoutExerciseId: z.string(),
  setIndex: z.number().int().min(0),
  weightKg: z.number().min(0).nullable(),
  reps: z.number().int().min(0),
  rpe: z.number().nullable().optional(),
  kind: z.enum(["normal", "warmup", "failure", "dropset"]).default("normal"),
  notes: z.string().nullable().optional(),
  loggedAt: z.coerce.date(),
});

const finishWorkoutPayload = z.object({
  workoutId: z.string(),
  endedAt: z.coerce.date(),
  pausedSeconds: z.number().int().min(0).default(0),
  // Workout-level notes (feedback gap: the offline finish_workout payload had no notes field
  // at all, unlike log_set — see activeWorkoutStore.ts's finish()). Rides the same offline-safe
  // outbox path rather than a second online-only PATCH call bolted onto the finish flow.
  notes: z.string().nullable().optional(),
});

/**
 * Mid-session "add exercise" (feedback gap: a busy squat rack / equipment swap had no path
 * but cancelling the whole workout). Same client-generated-id idempotency pattern as
 * start_workout's exercise rows — `id` is minted on-device so the client can start logging
 * sets against it immediately, before this has even synced.
 */
const addExercisePayload = z.object({
  id: z.string().min(1),
  workoutId: z.string().min(1),
  exerciseId: z.string().min(1),
  orderIndex: z.number().int(),
});

const syncItem = z.discriminatedUnion("type", [
  z.object({ clientId: z.string().min(1), type: z.literal("start_workout"), payload: startWorkoutPayload }),
  z.object({ clientId: z.string().min(1), type: z.literal("log_set"), payload: logSetPayload }),
  z.object({ clientId: z.string().min(1), type: z.literal("finish_workout"), payload: finishWorkoutPayload }),
  z.object({ clientId: z.string().min(1), type: z.literal("add_exercise"), payload: addExercisePayload }),
]);

const syncBody = z.object({ items: z.array(syncItem).min(1).max(200) });

export function registerSyncRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.post("/api/sync", { schema: { body: syncBody } }, async (req) => {
    const results = await applySyncBatch(db, req.body.items);
    return { results };
  });
}
