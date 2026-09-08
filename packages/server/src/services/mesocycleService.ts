import { generateMesocycleWeekPercents } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { NotFoundError } from "../lib/errors.js";
import { findRoutineById } from "../repositories/routineRepository.js";
import {
  deleteMesocycleForRoutine,
  findMesocycleByRoutineId,
  insertMesocycle,
  updateMesocycleCurrentWeek,
  type Mesocycle,
} from "../repositories/mesocycleRepository.js";

/** `mesocycles` has no `user_id` of its own (child-via-parent, one-to-one with `routines`) — every
 *  entry point here checks the parent routine belongs to `userId` first, so a guessed/cross-user
 *  routineId is a 404, not a leak into or mutation of someone else's cycle. */
async function assertOwnsRoutine(db: LiftrDb, userId: string, routineId: string): Promise<void> {
  const routine = await findRoutineById(db, userId, routineId);
  if (!routine) throw new NotFoundError();
}

/** Attach a new cycle to a routine, replacing any existing one — a routine has at most one
 *  active mesocycle at a time (schema.ts: `routineId` is unique on the mesocycles table). */
export async function startMesocycle(db: LiftrDb, userId: string, routineId: string, totalWeeks: number): Promise<Mesocycle> {
  await assertOwnsRoutine(db, userId, routineId);
  const weekPercents = generateMesocycleWeekPercents(totalWeeks);
  await deleteMesocycleForRoutine(db, routineId);
  return insertMesocycle(db, routineId, totalWeeks, weekPercents);
}

export async function endMesocycle(db: LiftrDb, userId: string, routineId: string) {
  await assertOwnsRoutine(db, userId, routineId);
  return deleteMesocycleForRoutine(db, routineId);
}

/** Called once a workout on this routine finishes; capped at totalWeeks rather than looping, so
 *  a finished cycle needs a deliberate restart — the one real decision in this file, and why it
 *  isn't just a repository update. */
export async function advanceMesocycle(db: LiftrDb, userId: string, routineId: string): Promise<Mesocycle> {
  await assertOwnsRoutine(db, userId, routineId);
  const existing = await findMesocycleByRoutineId(db, routineId);
  if (!existing) throw new NotFoundError("no_active_mesocycle");

  const currentWeek = Math.min(existing.currentWeek + 1, existing.totalWeeks);
  return updateMesocycleCurrentWeek(db, routineId, currentWeek);
}
