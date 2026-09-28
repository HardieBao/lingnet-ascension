CREATE TABLE `realm_events` (
	`id` text PRIMARY KEY NOT NULL,
	`cultivator_id` text NOT NULL,
	`from_realm` text NOT NULL,
	`to_realm` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_realm_events_target` ON `realm_events` (`cultivator_id`,`to_realm`);--> statement-breakpoint
ALTER TABLE `cultivators` ADD `realm` text DEFAULT 'mortal' NOT NULL;