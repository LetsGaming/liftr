-- Custom SQL migration file, put your code below! --
-- Data-only migration: remap pre-existing rows written under the old 5-tier
-- naming scheme (bronze/silver/gold/platinum/diamond) to their 9-tier
-- equivalents. Migration 0009 only added a new column; nothing rewrote
-- old rows in `standards.tier`, `ranks.tier`, `ranks.peak_tier`, or
-- `rank_events.tier`. SQLite's `text({enum:...})` has no real CHECK
-- constraint, so those old-scheme rows survive silently and break
-- tiers.ts's `ordinal()` (TIERS.indexOf returns -1 for an unknown string),
-- which in turn wedges `ratchetPeak`'s isStronger comparison forever.
--
-- Mapping (same one used everywhere else in this branch): the four tiers
-- that kept their old anchor ratios map 1:1 to their new names; the other
-- five 9-tier names (initiate/trainee/lifter/elite/apex) never existed
-- under the old scheme, so no old value maps to them here.
--   bronze   -> apprentice
--   silver   -> athlete
--   gold     -> advanced
--   platinum -> expert
--   diamond  -> apex

UPDATE `standards` SET `tier` = 'apprentice' WHERE `tier` = 'bronze';
--> statement-breakpoint
UPDATE `standards` SET `tier` = 'athlete' WHERE `tier` = 'silver';
--> statement-breakpoint
UPDATE `standards` SET `tier` = 'advanced' WHERE `tier` = 'gold';
--> statement-breakpoint
UPDATE `standards` SET `tier` = 'expert' WHERE `tier` = 'platinum';
--> statement-breakpoint
UPDATE `standards` SET `tier` = 'apex' WHERE `tier` = 'diamond';
--> statement-breakpoint
UPDATE `ranks` SET `tier` = 'apprentice' WHERE `tier` = 'bronze';
--> statement-breakpoint
UPDATE `ranks` SET `tier` = 'athlete' WHERE `tier` = 'silver';
--> statement-breakpoint
UPDATE `ranks` SET `tier` = 'advanced' WHERE `tier` = 'gold';
--> statement-breakpoint
UPDATE `ranks` SET `tier` = 'expert' WHERE `tier` = 'platinum';
--> statement-breakpoint
UPDATE `ranks` SET `tier` = 'apex' WHERE `tier` = 'diamond';
--> statement-breakpoint
UPDATE `ranks` SET `peak_tier` = 'apprentice' WHERE `peak_tier` = 'bronze';
--> statement-breakpoint
UPDATE `ranks` SET `peak_tier` = 'athlete' WHERE `peak_tier` = 'silver';
--> statement-breakpoint
UPDATE `ranks` SET `peak_tier` = 'advanced' WHERE `peak_tier` = 'gold';
--> statement-breakpoint
UPDATE `ranks` SET `peak_tier` = 'expert' WHERE `peak_tier` = 'platinum';
--> statement-breakpoint
UPDATE `ranks` SET `peak_tier` = 'apex' WHERE `peak_tier` = 'diamond';
--> statement-breakpoint
UPDATE `rank_events` SET `tier` = 'apprentice' WHERE `tier` = 'bronze';
--> statement-breakpoint
UPDATE `rank_events` SET `tier` = 'athlete' WHERE `tier` = 'silver';
--> statement-breakpoint
UPDATE `rank_events` SET `tier` = 'advanced' WHERE `tier` = 'gold';
--> statement-breakpoint
UPDATE `rank_events` SET `tier` = 'expert' WHERE `tier` = 'platinum';
--> statement-breakpoint
UPDATE `rank_events` SET `tier` = 'apex' WHERE `tier` = 'diamond';
--> statement-breakpoint

-- Division clamp. The old scheme was a fixed 3 divisions per tier; the new
-- scheme is not (expert has 2, apex has 1). A legacy platinum-III row (or
-- an apex row remapped from diamond-II/III) would otherwise land on a
-- division that no longer exists for its tier — not a crash (ordinal() still
-- returns a sane, monotone value), but an invalid, unrenderable band. Runs
-- after the renames above so it can key off the new tier names.
UPDATE `standards` SET `division` = 2 WHERE `tier` = 'expert' AND `division` > 2;
--> statement-breakpoint
UPDATE `standards` SET `division` = 1 WHERE `tier` = 'apex' AND `division` > 1;
--> statement-breakpoint
UPDATE `ranks` SET `division` = 2 WHERE `tier` = 'expert' AND `division` > 2;
--> statement-breakpoint
UPDATE `ranks` SET `division` = 1 WHERE `tier` = 'apex' AND `division` > 1;
--> statement-breakpoint
UPDATE `ranks` SET `peak_division` = 2 WHERE `peak_tier` = 'expert' AND `peak_division` > 2;
--> statement-breakpoint
UPDATE `ranks` SET `peak_division` = 1 WHERE `peak_tier` = 'apex' AND `peak_division` > 1;
--> statement-breakpoint
UPDATE `rank_events` SET `division` = 2 WHERE `tier` = 'expert' AND `division` > 2;
--> statement-breakpoint
UPDATE `rank_events` SET `division` = 1 WHERE `tier` = 'apex' AND `division` > 1;

