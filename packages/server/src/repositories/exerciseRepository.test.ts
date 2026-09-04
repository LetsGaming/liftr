import { beforeEach, describe, expect, it } from "vitest";
import { muscles, type LiftrDb } from "@liftr/db";
import { insertCustomExercise } from "./exerciseRepository.js";
import { createTestDb } from "../services/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function insertMuscle(slug: string) {
  const [row] = await db.insert(muscles).values({ slug, svgRegionKey: `mb-${slug}` }).returning();
  return row!;
}

describe("insertCustomExercise", () => {
  it("creates the exercise with no muscle tags when none are given", async () => {
    const row = await insertCustomExercise(db, {
      slug: "my-custom-move",
      nameKey: "my-custom-move",
      movementPattern: "push-horizontal",
      isBodyweight: false,
    });

    expect(row.slug).toBe("my-custom-move");
    expect(row.isCustom).toBe(true);
  });

  it("tags the exercise with the given primary/secondary muscles", async () => {
    const chest = await insertMuscle("chest");
    const triceps = await insertMuscle("triceps");

    const row = await insertCustomExercise(db, {
      slug: "my-custom-press",
      nameKey: "my-custom-press",
      movementPattern: "push-horizontal",
      isBodyweight: false,
      muscleSlugs: [
        { slug: "chest", role: "primary" },
        { slug: "triceps", role: "secondary" },
      ],
    });

    const tagged = await db.query.exerciseMuscles.findMany({ where: (em, { eq }) => eq(em.exerciseId, row.id) });
    expect(tagged).toHaveLength(2);
    expect(tagged.find((t) => t.muscleId === chest.id)?.role).toBe("primary");
    expect(tagged.find((t) => t.muscleId === triceps.id)?.role).toBe("secondary");
  });

  it("silently skips an unknown muscle slug rather than throwing", async () => {
    const chest = await insertMuscle("chest");

    const row = await insertCustomExercise(db, {
      slug: "my-custom-fly",
      nameKey: "my-custom-fly",
      movementPattern: "isolation",
      isBodyweight: false,
      muscleSlugs: [
        { slug: "chest", role: "primary" },
        { slug: "not-a-real-muscle", role: "secondary" },
      ],
    });

    const tagged = await db.query.exerciseMuscles.findMany({ where: (em, { eq }) => eq(em.exerciseId, row.id) });
    expect(tagged).toHaveLength(1);
    expect(tagged[0]?.muscleId).toBe(chest.id);
  });
});
