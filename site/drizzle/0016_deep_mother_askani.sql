CREATE TABLE `stable_reward_hold_releases` (
	`settlement_id` text PRIMARY KEY NOT NULL,
	`reviewed_by` text NOT NULL,
	`reason` text NOT NULL,
	`reviewed_at` integer NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `stable_reward_revocations`(`settlement_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stable_hold_release_reason" CHECK(length("stable_reward_hold_releases"."reason") BETWEEN 20 AND 500)
);
--> statement-breakpoint
CREATE TABLE `stable_reward_recovery_payments` (
	`credit_event_id` text PRIMARY KEY NOT NULL,
	`cultivator_id` text NOT NULL,
	`resource` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`credit_event_id`) REFERENCES `ledger_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stable_recovery_payment_amount" CHECK("stable_reward_recovery_payments"."amount" > 0 AND "stable_reward_recovery_payments"."resource" IN ('token', 'cultivation', 'merit'))
);
--> statement-breakpoint
CREATE TABLE `stable_reward_revocations` (
	`settlement_id` text PRIMARY KEY NOT NULL,
	`cultivator_id` text NOT NULL,
	`main_commit` text NOT NULL,
	`token_offset` integer NOT NULL,
	`cultivation_offset` integer NOT NULL,
	`merit_offset` integer NOT NULL,
	`token_debt` integer NOT NULL,
	`cultivation_debt` integer NOT NULL,
	`merit_debt` integer NOT NULL,
	`revoked_by` text NOT NULL,
	`reason` text NOT NULL,
	`revoked_at` integer NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `stable_reward_settlements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revoked_by`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stable_revocation_amounts" CHECK("stable_reward_revocations"."token_offset" >= 0 AND "stable_reward_revocations"."cultivation_offset" >= 0 AND "stable_reward_revocations"."merit_offset" >= 0 AND "stable_reward_revocations"."token_debt" >= 0 AND "stable_reward_revocations"."cultivation_debt" >= 0 AND "stable_reward_revocations"."merit_debt" >= 0),
	CONSTRAINT "stable_revocation_review" CHECK("stable_reward_revocations"."revoked_by" != "stable_reward_revocations"."cultivator_id" AND length("stable_reward_revocations"."reason") BETWEEN 20 AND 500)
);
--> statement-breakpoint
CREATE VIEW stable_reward_debts AS
SELECT r.cultivator_id, 'token' AS resource,
  SUM(r.token_debt) - COALESCE((SELECT SUM(p.amount) FROM stable_reward_recovery_payments p
    WHERE p.cultivator_id = r.cultivator_id AND p.resource = 'token'), 0) AS outstanding
FROM stable_reward_revocations r GROUP BY r.cultivator_id
UNION ALL
SELECT r.cultivator_id, 'cultivation',
  SUM(r.cultivation_debt) - COALESCE((SELECT SUM(p.amount) FROM stable_reward_recovery_payments p
    WHERE p.cultivator_id = r.cultivator_id AND p.resource = 'cultivation'), 0)
FROM stable_reward_revocations r GROUP BY r.cultivator_id
UNION ALL
SELECT r.cultivator_id, 'merit',
  SUM(r.merit_debt) - COALESCE((SELECT SUM(p.amount) FROM stable_reward_recovery_payments p
    WHERE p.cultivator_id = r.cultivator_id AND p.resource = 'merit'), 0)
FROM stable_reward_revocations r GROUP BY r.cultivator_id;
--> statement-breakpoint
CREATE VIEW active_stable_reward_holds AS
SELECT r.cultivator_id FROM stable_reward_revocations r
LEFT JOIN stable_reward_hold_releases h ON h.settlement_id = r.settlement_id
WHERE h.settlement_id IS NULL;
--> statement-breakpoint
CREATE TRIGGER stable_revocation_current BEFORE INSERT ON stable_reward_revocations
WHEN NOT EXISTS (
  SELECT 1 FROM stable_reward_settlements s JOIN submissions result ON result.id = s.submission_id
  WHERE s.id = NEW.settlement_id AND s.cultivator_id = NEW.cultivator_id
    AND NEW.revoked_by != result.cultivator_id
    AND NEW.token_offset + NEW.token_debt = s.token
    AND NEW.cultivation_offset + NEW.cultivation_debt = s.cultivation
    AND NEW.merit_offset + NEW.merit_debt = s.merit
)
BEGIN SELECT RAISE(ABORT, 'stable recovery does not match the original award'); END;
--> statement-breakpoint
CREATE TRIGGER stable_revocation_no_update BEFORE UPDATE ON stable_reward_revocations
BEGIN SELECT RAISE(ABORT, 'stable reward revocations are append only'); END;
--> statement-breakpoint
CREATE TRIGGER stable_revocation_no_delete BEFORE DELETE ON stable_reward_revocations
BEGIN SELECT RAISE(ABORT, 'stable reward revocations are append only'); END;
--> statement-breakpoint
CREATE TRIGGER stable_recovery_payment_no_update BEFORE UPDATE ON stable_reward_recovery_payments
BEGIN SELECT RAISE(ABORT, 'stable reward recovery payments are append only'); END;
--> statement-breakpoint
CREATE TRIGGER stable_recovery_payment_no_delete BEFORE DELETE ON stable_reward_recovery_payments
BEGIN SELECT RAISE(ABORT, 'stable reward recovery payments are append only'); END;
--> statement-breakpoint
CREATE TRIGGER stable_recovery_payment_proof BEFORE INSERT ON stable_reward_recovery_payments
WHEN NOT EXISTS (
  SELECT 1 FROM ledger_events credit JOIN ledger_events offset_event
    ON offset_event.id = 'stable-debt:' || credit.id
  WHERE credit.id = NEW.credit_event_id AND credit.cultivator_id = NEW.cultivator_id
    AND credit.resource = NEW.resource AND credit.delta > 0
    AND offset_event.cultivator_id = NEW.cultivator_id AND offset_event.resource = NEW.resource
    AND offset_event.delta = -NEW.amount
)
BEGIN SELECT RAISE(ABORT, 'recovery payment needs matching ledger offset'); END;
--> statement-breakpoint
CREATE TRIGGER stable_hold_release_independent BEFORE INSERT ON stable_reward_hold_releases
WHEN NOT EXISTS (
  SELECT 1 FROM stable_reward_revocations r JOIN cultivators reviewer ON reviewer.id = NEW.reviewed_by
  WHERE r.settlement_id = NEW.settlement_id AND reviewer.provider = 'github'
    AND NEW.reviewed_by != r.cultivator_id AND NEW.reviewed_by != r.revoked_by
)
BEGIN SELECT RAISE(ABORT, 'independent recovery review required'); END;
--> statement-breakpoint
CREATE TRIGGER stable_hold_release_no_update BEFORE UPDATE ON stable_reward_hold_releases
BEGIN SELECT RAISE(ABORT, 'stable hold releases are append only'); END;
--> statement-breakpoint
CREATE TRIGGER stable_hold_release_no_delete BEFORE DELETE ON stable_reward_hold_releases
BEGIN SELECT RAISE(ABORT, 'stable hold releases are append only'); END;
--> statement-breakpoint
CREATE TRIGGER stable_spend_hold BEFORE INSERT ON ledger_events
WHEN NEW.delta < 0 AND NEW.resource IN ('token', 'cultivation', 'merit')
  AND NEW.source_key NOT LIKE '%:stable:reversal' AND NEW.source_key NOT LIKE 'stable-debt:%'
  AND (EXISTS (SELECT 1 FROM active_stable_reward_holds h WHERE h.cultivator_id = NEW.cultivator_id)
    OR EXISTS (SELECT 1 FROM stable_reward_debts d WHERE d.cultivator_id = NEW.cultivator_id AND d.outstanding > 0))
BEGIN SELECT RAISE(ABORT, 'stable reward recovery freezes spending'); END;
--> statement-breakpoint
CREATE TRIGGER stable_reward_hold_grants BEFORE INSERT ON ledger_events
WHEN NEW.delta > 0 AND NEW.resource IN ('token', 'cultivation', 'merit')
  AND (NEW.source_key LIKE '%:verified' OR NEW.source_key LIKE '%:official' OR NEW.source_key LIKE '%:stable')
  AND EXISTS (SELECT 1 FROM active_stable_reward_holds h WHERE h.cultivator_id = NEW.cultivator_id)
BEGIN SELECT RAISE(ABORT, 'stable reward recovery freezes new awards'); END;
--> statement-breakpoint
CREATE TRIGGER stable_recovery_apply_credit AFTER INSERT ON ledger_events
WHEN NEW.delta > 0 AND NEW.resource IN ('token', 'cultivation', 'merit')
  AND EXISTS (SELECT 1 FROM stable_reward_debts d WHERE d.cultivator_id = NEW.cultivator_id
    AND d.resource = NEW.resource AND d.outstanding > 0)
BEGIN
  INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
  SELECT 'stable-debt:' || NEW.id, NEW.cultivator_id, NEW.resource,
    -MIN(NEW.delta, d.outstanding), 'stable-debt:' || NEW.id, NEW.created_at
  FROM stable_reward_debts d WHERE d.cultivator_id = NEW.cultivator_id AND d.resource = NEW.resource;
  INSERT INTO stable_reward_recovery_payments (credit_event_id, cultivator_id, resource, amount, created_at)
  SELECT NEW.id, NEW.cultivator_id, NEW.resource, MIN(NEW.delta, d.outstanding), NEW.created_at
  FROM stable_reward_debts d WHERE d.cultivator_id = NEW.cultivator_id AND d.resource = NEW.resource;
END;
--> statement-breakpoint
CREATE TRIGGER stable_realm_event_hold BEFORE INSERT ON realm_events
WHEN EXISTS (SELECT 1 FROM active_stable_reward_holds h WHERE h.cultivator_id = NEW.cultivator_id)
  OR EXISTS (SELECT 1 FROM stable_reward_debts d WHERE d.cultivator_id = NEW.cultivator_id AND d.outstanding > 0)
BEGIN SELECT RAISE(ABORT, 'stable reward recovery freezes advancement'); END;
--> statement-breakpoint
CREATE TRIGGER stable_realm_update_hold BEFORE UPDATE OF realm ON cultivators
WHEN NEW.realm != OLD.realm AND (EXISTS (SELECT 1 FROM active_stable_reward_holds h WHERE h.cultivator_id = NEW.id)
  OR EXISTS (SELECT 1 FROM stable_reward_debts d WHERE d.cultivator_id = NEW.id AND d.outstanding > 0))
BEGIN SELECT RAISE(ABORT, 'stable reward recovery freezes advancement'); END;
