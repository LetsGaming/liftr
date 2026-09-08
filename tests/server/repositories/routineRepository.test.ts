import { beforeEach, describe, expect, it } from "vitest";
import { mesocycles, OWNER_USER_ID, routineExercises, routines, type LiftrDb } from "@liftr/db";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";
import {
  archiveRoutine,
  deleteRoutineExercises,
  findActiveRoutinesWithExercises,
  findMesocyclesByRoutineIds,
  insertRoutine,
  insertRoutineExercises,
  updateRoutineMeta,
} from "~server/repositories/routineRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("findActiveRoutinesWithExercises", () => {
  it("returns non-archived routines ordered by orderIndex, with each exercise's targetSets parsed from JSON", async () => {
    const ex = await insertTestExercise(db);
    await db.insert(routines).values({ name: "Routine B", orderIndex: 1 });
    const [routineA] = await db.insert(routines).values({ name: "Routine A", orderIndex: 0 }).returning();
    await db.insert(routineExercises).values({
      routineId: routineA!.id,
      exerciseId: ex.id,
      orderIndex: 0,
      targetSets: JSON.stringify([{ reps: 5, weightKg: 100 }]),
    });

    const result = await findActiveRoutinesWithExercises(db, OWNER_USER_ID);

    expect(result.map((r) => r.name)).toEqual(["Routine A", "Routine B"]);
    expect(result[0]!.routineExercises).toHaveLength(1);
    expect(result[0]!.routineExercises[0]!.targetSets).toEqual([{ reps: 5, weightKg: 100 }]);
    expect(result[0]!.routineExercises[0]!.exercise.id).toBe(ex.id);
    expect(result[1]!.routineExercises).toEqual([]);
  });

  it("excludes archived routines", async () => {
    await db.insert(routines).values({ name: "Archived", orderIndex: 0, archivedAt: new Date() });
    const [active] = await db.insert(routines).values({ name: "Active", orderIndex: 1 }).returning();

    const result = await findActiveRoutinesWithExercises(db, OWNER_USER_ID);

    expect(result.map((r) => r.id)).toEqual([active!.id]);
  });

  it("returns an empty array when there are no routines at all", async () => {
    const result = await findActiveRoutinesWithExercises(db, OWNER_USER_ID);
    expect(result).toEqual([]);
  });
});

describe("findMesocyclesByRoutineIds", () => {
  it("returns an empty array without querying when given no ids", async () => {
    const result = await findMesocyclesByRoutineIds(db, []);
    expect(result).toEqual([]);
  });

  it("returns matching mesocycles with weekPercents parsed from JSON", async () => {
    const [routine] = await db.insert(routines).values({ name: "R1", orderIndex: 0 }).returning();
    const [otherRoutine] = await db.insert(routines).values({ name: "R2", orderIndex: 1 }).returning();
    await db.insert(mesocycles).values({
      routineId: routine!.id,
      totalWeeks: 4,
      currentWeek: 1,
      weekPercents: JSON.stringify([80, 85, 90, 60]),
    });
    await db.insert(mesocycles).values({
      routineId: otherRoutine!.id,
      totalWeeks: 4,
      currentWeek: 1,
      weekPercents: JSON.stringify([80, 85, 90, 60]),
    });

    const result = await findMesocyclesByRoutineIds(db, [routine!.id]);

    expect(result).toHaveLength(1);
    expect(result[0]!.routineId).toBe(routine!.id);
    expect(result[0]!.weekPercents).toEqual([80, 85, 90, 60]);
  });
});

describe("insertRoutine", () => {
  it("creates and returns the new routine row", async () => {
    const row = await insertRoutine(db, OWNER_USER_ID, "Push Day", 2);

    expect(row.name).toBe("Push Day");
    expect(row.orderIndex).toBe(2);
    expect(row.archivedAt).toBeNull();
  });
});

describe("insertRoutineExercises", () => {
  it("inserts each exercise with its targetSets JSON-stringified", async () => {
    const ex = await insertTestExercise(db);
    const routine = await insertRoutine(db, OWNER_USER_ID, "Pull Day", 0);

    await insertRoutineExercises(db, routine.id, [
      { exerciseId: ex.id, orderIndex: 0, targetSets: [{ reps: 10, weightKg: null }] },
    ]);

    const rows = await db.query.routineExercises.findMany({ where: (re, { eq }) => eq(re.routineId, routine.id) });
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.targetSets)).toEqual([{ reps: 10, weightKg: null }]);
  });

  it("is a no-op when given an empty exercises array", async () => {
    const routine = await insertRoutine(db, OWNER_USER_ID, "Empty Day", 0);

    await insertRoutineExercises(db, routine.id, []);

    const rows = await db.query.routineExercises.findMany({ where: (re, { eq }) => eq(re.routineId, routine.id) });
    expect(rows).toEqual([]);
  });
});

describe("updateRoutineMeta", () => {
  it("patches only the given fields, leaving others untouched", async () => {
    const routine = await insertRoutine(db, OWNER_USER_ID, "Old Name", 0);

    await updateRoutineMeta(db, OWNER_USER_ID, routine.id, { name: "New Name" });

    const updated = await db.query.routines.findFirst({ where: (r, { eq }) => eq(r.id, routine.id) });
    expect(updated!.name).toBe("New Name");
    expect(updated!.orderIndex).toBe(0);
  });
});

describe("deleteRoutineExercises", () => {
  it("removes only the exercises belonging to the given routine", async () => {
    const ex = await insertTestExercise(db);
    const routine = await insertRoutine(db, OWNER_USER_ID, "R1", 0);
    const otherRoutine = await insertRoutine(db, OWNER_USER_ID, "R2", 1);
    await insertRoutineExercises(db, routine.id, [{ exerciseId: ex.id, orderIndex: 0, targetSets: [] }]);
    await insertRoutineExercises(db, otherRoutine.id, [{ exerciseId: ex.id, orderIndex: 0, targetSets: [] }]);

    await deleteRoutineExercises(db, routine.id);

    const remainingForRoutine = await db.query.routineExercises.findMany({ where: (re, { eq }) => eq(re.routineId, routine.id) });
    const remainingForOther = await db.query.routineExercises.findMany({ where: (re, { eq }) => eq(re.routineId, otherRoutine.id) });
    expect(remainingForRoutine).toEqual([]);
    expect(remainingForOther).toHaveLength(1);
  });
});

describe("archiveRoutine", () => {
  it("sets archivedAt so the routine no longer shows up as active", async () => {
    const routine = await insertRoutine(db, OWNER_USER_ID, "To Archive", 0);

    await archiveRoutine(db, OWNER_USER_ID, routine.id);

    const updated = await db.query.routines.findFirst({ where: (r, { eq }) => eq(r.id, routine.id) });
    expect(updated!.archivedAt).not.toBeNull();

    const active = await findActiveRoutinesWithExercises(db, OWNER_USER_ID);
    expect(active.find((r) => r.id === routine.id)).toBeUndefined();
  });
});
