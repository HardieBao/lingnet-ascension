import { FORMAL_RESULTS_COUNT_SUBQUERY } from "./formal-results.ts";
import { INDEPENDENT_REVIEWS_COUNT_SUBQUERY } from "./revalidations.ts";

export type RealmTrial = {
  id: string; claim_id: string; cultivator_id: string; from_realm: string; target_realm: string;
  fee: number; base_commit: string; state: string; started_at: number; expires_at: number;
  finished_at: number | null; finish_reason: string | null; outcome: string | null;
};

export type RealmTrialOffer = {
  claim_id: string; mission_id: string; title: string; target_realm: "foundation" | "core";
  duration_ms: number; fee: number;
};

export const REALM_TRIAL_OFFERS_SQL = `
  SELECT c.id AS claim_id, m.id AS mission_id,
    COALESCE(CASE WHEN json_valid(c.reward_snapshot) THEN json_extract(c.reward_snapshot, '$.title') END, m.title) AS title,
    t.target_realm, t.duration_ms, CASE t.target_realm WHEN 'core' THEN 2000 ELSE 500 END AS fee
  FROM claims c JOIN missions m ON m.id = c.mission_id JOIN realm_trial_contracts t ON t.mission_id = m.id
    JOIN cultivators u ON u.id = c.cultivator_id
  WHERE c.cultivator_id = ? AND c.state = 'running' AND c.expires_at > ? AND m.state = 'open' AND m.contract_ready = 1
    AND ((u.realm = 'qi' AND t.target_realm = 'foundation') OR (u.realm = 'foundation' AND t.target_realm = 'core'))
    AND NOT EXISTS (SELECT 1 FROM submissions WHERE claim_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM realm_trials WHERE claim_id = c.id OR (cultivator_id = c.cultivator_id AND state = 'active'))
  ORDER BY c.claimed_at DESC, c.id DESC LIMIT 2
`;

export const REALM_TRIAL_START_SQL = `
  INSERT INTO realm_trials (id, claim_id, cultivator_id, from_realm, target_realm, fee, base_commit, started_at, expires_at)
  SELECT ?, c.id, c.cultivator_id, u.realm, t.target_realm, CASE t.target_realm WHEN 'core' THEN 2000 ELSE 500 END,
    json_extract(c.reward_snapshot, '$.baseCommit'), ?, ? + t.duration_ms
  FROM claims c JOIN cultivators u ON u.id = c.cultivator_id
    JOIN missions m ON m.id = c.mission_id JOIN realm_trial_contracts t ON t.mission_id = m.id
  WHERE c.id = ? AND c.cultivator_id = ? AND c.state = 'running' AND c.expires_at > ?
    AND m.state = 'open' AND m.contract_ready = 1
    AND ((t.target_realm = 'foundation' AND u.realm = 'qi') OR (t.target_realm = 'core' AND u.realm = 'foundation'))
    AND json_valid(c.reward_snapshot) AND length(json_extract(c.reward_snapshot, '$.baseCommit')) = 40
    AND NOT EXISTS (SELECT 1 FROM submissions WHERE claim_id = c.id)
    AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = u.id AND resource = 'token') >= CASE t.target_realm WHEN 'core' THEN 2000 ELSE 500 END
    AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = u.id AND resource = 'cultivation') >= CASE t.target_realm WHEN 'core' THEN 5000 ELSE 1000 END
    AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = u.id AND resource = 'merit') >= CASE t.target_realm WHEN 'core' THEN 200 ELSE 50 END
    AND ${FORMAL_RESULTS_COUNT_SUBQUERY} >= CASE t.target_realm WHEN 'core' THEN 10 ELSE 3 END
    AND (t.target_realm = 'foundation' OR ${INDEPENDENT_REVIEWS_COUNT_SUBQUERY} >= 1)
    AND NOT EXISTS (SELECT 1 FROM realm_trials WHERE claim_id = c.id OR (cultivator_id = u.id AND state = 'active'))
    AND NOT EXISTS (SELECT 1 FROM realm_events WHERE cultivator_id = u.id AND to_realm = t.target_realm)
`;

export const REALM_TRIAL_HISTORY_SQL = `
  SELECT *, CASE WHEN state = 'active' THEN NULL ELSE state END AS outcome
  FROM realm_trials WHERE cultivator_id = ? ORDER BY started_at DESC, id DESC LIMIT 30
`;

export const REALM_TRIAL_PASS_SQL = `
  UPDATE realm_trials SET state = 'passed', finished_at = ?, finish_reason = '本次专属悬赏按时形成正式成果，独立复核已接受'
  WHERE cultivator_id = ? AND state = 'active' AND target_realm IN ('foundation', 'core') AND (? IS NULL OR id = ?)
    AND EXISTS (SELECT 1 FROM cultivators WHERE id = realm_trials.cultivator_id AND realm = realm_trials.from_realm)
    AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = realm_trials.cultivator_id AND resource = 'cultivation') >= CASE target_realm WHEN 'core' THEN 5000 ELSE 1000 END
    AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = realm_trials.cultivator_id AND resource = 'merit') >= CASE target_realm WHEN 'core' THEN 200 ELSE 50 END
    AND ${FORMAL_RESULTS_COUNT_SUBQUERY} >= CASE target_realm WHEN 'core' THEN 10 ELSE 3 END
    AND (target_realm = 'foundation' OR ${INDEPENDENT_REVIEWS_COUNT_SUBQUERY} >= 1)
    AND EXISTS (
      SELECT 1 FROM claims c JOIN submissions s ON s.claim_id = c.id AND s.cultivator_id = c.cultivator_id
        JOIN missions m ON m.id = c.mission_id JOIN cultivators reviewer ON reviewer.id = s.reviewer_id
      WHERE c.id = realm_trials.claim_id AND c.cultivator_id = realm_trials.cultivator_id
        AND c.state = 'completed' AND m.state = 'done' AND s.state = 'accepted'
        AND length(s.integrated_commit) = 40 AND lower(s.integrated_commit) NOT GLOB '*[^0-9a-f]*'
        AND s.integrated_at BETWEEN realm_trials.started_at AND realm_trials.expires_at
        AND reviewer.id != c.cultivator_id
        AND json_valid(c.reward_snapshot) AND json_extract(c.reward_snapshot, '$.baseCommit') = realm_trials.base_commit
    )
`;

export const REALM_TRIAL_EXPIRE_SQL = `
  UPDATE realm_trials SET state = CASE WHEN expires_at <= ? OR EXISTS (
      SELECT 1 FROM claims WHERE id = realm_trials.claim_id AND (state = 'expired' OR (state IN ('claimed','running') AND expires_at <= ?))
    ) THEN 'expired' ELSE 'failed' END,
    finished_at = ?, finish_reason = '渡劫或认领已到期、释放或驳回，未形成有效突破；费用全额解冻'
  WHERE cultivator_id = ? AND state = 'active' AND (
    expires_at <= ? OR EXISTS (SELECT 1 FROM claims WHERE id = realm_trials.claim_id AND (
      state IN ('expired','released','rejected') OR (state IN ('claimed','running') AND expires_at <= ?)
    ))
  )
`;
