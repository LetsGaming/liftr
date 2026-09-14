/** In-memory, fully-migrated DB for service-layer tests — real SQLite behavior (constraints,
 *  cascades, uniqueness) without touching disk. Not exported from the package's public surface;
 *  test files import it directly by relative path. */
import { createDb, runMigrations, users, type LiftrDb, exercises } from "@liftr/db";
import { createSession } from "~server/repositories/authRepository.js";
import { generateSessionToken, hashSessionToken } from "~server/lib/sessionTokens.js";

export function createTestDb(): LiftrDb {
  const db = createDb(":memory:");
  runMigrations(db);
  return db;
}

/** A second, non-owner user — for cross-user isolation tests. The migration already seeds the
 *  owner (OWNER_USER_ID); this is for asserting a member can't see/touch the owner's rows (or
 *  vice versa). */
export async function insertTestUser(db: LiftrDb, overrides: Partial<typeof users.$inferInsert> = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const [row] = await db
    .insert(users)
    .values({
      username: overrides.username ?? `test-user-${suffix}`,
      name: overrides.name ?? `Test User ${suffix}`,
      role: overrides.role ?? "member",
      ...overrides,
    })
    .returning();
  return row!;
}

/** Inserts a user (or reuses the seeded owner) and a matching session row, returning the raw
 *  token a test can put straight into an `Authorization: Bearer` header. */
export async function insertTestUserWithSession(
  db: LiftrDb,
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<{ user: Awaited<ReturnType<typeof insertTestUser>>; token: string }> {
  const user = await insertTestUser(db, overrides);
  const token = generateSessionToken();
  await createSession(db, user.id, hashSessionToken(token));
  return { user, token };
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
