import { describe, expect, it } from "vitest";
import { exerciseMuscles, muscles, type LiftrDb } from "@liftr/db";
import { registerRoutineSuggestionRoutes } from "~server/routes/routineSuggestions.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

async function insertMuscle(db: LiftrDb, slug: string) {
  const [row] = await db.insert(muscles).values({ slug, svgRegionKey: `mb-${slug}` }).returning();
  return row!;
}

describe("POST /api/routines/suggest", () => {
  it("suggests exercises per requested muscle, attributing each pick to its muscle", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);
    const chest = await insertMuscle(db, "chest");
    const bench = await insertTestExercise(db, { slug: "bench-press", movementPattern: "push" });
    await db.insert(exerciseMuscles).values({ exerciseId: bench.id, muscleId: chest.id, role: "primary" });

    const res = await app.inject({
      method: "POST",
      url: "/api/routines/suggest",
      payload: { muscleSlugs: ["chest"], exercisesPerMuscle: 2, ownedEquipment: [] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exercises).toHaveLength(1);
    expect(body.exercises[0]).toMatchObject({ exerciseId: bench.id, slug: "bench-press", matchedMuscleSlug: "chest", isSubstitute: false });
    expect(Array.isArray(body.exercises[0].targetSets)).toBe(true);
  });

  it("returns an empty exercise list for a muscle slug that doesn't exist", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);

    const res = await app.inject({
      method: "POST",
      url: "/api/routines/suggest",
      payload: { muscleSlugs: ["not-a-real-muscle"] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ exercises: [] });
  });

  it("defaults exercisesPerMuscle to 2 when omitted", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);
    const chest = await insertMuscle(db, "chest");
    for (const slug of ["bench-press", "incline-press", "dips"]) {
      const ex = await insertTestExercise(db, { slug, movementPattern: "push" });
      await db.insert(exerciseMuscles).values({ exerciseId: ex.id, muscleId: chest.id, role: "primary" });
    }

    const res = await app.inject({
      method: "POST",
      url: "/api/routines/suggest",
      payload: { muscleSlugs: ["chest"], ownedEquipment: [] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().exercises).toHaveLength(2);
  });

  it("rejects an empty muscleSlugs array", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);

    const res = await app.inject({ method: "POST", url: "/api/routines/suggest", payload: { muscleSlugs: [] } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a missing muscleSlugs field", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);

    const res = await app.inject({ method: "POST", url: "/api/routines/suggest", payload: {} });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects exercisesPerMuscle out of range", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);

    const res = await app.inject({
      method: "POST",
      url: "/api/routines/suggest",
      payload: { muscleSlugs: ["chest"], exercisesPerMuscle: 6 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects an invalid experienceLevel", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);

    const res = await app.inject({
      method: "POST",
      url: "/api/routines/suggest",
      payload: { muscleSlugs: ["chest"], experienceLevel: "expert" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });
});

describe("POST /api/routines/recommend", () => {
  it("recommends sets/reps/weight for already-chosen exercises", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);
    const exercise = await insertTestExercise(db, { slug: "overhead-press", movementPattern: "push" });

    const res = await app.inject({
      method: "POST",
      url: "/api/routines/recommend",
      payload: { exerciseIds: [exercise.id] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exercises).toHaveLength(1);
    expect(body.exercises[0]).toMatchObject({ exerciseId: exercise.id, slug: "overhead-press" });
    expect(body.exercises[0].matchedMuscleSlug).toBeUndefined();
    expect(body.exercises[0].isSubstitute).toBeUndefined();
  });

  it("rejects an empty exerciseIds array", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);

    const res = await app.inject({ method: "POST", url: "/api/routines/recommend", payload: { exerciseIds: [] } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a missing exerciseIds field", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);

    const res = await app.inject({ method: "POST", url: "/api/routines/recommend", payload: {} });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects an invalid experienceLevel", async () => {
    const { app, db } = createTestApp();
    registerRoutineSuggestionRoutes(app, db);
    const exercise = await insertTestExercise(db);

    const res = await app.inject({
      method: "POST",
      url: "/api/routines/recommend",
      payload: { exerciseIds: [exercise.id], experienceLevel: "pro" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });
});
