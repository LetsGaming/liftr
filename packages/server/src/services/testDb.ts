/** In-memory, fully-migrated DB for service-layer tests — real SQLite behavior (constraints,
 *  cascades, uniqueness) without touching disk. Not exported from the package's public surface;
 *  test files import it directly by relative path. */
import { createDb, exercises, runMigrations, type LiftrDb } from "@liftr/db";

export function createTestDb(): LiftrDb {
  const db = createDb(":memory:");
  runMigrations(db);
  return db;
}

export async function insertTestExercise(db: LiftrDb, overrides: Partial<typeof exercises.$inferInsert> = {}) {
  const [row] = await db
    .insert(exercises)
    .values({
      slug: overrides.slug ?? `test-exercise-${Math.random().toString(36).slice(2, 8)}`,
      nameKey: "exercise.test.name",
      movementPattern: "push",
      isBodyweight: false,
      ...overrides,
    })
    .returning();
  return row!;
}
