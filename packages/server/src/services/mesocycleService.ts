import { generateMesocycleWeekPercents } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { NotFoundError } from "../lib/errors.js";
import {
  deleteMesocycleForRoutine,
  findMesocycleByRoutineId,
  insertMesocycle,
  updateMesocycleCurrentWeek,
  type Mesocycle,
} from "../repositories/mesocycleRepository.js";

/** Attach a new cycle to a routine, replacing any existing one — a routine has at most one
 *  active mesocycle at a time (schema.ts: `routineId` is unique on the mesocycles table). */
export async function startMesocycle(db: LiftrDb, routineId: string, totalWeeks: number): Promise<Mesocycle> {
  const weekPercents = generateMesocycleWeekPercents(totalWeeks);
  await deleteMesocycleForRoutine(db, routineId);
  return insertMesocycle(db, routineId, totalWeeks, weekPercents);
}

export function endMesocycle(db: LiftrDb, routineId: string) {
  return deleteMesocycleForRoutine(db, routineId);
}

/** Called once a workout on this routine finishes; capped at totalWeeks rather than looping, so
 *  a finished cycle needs a deliberate restart — the one real decision in this file, and why it
 *  isn't just a repository update. */
export async function advanceMesocycle(db: LiftrDb, routineId: string): Promise<Mesocycle> {
  const existing = await findMesocycleByRoutineId(db, routineId);
  if (!existing) throw new NotFoundError("no_active_mesocycle");

  const currentWeek = Math.min(existing.currentWeek + 1, existing.totalWeeks);
  return updateMesocycleCurrentWeek(db, routineId, currentWeek);
}
