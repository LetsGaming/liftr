import { beforeEach, describe, expect, it } from "vitest";
import { exerciseMuscles, muscles, OWNER_USER_ID, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { findAllMuscles, findMuscleTrainingLog } from "~server/repositories/muscleRepository.js";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function insertMuscle(slug: string) {
  const [row] = await db.insert(muscles).values({ slug, svgRegionKey: `mb-${slug}` }).returning();
  return row!;
}

describe("findAllMuscles", () => {
  it("returns an empty array when there are no muscles", async () => {
    const result = await findAllMuscles(db);
    expect(result).toEqual([]);
  });

  it("returns every muscle row", async () => {
    await insertMuscle("chest");
    await insertMuscle("legs");

    const result = await findAllMuscles(db);

    expect(result.map((m) => m.slug).sort()).toEqual(["chest", "legs"]);
  });
});

describe("findMuscleTrainingLog", () => {
  it("returns an empty array when nothing has been logged", async () => {
    const result = await findMuscleTrainingLog(db, OWNER_USER_ID);
    expect(result).toEqual([]);
  });

  it("returns one row per logged set per tagged muscle, with that muscle's role, most-recently-logged first", async () => {
    const chest = await insertMuscle("chest");
    const triceps = await insertMuscle("triceps");
    const bench = await insertTestExercise(db, { slug: "bench-press-mr" });
    await db.insert(exerciseMuscles).values([
      { exerciseId: bench.id, muscleId: chest.id, role: "primary" },
      { exerciseId: bench.id, muscleId: triceps.id, role: "secondary" },
    ]);

    const [workout] = await db.insert(workouts).values({ clientId: "w-mr", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: bench.id, orderIndex: 0 }).returning();
    await db.insert(sets).values([
      { workoutExerciseId: we!.id, setIndex: 0, weightKg: 60, reps: 8, kind: "normal", isWarmup: false, loggedAt: new Date("2026-09-01T10:00:00Z"), clientId: "s-mr-old" },
      { workoutExerciseId: we!.id, setIndex: 1, weightKg: 65, reps: 6, kind: "normal", isWarmup: false, loggedAt: new Date("2026-09-02T10:00:00Z"), clientId: "s-mr-new" },
    ]);

    const result = await findMuscleTrainingLog(db, OWNER_USER_ID);

    // 2 sets x 2 tagged muscles = 4 rows.
    expect(result).toHaveLength(4);
    expect(new Date(result[0]!.loggedAt).getTime()).toBeGreaterThanOrEqual(new Date(result[result.length - 1]!.loggedAt).getTime());
    const chestRows = result.filter((r) => r.muscleSlug === "chest");
    expect(chestRows).toHaveLength(2);
    expect(chestRows.every((r) => r.role === "primary")).toBe(true);
    const tricepsRows = result.filter((r) => r.muscleSlug === "triceps");
    expect(tricepsRows.every((r) => r.role === "secondary")).toBe(true);
  });

  it("excludes sets for exercises with no muscle tags", async () => {
    const untagged = await insertTestExercise(db, { slug: "untagged-mr" });
    const [workout] = await db.insert(workouts).values({ clientId: "w-mr2", startedAt: new Date(), pausedSeconds: 0 }).returning();
    const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId: untagged.id, orderIndex: 0 }).returning();
    await db.insert(sets).values({ workoutExerciseId: we!.id, setIndex: 0, weightKg: 40, reps: 10, kind: "normal", isWarmup: false, loggedAt: new Date(), clientId: "s-untagged" });

    const result = await findMuscleTrainingLog(db, OWNER_USER_ID);

    expect(result).toEqual([]);
  });
});
