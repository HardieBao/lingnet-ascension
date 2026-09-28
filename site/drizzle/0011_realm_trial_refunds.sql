CREATE TRIGGER realm_trials_finish_once BEFORE UPDATE ON realm_trials
WHEN OLD.state != 'active' OR NEW.state = 'active'
  OR NEW.id IS NOT OLD.id OR NEW.claim_id IS NOT OLD.claim_id OR NEW.cultivator_id IS NOT OLD.cultivator_id
  OR NEW.from_realm IS NOT OLD.from_realm OR NEW.target_realm IS NOT OLD.target_realm OR NEW.fee IS NOT OLD.fee
  OR NEW.base_commit IS NOT OLD.base_commit OR NEW.started_at IS NOT OLD.started_at OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.finished_at IS NULL OR NEW.finished_at < OLD.started_at
  OR NEW.finish_reason IS NULL OR length(NEW.finish_reason) NOT BETWEEN 1 AND 500
BEGIN SELECT RAISE(ABORT, 'trial can finish once without rewriting its start'); END;
--> statement-breakpoint
CREATE TRIGGER realm_trials_pass_requires_formal_result BEFORE UPDATE ON realm_trials
WHEN NEW.state = 'passed' AND (
  NEW.target_realm != 'foundation'
  OR NOT EXISTS (SELECT 1 FROM cultivators WHERE id = NEW.cultivator_id AND realm = NEW.from_realm)
  OR NOT EXISTS (
    SELECT 1 FROM claims c JOIN submissions s ON s.claim_id = c.id AND s.cultivator_id = c.cultivator_id
      JOIN missions m ON m.id = c.mission_id
    WHERE c.id = NEW.claim_id AND c.cultivator_id = NEW.cultivator_id AND c.state = 'completed' AND m.state = 'done'
      AND s.state = 'accepted' AND length(s.integrated_commit) = 40
      AND s.integrated_at BETWEEN NEW.started_at AND NEW.expires_at
      AND s.reviewer_id IS NOT NULL AND s.reviewer_id != NEW.cultivator_id
  )
)
BEGIN SELECT RAISE(ABORT, 'trial requires its own on-time formal result and an independent reviewer'); END;
--> statement-breakpoint
CREATE TRIGGER realm_trials_settle_ledger AFTER UPDATE ON realm_trials
BEGIN
  INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
  VALUES ('trial:' || NEW.id || ':' || NEW.state || ':unlock', NEW.cultivator_id, 'token_locked', -NEW.fee,
    'trial:' || NEW.id || ':' || NEW.state || ':unlock', NEW.finished_at);
  INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
  SELECT 'trial:' || NEW.id || ':' || NEW.state || ':refund', NEW.cultivator_id, 'token', NEW.fee,
    'trial:' || NEW.id || ':' || NEW.state || ':refund', NEW.finished_at WHERE NEW.state != 'passed';
END;
--> statement-breakpoint
CREATE TRIGGER realm_trials_pass_realm AFTER UPDATE ON realm_trials
WHEN NEW.state = 'passed'
BEGIN
  INSERT INTO realm_events (id, cultivator_id, from_realm, to_realm, created_at)
  VALUES ('trial:' || NEW.id, NEW.cultivator_id, NEW.from_realm, NEW.target_realm, NEW.finished_at);
  UPDATE cultivators SET realm = NEW.target_realm WHERE id = NEW.cultivator_id AND realm = NEW.from_realm;
END;
