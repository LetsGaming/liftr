/** In-memory, fully-migrated DB for service-layer tests — real SQLite behavior (constraints,
 *  cascades, uniqueness) without touching disk. Not exported from the package's public surface;
 *  test files import it directly by relative path. */
import { createDb, runMigrations, users, type LiftrDb, exercises } from "@liftr/db";

export function createTestDb(): LiftrDb {
  const db = createDb(":memory:");
  runMigrations(db);
  return db;
}

/** A second, non-owner user — for cross-user isolation tests. The migration already seeds the
 *  owner (OWNER_USER_ID); this is for asserting a member can't see/touch the owner's rows (or
 *  vice versa). */
export async function insertTestUser(db: LiftrDb, overrides: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db
    .insert(users)
    .values({
      name: overrides.name ?? `Test User ${Math.random().toString(36).slice(2, 8)}`,
      role: overrides.role ?? "member",
      ...overrides,
    })
    .returning();
  return row!;
}

export async function insertTestExercise(db: LiftrDb, overrides: Partial<typeof exercises.$inferInsert> = {}) {
  const [row] = await db
    .insert(exercises)
    .values({
      slug: overrides.slug ?? `test-exercise-${Math.random().toString(36).slice(2, 8)}`,
      movementPattern: "push",
      isBodyweight: false,
      ...overrides,
    })
    .returning();
  return row!;
}
