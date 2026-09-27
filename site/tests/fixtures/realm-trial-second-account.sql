-- Fresh synthetic account after the failed response-status regression.
INSERT INTO cultivators (id, provider, provider_id, handle, display_name, realm, session_version, created_at)
SELECT 'fixture-trial-ready-2', provider, '903', handle, display_name, realm, session_version, created_at
FROM cultivators WHERE id = 'fixture-trial-ready';
INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
SELECT id || '-2', 'fixture-trial-ready-2', resource, delta, source_key || '-2', created_at
FROM ledger_events WHERE cultivator_id = 'fixture-trial-ready' AND source_key LIKE 'fixture-seed:%';
INSERT INTO missions (id, title, description, rank, branch, state, base_commit, allowed_paths, acceptance,
  reward_token, reward_cultivation, reward_merit, deposit, budget_tokens, created_at, contract_ready, required_realm, required_merit)
SELECT 'fixture-foundation-mission-2', title, description, rank, branch, state, base_commit, allowed_paths, acceptance,
  reward_token, reward_cultivation, reward_merit, deposit, budget_tokens, created_at, contract_ready, required_realm, required_merit
FROM missions WHERE id = 'fixture-foundation-mission';
INSERT INTO claims (id, mission_id, cultivator_id, state, claimed_at, started_at, expires_at, reward_snapshot)
SELECT id || '-2', mission_id, 'fixture-trial-ready-2', state, claimed_at, started_at, expires_at, reward_snapshot
FROM claims WHERE cultivator_id = 'fixture-trial-ready' AND state = 'completed';
INSERT INTO submissions (id, claim_id, cultivator_id, artifact_key, artifact_sha256, state, verdict, created_at,
  reviewer_id, review_reason, reviewed_at, integrated_commit, integrated_at)
SELECT id || '-2', claim_id || '-2', 'fixture-trial-ready-2', artifact_key, artifact_sha256, state, verdict, created_at,
  reviewer_id, review_reason, reviewed_at, integrated_commit, integrated_at FROM submissions WHERE cultivator_id = 'fixture-trial-ready';
INSERT INTO claims (id, mission_id, cultivator_id, state, claimed_at, started_at, expires_at, reward_snapshot)
SELECT 'fixture-foundation-claim-2', 'fixture-foundation-mission-2', 'fixture-trial-ready-2', 'running',
  unixepoch()*1000, unixepoch()*1000, unixepoch()*1000+7200000, reward_snapshot
FROM claims WHERE id = 'fixture-foundation-claim';
INSERT INTO realm_trial_contracts VALUES ('fixture-foundation-mission-2', 'foundation', 3600000);
