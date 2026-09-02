import { beforeEach, describe, expect, it } from "vitest";
import { exerciseMuscles, muscles, type LiftrDb } from "@liftr/db";
import { recommendForChosenExercises, suggestExercisesForMuscles } from "./routineSuggestionService.js";
import { createTestDb, insertTestExercise } from "./testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function insertMuscle(slug: string) {
  const [row] = await db.insert(muscles).values({ slug, svgRegionKey: `mb-${slug}` }).returning();
  return row!;
}

async function tagPrimary(exerciseId: string, muscleId: string) {
  await db.insert(exerciseMuscles).values({ exerciseId, muscleId, role: "primary" });
}

describe("suggestExercisesForMuscles", () => {
  it("attributes each pick to the requested muscle that earned it a slot", async () => {
    const chest = await insertMuscle("chest");
    const bench = await insertTestExercise(db, { slug: "bench-press", movementPattern: "push" });
    await tagPrimary(bench.id, chest.id);

    const [result] = await suggestExercisesForMuscles(db, {
      muscleSlugs: ["chest"],
      exercisesPerMuscle: 2,
      ownedEquipment: [],
    });

    expect(result?.exerciseId).toBe(bench.id);
    expect(result?.matchedMuscleSlug).toBe("chest");
    expect(result?.isSubstitute).toBe(false);
  });

  it("flags a pick as a substitute when the preferred exercise needed equipment the user doesn't own", async () => {
    const chest = await insertMuscle("chest");
    const barbellBench = await insertTestExercise(db, {
      slug: "barbell-bench-press",
      movementPattern: "push",
      requiredEquipment: JSON.stringify([{ item: "barbell", tier: "required" }]),
    });
    const pushup = await insertTestExercise(db, {
      slug: "push-up",
      movementPattern: "push",
      isBodyweight: true,
      requiredEquipment: JSON.stringify([]),
    });
    await tagPrimary(barbellBench.id, chest.id);
    await tagPrimary(pushup.id, chest.id);

    const [result] = await suggestExercisesForMuscles(db, {
      muscleSlugs: ["chest"],
      exercisesPerMuscle: 1,
      ownedEquipment: ["dumbbell"], // owns something, but not a barbell — barbell-bench-press is unusable
    });

    expect(result?.exerciseId).toBe(pushup.id);
    expect(result?.matchedMuscleSlug).toBe("chest");
    expect(result?.isSubstitute).toBe(true);
  });

  it("drops a candidate with no usable substitute instead of guessing", async () => {
    const chest = await insertMuscle("chest");
    const barbellBench = await insertTestExercise(db, {
      slug: "barbell-bench-press",
      movementPattern: "push",
      requiredEquipment: JSON.stringify([{ item: "barbell", tier: "required" }]),
    });
    await tagPrimary(barbellBench.id, chest.id);

    const result = await suggestExercisesForMuscles(db, {
      muscleSlugs: ["chest"],
      exercisesPerMuscle: 1,
      ownedEquipment: ["dumbbell"], // no substitute candidates exist at all
    });

    expect(result).toHaveLength(0);
  });

  it("returns an empty list for a muscle slug that doesn't exist", async () => {
    const result = await suggestExercisesForMuscles(db, {
      muscleSlugs: ["not-a-real-muscle"],
      exercisesPerMuscle: 2,
      ownedEquipment: [],
    });
    expect(result).toHaveLength(0);
  });
});

describe("recommendForChosenExercises", () => {
  it("never sets matchedMuscleSlug or isSubstitute — those only apply to muscle-guided suggestions", async () => {
    const exercise = await insertTestExercise(db, { slug: "overhead-press", movementPattern: "push" });

    const [result] = await recommendForChosenExercises(db, [exercise.id]);

    expect(result?.exerciseId).toBe(exercise.id);
    expect(result?.matchedMuscleSlug).toBeUndefined();
    expect(result?.isSubstitute).toBeUndefined();
  });
});
