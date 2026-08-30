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
CREATE UNIQUE INDEX `mesocycles_routine_id_unique` ON `mesocycles` (`routine_id`);