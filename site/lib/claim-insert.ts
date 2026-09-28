export const CLAIM_INSERT_SQL = `
  INSERT INTO claims (id, mission_id, cultivator_id, state, claimed_at, started_at, expires_at, reward_snapshot)
  SELECT ?, m.id, ?, 'claimed', ?, NULL, ?, ? FROM missions m JOIN cultivators c ON c.id = ?
  WHERE m.id = ? AND m.state = 'open' AND m.contract_ready = 1
    AND CASE c.realm WHEN 'mortal' THEN 0 WHEN 'qi' THEN 1 WHEN 'foundation' THEN 2 WHEN 'core' THEN 3 END >=
      CASE m.required_realm WHEN 'mortal' THEN 0 WHEN 'qi' THEN 1 WHEN 'foundation' THEN 2 WHEN 'core' THEN 3 END
    AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = c.id AND resource = 'merit') >= m.required_merit
    AND NOT EXISTS (SELECT 1 FROM claims WHERE mission_id = ? AND state IN ('claimed', 'running', 'submitted', 'review', 'approved', 'frozen'))
    AND (SELECT COUNT(*) FROM claims WHERE cultivator_id = ? AND state IN ('claimed', 'running', 'submitted', 'review', 'approved', 'frozen')) <
      CASE WHEN EXISTS (SELECT 1 FROM inventory WHERE cultivator_id = ? AND item_id = ? AND equipped_at IS NOT NULL)
        THEN ? ELSE ? END
    AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = ? AND resource = 'token') >= ?
`;
