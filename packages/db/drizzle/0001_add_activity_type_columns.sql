ALTER TABLE `run_prs` ADD `activity_type` text DEFAULT 'run' NOT NULL;--> statement-breakpoint
ALTER TABLE `run_rank_events` ADD `activity_type` text DEFAULT 'run' NOT NULL;--> statement-breakpoint
ALTER TABLE `run_ranks` ADD `activity_type` text DEFAULT 'run' NOT NULL;--> statement-breakpoint
ALTER TABLE `run_standards` ADD `activity_type` text DEFAULT 'run' NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `activity_type` text DEFAULT 'run' NOT NULL;