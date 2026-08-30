import { mesocycles, type LiftrDb } from "@liftr/db";
import { eq } from "drizzle-orm";

export interface Mesocycle {
  id: string;
  routineId: string;
  totalWeeks: number;
  currentWeek: number;
  weekPercents: number[];
  createdAt: Date;
}

function toDomain(row: typeof mesocycles.$inferSelect): Mesocycle {
  return { ...row, weekPercents: JSON.parse(row.weekPercents) as number[] };
}

export async function findMesocycleByRoutineId(db: LiftrDb, routineId: string): Promise<Mesocycle | null> {
  const row = await db.query.mesocycles.findFirst({ where: eq(mesocycles.routineId, routineId) });
  return row ? toDomain(row) : null;
}

export function deleteMesocycleForRoutine(db: LiftrDb, routineId: string) {
  return db.delete(mesocycles).where(eq(mesocycles.routineId, routineId));
}

export async function insertMesocycle(db: LiftrDb, routineId: string, totalWeeks: number, weekPercents: number[]): Promise<Mesocycle> {
  const [row] = await db
    .insert(mesocycles)
    .values({ routineId, totalWeeks, currentWeek: 1, weekPercents: JSON.stringify(weekPercents) })
    .returning();
  if (!row) throw new Error("mesocycle insert failed");
  return toDomain(row);
}

export async function updateMesocycleCurrentWeek(db: LiftrDb, routineId: string, currentWeek: number): Promise<Mesocycle> {
  const [row] = await db.update(mesocycles).set({ currentWeek }).where(eq(mesocycles.routineId, routineId)).returning();
  if (!row) throw new Error("mesocycle update failed");
  return toDomain(row);
}
