-- Synthetic local data only. Never apply to a hosted or production database.
INSERT INTO cultivators (id, provider, provider_id, handle, display_name, realm, created_at)
VALUES ('fixture-trial-ready', 'github', '901', 'TrialFixture', '渡劫隔离测试账号', 'qi', 1),
  ('fixture-trial-reviewer', 'github', '902', 'TrialReviewerFixture', '独立复核测试账号', 'mortal', 1);
INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
VALUES ('fixture-token', 'fixture-trial-ready', 'token', 1000, 'fixture-seed:token', 1),
  ('fixture-cultivation', 'fixture-trial-ready', 'cultivation', 1000, 'fixture-seed:cultivation', 1),
  ('fixture-merit', 'fixture-trial-ready', 'merit', 50, 'fixture-seed:merit', 1);
INSERT INTO missions (id, title, description, rank, branch, state, base_commit, allowed_paths, acceptance,
  reward_token, reward_cultivation, reward_merit, deposit, contract_ready, created_at)
VALUES ('fixture-formal-1', '合成正式成果一', '不是社区成果', '黄阶', '测试', 'done', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'fixture.md', '测试', 0, 0, 0, 0, 1, 1),
  ('fixture-formal-2', '合成正式成果二', '不是社区成果', '黄阶', '测试', 'done', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'fixture.md', '测试', 0, 0, 0, 0, 1, 1),
  ('fixture-formal-3', '合成正式成果三', '不是社区成果', '黄阶', '测试', 'done', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'fixture.md', '测试', 0, 0, 0, 0, 1, 1),
  ('fixture-foundation-mission', '合成筑基渡劫', '只验证流程，不是真实渡劫任务', '地阶', '测试', 'open', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'fixture.md', '测试', 0, 0, 0, 0, 1, 1);
INSERT INTO claims (id, mission_id, cultivator_id, state, claimed_at, started_at, expires_at, reward_snapshot)
SELECT 'fixture-claim-' || id, id, 'fixture-trial-ready', 'completed', 1, 1, 2, '{"deposit":0}'
FROM missions WHERE id LIKE 'fixture-formal-%';
INSERT INTO submissions (id, claim_id, cultivator_id, artifact_key, artifact_sha256, state, reviewer_id,
  integrated_commit, integrated_at, created_at)
SELECT 'fixture-submission-' || id, 'fixture-claim-' || id, 'fixture-trial-ready', 'fixture.md',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'accepted', 'fixture-trial-reviewer',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 2, 1 FROM missions WHERE id LIKE 'fixture-formal-%';
INSERT INTO claims (id, mission_id, cultivator_id, state, claimed_at, started_at, expires_at, reward_snapshot)
VALUES ('fixture-foundation-claim', 'fixture-foundation-mission', 'fixture-trial-ready', 'running',
  unixepoch() * 1000, unixepoch() * 1000, unixepoch() * 1000 + 7200000,
  '{"deposit":0,"baseCommit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","allowedPaths":"fixture.md","officialToken":0}');
