import { beforeEach, describe, expect, it } from "vitest";
import { routines, type LiftrDb } from "@liftr/db";
import { advanceMesocycle, endMesocycle, startMesocycle } from "./mesocycleService.js";
import { NotFoundError } from "../lib/errors.js";
import { createTestDb } from "./testDb.js";

let db: LiftrDb;
let routineId: string;

beforeEach(async () => {
  db = createTestDb();
  const [routine] = await db.insert(routines).values({ name: "Test Routine" }).returning();
  routineId = routine!.id;
});

describe("startMesocycle", () => {
  it("attaches a cycle starting at week 1 with a generated week-percent curve", async () => {
    const meso = await startMesocycle(db, routineId, 4);
    expect(meso.currentWeek).toBe(1);
    expect(meso.totalWeeks).toBe(4);
    expect(meso.weekPercents).toHaveLength(4);
  });

  it("replaces any existing cycle for the routine rather than creating a second one", async () => {
    await startMesocycle(db, routineId, 4);
    const replaced = await startMesocycle(db, routineId, 6);
    expect(replaced.totalWeeks).toBe(6);
    expect(replaced.currentWeek).toBe(1);
  });
});

describe("advanceMesocycle", () => {
  it("increments currentWeek by one", async () => {
    await startMesocycle(db, routineId, 4);
    const advanced = await advanceMesocycle(db, routineId);
    expect(advanced.currentWeek).toBe(2);
  });

  it("caps at totalWeeks instead of looping past a finished cycle", async () => {
    await startMesocycle(db, routineId, 2);
    await advanceMesocycle(db, routineId); // week 2
    const advanced = await advanceMesocycle(db, routineId); // would be week 3, capped at 2
    expect(advanced.currentWeek).toBe(2);
  });

  it("throws NotFoundError when the routine has no active mesocycle", async () => {
    await expect(advanceMesocycle(db, routineId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("endMesocycle", () => {
  it("detaches the cycle so the routine reverts to plain behavior", async () => {
    await startMesocycle(db, routineId, 4);
    await endMesocycle(db, routineId);
    await expect(advanceMesocycle(db, routineId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
