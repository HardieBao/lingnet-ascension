CREATE TABLE `artifact_payloads` (
	`artifact_key` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`content` text NOT NULL,
	`sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "artifact_payload_size" CHECK(length(CAST("artifact_payloads"."content" AS BLOB)) <= 131072),
	CONSTRAINT "artifact_payload_digest" CHECK(length("artifact_payloads"."sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artifact_payload_submission` ON `artifact_payloads` (`submission_id`);