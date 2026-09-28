export const REVIEW_REJECT_REFUND_SQL = `
  INSERT OR IGNORE INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
  SELECT ?, ?, ?, ?, ?, ?
  WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'rejected' AND reviewer_id = ?)
    AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = 'rejected' AND cultivator_id = ?)
    AND EXISTS (SELECT 1 FROM ledger_events WHERE cultivator_id = ? AND resource = 'token_locked' AND source_key = ? AND delta = ?)
`;
