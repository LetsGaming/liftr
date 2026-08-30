CREATE TABLE `rank_events` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`tier` text NOT NULL,
	`division` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rank_events_exercise_idx` ON `rank_events` (`exercise_id`);