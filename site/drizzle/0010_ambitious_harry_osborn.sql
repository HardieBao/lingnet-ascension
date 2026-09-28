CREATE TABLE `realm_trial_contracts` (
	`mission_id` text PRIMARY KEY NOT NULL,
	`target_realm` text NOT NULL,
	`duration_ms` integer NOT NULL,
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "realm_trial_contract_target" CHECK("realm_trial_contracts"."target_realm" IN ('foundation', 'core')),
	CONSTRAINT "realm_trial_contract_duration" CHECK("realm_trial_contracts"."duration_ms" BETWEEN 60000 AND 259200000)
);
--> statement-breakpoint
CREATE TABLE `realm_trials` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`cultivator_id` text NOT NULL,
	`from_realm` text NOT NULL,
	`target_realm` text NOT NULL,
	`fee` integer NOT NULL,
	`base_commit` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`finished_at` integer,
	`finish_reason` text,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "realm_trial_fee" CHECK(("realm_trials"."from_realm" = 'qi' AND "realm_trials"."target_realm" = 'foundation' AND "realm_trials"."fee" = 500) OR ("realm_trials"."from_realm" = 'foundation' AND "realm_trials"."target_realm" = 'core' AND "realm_trials"."fee" = 2000)),
	CONSTRAINT "realm_trial_base" CHECK(length("realm_trials"."base_commit") = 40),
	CONSTRAINT "realm_trial_state" CHECK("realm_trials"."state" IN ('active', 'passed', 'expired', 'withdrawn', 'failed', 'platform_failure')),
	CONSTRAINT "realm_trial_expiry" CHECK("realm_trials"."expires_at" > "realm_trials"."started_at"),
	CONSTRAINT "realm_trial_finish" CHECK(("realm_trials"."state" = 'active' AND "realm_trials"."finished_at" IS NULL AND "realm_trials"."finish_reason" IS NULL) OR ("realm_trials"."state" != 'active' AND "realm_trials"."finished_at" >= "realm_trials"."started_at" AND length("realm_trials"."finish_reason") BETWEEN 1 AND 500))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_realm_trials_claim` ON `realm_trials` (`claim_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_realm_trials_active_cultivator` ON `realm_trials` (`cultivator_id`) WHERE state = 'active';
--> statement-breakpoint
CREATE TRIGGER realm_trials_begin_active BEFORE INSERT ON realm_trials
WHEN NEW.state != 'active' OR NEW.finished_at IS NOT NULL OR NEW.finish_reason IS NOT NULL
  OR NOT EXISTS (SELECT 1 FROM claims WHERE id = NEW.claim_id AND cultivator_id = NEW.cultivator_id)
BEGIN SELECT RAISE(ABORT, 'trial must begin active on its own claim'); END;
--> statement-breakpoint
CREATE TRIGGER realm_trials_freeze AFTER INSERT ON realm_trials
BEGIN
  INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
  VALUES ('trial:' || NEW.id || ':hold', NEW.cultivator_id, 'token', -NEW.fee, 'trial:' || NEW.id || ':hold', NEW.started_at);
  INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
  VALUES ('trial:' || NEW.id || ':locked', NEW.cultivator_id, 'token_locked', NEW.fee, 'trial:' || NEW.id || ':locked', NEW.started_at);
END;
--> statement-breakpoint
CREATE TRIGGER realm_trials_no_delete BEFORE DELETE ON realm_trials
BEGIN SELECT RAISE(ABORT, 'trial history cannot be deleted'); END;
