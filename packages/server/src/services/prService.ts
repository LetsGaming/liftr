/**
 * Personal Records ledger (workplan-v1 §2). Reads the `prs` table — already fully populated on
 * every workout finish per the rank-recompute pipeline — joined to the exercise's slug (for
 * display via the client's useExerciseName composable) and, where the originating set still
 * exists, the workout it belongs to (for a "jump to this workout" link). Purely additive read
 * access; no new computation, no schema change.
 */
import { desc, eq } from "drizzle-orm";
import { exercises, prs, sets, workoutExercises, type LiftrDb } from "@liftr/db";

export interface PrListItem {
  id: string;
  exerciseId: string;
  exerciseSlug: string;
  /** Literal display name — set for custom exercises. Null for catalog exercises (resolved
   *  client-side via i18n on `exerciseSlug`). */
  exerciseName: string | null;
  kind: "e1rm" | "weight" | "reps" | "volume";
  value: number;
  achievedAt: string;
  workoutId: string | null;
}

export async function getPrs(db: LiftrDb): Promise<PrListItem[]> {
  const rows = await db
    .select({
      id: prs.id,
      exerciseId: prs.exerciseId,
      exerciseSlug: exercises.slug,
      exerciseName: exercises.name,
      kind: prs.kind,
      value: prs.value,
      achievedAt: prs.achievedAt,
      workoutId: workoutExercises.workoutId,
    })
    .from(prs)
    .innerJoin(exercises, eq(prs.exerciseId, exercises.id))
    .leftJoin(sets, eq(prs.setId, sets.id))
    .leftJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .orderBy(desc(prs.achievedAt));

  return rows.map((r) => ({
    ...r,
    achievedAt: r.achievedAt.toISOString(),
  }));
}
