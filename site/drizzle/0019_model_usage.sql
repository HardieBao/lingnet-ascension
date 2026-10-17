CREATE TABLE `model_usage_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`cultivator_id` text NOT NULL,
	`digest` text NOT NULL,
	`report_json` text NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "usage_report_size" CHECK(length(CAST("model_usage_reports"."report_json" AS BLOB)) <= 4096),
	CONSTRAINT "usage_report_json" CHECK(json_valid("model_usage_reports"."report_json")),
	CONSTRAINT "usage_report_digest" CHECK(length("model_usage_reports"."digest") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_usage_claim_digest` ON `model_usage_reports` (`claim_id`,`digest`);--> statement-breakpoint
CREATE INDEX `idx_usage_owner_time` ON `model_usage_reports` (`cultivator_id`,`received_at`);
--> statement-breakpoint
CREATE TRIGGER model_usage_reports_immutable_update BEFORE UPDATE ON model_usage_reports
BEGIN SELECT RAISE(ABORT, 'Model usage reports are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER model_usage_reports_immutable_delete BEFORE DELETE ON model_usage_reports
BEGIN SELECT RAISE(ABORT, 'Model usage reports are append-only'); END;
