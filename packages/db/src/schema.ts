/**
 * Drizzle schema (plan Phase 0.2). Routine (template) vs Workout (session) is a deliberate,
 * load-bearing split — do not collapse them. `run_points` is kept in full per point (never
 * compressed to a polyline blob) because it is what makes run replay possible (audit §5).
 * Every derived/cache table (`ranks`, `prs`, streak state) must be reconstructible from the
 * raw tables below via a `recompute` pass — see plan "Cross-cutting requirements".
 */
import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const muscles = sqliteTable("muscles", {
  id: id(),
  slug: text("slug").notNull().unique(),
  /** Maps to the mockup's SVG region classes, e.g. mb-lat, mb-trap, ms-bi. */
  svgRegionKey: text("svg_region_key").notNull(),
});

export const exercises = sqliteTable("exercises", {
  id: id(),
  slug: text("slug").notNull().unique(),
  /** Literal display name — set only for custom (user-created) exercises. Null for catalog
   *  exercises, which resolve their name via i18n lookup keyed on `slug`
   *  (`packages/client/src/composables/useExerciseName.ts`: locales/exercises.de.json's
   *  `exercise.${slug}.name`, falling back to the raw slug if even that's missing). Replaces the
   *  former `nameKey` column, which was dead data end-to-end — no display code ever read it, for
   *  either custom or catalog exercises; resolution always went through `slug`. */
  name: text("name"),
  equipment: text("equipment"),
  /** JSON-encoded EquipmentRequirement[] (@liftr/shared) — the full physical requirement list
   *  (e.g. bench-press: barbell + plates + bench), distinct from `equipment` above which is
   *  just the one primary/icon-driving item. Null for legacy rows before this column existed;
   *  callers treat null the same as an empty list. */
  requiredEquipment: text("required_equipment"),
  /** push | pull | squat | hinge | carry | isolation-* — what synthetic derivation joins on. */
  movementPattern: text("movement_pattern").notNull(),
  isBodyweight: integer("is_bodyweight", { mode: "boolean" }).notNull().default(false),
  isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  /** wger CC-BY-SA attribution string, required for the attributions page (plan 3.3). */
  sourceAttribution: text("source_attribution"),
  demoStartImage: text("demo_start_image"),
  demoEndImage: text("demo_end_image"),
  howToKey: text("how_to_key"),
  /** bodyweight-load leverage factor (push-up ~0.64, pull-up 1.0); null for loaded lifts. */
  bodyweightLeverage: real("bodyweight_leverage"),
  createdAt: createdAt(),
});

export const exerciseMuscles = sqliteTable(
  "exercise_muscles",
  {
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    muscleId: text("muscle_id")
      .notNull()
      .references(() => muscles.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["primary", "secondary"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.muscleId] })],
);

// ---------------------------------------------------------------------------
// Routines (templates) vs Workouts (logged sessions)
// ---------------------------------------------------------------------------

export const routines = sqliteTable("routines", {
  id: id(),
  name: text("name").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

export const routineExercises = sqliteTable(
  "routine_exercises",
  {
    id: id(),
    routineId: text("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    orderIndex: integer("order_index").notNull().default(0),
    /** JSON-encoded {reps, weightKg}[], one target per set (e.g. a 10/8/6 pyramid, optionally
     *  with a weight target per set too) — same JSON-text-column convention as
     *  mesocycles.weekPercents. Set *count* is this array's length; there is deliberately no
     *  separate count column to keep in sync. weightKg is nullable: null means "no weight
     *  target for this set" (plain bodyweight — push-ups, pull-ups) as opposed to `0`, which
     *  means "tracked, currently no added weight" (e.g. weighted dips before you've added a
     *  plate) — that distinction is what drives whether SetEntry.vue shows a weight stepper
     *  at all during logging. Replaced the earlier reps-only targetRepsPerSet: number[] (no
     *  way to plan a weight target, or "extra kg" for a bodyweight movement, at all). */
    targetSets: text("target_sets_json").notNull().default('[{"reps":8,"weightKg":null},{"reps":8,"weightKg":null},{"reps":8,"weightKg":null}]'),
    /** nullable now so Phase 6 superset/circuit grouping isn't a later migration. */
    supersetGroup: integer("superset_group"),
    /** Feedback: "it should be possible to adjust the pause, per set and per exercise (e.g. 30s
     *  pause for pushups and 3 minutes after the push up exercise, then 1.5m pause per set of
     *  the next exercise)". Both nullable — null means "use RestTimer's built-in 90s default",
     *  same fallback behaviour a routine had before either column existed, so old rows and rows
     *  that never touch the rest-time UI stay exactly as before. */
    restBetweenSetsSeconds: integer("rest_between_sets_seconds"),
    restAfterExerciseSeconds: integer("rest_after_exercise_seconds"),
  },
  (t) => [index("routine_exercises_routine_idx").on(t.routineId)],
);

/**
 * Periodization / mesocycle (plan §6.8): at most one active cycle per routine. `weekPercents`
 * is a JSON-encoded number[] (generated once by @liftr/shared's generateMesocycleWeekPercents,
 * not hand-edited per week) — storing the whole curve rather than recomputing it lets the
 * built-in ramp/deload shape change in code later without silently reshaping a cycle already
 * in progress.
 */
export const mesocycles = sqliteTable("mesocycles", {
  id: id(),
  routineId: text("routine_id")
    .notNull()
    .unique()
    .references(() => routines.id, { onDelete: "cascade" }),
  totalWeeks: integer("total_weeks").notNull(),
  currentWeek: integer("current_week").notNull().default(1),
  weekPercents: text("week_percents").notNull(),
  createdAt: createdAt(),
});

export const workouts = sqliteTable("workouts", {
  id: id(),
  routineId: text("routine_id").references(() => routines.id, { onDelete: "set null" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  pausedSeconds: integer("paused_seconds").notNull().default(0),
  /** Plausibility gate multiplier (rank engine v2) — computed once at finish-workout time from
   *  session pace / improbable-jump / unrealistic-value checks (see @liftr/shared's
   *  plausibility.ts). Null until the workout finishes (matches endedAt's own nullability);
   *  application code treats a null/missing value as 1 (fully plausible) rather than using a SQL
   *  default, since a workout with no endedAt has no plausibility verdict yet either. */
  plausibilityMultiplier: real("plausibility_multiplier"),
  /** Streak/XP mechanics redesign (docs/superpowers/specs/2026-09-04-streak-xp-mechanics-design.md)
   *  — the session's consistency and variety XP bonuses, computed once at finish-workout time
   *  (same nullable/frozen-at-finish convention as plausibilityMultiplier above, since both depend
   *  on that session's temporal context — the streak-as-of-that-date, the previous session's
   *  muscle set — which is awkward/expensive to re-derive on every read). Null until the workout
   *  finishes; application code treats null as 0 when summing into a user's total XP. No backfill
   *  for pre-existing rows — pre-v1, no production data to preserve. */
  consistencyBonusXp: real("consistency_bonus_xp"),
  varietyBonusXp: real("variety_bonus_xp"),
  notes: text("notes"),
  clientId: text("client_id").notNull().unique(), // offline-sync idempotency key
});

export const workoutExercises = sqliteTable(
  "workout_exercises",
  {
    id: id(),
    workoutId: text("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    orderIndex: integer("order_index").notNull().default(0),
  },
  (t) => [index("workout_exercises_workout_idx").on(t.workoutId)],
);

export const sets = sqliteTable(
  "sets",
  {
    id: id(),
    workoutExerciseId: text("workout_exercise_id")
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    setIndex: integer("set_index").notNull(),
    weightKg: real("weight_kg"), // null for pure rep-based bodyweight sets
    reps: integer("reps").notNull(),
    rpe: real("rpe"),
    /** Kept alongside `kind` (not derived on read) because every rank/XP/history query already
     *  filters on this exact boolean column — replacing it with `kind = 'warmup'` everywhere
     *  would touch rankEngine.ts, routes/xp.ts, routes/history.ts, routes/export.ts, and every
     *  client store that reads it. Always written in lockstep with `kind` at insert time
     *  (routes/sync.ts derives it from `kind`, single source of truth there), never
     *  independently — so the two can't drift even though both exist. */
    isWarmup: integer("is_warmup", { mode: "boolean" }).notNull().default(false),
    /** Set classification (feedback: "not possible to set what kind of set this is") — purely
     *  descriptive metadata layered on top of the existing warmup/working split above. Doesn't
     *  change what counts toward rank/XP (still governed by isWarmup alone, as before this
     *  column existed): a drop-set or a partially-failed set still represents real effort at a
     *  real weight, same as any other working set. */
    kind: text("kind", { enum: ["normal", "warmup", "failure", "dropset"] }).notNull().default("normal"),
    notes: text("notes"),
    loggedAt: integer("logged_at", { mode: "timestamp_ms" }).notNull(),
    /** offline write-queue idempotency key (plan 1.3) — POST /api/sync dedupes on this. */
    clientId: text("client_id").notNull().unique(),
  },
  (t) => [index("sets_workout_exercise_idx").on(t.workoutExerciseId)],
);

export const bodyweightLogs = sqliteTable("bodyweight_logs", {
  id: id(),
  date: text("date").notNull(), // YYYY-MM-DD
  weightKg: real("weight_kg").notNull(),
});

// ---------------------------------------------------------------------------
// Rank engine
// ---------------------------------------------------------------------------

export const standards = sqliteTable(
  "standards",
  {
    id: id(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    sex: text("sex", { enum: ["male", "female"] }).notNull().default("male"),
    metric: text("metric", { enum: ["load_ratio", "reps"] }).notNull(),
    tier: text("tier", { enum: ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"] }).notNull(),
    division: integer("division").notNull(), // N (weakest) down to 1 (strongest), N = TIER_DIVISION_COUNT[tier]
    threshold: real("threshold").notNull(),
    trust: text("trust", { enum: ["real", "derived", "synthetic"] }).notNull(),
  },
  (t) => [index("standards_exercise_idx").on(t.exerciseId)],
);

/** Derived cache, always rebuildable from sets + standards via `pnpm recompute`. */
export const ranks = sqliteTable("ranks", {
  exerciseId: text("exercise_id")
    .primaryKey()
    .references(() => exercises.id, { onDelete: "cascade" }),
  tier: text("tier", { enum: ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"] }).notNull(),
  division: integer("division").notNull(),
  lp: real("lp").notNull(),
  e1rm: real("e1rm").notNull(),
  trust: text("trust", { enum: ["real", "derived", "synthetic"] }).notNull(),
  nextTargetWeightKg: real("next_target_weight_kg"),
  nextTargetReps: integer("next_target_reps"),
  computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull(),
  /** Ratchet-only "best ever" snapshot (rank engine redesign R1) — locked in the moment it's
   *  achieved and never recomputed retroactively (e.g. against today's bodyweight). Nullable:
   *  existing rows are backfilled to `peak* = current *` on their first post-migration
   *  recompute (see `recomputeRankForExercise`), not by the migration itself. */
  peakTier: text("peak_tier", { enum: ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"] }),
  peakDivision: integer("peak_division"),
  peakLp: real("peak_lp"),
  peakE1rm: real("peak_e1rm"),
  peakAchievedAt: integer("peak_achieved_at", { mode: "timestamp_ms" }),
});

export const prs = sqliteTable(
  "prs",
  {
    id: id(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["e1rm", "weight", "reps", "volume"] }).notNull(),
    value: real("value").notNull(),
    setId: text("set_id").references(() => sets.id, { onDelete: "set null" }),
    achievedAt: integer("achieved_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("prs_exercise_idx").on(t.exerciseId)],
);

/** Append-only history of every rank-up (engagement rework W8) — read-only log of an event
 *  `ranks` (the derived single-row-per-exercise cache above) already detects; not a new reward
 *  mechanic. Shape copied verbatim from `prs` above per the round-2 plan's reuse rule. */
export const rankEvents = sqliteTable(
  "rank_events",
  {
    id: id(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    tier: text("tier", { enum: ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"] }).notNull(),
    division: integer("division").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    /** Rank engine v2 gap fix (workstream B, task 1): null when the workout that produced this
     *  rank-up was fully plausible, otherwise the same reason plausibility.ts attached to that
     *  workout. Lets the weekday aggregation (rankService.ts's computeRankEventsByWeekday) and
     *  RankUpCalendar.vue mute a flagged-but-still-peak-eligible rank-up's dot instead of
     *  rendering it identically to a genuine one — `ranks`/`rankedUp` itself was already gated
     *  by PEAK_ELIGIBILITY_FLOOR (0.3), which is looser than plausibility.ts's own floor (0.05)
     *  and reason-setting threshold (any detected severity at all), so a moderately-flagged
     *  session can genuinely advance peak and still deserve a muted dot, not an omitted one. */
    plausibilityReason: text("plausibility_reason", { enum: ["pace", "improbable_jump", "exceeds_ceiling"] }),
  },
  (t) => [index("rank_events_exercise_idx").on(t.exerciseId)],
);

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

export const runs = sqliteTable("runs", {
  id: id(),
  source: text("source", { enum: ["gpx", "fit", "manual", "healthconnect"] }).notNull(),
  name: text("name"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  distanceM: real("distance_m").notNull(),
  durationS: real("duration_s").notNull(),
  avgPaceSPerKm: real("avg_pace_s_per_km"),
  avgHr: real("avg_hr"),
  elevationGainM: real("elevation_gain_m"),
  clientId: text("client_id").notNull().unique(),
});

/** The replay-enabling table (audit §5) — never discard points after computing the summary. */
export const runPoints = sqliteTable(
  "run_points",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    t: integer("t", { mode: "timestamp_ms" }).notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    ele: real("ele"),
    hr: integer("hr"),
    cadence: integer("cadence"),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.idx] }),
    index("run_points_run_idx").on(t.runId),
  ],
);

// ---------------------------------------------------------------------------
// Motivation: streaks + settings
// ---------------------------------------------------------------------------

export const streaks = sqliteTable(
  "streaks",
  {
    date: text("date").notNull(), // YYYY-MM-DD
    kind: text("kind", { enum: ["workout", "run"] }).notNull(),
    protectionUsed: integer("protection_used", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [uniqueIndex("streaks_date_kind_idx").on(t.date, t.kind)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON-encoded
});

// ---------------------------------------------------------------------------
// Relations (drizzle relational query API — used by the server's db.query.* calls)
// ---------------------------------------------------------------------------

export const exercisesRelations = relations(exercises, ({ many }) => ({
  exerciseMuscles: many(exerciseMuscles),
}));

export const musclesRelations = relations(muscles, ({ many }) => ({
  exerciseMuscles: many(exerciseMuscles),
}));

export const exerciseMusclesRelations = relations(exerciseMuscles, ({ one }) => ({
  exercise: one(exercises, { fields: [exerciseMuscles.exerciseId], references: [exercises.id] }),
  muscle: one(muscles, { fields: [exerciseMuscles.muscleId], references: [muscles.id] }),
}));

export const routinesRelations = relations(routines, ({ many }) => ({
  routineExercises: many(routineExercises),
}));

export const routineExercisesRelations = relations(routineExercises, ({ one }) => ({
  routine: one(routines, { fields: [routineExercises.routineId], references: [routines.id] }),
  exercise: one(exercises, { fields: [routineExercises.exerciseId], references: [exercises.id] }),
}));

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  routine: one(routines, { fields: [workouts.routineId], references: [routines.id] }),
  workoutExercises: many(workoutExercises),
}));

export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
  workout: one(workouts, { fields: [workoutExercises.workoutId], references: [workouts.id] }),
  exercise: one(exercises, { fields: [workoutExercises.exerciseId], references: [exercises.id] }),
  sets: many(sets),
}));

export const setsRelations = relations(sets, ({ one, many }) => ({
  workoutExercise: one(workoutExercises, {
    fields: [sets.workoutExerciseId],
    references: [workoutExercises.id],
  }),
  prs: many(prs),
}));

export const runsRelations = relations(runs, ({ many }) => ({
  points: many(runPoints),
}));

export const runPointsRelations = relations(runPoints, ({ one }) => ({
  run: one(runs, { fields: [runPoints.runId], references: [runs.id] }),
}));

export const ranksRelations = relations(ranks, ({ one }) => ({
  exercise: one(exercises, { fields: [ranks.exerciseId], references: [exercises.id] }),
}));

export const prsRelations = relations(prs, ({ one }) => ({
  exercise: one(exercises, { fields: [prs.exerciseId], references: [exercises.id] }),
  set: one(sets, { fields: [prs.setId], references: [sets.id] }),
}));
