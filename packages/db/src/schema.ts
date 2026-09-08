/**
 * Drizzle schema. Routine (template) vs Workout (session) is a deliberate, load-bearing split —
 * do not collapse them. `run_points` is kept in full per point (never compressed to a polyline
 * blob) because it is what makes run replay possible. Every derived/cache table (`ranks`, `prs`,
 * streak state) must be reconstructible from the raw tables below via a `recompute` pass.
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
// Users (multi-user hardening groundwork — see docs/adr/0006-multi-user-hardening.md)
// ---------------------------------------------------------------------------

/** The single seeded owner, created by the initial migration. Deterministic (not
 *  `crypto.randomUUID()`) so every fresh db — including every in-memory test db, which runs the
 *  same migration — gets a known user id for free, and so the migration's seed INSERT can be
 *  plain static SQL. Real per-user login doesn't exist yet; this is the one row every request
 *  resolves to today, via `userContext.ts`'s `resolveCurrentUserId`. */
export const OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  role: text("role", { enum: ["owner", "member"] }).notNull(),
  createdAt: createdAt(),
});

/** Every per-user table's owner column. Defaults to `OWNER_USER_ID` so a caller that doesn't
 *  (yet) resolve a real user — a direct `db.insert(...)` in a test fixture, a maintenance script —
 *  attributes to the one identity that actually exists today, rather than needing to pass it
 *  explicitly everywhere. Every repository/service/route that serves a real request already
 *  threads a resolved `userId` through explicitly instead of relying on this default; real
 *  per-user login replaces `resolveCurrentUserId`'s constant with a session lookup and this
 *  default stops mattering in practice, without needing a schema change. */
const userId = () =>
  text("user_id")
    .notNull()
    .default(OWNER_USER_ID)
    .references(() => users.id, { onDelete: "cascade" });

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
   *  just the one primary/icon-driving item. Both write paths (catalog ingest, custom-exercise
   *  creation) always compute and store a real array — defaults to `'[]'` rather than being
   *  nullable, so callers never need a null case for "no requirements known". */
  requiredEquipment: text("required_equipment").notNull().default("[]"),
  /** push | pull | squat | hinge | carry | isolation-* — what synthetic derivation joins on. */
  movementPattern: text("movement_pattern").notNull(),
  isBodyweight: integer("is_bodyweight", { mode: "boolean" }).notNull().default(false),
  isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  /** Multi-user hardening groundwork: null for every catalog exercise (ingested or seeded); set
   *  to the creator's id for a custom (`isCustom`) exercise. NOT currently used to scope
   *  visibility — custom exercises stay in the shared catalog, visible to every user, for this
   *  pass (see docs/adr/0006-multi-user-hardening.md's "accepted limitation": two users picking
   *  the same natural slug for a custom exercise collide on `exercises.slug`'s global
   *  uniqueness). This column exists now so scoping custom-exercise visibility per creator later
   *  is a query change, not another schema migration. */
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  /** wger CC-BY-SA attribution string, required for the attributions page. */
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
  userId: userId(),
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
    /** nullable now so superset/circuit grouping isn't a later migration. */
    supersetGroup: integer("superset_group"),
    /** Lets rest time be tuned per set and per exercise (e.g. 30s between pushup sets, then 3
     *  minutes before the next exercise). Both nullable — null means "use RestTimer's built-in 90s default",
     *  same fallback behaviour a routine had before either column existed, so old rows and rows
     *  that never touch the rest-time UI stay exactly as before. */
    restBetweenSetsSeconds: integer("rest_between_sets_seconds"),
    restAfterExerciseSeconds: integer("rest_after_exercise_seconds"),
  },
  (t) => [index("routine_exercises_routine_idx").on(t.routineId)],
);

/**
 * Periodization / mesocycle: at most one active cycle per routine. `weekPercents`
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

export const workouts = sqliteTable(
  "workouts",
  {
    id: id(),
    userId: userId(),
    routineId: text("routine_id").references(() => routines.id, { onDelete: "set null" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    pausedSeconds: integer("paused_seconds").notNull().default(0),
    /** Plausibility gate multiplier — computed once at finish-workout time from
     *  session pace / improbable-jump / unrealistic-value checks (see @liftr/shared's
     *  plausibility.ts). Null until the workout finishes (matches endedAt's own nullability);
     *  application code treats a null/missing value as 1 (fully plausible) rather than using a SQL
     *  default, since a workout with no endedAt has no plausibility verdict yet either. */
    plausibilityMultiplier: real("plausibility_multiplier"),
    /** The session's consistency and variety XP bonuses, computed once at finish-workout time
     *  (same nullable/frozen-at-finish convention as plausibilityMultiplier above, since both depend
     *  on that session's temporal context — the streak-as-of-that-date, the previous session's
     *  muscle set — which is awkward/expensive to re-derive on every read). Null until the workout
     *  finishes; application code treats null as 0 when summing into a user's total XP. No backfill
     *  for pre-existing rows — pre-v1, no production data to preserve. */
    consistencyBonusXp: real("consistency_bonus_xp"),
    varietyBonusXp: real("variety_bonus_xp"),
    notes: text("notes"),
    clientId: text("client_id").notNull(), // offline-sync idempotency key, unique per user (below)
  },
  (t) => [uniqueIndex("workouts_user_client_idx").on(t.userId, t.clientId)],
);

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
    /** Denormalized from `workoutExerciseId -> workoutExercises -> workouts.userId` — a
     *  deliberate exception to "children inherit ownership via their parent", written by exactly
     *  one function (`insertSet`) in lockstep with the parent, same precedent as this table's own
     *  `isWarmup`/`kind` pair below. `sets` is the join target of ~8 ownership-sensitive queries
     *  across six repository files (rank resolution, XP, history, export, muscle training log,
     *  "last performed" lookups) that would otherwise each need their own two-hop join with no
     *  compiler-enforced guarantee it's present — a forgotten join here is a silent cross-user
     *  data leak. See docs/adr/0006-multi-user-hardening.md. */
    userId: userId(),
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
    /** Set classification — purely descriptive metadata layered on top of the existing warmup/working split above. Doesn't
     *  change what counts toward rank/XP (still governed by isWarmup alone, as before this
     *  column existed): a drop-set or a partially-failed set still represents real effort at a
     *  real weight, same as any other working set. */
    kind: text("kind", { enum: ["normal", "warmup", "failure", "dropset"] }).notNull().default("normal"),
    notes: text("notes"),
    loggedAt: integer("logged_at", { mode: "timestamp_ms" }).notNull(),
    /** offline write-queue idempotency key — POST /api/sync dedupes on this, unique
     *  per user (below). */
    clientId: text("client_id").notNull(),
  },
  (t) => [
    index("sets_workout_exercise_idx").on(t.workoutExerciseId),
    uniqueIndex("sets_user_client_idx").on(t.userId, t.clientId),
  ],
);

export const bodyweightLogs = sqliteTable("bodyweight_logs", {
  id: id(),
  userId: userId(),
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

/** Derived cache, always rebuildable from sets + standards via `pnpm recompute`. Primary key is
 *  composite `(userId, exerciseId)` — was bare `exerciseId` before multi-user hardening (one
 *  rank row per exercise, globally); each user now gets their own resolved rank per exercise. */
export const ranks = sqliteTable(
  "ranks",
  {
    userId: userId(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    tier: text("tier", { enum: ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"] }).notNull(),
    division: integer("division").notNull(),
    lp: real("lp").notNull(),
    e1rm: real("e1rm").notNull(),
    trust: text("trust", { enum: ["real", "derived", "synthetic"] }).notNull(),
    nextTargetWeightKg: real("next_target_weight_kg"),
    nextTargetReps: integer("next_target_reps"),
    computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull(),
    /** Ratchet-only "best ever" snapshot — locked in the moment it's
     *  achieved and never recomputed retroactively (e.g. against today's bodyweight). Nullable:
     *  existing rows are backfilled to `peak* = current *` on their first post-migration
     *  recompute (see `recomputeRankForExercise`), not by the migration itself. */
    peakTier: text("peak_tier", { enum: ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"] }),
    peakDivision: integer("peak_division"),
    peakLp: real("peak_lp"),
    peakE1rm: real("peak_e1rm"),
    peakAchievedAt: integer("peak_achieved_at", { mode: "timestamp_ms" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.exerciseId] })],
);

export const prs = sqliteTable(
  "prs",
  {
    id: id(),
    userId: userId(),
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

/** Append-only history of every rank-up — read-only log of an event
 *  `ranks` (the derived single-row-per-exercise cache above) already detects; not a new reward
 *  mechanic. Shape copied verbatim from `prs` above. */
export const rankEvents = sqliteTable(
  "rank_events",
  {
    id: id(),
    userId: userId(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    tier: text("tier", { enum: ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"] }).notNull(),
    division: integer("division").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    /** Null when the workout that produced this
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

export const runs = sqliteTable(
  "runs",
  {
    id: id(),
    userId: userId(),
    source: text("source", { enum: ["gpx", "fit", "manual", "healthconnect"] }).notNull(),
    name: text("name"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    distanceM: real("distance_m").notNull(),
    durationS: real("duration_s").notNull(),
    avgPaceSPerKm: real("avg_pace_s_per_km"),
    avgHr: real("avg_hr"),
    elevationGainM: real("elevation_gain_m"),
    clientId: text("client_id").notNull(), // unique per user (below)
  },
  (t) => [uniqueIndex("runs_user_client_idx").on(t.userId, t.clientId)],
);

/** The replay-enabling table — never discard points after computing the summary. */
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
    userId: userId(),
    date: text("date").notNull(), // YYYY-MM-DD
    kind: text("kind", { enum: ["workout", "run"] }).notNull(),
    protectionUsed: integer("protection_used", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [uniqueIndex("streaks_user_date_kind_idx").on(t.userId, t.date, t.kind)],
);

/** Composite primary key `(userId, key)` — was bare `key` before multi-user hardening (one
 *  global JSON k/v store); every settings key in use today (profile, ownedEquipment, gymSetup,
 *  defaultBodyweightKg) is genuinely per-user (sex/workoutsPerWeek drive which standards
 *  population and streak-token pool a user is ranked/protected against). */
export const settings = sqliteTable(
  "settings",
  {
    userId: userId(),
    key: text("key").notNull(),
    value: text("value").notNull(), // JSON-encoded
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

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
