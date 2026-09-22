DROP INDEX `run_prs_category_idx`;--> statement-breakpoint
CREATE INDEX `run_prs_activity_category_idx` ON `run_prs` (`activity_type`,`category`);--> statement-breakpoint
DROP INDEX `run_rank_events_category_idx`;--> statement-breakpoint
CREATE INDEX `run_rank_events_activity_category_idx` ON `run_rank_events` (`activity_type`,`category`);--> statement-breakpoint
DROP INDEX `run_standards_category_sex_tier_division_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `run_standards_activity_category_sex_tier_division_idx` ON `run_standards` (`activity_type`,`category`,`sex`,`tier`,`division`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_run_ranks` (
	`user_id` text DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	`activity_type` text DEFAULT 'run' NOT NULL,
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
	PRIMARY KEY(`user_id`, `activity_type`, `category`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_run_ranks`("user_id", "activity_type", "category", "tier", "division", "lp", "best_speed_mps", "trust", "next_target_speed_mps", "computed_at", "peak_tier", "peak_division", "peak_lp", "peak_speed_mps", "peak_achieved_at") SELECT "user_id", "activity_type", "category", "tier", "division", "lp", "best_speed_mps", "trust", "next_target_speed_mps", "computed_at", "peak_tier", "peak_division", "peak_lp", "peak_speed_mps", "peak_achieved_at" FROM `run_ranks`;--> statement-breakpoint
DROP TABLE `run_ranks`;--> statement-breakpoint
ALTER TABLE `__new_run_ranks` RENAME TO `run_ranks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;