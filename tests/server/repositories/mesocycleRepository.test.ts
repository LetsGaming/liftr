import { beforeEach, describe, expect, it } from "vitest";
import { routines, type LiftrDb } from "@liftr/db";
import {
  deleteMesocycleForRoutine,
  findMesocycleByRoutineId,
  insertMesocycle,
  updateMesocycleCurrentWeek,
} from "~server/repositories/mesocycleRepository.js";
import { createTestDb } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function insertRoutine(name = "Push Day") {
  const [row] = await db.insert(routines).values({ name }).returning();
  return row!;
}

describe("insertMesocycle", () => {
  it("creates the cycle starting at week 1 and round-trips the week-percent curve", async () => {
    const routine = await insertRoutine();

    const meso = await insertMesocycle(db, routine.id, 4, [1, 0.9, 1.1, 0.5]);

    expect(meso.routineId).toBe(routine.id);
    expect(meso.totalWeeks).toBe(4);
    expect(meso.currentWeek).toBe(1);
    expect(meso.weekPercents).toEqual([1, 0.9, 1.1, 0.5]);
  });
});

describe("findMesocycleByRoutineId", () => {
  it("returns null when the routine has no mesocycle", async () => {
    const routine = await insertRoutine();

    const result = await findMesocycleByRoutineId(db, routine.id);

    expect(result).toBeNull();
  });

  it("returns the mesocycle with the JSON weekPercents parsed back into an array", async () => {
    const routine = await insertRoutine();
    await insertMesocycle(db, routine.id, 3, [0.8, 1, 1.2]);

    const result = await findMesocycleByRoutineId(db, routine.id);

    expect(result).not.toBeNull();
    expect(result!.weekPercents).toEqual([0.8, 1, 1.2]);
    expect(result!.totalWeeks).toBe(3);
  });
});

describe("updateMesocycleCurrentWeek", () => {
  it("advances the current week and preserves the rest of the row", async () => {
    const routine = await insertRoutine();
    await insertMesocycle(db, routine.id, 6, [1, 1, 1, 1, 1, 1]);

    const updated = await updateMesocycleCurrentWeek(db, routine.id, 3);

    expect(updated.currentWeek).toBe(3);
    expect(updated.totalWeeks).toBe(6);
    expect(updated.weekPercents).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("throws when no mesocycle exists for the routine", async () => {
    const routine = await insertRoutine();

    await expect(updateMesocycleCurrentWeek(db, routine.id, 2)).rejects.toThrow();
  });
});

describe("deleteMesocycleForRoutine", () => {
  it("removes the mesocycle so a subsequent lookup returns null", async () => {
    const routine = await insertRoutine();
    await insertMesocycle(db, routine.id, 4, [1, 1, 1, 1]);

    await deleteMesocycleForRoutine(db, routine.id);

    const result = await findMesocycleByRoutineId(db, routine.id);
    expect(result).toBeNull();
  });

  it("does not throw when there is nothing to delete", async () => {
    const routine = await insertRoutine();

    await expect(deleteMesocycleForRoutine(db, routine.id)).resolves.not.toThrow();
  });
});
