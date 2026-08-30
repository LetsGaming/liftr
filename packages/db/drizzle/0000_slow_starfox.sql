CREATE TABLE `bodyweight_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercise_muscles` (
	`exercise_id` text NOT NULL,
	`muscle_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`exercise_id`, `muscle_id`),
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`muscle_id`) REFERENCES `muscles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_key` text NOT NULL,
	`equipment` text,
	`movement_pattern` text NOT NULL,
	`is_bodyweight` integer DEFAULT false NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`source_attribution` text,
	`demo_start_image` text,
	`demo_end_image` text,
	`how_to_key` text,
	`bodyweight_leverage` real,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_slug_unique` ON `exercises` (`slug`);--> statement-breakpoint
CREATE TABLE `muscles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`svg_region_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `muscles_slug_unique` ON `muscles` (`slug`);--> statement-breakpoint
CREATE TABLE `prs` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` real NOT NULL,
	`set_id` text,
	`achieved_at` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prs_exercise_idx` ON `prs` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `ranks` (
	`exercise_id` text PRIMARY KEY NOT NULL,
	`tier` text NOT NULL,
	`division` integer NOT NULL,
	`lp` real NOT NULL,
	`e1rm` real NOT NULL,
	`trust` text NOT NULL,
	`next_target_weight_kg` real,
	`next_target_reps` integer,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `routine_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`target_sets` integer DEFAULT 3 NOT NULL,
	`target_reps` integer DEFAULT 8 NOT NULL,
	`superset_group` integer,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `routine_exercises_routine_idx` ON `routine_exercises` (`routine_id`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_points` (
	`run_id` text NOT NULL,
	`idx` integer NOT NULL,
	`t` integer NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`ele` real,
	`hr` integer,
	`cadence` integer,
	PRIMARY KEY(`run_id`, `idx`),
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_points_run_idx` ON `run_points` (`run_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`name` text,
	`started_at` integer NOT NULL,
	`distance_m` real NOT NULL,
	`duration_s` real NOT NULL,
	`avg_pace_s_per_km` real,
	`avg_hr` real,
	`elevation_gain_m` real,
	`client_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_client_id_unique` ON `runs` (`client_id`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`weight_kg` real,
	`reps` integer NOT NULL,
	`rpe` real,
	`is_warmup` integer DEFAULT false NOT NULL,
	`notes` text,
	`logged_at` integer NOT NULL,
	`client_id` text NOT NULL,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sets_client_id_unique` ON `sets` (`client_id`);--> statement-breakpoint
CREATE INDEX `sets_workout_exercise_idx` ON `sets` (`workout_exercise_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `standards` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`sex` text DEFAULT 'male' NOT NULL,
	`metric` text NOT NULL,
	`tier` text NOT NULL,
	`division` integer NOT NULL,
	`threshold` real NOT NULL,
	`trust` text NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `standards_exercise_idx` ON `standards` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `streaks` (
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`protection_used` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `streaks_date_kind_idx` ON `streaks` (`date`,`kind`);--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_idx` ON `workout_exercises` (`workout_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`paused_seconds` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`client_id` text NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workouts_client_id_unique` ON `workouts` (`client_id`);