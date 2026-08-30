ALTER TABLE `routine_exercises` ADD `target_reps_per_set` text DEFAULT '[8,8,8]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `routine_exercises` DROP COLUMN `target_sets`;
--> statement-breakpoint
ALTER TABLE `routine_exercises` DROP COLUMN `target_reps`;
