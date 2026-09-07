import { beforeEach, describe, expect, it } from "vitest";
import { exerciseMuscles, muscles, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import { computeMuscleLastTrained } from "~server/services/readinessService.js";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function insertMuscle(slug: string) {
  const [row] = await db.insert(muscles).values({ slug, svgRegionKey: `mb-${slug}` }).returning();
  return row!;
}

async function linkExerciseMuscle(exerciseId: string, muscleId: string, role: "primary" | "secondary") {
  await db.insert(exerciseMuscles).values({ exerciseId, muscleId, role });
}

async function logSet(exerciseId: string, loggedAt: Date) {
  const [workout] = await db
    .insert(workouts)
    .values({ clientId: `w-${Math.random()}`, startedAt: loggedAt, pausedSeconds: 0 })
    .returning();
  const [we] = await db
    .insert(workoutExercises)
    .values({ workoutId: workout!.id, exerciseId, orderIndex: 0 })
    .returning();
  await db.insert(sets).values({
    workoutExerciseId: we!.id,
    setIndex: 0,
    weightKg: 50,
    reps: 5,
    kind: "normal",
    isWarmup: false,
    loggedAt,
    clientId: `s-${Math.random()}`,
  });
}

describe("computeMuscleLastTrained", () => {
  it("returns an empty array when no muscles are modeled", async () => {
    expect(await computeMuscleLastTrained(db)).toEqual([]);
  });

  it("reports lastTrainedAt null and wasPrimary true for a muscle never trained", async () => {
    await insertMuscle("chest");

    const result = await computeMuscleLastTrained(db);

    expect(result).toEqual([{ slug: "chest", lastTrainedAt: null, wasPrimary: true }]);
  });

  it("reports the most recent set's timestamp and role for a trained muscle", async () => {
    const muscle = await insertMuscle("chest");
    const exercise = await insertTestExercise(db);
    await linkExerciseMuscle(exercise.id, muscle.id, "primary");
    const loggedAt = new Date("2026-09-01T10:00:00Z");
    await logSet(exercise.id, loggedAt);

    const result = await computeMuscleLastTrained(db);

    expect(result).toEqual([{ slug: "chest", lastTrainedAt: loggedAt.toISOString(), wasPrimary: true }]);
  });

  it("picks whichever involvement happened most recently, primary or secondary", async () => {
    const muscle = await insertMuscle("triceps");
    const primaryExercise = await insertTestExercise(db);
    const secondaryExercise = await insertTestExercise(db);
    await linkExerciseMuscle(primaryExercise.id, muscle.id, "primary");
    await linkExerciseMuscle(secondaryExercise.id, muscle.id, "secondary");

    // primary involvement happened earlier...
    await logSet(primaryExercise.id, new Date("2026-09-01T10:00:00Z"));
    // ...but a secondary involvement happened more recently, so it wins for "last trained."
    const laterLoggedAt = new Date("2026-09-03T10:00:00Z");
    await logSet(secondaryExercise.id, laterLoggedAt);

    const result = await computeMuscleLastTrained(db);

    expect(result).toEqual([{ slug: "triceps", lastTrainedAt: laterLoggedAt.toISOString(), wasPrimary: false }]);
  });

  it("returns one row per muscle, covering both trained and untrained muscles together", async () => {
    const trained = await insertMuscle("back");
    await insertMuscle("calves");
    const exercise = await insertTestExercise(db);
    await linkExerciseMuscle(exercise.id, trained.id, "primary");
    await logSet(exercise.id, new Date("2026-09-01T10:00:00Z"));

    const result = await computeMuscleLastTrained(db);

    expect(result).toHaveLength(2);
    const bySlug = Object.fromEntries(result.map((r) => [r.slug, r]));
    expect(bySlug.back!.lastTrainedAt).not.toBeNull();
    expect(bySlug.calves!.lastTrainedAt).toBeNull();
  });
});
