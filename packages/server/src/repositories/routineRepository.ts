import type { SetKind } from "@liftr/shared";
import { mesocycles, routineExercises, routines, type LiftrDb } from "@liftr/db";
import { and, eq, inArray } from "drizzle-orm";

export interface SetTarget {
  reps: number;
  weightKg: number | null;
  kind?: SetKind;
}

export interface RoutineExerciseInput {
  exerciseId: string;
  orderIndex: number;
  targetSets: SetTarget[];
  supersetGroup?: number | null;
  restBetweenSetsSeconds?: number | null;
  restAfterExerciseSeconds?: number | null;
}

/** `targetSets`/`weekPercents` are stored as JSON text columns — parsing them here, at the
 *  repository edge, is what keeps every caller working with the real domain shape (a real
 *  array) instead of each one having to remember to `JSON.parse` a string column itself
 *  (data-persistence.md: "map storage shapes to clean domain types at the repository edge"). */
export async function findActiveRoutinesWithExercises(db: LiftrDb, userId: string) {
  const rows = await db.query.routines.findMany({
    where: (r, { isNull, and: andOp, eq: eqOp }) => andOp(eqOp(r.userId, userId), isNull(r.archivedAt)),
    with: { routineExercises: { with: { exercise: true } } },
    orderBy: (r, { asc }) => asc(r.orderIndex),
  });

  return rows.map((r) => ({
    ...r,
    routineExercises: r.routineExercises.map((re) => ({
      ...re,
      targetSets: JSON.parse(re.targetSets) as SetTarget[],
    })),
  }));
}

/** `mesocycles` has no `user_id` of its own (child-via-parent, one-to-one with `routines`) — the
 *  caller must already have resolved `routineIds` from `findActiveRoutinesWithExercises` (or
 *  another userId-scoped routine lookup), so ownership is inherited from that set of ids. */
export async function findMesocyclesByRoutineIds(db: LiftrDb, routineIds: string[]) {
  if (routineIds.length === 0) return [];
  const rows = await db.query.mesocycles.findMany({ where: inArray(mesocycles.routineId, routineIds) });
  return rows.map((m) => ({ ...m, weekPercents: JSON.parse(m.weekPercents) as number[] }));
}

export async function insertRoutine(db: LiftrDb, userId: string, name: string, orderIndex: number) {
  const [routine] = await db.insert(routines).values({ userId, name, orderIndex }).returning();
  if (!routine) throw new Error("routine insert failed");
  return routine;
}

export function insertRoutineExercises(db: LiftrDb, routineId: string, exercises: RoutineExerciseInput[]) {
  if (exercises.length === 0) return Promise.resolve();
  return db.insert(routineExercises).values(
    exercises.map((ex) => ({ ...ex, targetSets: JSON.stringify(ex.targetSets), routineId })),
  );
}

export function updateRoutineMeta(db: LiftrDb, userId: string, id: string, patch: { name?: string; orderIndex?: number }) {
  return db.update(routines).set(patch).where(and(eq(routines.userId, userId), eq(routines.id, id)));
}

export function deleteRoutineExercises(db: LiftrDb, routineId: string) {
  return db.delete(routineExercises).where(eq(routineExercises.routineId, routineId));
}

export function archiveRoutine(db: LiftrDb, userId: string, id: string) {
  return db.update(routines).set({ archivedAt: new Date() }).where(and(eq(routines.userId, userId), eq(routines.id, id)));
}

export function findRoutineById(db: LiftrDb, userId: string, id: string) {
  return db.query.routines.findFirst({ where: and(eq(routines.userId, userId), eq(routines.id, id)) });
}
