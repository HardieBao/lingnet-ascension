-- Synthetic, isolated local accounts; never run against a hosted database.
INSERT INTO cultivators (id, provider, provider_id, handle, display_name, realm, created_at) VALUES
  ('fixture-trial-no-token','github','904','Fixture','隔离测试','qi',1),
  ('fixture-trial-no-cultivation','github','905','Fixture','隔离测试','qi',1),
  ('fixture-trial-no-merit','github','906','Fixture','隔离测试','qi',1),
  ('fixture-trial-no-results','github','907','Fixture','隔离测试','qi',1),
  ('fixture-trial-mortal','github','908','Fixture','隔离测试','mortal',1),
  ('fixture-trial-ordinary','github','909','Fixture','隔离测试','qi',1),
  ('fixture-trial-submitted','github','910','Fixture','隔离测试','qi',1),
  ('fixture-trial-audit','github','911','Fixture','隔离测试','qi',1);
INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
SELECT u.id || ':' || r.resource, u.id, r.resource,
  CASE WHEN r.resource = 'token' THEN CASE WHEN u.id = 'fixture-trial-no-token' THEN 499 ELSE 1000 END
    WHEN r.resource = 'cultivation' THEN CASE WHEN u.id = 'fixture-trial-no-cultivation' THEN 999 ELSE 1000 END
    ELSE CASE WHEN u.id = 'fixture-trial-no-merit' THEN 49 ELSE 50 END END,
  u.id || ':seed:' || r.resource, 1
FROM cultivators u CROSS JOIN (SELECT 'token' AS resource UNION ALL SELECT 'cultivation' UNION ALL SELECT 'merit') r
WHERE CAST(u.provider_id AS INTEGER) BETWEEN 904 AND 911;
INSERT INTO claims (id, mission_id, cultivator_id, state, claimed_at, started_at, expires_at, reward_snapshot)
SELECT u.id || ':formal:' || m.id, m.id, u.id, 'completed', 1, 1, 2, '{"deposit":0}'
FROM cultivators u CROSS JOIN missions m
WHERE CAST(u.provider_id AS INTEGER) BETWEEN 904 AND 911 AND m.id LIKE 'fixture-formal-%'
  AND NOT (u.id = 'fixture-trial-no-results' AND m.id = 'fixture-formal-3');
INSERT INTO submissions (id, claim_id, cultivator_id, artifact_key, artifact_sha256, state, reviewer_id,
  integrated_commit, integrated_at, created_at)
SELECT 's:' || c.id, c.id, c.cultivator_id, 'fixture.md',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'accepted', 'fixture-trial-reviewer',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 2, 1
FROM claims c JOIN cultivators u ON u.id = c.cultivator_id
WHERE CAST(u.provider_id AS INTEGER) BETWEEN 904 AND 911 AND c.state = 'completed';
INSERT INTO missions (id, title, description, rank, branch, state, base_commit, allowed_paths, acceptance,
  reward_token, reward_cultivation, reward_merit, deposit, contract_ready, created_at)
SELECT u.id || ':mission', '合成渡劫边界', '只验证公开接口，不是真实悬赏', '地阶', '测试', 'open',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'fixture.md', '测试', 0, 0, 0, 0, 1, 1
FROM cultivators u WHERE CAST(u.provider_id AS INTEGER) BETWEEN 904 AND 911;
INSERT INTO realm_trial_contracts
SELECT id, 'foundation', 3600000 FROM missions WHERE id LIKE 'fixture-trial-%:mission' AND id != 'fixture-trial-ordinary:mission';
INSERT INTO claims (id, mission_id, cultivator_id, state, claimed_at, started_at, expires_at, reward_snapshot)
SELECT u.id || ':claim', u.id || ':mission', u.id, 'running', unixepoch()*1000, unixepoch()*1000, unixepoch()*1000+7200000,
  '{"deposit":0,"baseCommit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","allowedPaths":"fixture.md","officialToken":0}'
FROM cultivators u WHERE CAST(u.provider_id AS INTEGER) BETWEEN 904 AND 911;
INSERT INTO submissions (id, claim_id, cultivator_id, artifact_key, artifact_sha256, state, created_at)
VALUES ('fixture-already-submitted', 'fixture-trial-submitted:claim', 'fixture-trial-submitted', 'fixture.md',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'revision', unixepoch()*1000);
