import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, sets, standards, workoutExercises, workouts, type LiftrDb } from "@liftr/db";
import type { FastifyInstance } from "fastify";
import { registerOverallRankRoutes } from "~server/routes/overallRank.js";
import { recomputeRankForExercise } from "~server/services/rankService.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

let app: FastifyInstance;
let db: LiftrDb;

beforeEach(() => {
  ({ app, db } = createTestApp());
  registerOverallRankRoutes(app, db);
});

async function seedStandards(exerciseId: string) {
  await db.insert(standards).values([
    { exerciseId, sex: "male", metric: "load_ratio", tier: "apprentice", division: 3, threshold: 0.5, trust: "real" },
    { exerciseId, sex: "male", metric: "load_ratio", tier: "athlete", division: 3, threshold: 1.1, trust: "real" },
    { exerciseId, sex: "male", metric: "load_ratio", tier: "advanced", division: 3, threshold: 2.2, trust: "real" },
  ]);
}

async function logSet(exerciseId: string, weightKg: number, reps: number, loggedAt: Date = new Date()) {
  const [workout] = await db
    .insert(workouts)
    .values({ clientId: `overall-rank-w-${Math.random()}`, startedAt: new Date(), pausedSeconds: 0 })
    .returning();
  const [we] = await db.insert(workoutExercises).values({ workoutId: workout!.id, exerciseId, orderIndex: 0 }).returning();
  await db.insert(sets).values({
    workoutExerciseId: we!.id,
    setIndex: 0,
    weightKg,
    reps,
    kind: "normal",
    isWarmup: false,
    loggedAt,
    clientId: `overall-rank-s-${Math.random()}`,
  });
}

/** Peak corroboration (XP/rank balancing redesign §3) requires a second, distinct day at the
 *  same or stronger performance before a peak is established. */
async function establishCorroboratedPeak(exerciseId: string, weightKg: number, reps: number) {
  await logSet(exerciseId, weightKg, reps);
  await logSet(exerciseId, weightKg, reps, new Date(Date.now() - 24 * 60 * 60 * 1000));
}

describe("GET /api/overall-rank", () => {
  it("returns null current/peak when nothing has been ranked yet", async () => {
    const res = await app.inject({ method: "GET", url: "/api/overall-rank" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ current: null, peak: null });
  });

  it("returns the aggregated current band once an exercise has a computed rank", async () => {
    const exercise = await insertTestExercise(db);
    await seedStandards(exercise.id);
    await logSet(exercise.id, 90, 8); // clears the athlete threshold at the 75kg fallback bodyweight
    await recomputeRankForExercise(db, OWNER_USER_ID, exercise.id);

    const res = await app.inject({ method: "GET", url: "/api/overall-rank" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.current).toMatchObject({ tier: "athlete" });
    expect(typeof body.current.division).toBe("number");
    expect(typeof body.current.lp).toBe("number");
    expect(body.peak).toBeNull(); // a single, uncorroborated session doesn't establish a peak yet
  });

  it("returns the aggregated peak band once a corroborated peak exists", async () => {
    const exercise = await insertTestExercise(db);
    await seedStandards(exercise.id);
    await establishCorroboratedPeak(exercise.id, 90, 8);
    await recomputeRankForExercise(db, OWNER_USER_ID, exercise.id);

    const res = await app.inject({ method: "GET", url: "/api/overall-rank" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.peak).toMatchObject({ tier: "athlete" });
  });
});
