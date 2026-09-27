CREATE TRIGGER realm_trials_core_start_qualified BEFORE INSERT ON realm_trials
WHEN NEW.target_realm = 'core' AND (
  NOT (EXISTS (SELECT 1 FROM cultivators WHERE id = NEW.cultivator_id AND realm = 'foundation')
  AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = NEW.cultivator_id AND resource = 'cultivation') >= 5000
  AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = NEW.cultivator_id AND resource = 'merit') >= 200
  AND (SELECT COUNT(DISTINCT c.mission_id) FROM claims c
    JOIN submissions s ON s.claim_id = c.id AND s.cultivator_id = c.cultivator_id JOIN missions m ON m.id = c.mission_id
    WHERE c.cultivator_id = NEW.cultivator_id AND c.state = 'completed' AND m.state = 'done'
      AND s.state = 'accepted' AND length(s.integrated_commit) = 40 AND s.integrated_at IS NOT NULL) >= 10
  AND EXISTS (
    SELECT 1 FROM result_revalidations r JOIN result_revalidation_decisions d ON d.revalidation_id = r.id AND d.decision = 'accept'
      JOIN submissions s ON s.id = r.submission_id
      JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id JOIN missions m ON m.id = c.mission_id
      JOIN cultivators reporter ON reporter.id = r.cultivator_id AND reporter.provider = 'github'
      JOIN cultivators adopter ON adopter.id = d.decided_by AND adopter.provider = 'github'
    WHERE r.cultivator_id = NEW.cultivator_id AND s.cultivator_id != r.cultivator_id
      AND d.decided_by != r.cultivator_id AND d.decided_by != s.cultivator_id
      AND s.state = 'accepted' AND c.state = 'completed' AND m.state = 'done' AND s.integrated_at IS NOT NULL
      AND r.integrated_commit = lower(s.integrated_commit) AND r.artifact_sha256 = lower(s.artifact_sha256)
  ))
  OR (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = NEW.cultivator_id AND resource = 'token') < 2000
  OR NOT EXISTS (
    SELECT 1 FROM claims c JOIN missions m ON m.id = c.mission_id
      JOIN realm_trial_contracts t ON t.mission_id = m.id AND t.target_realm = 'core'
    WHERE c.id = NEW.claim_id AND c.cultivator_id = NEW.cultivator_id AND c.state = 'running'
      AND c.expires_at > NEW.started_at AND m.state = 'open' AND m.contract_ready = 1
      AND CASE WHEN json_valid(c.reward_snapshot) THEN json_extract(c.reward_snapshot, '$.baseCommit') END = NEW.base_commit
      AND NEW.expires_at = NEW.started_at + t.duration_ms
      AND NOT EXISTS (SELECT 1 FROM submissions WHERE claim_id = c.id)
  )
)
BEGIN SELECT RAISE(ABORT, 'core trial requires its own live contract, balances, formal results and adopted independent replay'); END;
--> statement-breakpoint
DROP TRIGGER realm_trials_pass_requires_formal_result;
--> statement-breakpoint
CREATE TRIGGER realm_trials_pass_requires_formal_result BEFORE UPDATE ON realm_trials
WHEN NEW.state = 'passed' AND (
  NEW.target_realm NOT IN ('foundation', 'core')
  OR NOT EXISTS (SELECT 1 FROM cultivators WHERE id = NEW.cultivator_id AND realm = NEW.from_realm)
  OR NOT EXISTS (
    SELECT 1 FROM claims c JOIN submissions s ON s.claim_id = c.id AND s.cultivator_id = c.cultivator_id
      JOIN missions m ON m.id = c.mission_id JOIN cultivators reviewer ON reviewer.id = s.reviewer_id
    WHERE c.id = NEW.claim_id AND c.cultivator_id = NEW.cultivator_id AND c.state = 'completed' AND m.state = 'done'
      AND s.state = 'accepted' AND length(s.integrated_commit) = 40 AND lower(s.integrated_commit) NOT GLOB '*[^0-9a-f]*'
      AND s.integrated_at BETWEEN NEW.started_at AND NEW.expires_at AND reviewer.id != NEW.cultivator_id
      AND CASE WHEN json_valid(c.reward_snapshot) THEN json_extract(c.reward_snapshot, '$.baseCommit') END = NEW.base_commit
  )
  OR (NEW.target_realm = 'core' AND NOT (EXISTS (SELECT 1 FROM cultivators WHERE id = NEW.cultivator_id AND realm = 'foundation')
  AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = NEW.cultivator_id AND resource = 'cultivation') >= 5000
  AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = NEW.cultivator_id AND resource = 'merit') >= 200
  AND (SELECT COUNT(DISTINCT c.mission_id) FROM claims c
    JOIN submissions s ON s.claim_id = c.id AND s.cultivator_id = c.cultivator_id JOIN missions m ON m.id = c.mission_id
    WHERE c.cultivator_id = NEW.cultivator_id AND c.state = 'completed' AND m.state = 'done'
      AND s.state = 'accepted' AND length(s.integrated_commit) = 40 AND s.integrated_at IS NOT NULL) >= 10
  AND EXISTS (
    SELECT 1 FROM result_revalidations r JOIN result_revalidation_decisions d ON d.revalidation_id = r.id AND d.decision = 'accept'
      JOIN submissions s ON s.id = r.submission_id
      JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id JOIN missions m ON m.id = c.mission_id
      JOIN cultivators reporter ON reporter.id = r.cultivator_id AND reporter.provider = 'github'
      JOIN cultivators adopter ON adopter.id = d.decided_by AND adopter.provider = 'github'
    WHERE r.cultivator_id = NEW.cultivator_id AND s.cultivator_id != r.cultivator_id
      AND d.decided_by != r.cultivator_id AND d.decided_by != s.cultivator_id
      AND s.state = 'accepted' AND c.state = 'completed' AND m.state = 'done' AND s.integrated_at IS NOT NULL
      AND r.integrated_commit = lower(s.integrated_commit) AND r.artifact_sha256 = lower(s.artifact_sha256)
  )))
)
BEGIN SELECT RAISE(ABORT, 'trial requires its own on-time formal result, independent reviewer and current breakthrough qualification'); END;
