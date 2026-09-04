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
      name: "My Custom Move",
      movementPattern: "push-horizontal",
      isBodyweight: false,
    });

    expect(row.slug).toBe("my-custom-move");
    expect(row.isCustom).toBe(true);
    expect(row.name).toBe("My Custom Move");
  });

  it("stores and returns the literal typed name, umlauts and all — the display-name bug this closes (WS2)", async () => {
    // The bug this regression-tests: the exercises table had no `name` column at all, only a
    // `nameKey` i18n key the client's display resolution never actually read — so every custom
    // exercise rendered its machine slug everywhere (list, detail sheet, API response), not what
    // the user typed. Slug transliteration (ü→ue) already worked; the missing name field is the
    // part that was actually broken.
    const row = await insertCustomExercise(db, {
      slug: "ueberkopfdruecken-test",
      name: "Überkopfdrücken Test",
      movementPattern: "push-vertical",
      isBodyweight: false,
    });

    expect(row.name).toBe("Überkopfdrücken Test");
    expect(row.slug).toBe("ueberkopfdruecken-test");
  });

  it("tags the exercise with the given primary/secondary muscles", async () => {
    const chest = await insertMuscle("chest");
    const triceps = await insertMuscle("triceps");

    const row = await insertCustomExercise(db, {
      slug: "my-custom-press",
      name: "My Custom Press",
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
      name: "My Custom Fly",
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
