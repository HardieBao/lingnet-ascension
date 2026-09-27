CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`cultivator_id` text NOT NULL,
	`state` text NOT NULL,
	`claimed_at` integer NOT NULL,
	`started_at` integer,
	`expires_at` integer NOT NULL,
	`reward_snapshot` text NOT NULL,
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_claims_active_mission` ON `claims` (`mission_id`) WHERE state IN ('claimed', 'running', 'submitted', 'review');--> statement-breakpoint
CREATE INDEX `idx_claims_cultivator_state` ON `claims` (`cultivator_id`,`state`);--> statement-breakpoint
CREATE TABLE `cultivators` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cultivators_provider` ON `cultivators` (`provider`,`provider_id`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`cultivator_id` text NOT NULL,
	`item_id` text NOT NULL,
	`acquired_at` integer NOT NULL,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_cultivator` ON `inventory` (`cultivator_id`);--> statement-breakpoint
CREATE TABLE `ledger_events` (
	`id` text PRIMARY KEY NOT NULL,
	`cultivator_id` text NOT NULL,
	`resource` text NOT NULL,
	`delta` integer NOT NULL,
	`source_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ledger_source_resource` ON `ledger_events` (`source_key`,`resource`);--> statement-breakpoint
CREATE INDEX `idx_ledger_cultivator_resource` ON `ledger_events` (`cultivator_id`,`resource`);--> statement-breakpoint
CREATE TABLE `missions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`rank` text NOT NULL,
	`branch` text NOT NULL,
	`state` text NOT NULL,
	`base_commit` text NOT NULL,
	`allowed_paths` text NOT NULL,
	`acceptance` text NOT NULL,
	`reward_token` integer NOT NULL,
	`reward_cultivation` integer NOT NULL,
	`reward_merit` integer NOT NULL,
	`deposit` integer DEFAULT 0 NOT NULL,
	`budget_tokens` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`cultivator_id` text NOT NULL,
	`artifact_key` text NOT NULL,
	`artifact_sha256` text NOT NULL,
	`state` text NOT NULL,
	`verdict` text,
	`reviewer_id` text,
	`review_reason` text,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_submissions_state` ON `submissions` (`state`);