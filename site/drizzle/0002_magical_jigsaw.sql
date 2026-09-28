DROP INDEX `idx_claims_active_mission`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_claims_active_mission` ON `claims` (`mission_id`) WHERE state IN ('claimed', 'running', 'submitted', 'review', 'approved');--> statement-breakpoint
ALTER TABLE `submissions` ADD `integrated_commit` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `integrated_at` integer;