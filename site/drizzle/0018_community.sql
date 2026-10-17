CREATE TABLE `sect_memberships` (
	`sect_id` text NOT NULL,
	`cultivator_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`is_public` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`changed_by` text NOT NULL,
	PRIMARY KEY(`sect_id`, `cultivator_id`),
	FOREIGN KEY (`sect_id`) REFERENCES `sects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sect_membership_state" CHECK("sect_memberships"."state" IN ('pending', 'active', 'rejected', 'left')),
	CONSTRAINT "sect_membership_visibility" CHECK("sect_memberships"."is_public" IN (0, 1)),
	CONSTRAINT "sect_membership_revision" CHECK("sect_memberships"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_membership_current_cultivator` ON `sect_memberships` (`cultivator_id`) WHERE state IN ('pending', 'active');--> statement-breakpoint
CREATE INDEX `idx_membership_sect_state` ON `sect_memberships` (`sect_id`,`state`);--> statement-breakpoint
CREATE TABLE `sects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`description` text NOT NULL,
	`owner_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`reviewed_by` text,
	`review_reason` text,
	`reviewed_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sect_name_length" CHECK(length("sects"."name") BETWEEN 1 AND 40),
	CONSTRAINT "sect_description_length" CHECK(length("sects"."description") <= 500),
	CONSTRAINT "sect_state" CHECK("sects"."state" IN ('pending', 'active', 'rejected', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sects_current_name` ON `sects` (`name_key`) WHERE state IN ('pending', 'active');--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sects_current_owner` ON `sects` (`owner_id`) WHERE state IN ('pending', 'active');--> statement-breakpoint
ALTER TABLE `cultivator_profiles` ADD `contributions_public` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `withdraw_profile_contributions`
AFTER UPDATE OF `is_public` ON `cultivator_profiles`
WHEN NEW.is_public = 0 AND NEW.contributions_public != 0
BEGIN
  UPDATE cultivator_profiles SET contributions_public = 0 WHERE cultivator_id = NEW.cultivator_id;
END;
