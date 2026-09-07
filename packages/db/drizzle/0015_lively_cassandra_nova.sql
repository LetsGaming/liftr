CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `users` (`id`, `name`, `role`, `created_at`) VALUES ('00000000-0000-4000-8000-000000000001', 'Owner', 'owner', unixepoch('subsec') * 1000);
--> statement-breakpoint
DROP INDEX `runs_client_id_unique`;--> statement-breakpoint
ALTER TABLE `runs` ADD `user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `runs_user_client_idx` ON `runs` (`user_id`,`client_id`);--> statement-breakpoint
DROP INDEX `sets_client_id_unique`;--> statement-breakpoint
ALTER TABLE `sets` ADD `user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `sets_user_client_idx` ON `sets` (`user_id`,`client_id`);--> statement-breakpoint
DROP INDEX `streaks_date_kind_idx`;--> statement-breakpoint
ALTER TABLE `streaks` ADD `user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `streaks_user_date_kind_idx` ON `streaks` (`user_id`,`date`,`kind`);--> statement-breakpoint
DROP INDEX `workouts_client_id_unique`;--> statement-breakpoint
ALTER TABLE `workouts` ADD `user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `workouts_user_client_idx` ON `workouts` (`user_id`,`client_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ranks` (
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
INSERT INTO `__new_ranks`("user_id", "exercise_id", "tier", "division", "lp", "e1rm", "trust", "next_target_weight_kg", "next_target_reps", "computed_at", "peak_tier", "peak_division", "peak_lp", "peak_e1rm", "peak_achieved_at") SELECT '00000000-0000-4000-8000-000000000001', "exercise_id", "tier", "division", "lp", "e1rm", "trust", "next_target_weight_kg", "next_target_reps", "computed_at", "peak_tier", "peak_division", "peak_lp", "peak_e1rm", "peak_achieved_at" FROM `ranks`;--> statement-breakpoint
DROP TABLE `ranks`;--> statement-breakpoint
ALTER TABLE `__new_ranks` RENAME TO `ranks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_settings`("user_id", "key", "value") SELECT '00000000-0000-4000-8000-000000000001', "key", "value" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
ALTER TABLE `bodyweight_logs` ADD `user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `exercises` ADD `created_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `prs` ADD `user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `rank_events` ADD `user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `routines` ADD `user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL REFERENCES users(id);