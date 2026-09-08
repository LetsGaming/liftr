CREATE TABLE `bodyweight_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
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
	`name` text,
	`equipment` text,
	`required_equipment` text DEFAULT '[]' NOT NULL,
	`movement_pattern` text NOT NULL,
	`is_bodyweight` integer DEFAULT false NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`created_by_user_id` text,
	`source_attribution` text,
	`demo_start_image` text,
	`demo_end_image` text,
	`how_to_key` text,
	`bodyweight_leverage` real,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_slug_unique` ON `exercises` (`slug`);--> statement-breakpoint
CREATE TABLE `mesocycles` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`total_weeks` integer NOT NULL,
	`current_week` integer DEFAULT 1 NOT NULL,
	`week_percents` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mesocycles_routine_id_unique` ON `mesocycles` (`routine_id`);--> statement-breakpoint
CREATE TABLE `muscles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`svg_region_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `muscles_slug_unique` ON `muscles` (`slug`);--> statement-breakpoint
CREATE TABLE `planned_route_points` (
	`route_id` text NOT NULL,
	`idx` integer NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`ele` real,
	PRIMARY KEY(`route_id`, `idx`),
	FOREIGN KEY (`route_id`) REFERENCES `planned_routes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `planned_route_points_route_idx` ON `planned_route_points` (`route_id`);--> statement-breakpoint
CREATE TABLE `planned_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`name` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`waypoints_json` text NOT NULL,
	`distance_m` real NOT NULL,
	`elevation_gain_m` real,
	`geometry_source` text NOT NULL,
	`computed_at` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`exercise_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` real NOT NULL,
	`set_id` text,
	`achieved_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prs_exercise_idx` ON `prs` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `rank_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`exercise_id` text NOT NULL,
	`tier` text NOT NULL,
	`division` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`plausibility_reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rank_events_exercise_idx` ON `rank_events` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `ranks` (
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`exercise_id` text NOT NULL,
	`tier` text NOT NULL,
	`division` integer NOT NULL,
	`lp` real NOT NULL,
	`e1rm` real NOT NULL,
	`trust` text NOT NULL,
	`next_target_weight_kg` real,
	`next_target_reps` integer,
	`computed_at` integer NOT NULL,
	`peak_tier` text,
	`peak_division` integer,
	`peak_lp` real,
	`peak_e1rm` real,
	`peak_achieved_at` integer,
	PRIMARY KEY(`user_id`, `exercise_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `routine_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`target_sets_json` text DEFAULT '[{"reps":8,"weightKg":null},{"reps":8,"weightKg":null},{"reps":8,"weightKg":null}]' NOT NULL,
	`superset_group` integer,
	`rest_between_sets_seconds` integer,
	`rest_after_exercise_seconds` integer,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `routine_exercises_routine_idx` ON `routine_exercises` (`routine_id`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`name` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
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
CREATE TABLE `run_prs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`value` real NOT NULL,
	`run_id` text NOT NULL,
	`achieved_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_prs_category_idx` ON `run_prs` (`category`);--> statement-breakpoint
CREATE TABLE `run_rank_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`category` text NOT NULL,
	`tier` text NOT NULL,
	`division` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`plausibility_reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_rank_events_category_idx` ON `run_rank_events` (`category`);--> statement-breakpoint
CREATE TABLE `run_ranks` (
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`category` text NOT NULL,
	`tier` text NOT NULL,
	`division` integer NOT NULL,
	`lp` real NOT NULL,
	`best_speed_mps` real,
	`trust` text,
	`next_target_speed_mps` real,
	`computed_at` integer NOT NULL,
	`peak_tier` text,
	`peak_division` integer,
	`peak_lp` real,
	`peak_speed_mps` real,
	`peak_achieved_at` integer,
	PRIMARY KEY(`user_id`, `category`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `run_standards` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`sex` text NOT NULL,
	`tier` text NOT NULL,
	`division` integer NOT NULL,
	`threshold` real NOT NULL,
	`trust` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_standards_category_sex_tier_division_idx` ON `run_standards` (`category`,`sex`,`tier`,`division`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`source` text NOT NULL,
	`name` text,
	`started_at` integer NOT NULL,
	`distance_m` real NOT NULL,
	`duration_s` real NOT NULL,
	`avg_pace_s_per_km` real,
	`avg_hr` real,
	`elevation_gain_m` real,
	`planned_route_id` text,
	`plausibility_multiplier` real,
	`client_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planned_route_id`) REFERENCES `planned_routes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_user_client_idx` ON `runs` (`user_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`weight_kg` real,
	`reps` integer NOT NULL,
	`rpe` real,
	`is_warmup` integer DEFAULT false NOT NULL,
	`kind` text DEFAULT 'normal' NOT NULL,
	`notes` text,
	`logged_at` integer NOT NULL,
	`client_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sets_workout_exercise_idx` ON `sets` (`workout_exercise_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sets_user_client_idx` ON `sets` (`user_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
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
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`protection_used` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `streaks_user_date_kind_idx` ON `streaks` (`user_id`,`date`,`kind`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `users` (`id`, `name`, `role`, `created_at`) VALUES ('00000000-0000-4000-8000-000000000001', 'Owner', 'owner', unixepoch('subsec') * 1000);
--> statement-breakpoint
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
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`routine_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`paused_seconds` integer DEFAULT 0 NOT NULL,
	`plausibility_multiplier` real,
	`consistency_bonus_xp` real,
	`variety_bonus_xp` real,
	`notes` text,
	`client_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workouts_user_client_idx` ON `workouts` (`user_id`,`client_id`);