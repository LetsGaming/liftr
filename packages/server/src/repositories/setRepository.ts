import { and, eq } from "drizzle-orm";
import { sets, type LiftrDb } from "@liftr/db";

export function findSetByClientId(db: LiftrDb, userId: string, clientId: string) {
  return db.query.sets.findFirst({ where: and(eq(sets.userId, userId), eq(sets.clientId, clientId)) });
}

export interface NewSet {
  workoutExerciseId: string;
  setIndex: number;
  weightKg: number | null;
  reps: number;
  rpe?: number | null;
  kind: "normal" | "warmup" | "failure" | "dropset";
  isWarmup: boolean;
  notes?: string | null;
  loggedAt: Date;
  clientId: string;
}

export async function insertSet(db: LiftrDb, userId: string, values: NewSet) {
  const [row] = await db
    .insert(sets)
    .values({ ...values, userId })
    .returning();
  if (!row) throw new Error("set insert failed");
  return row;
}
