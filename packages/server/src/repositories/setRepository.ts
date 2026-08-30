import { eq } from "drizzle-orm";
import { sets, type LiftrDb } from "@liftr/db";

export function findSetByClientId(db: LiftrDb, clientId: string) {
  return db.query.sets.findFirst({ where: eq(sets.clientId, clientId) });
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

export async function insertSet(db: LiftrDb, values: NewSet) {
  const [row] = await db.insert(sets).values(values).returning();
  if (!row) throw new Error("set insert failed");
  return row;
}
