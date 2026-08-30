ALTER TABLE `routine_exercises` ADD `target_sets_json` text DEFAULT '[{"reps":8,"weightKg":null},{"reps":8,"weightKg":null},{"reps":8,"weightKg":null}]' NOT NULL;
--> statement-breakpoint
UPDATE `routine_exercises` SET `target_sets_json` = (
  '[' || (
    SELECT group_concat('{"reps":' || value || ',"weightKg":null}')
    FROM json_each(`target_reps_per_set`)
  ) || ']'
);
--> statement-breakpoint
ALTER TABLE `routine_exercises` DROP COLUMN `target_reps_per_set`;
