CREATE TABLE `cultivator_profiles` (
	`cultivator_id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`daohao` text NOT NULL,
	`is_public` integer DEFAULT 0 NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "profile_daohao_length" CHECK(length("cultivator_profiles"."daohao") BETWEEN 1 AND 32),
	CONSTRAINT "profile_visibility" CHECK("cultivator_profiles"."is_public" IN (0, 1)),
	CONSTRAINT "profile_revision" CHECK("cultivator_profiles"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cultivator_profiles_public_id_unique` ON `cultivator_profiles` (`public_id`);