import { beforeEach, describe, expect, it } from "vitest";
import { createDb, exercises, muscles, runMigrations, sets, workoutExercises, workouts, type LiftrDb } from "@liftr/db";

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
});
