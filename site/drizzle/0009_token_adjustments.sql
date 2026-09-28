CREATE TABLE `token_adjustment_decisions` (
	`request_id` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`decided_by` text NOT NULL,
	`reason` text NOT NULL,
	`decided_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `token_adjustment_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "token_adjustment_decision_kind" CHECK("token_adjustment_decisions"."decision" IN ('approve', 'reject')),
	CONSTRAINT "token_adjustment_decision_reason_length" CHECK(length("token_adjustment_decisions"."reason") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE `token_adjustment_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`target_cultivator_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reference` text NOT NULL,
	`reason` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` integer NOT NULL,
	FOREIGN KEY (`target_cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "token_adjustment_delta_range" CHECK("token_adjustment_requests"."delta" != 0 AND "token_adjustment_requests"."delta" BETWEEN -10000 AND 10000),
	CONSTRAINT "token_adjustment_reference_length" CHECK(length("token_adjustment_requests"."reference") BETWEEN 1 AND 100),
	CONSTRAINT "token_adjustment_reason_length" CHECK(length("token_adjustment_requests"."reason") BETWEEN 20 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_token_adjustment_reference` ON `token_adjustment_requests` (`target_cultivator_id`,`reference`);
--> statement-breakpoint
CREATE TRIGGER token_adjustment_requests_no_update BEFORE UPDATE ON token_adjustment_requests
BEGIN SELECT RAISE(ABORT, 'adjustment requests are append only'); END;
--> statement-breakpoint
CREATE TRIGGER token_adjustment_requests_no_delete BEFORE DELETE ON token_adjustment_requests
BEGIN SELECT RAISE(ABORT, 'adjustment requests are append only'); END;
--> statement-breakpoint
CREATE TRIGGER token_adjustment_decisions_no_update BEFORE UPDATE ON token_adjustment_decisions
BEGIN SELECT RAISE(ABORT, 'adjustment decisions are append only'); END;
--> statement-breakpoint
CREATE TRIGGER token_adjustment_decisions_no_delete BEFORE DELETE ON token_adjustment_decisions
BEGIN SELECT RAISE(ABORT, 'adjustment decisions are append only'); END;
--> statement-breakpoint
CREATE TRIGGER token_adjustment_no_self_approval BEFORE INSERT ON token_adjustment_decisions
WHEN EXISTS (SELECT 1 FROM token_adjustment_requests WHERE id = NEW.request_id AND requested_by = NEW.decided_by)
BEGIN SELECT RAISE(ABORT, 'adjustment cannot be self approved'); END;
--> statement-breakpoint
CREATE TRIGGER token_adjustment_approved_ledger AFTER INSERT ON token_adjustment_decisions
WHEN NEW.decision = 'approve'
BEGIN
  INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
  SELECT 'admin-adjustment:' || r.id, r.target_cultivator_id, 'token', r.delta,
    'admin-adjustment:' || r.id, NEW.decided_at
  FROM token_adjustment_requests r WHERE r.id = NEW.request_id;
END;
