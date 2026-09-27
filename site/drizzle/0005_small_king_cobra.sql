CREATE TABLE `mission_dependencies` (
	`mission_id` text NOT NULL,
	`prerequisite_id` text NOT NULL,
	PRIMARY KEY(`mission_id`, `prerequisite_id`),
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prerequisite_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `missions` ADD `contract_ready` integer DEFAULT 0 NOT NULL;