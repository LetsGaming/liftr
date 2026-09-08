import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  exercises,
  muscles,
  OWNER_USER_ID,
  ranks,
  runMigrations,
  settings,
  sets,
  users,
  workoutExercises,
  workouts,
  type LiftrDb,
} from "@liftr/db";

let db: LiftrDb;

beforeEach(() => {
  db = createDb(":memory:");
});

function tableNames(database: LiftrDb): string[] {
  const rows = database.$client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

describe("runMigrations", () => {
  it("creates the schema's tables on a fresh db, spot-checked across catalog/log/rank areas", () => {
    runMigrations(db);

    const names = tableNames(db);
    for (const expected of ["exercises", "muscles", "workouts", "sets", "ranks", "streaks", "settings"]) {
      expect(names).toContain(expected);
    }
  });

  it("produces a db that can actually be written to and read from, not just table shells", async () => {
    runMigrations(db);

    const [muscle] = await db.insert(muscles).values({ slug: "chest", svgRegionKey: "mb-chest" }).returning();
    expect(muscle?.slug).toBe("chest");

    const found = await db.query.muscles.findFirst({ where: (m, { eq }) => eq(m.slug, "chest") });
    expect(found?.id).toBe(muscle?.id);
  });

  it("is idempotent — calling it again on an already-migrated db does not error or duplicate applied migrations", async () => {
    runMigrations(db);
    const namesAfterFirstRun = tableNames(db);
    const migrationRowsAfterFirstRun = db.$client
      .prepare("SELECT COUNT(*) as count FROM __drizzle_migrations")
      .get() as { count: number };

    // Insert a row between the two runs so we can also confirm re-running migrations doesn't
    // touch (e.g. wipe or recreate) tables that already exist and already hold data.
    const [exercise] = await db
      .insert(exercises)
      .values({ slug: "bench-press", movementPattern: "push" })
      .returning();

    expect(() => runMigrations(db)).not.toThrow();

    const namesAfterSecondRun = tableNames(db);
    const migrationRowsAfterSecondRun = db.$client
      .prepare("SELECT COUNT(*) as count FROM __drizzle_migrations")
      .get() as { count: number };

    expect(namesAfterSecondRun).toEqual(namesAfterFirstRun);
    expect(migrationRowsAfterSecondRun.count).toBe(migrationRowsAfterFirstRun.count);

    const stillThere = await db.query.exercises.findFirst({ where: (e, { eq }) => eq(e.id, exercise!.id) });
    expect(stillThere?.slug).toBe("bench-press");
  });

  it("leaves foreign key enforcement on across the migration run, so schema-declared cascades/restricts hold immediately after", async () => {
    runMigrations(db);
    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);

    const [exercise] = await db
      .insert(exercises)
      .values({ slug: "row-machine", movementPattern: "pull" })
      .returning();
    const [workout] = await db
      .insert(workouts)
      .values({ startedAt: new Date(), clientId: "client-1" })
      .returning();
    const [workoutExercise] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId: exercise!.id })
      .returning();

    await expect(
      db.insert(sets).values({
        workoutExerciseId: "not-a-real-id",
        setIndex: 0,
        reps: 5,
        loggedAt: new Date(),
        clientId: "client-set-1",
      }),
    ).rejects.toThrow();

    // Sanity: the real workoutExerciseId works, confirming the rejection above was the FK check
    // (not some unrelated column error).
    await expect(
      db.insert(sets).values({
        workoutExerciseId: workoutExercise!.id,
        setIndex: 0,
        reps: 5,
        loggedAt: new Date(),
        clientId: "client-set-2",
      }),
    ).resolves.not.toThrow();
  });

  it("seeds exactly one owner user and leaves the fk graph consistent (multi-user hardening)", async () => {
    runMigrations(db);

    const violations = db.$client.pragma("foreign_key_check") as unknown[];
    expect(violations).toEqual([]);

    const allUsers = await db.query.users.findMany();
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0]).toMatchObject({ id: OWNER_USER_ID, role: "owner" });
  });

  it("defaults per-user rows onto the owner user and enforces composite primary keys (multi-user hardening)", async () => {
    runMigrations(db);

    const [exercise] = await db
      .insert(exercises)
      .values({ slug: "front-squat", movementPattern: "squat" })
      .returning();

    const [rank] = await db
      .insert(ranks)
      .values({
        exerciseId: exercise!.id,
        tier: "initiate",
        division: 1,
        lp: 0,
        e1rm: 0,
        trust: "synthetic",
        computedAt: new Date(),
      })
      .returning();
    expect(rank?.userId).toBe(OWNER_USER_ID);

    // Composite PK (userId, exerciseId) must reject a duplicate for the same owner user.
    await expect(
      db.insert(ranks).values({
        exerciseId: exercise!.id,
        tier: "initiate",
        division: 1,
        lp: 0,
        e1rm: 0,
        trust: "synthetic",
        computedAt: new Date(),
      }),
    ).rejects.toThrow();

    const [setting] = await db.insert(settings).values({ key: "units", value: "metric" }).returning();
    expect(setting?.userId).toBe(OWNER_USER_ID);

    await expect(db.insert(settings).values({ key: "units", value: "imperial" })).rejects.toThrow();
  });

  it("cascades a deleted user onto their own rows without touching the shared exercise catalog (multi-user hardening)", async () => {
    runMigrations(db);

    const [otherUser] = await db.insert(users).values({ name: "Member", role: "member" }).returning();
    const [exercise] = await db
      .insert(exercises)
      .values({ slug: "incline-press", movementPattern: "push" })
      .returning();
    await db.insert(workouts).values({ startedAt: new Date(), clientId: "member-client-1", userId: otherUser!.id });

    await db.delete(users).where(eq(users.id, otherUser!.id));

    const remainingWorkouts = await db.query.workouts.findMany({
      where: (w, { eq: eqOp }) => eqOp(w.userId, otherUser!.id),
    });
    expect(remainingWorkouts).toHaveLength(0);

    const stillCataloged = await db.query.exercises.findFirst({ where: (e, { eq: eqOp }) => eqOp(e.id, exercise!.id) });
    expect(stillCataloged).toBeDefined();
  });
});
