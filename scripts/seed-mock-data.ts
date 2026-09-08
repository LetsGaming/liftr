/**
 * Run by scripts/dev-up.mjs against that session's own LIFTR_DB_PATH — never invoked directly
 * outside of it. Brings a freshly-migrated, empty database to "every feature has something real
 * to show" in three phases:
 *
 *  1. Exercise catalog: ingests tools/catalog/curated.yaml (movements, muscles, strength
 *     standards) into this session's DB — always, since a fresh DB has zero exercises. Catalog
 *     *images* are the one part of this that's expensive (network-fetched) and content-identical
 *     across every session, so they're skipped here unless the shared data/images/ dir (see
 *     dev-up.mjs) is still empty — first run on a machine pays that cost once, every session
 *     after reuses it instantly.
 *  2. A user profile: onboarding profile, owned equipment, gym/plate setup, a bodyweight trend,
 *     one custom exercise, three routines (Push/Pull/Bein Tag) with a mesocycle on one of them.
 *  3. ~4 weeks of workout history, fed through the real sync pipeline (applySyncBatch — the exact
 *     function packages/server/src/routes/sync.ts calls for a real client flush) so ranks, PRs,
 *     streaks, and XP all come out correctly derived rather than hand-computed here. Deliberately
 *     varied: some exercises get a corroborated (locked-in) peak, one is left uncorroborated on
 *     purpose, and one (chin-up) is trained early and then never again, so the current-vs-peak
 *     rank decay UI has something real to show too. Plus two finished runs — one GPS-tracked (a
 *     real route with map + replay) and one logged manually (no route/HR/elevation, per POST
 *     /api/runs' actual manual-entry contract) — so both the presence and the absence of
 *     GPS-derived features are covered, not just the happy path.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, OWNER_USER_ID, runMigrations, type LiftrDb } from "@liftr/db";

import { loadCatalog, ingestCatalog } from "../packages/ingest/src/ingestCatalog.js";
import { ingestStandards } from "../packages/ingest/src/ingestStandards.js";
import { ingestImages } from "../packages/ingest/src/ingestImages.js";
import { ingestMuscleAssets } from "../packages/ingest/src/ingestMuscleAssets.js";

import { writeJsonSetting } from "../packages/server/src/repositories/settingsRepository.js";
import { upsertBodyweightLog } from "../packages/server/src/repositories/bodyweightRepository.js";
import { insertCustomExercise } from "../packages/server/src/repositories/exerciseRepository.js";
import { insertRoutine, insertRoutineExercises, type RoutineExerciseInput } from "../packages/server/src/repositories/routineRepository.js";
import { insertMesocycle } from "../packages/server/src/repositories/mesocycleRepository.js";
import { insertRun, insertRunPoints } from "../packages/server/src/repositories/runRepository.js";
import { applySyncBatch, type SyncItem } from "../packages/server/src/services/syncService.js";
import type { GymSetup } from "../packages/server/src/routes/settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const CATALOG_PATH = path.join(repoRoot, "tools/catalog/curated.yaml");
const DB_PATH = process.env.LIFTR_DB_PATH;
const IMAGES_DIR = process.env.LIFTR_IMAGES_DIR ?? path.join(repoRoot, "data/images");

if (!DB_PATH) throw new Error("LIFTR_DB_PATH must be set — run this via scripts/dev-up.mjs, not directly.");

const USER_ID = OWNER_USER_ID;
const BODYWEIGHT_KG = 82;

function daysAgo(n: number, hour = 18, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function round25(kg: number): number {
  return Math.round(kg / 2.5) * 2.5;
}

async function ensureCatalog(db: LiftrDb) {
  console.log("  loading tools/catalog/curated.yaml...");
  const entries = await loadCatalog(CATALOG_PATH);
  await ingestCatalog(db, CATALOG_PATH);
  await ingestStandards(db, entries);
  console.log(`  catalog + standards ingested (${entries.length} exercises).`);

  const hasImages = fs.existsSync(IMAGES_DIR) && fs.readdirSync(IMAGES_DIR).length > 0;
  if (hasImages) {
    console.log(`  ${IMAGES_DIR} already has content — skipping image/muscle-asset fetch.`);
    return;
  }
  console.log("  data/images/ is empty (first run on this machine) — fetching catalog images + muscle assets, this can take a minute...");
  try {
    await ingestImages(entries, IMAGES_DIR);
    await ingestMuscleAssets(IMAGES_DIR);
  } catch (err) {
    // Not fatal: exercises without a photo already fall back to the icon UI — a real, supported
    // state, not a broken one — so a flaky/offline network here shouldn't fail the whole session.
    console.warn(`  ! image/muscle-asset fetch failed (continuing without photos): ${(err as Error).message}`);
  }
}

async function seedProfile(db: LiftrDb) {
  await writeJsonSetting(db, USER_ID, "profile", {
    sex: "male",
    birthYear: 1994,
    experienceLevel: "intermediate",
    workoutsPerWeek: 4,
  });

  await writeJsonSetting(db, USER_ID, "ownedEquipment", ["barbell", "dumbbell", "bodyweight", "cable", "machine"]);

  const gymSetup: GymSetup = {
    barWeights: { barbell: 20 },
    plates: [
      { weightKg: 25, count: 4 },
      { weightKg: 20, count: 2 },
      { weightKg: 10, count: 4 },
      { weightKg: 5, count: 4 },
      { weightKg: 2.5, count: 4 },
      { weightKg: 1.25, count: 2 },
    ],
  };
  await writeJsonSetting(db, USER_ID, "gymSetup", gymSetup);

  // A gently rising trend over the last month, logged every ~3 days (not daily — realistic).
  const start = 80.5;
  const end = BODYWEIGHT_KG;
  const logDays = [27, 24, 21, 18, 15, 12, 9, 6, 3, 0];
  for (let i = 0; i < logDays.length; i++) {
    const weightKg = Math.round((start + ((end - start) * i) / (logDays.length - 1)) * 10) / 10;
    const date = daysAgo(logDays[i]!).toISOString().slice(0, 10);
    await upsertBodyweightLog(db, USER_ID, date, weightKg);
  }
  console.log(`  profile, equipment, gym setup, and a ${logDays.length}-entry bodyweight trend seeded.`);
}

async function findExerciseId(db: LiftrDb, slug: string): Promise<string> {
  const row = await db.query.exercises.findFirst({ where: (e, { eq }) => eq(e.slug, slug) });
  if (!row) throw new Error(`seed-mock-data: catalog exercise "${slug}" not found after ingest`);
  return row.id;
}

interface PlannedSet {
  reps: number;
  weightKg: number | null;
  kind: "normal" | "warmup";
}

interface PlannedExercise {
  slug: string;
  isCustom?: boolean;
  sets: PlannedSet[];
}

interface PlannedSession {
  daysAgo: number;
  routineName: RoutineName;
  exercises: PlannedExercise[];
}

type RoutineName = "Push Tag" | "Pull Tag" | "Bein Tag";
const CUSTOM_EXERCISE_SLUG = "face-pull-cable";

/** Barbell working sets, with one light warmup set in front — weightKg step-repeats every other
 *  occurrence so the exercise gets a real corroborated (locked-in) peak, per ADR-0005. */
function barbellSets(occurrence: number, bwMultiplierAtStep: (step: number) => number, reps: number): PlannedSet[] {
  const step = Math.floor(occurrence / 2);
  const working = round25(BODYWEIGHT_KG * bwMultiplierAtStep(step));
  return [
    { reps: 8, weightKg: round25(working * 0.5), kind: "warmup" },
    { reps, weightKg: working, kind: "normal" },
    { reps, weightKg: working, kind: "normal" },
    { reps, weightKg: working, kind: "normal" },
  ];
}

/** overhead-press deliberately never repeats a weight (step === occurrence, not floor(occ/2)) —
 *  the one exercise in this seed left with an uncorroborated, still-pending peak. */
function overheadPressSets(occurrence: number): PlannedSet[] {
  const working = round25(BODYWEIGHT_KG * (0.45 + occurrence * 0.05));
  return [
    { reps: 8, weightKg: round25(working * 0.5), kind: "warmup" },
    { reps: 5, weightKg: working, kind: "normal" },
    { reps: 5, weightKg: working, kind: "normal" },
    { reps: 5, weightKg: working, kind: "normal" },
  ];
}

/** Bodyweight rep-based movement — reps step-repeat the same way barbellSets' weight does. */
function bodyweightRepSets(occurrence: number, repsAtStep: number[], addedWeightKg: number | null = null): PlannedSet[] {
  const step = Math.floor(occurrence / 2);
  const reps = repsAtStep[step] ?? repsAtStep[repsAtStep.length - 1]!;
  return [
    { reps, weightKg: addedWeightKg, kind: "normal" },
    { reps, weightKg: addedWeightKg, kind: "normal" },
    { reps, weightKg: addedWeightKg, kind: "normal" },
  ];
}

function buildSessionPlan(): PlannedSession[] {
  const dayTypes: ("push" | "pull" | "legs")[] = ["push", "pull", "legs", "push", "pull", "legs", "push", "pull", "legs", "push", "pull", "legs"];
  const sessionDaysAgo = [26, 23, 20, 18, 15, 13, 10, 8, 5, 3, 1, 0];

  let pushOcc = 0;
  let pullOcc = 0;
  let legsOcc = 0;
  let deadliftOcc = 0;

  const sessions: PlannedSession[] = [];
  for (let i = 0; i < dayTypes.length; i++) {
    const dayType = dayTypes[i]!;
    if (dayType === "push") {
      const occ = pushOcc++;
      sessions.push({
        daysAgo: sessionDaysAgo[i]!,
        routineName: "Push Tag",
        exercises: [
          { slug: "bench-press", sets: barbellSets(occ, (s) => 0.95 + s * 0.1, 5) },
          { slug: "overhead-press", sets: overheadPressSets(occ) },
          { slug: "dip", sets: bodyweightRepSets(occ, [10, 13], occ === 3 ? 5 : null) },
        ],
      });
    } else if (dayType === "pull") {
      const occ = pullOcc++;
      const exercises: PlannedExercise[] = [
        { slug: "barbell-row", sets: barbellSets(occ, (s) => 0.7 + s * 0.1, 8) },
        { slug: "pullup", sets: bodyweightRepSets(occ, [6, 8]) },
      ];
      // Last pull session also debuts the custom exercise, so it shows up in history/ranks UI.
      if (occ === 3) {
        exercises.push({
          slug: CUSTOM_EXERCISE_SLUG,
          isCustom: true,
          sets: [
            { reps: 15, weightKg: 15, kind: "normal" },
            { reps: 15, weightKg: 15, kind: "normal" },
            { reps: 15, weightKg: 15, kind: "normal" },
          ],
        });
      }
      sessions.push({ daysAgo: sessionDaysAgo[i]!, routineName: "Pull Tag", exercises });
    } else {
      const occ = legsOcc++;
      const exercises: PlannedExercise[] = [{ slug: "back-squat", sets: barbellSets(occ, (s) => 1.3 + s * 0.15, 5) }];
      // Deadlift every other legs day — realistic programming, and (with only 2 total sessions at
      // the same weight) still ends up corroborated.
      if (occ % 2 === 0) {
        exercises.push({ slug: "deadlift", sets: barbellSets(deadliftOcc++, () => 1.6, 5) });
      }
      sessions.push({ daysAgo: sessionDaysAgo[i]!, routineName: "Bein Tag", exercises });
    }
  }

  // Chin-up: trained twice, early, then never again — enough to corroborate a peak (ADR-0005),
  // then left well past the 21-day decay grace period so current-vs-peak actually diverges.
  sessions.push({ daysAgo: 40, routineName: "Pull Tag", exercises: [{ slug: "chinup", sets: bodyweightRepSets(0, [7]) }] });
  sessions.push({ daysAgo: 37, routineName: "Pull Tag", exercises: [{ slug: "chinup", sets: bodyweightRepSets(1, [7]) }] });

  return sessions;
}

async function seedRoutines(db: LiftrDb, customExerciseId: string): Promise<Record<RoutineName, string>> {
  const routineDefs: { name: RoutineName; exercises: { exerciseSlug: string; isCustom?: boolean; targetSets: RoutineExerciseInput["targetSets"] }[] }[] = [
    {
      name: "Push Tag",
      exercises: [
        { exerciseSlug: "bench-press", targetSets: [{ reps: 5, weightKg: 80 }, { reps: 5, weightKg: 80 }, { reps: 5, weightKg: 80 }] },
        { exerciseSlug: "overhead-press", targetSets: [{ reps: 5, weightKg: 45 }, { reps: 5, weightKg: 45 }, { reps: 5, weightKg: 45 }] },
        { exerciseSlug: "dip", targetSets: [{ reps: 12, weightKg: null }, { reps: 12, weightKg: null }, { reps: 12, weightKg: null }] },
      ],
    },
    {
      name: "Pull Tag",
      exercises: [
        { exerciseSlug: "barbell-row", targetSets: [{ reps: 8, weightKg: 65 }, { reps: 8, weightKg: 65 }, { reps: 8, weightKg: 65 }] },
        { exerciseSlug: "pullup", targetSets: [{ reps: 8, weightKg: null }, { reps: 8, weightKg: null }, { reps: 8, weightKg: null }] },
        { exerciseSlug: CUSTOM_EXERCISE_SLUG, isCustom: true, targetSets: [{ reps: 15, weightKg: 15 }, { reps: 15, weightKg: 15 }, { reps: 15, weightKg: 15 }] },
      ],
    },
    {
      name: "Bein Tag",
      exercises: [
        { exerciseSlug: "back-squat", targetSets: [{ reps: 5, weightKg: 120 }, { reps: 5, weightKg: 120 }, { reps: 5, weightKg: 120 }] },
        { exerciseSlug: "deadlift", targetSets: [{ reps: 5, weightKg: 130 }, { reps: 5, weightKg: 130 }, { reps: 5, weightKg: 130 }] },
      ],
    },
  ];

  const routineIds = {} as Record<RoutineName, string>;
  for (let i = 0; i < routineDefs.length; i++) {
    const def = routineDefs[i]!;
    const routine = await insertRoutine(db, USER_ID, def.name, i);
    routineIds[def.name] = routine.id;

    const exerciseInputs: RoutineExerciseInput[] = [];
    for (let j = 0; j < def.exercises.length; j++) {
      const e = def.exercises[j]!;
      const exerciseId = e.isCustom ? customExerciseId : await findExerciseId(db, e.exerciseSlug);
      exerciseInputs.push({ exerciseId, orderIndex: j, targetSets: e.targetSets });
    }
    await insertRoutineExercises(db, routine.id, exerciseInputs);
  }

  await insertMesocycle(db, routineIds["Bein Tag"], 6, [70, 80, 85, 90, 95, 60]);
  console.log(`  ${routineDefs.length} routines seeded (Push/Pull/Bein Tag), with a 6-week mesocycle on Bein Tag.`);
  return routineIds;
}

async function seedWorkoutHistory(db: LiftrDb, routineIds: Record<RoutineName, string>, customExerciseId: string) {
  const plan = buildSessionPlan();
  let workoutCount = 0;
  let setCount = 0;

  for (const session of plan) {
    const workoutId = randomUUID();
    const startedAt = daysAgo(session.daysAgo, 18, 0);

    const exerciseIdBySlug = new Map<string, string>();
    for (const ex of session.exercises) {
      exerciseIdBySlug.set(ex.slug, ex.isCustom ? customExerciseId : await findExerciseId(db, ex.slug));
    }

    const workoutExercises = session.exercises.map((ex, idx) => ({
      id: randomUUID(),
      exerciseId: exerciseIdBySlug.get(ex.slug)!,
      orderIndex: idx,
    }));

    const items: SyncItem[] = [
      {
        clientId: randomUUID(),
        type: "start_workout",
        payload: { id: workoutId, routineId: routineIds[session.routineName] ?? null, startedAt, exercises: workoutExercises },
      },
    ];

    let setOffsetSeconds = 0;
    for (let i = 0; i < session.exercises.length; i++) {
      const ex = session.exercises[i]!;
      const workoutExerciseId = workoutExercises[i]!.id;
      for (let setIndex = 0; setIndex < ex.sets.length; setIndex++) {
        const set = ex.sets[setIndex]!;
        setOffsetSeconds += 90;
        items.push({
          clientId: randomUUID(),
          type: "log_set",
          payload: {
            workoutExerciseId,
            setIndex,
            weightKg: set.weightKg,
            reps: set.reps,
            kind: set.kind,
            loggedAt: new Date(startedAt.getTime() + setOffsetSeconds * 1000),
          },
        });
        setCount++;
      }
    }

    const endedAt = new Date(startedAt.getTime() + (setOffsetSeconds + 300) * 1000);
    items.push({
      clientId: randomUUID(),
      type: "finish_workout",
      payload: { workoutId, endedAt, pausedSeconds: 0 },
    });

    const results = await applySyncBatch(db, USER_ID, items);
    const errors = results.filter((r) => r.status === "error");
    if (errors.length > 0) {
      throw new Error(`seed-mock-data: sync errors on session ${session.daysAgo}d ago: ${JSON.stringify(errors)}`);
    }
    workoutCount++;
  }

  console.log(`  ${workoutCount} finished workouts seeded (${setCount} sets) across 3 routines, spanning the last 40 days.`);
}

/** A short synthetic loop near Berlin-Tempelhof so /runs has a real route + replay to show. */
async function seedGpsRun(db: LiftrDb) {
  const startedAt = daysAgo(1, 7, 30);
  const pointCount = 20;
  const points = Array.from({ length: pointCount }, (_, i) => {
    const t = startedAt.getTime() + i * 78 * 1000; // ~26 min total, unix ms per RunPoint.t
    const angle = (i / pointCount) * 2 * Math.PI;
    return {
      idx: i,
      t,
      lat: 52.4732 + Math.sin(angle) * 0.004,
      lon: 13.4021 + Math.cos(angle) * 0.006,
      ele: 45 + Math.sin(angle * 2) * 3,
      hr: 148 + Math.round(Math.sin(angle) * 8),
    };
  });

  const run = await insertRun(db, USER_ID, {
    source: "gpx",
    name: "Feierabendlauf",
    startedAt,
    clientId: randomUUID(),
    distanceM: 5200,
    durationS: pointCount * 78,
    avgPaceSPerKm: Math.round((pointCount * 78) / 5.2),
    avgHr: 152,
    elevationGainM: 18,
  });
  await insertRunPoints(db, run.id, points);
  console.log(`  GPS run seeded (${(5200 / 1000).toFixed(1)} km, ${pointCount} route points, map + replay).`);
}

/** Mirrors POST /api/runs' manual-entry path (runImportService.ts's logManualRun): no
 *  RunPoint rows at all (no map, no replay, no HR/elevation), pace derived from distance/duration
 *  — the "what a manual entry can't do that a GPS import can" feature-coverage counterpart to
 *  seedGpsRun. Name left null on purpose: a real manual entry has no title unless the user types
 *  one, so this also exercises the unnamed-run display state. */
async function seedManualRun(db: LiftrDb) {
  const startedAt = daysAgo(3, 6, 45);
  const distanceM = 8000;
  const durationS = 2460; // 41 min

  await insertRun(db, USER_ID, {
    source: "manual",
    name: null,
    startedAt,
    clientId: randomUUID(),
    distanceM,
    durationS,
    avgPaceSPerKm: durationS / (distanceM / 1000),
  });
  console.log(`  Manual run seeded (${(distanceM / 1000).toFixed(1)} km, no route/HR/elevation — manual-entry fallback).`);
}

async function main() {
  const db = createDb(DB_PATH!);
  runMigrations(db);

  console.log("[seed] catalog...");
  await ensureCatalog(db);

  console.log("[seed] profile + equipment + bodyweight...");
  await seedProfile(db);

  console.log("[seed] custom exercise...");
  const customExercise = await insertCustomExercise(db, USER_ID, {
    slug: CUSTOM_EXERCISE_SLUG,
    name: "Face Pull (Kabel)",
    equipment: "cable",
    movementPattern: "pull",
    isBodyweight: false,
    muscleSlugs: [
      { slug: "front-delts", role: "primary" },
      { slug: "traps", role: "secondary" },
    ],
  });
  console.log(`  custom exercise "${customExercise.name}" seeded.`);

  console.log("[seed] routines + mesocycle...");
  const routineIds = await seedRoutines(db, customExercise.id);

  console.log("[seed] workout history (via the real sync pipeline)...");
  await seedWorkoutHistory(db, routineIds, customExercise.id);

  console.log("[seed] runs (GPS + manual entry)...");
  await seedGpsRun(db);
  await seedManualRun(db);

  console.log("[seed] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
