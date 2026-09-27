export type EconomyAuditRow = {
  cultivator_id: string;
  token_balance: number;
  locked_balance: number;
  cultivation_balance: number;
  merit_balance: number;
  expected_locked: number;
  invalid_snapshots: number;
  unknown_resources: number;
};

export const ECONOMY_AUDIT_SQL = `
  WITH balances AS (
    SELECT cultivator_id,
      SUM(CASE WHEN resource = 'token' THEN delta ELSE 0 END) AS token_balance,
      SUM(CASE WHEN resource = 'token_locked' THEN delta ELSE 0 END) AS locked_balance,
      SUM(CASE WHEN resource = 'cultivation' THEN delta ELSE 0 END) AS cultivation_balance,
      SUM(CASE WHEN resource = 'merit' THEN delta ELSE 0 END) AS merit_balance,
      SUM(CASE WHEN resource NOT IN ('token', 'token_locked', 'cultivation', 'merit') THEN 1 ELSE 0 END) AS unknown_resources
    FROM ledger_events GROUP BY cultivator_id
  ), claim_deposits AS (
    SELECT cultivator_id,
      CASE WHEN json_valid(reward_snapshot) THEN json_extract(reward_snapshot, '$.deposit') ELSE NULL END AS deposit
    FROM claims WHERE state IN ('claimed', 'running', 'submitted', 'review', 'approved', 'frozen')
  ), expected AS (
    SELECT cultivator_id,
      SUM(CASE WHEN typeof(deposit) = 'integer' AND deposit >= 0 THEN deposit ELSE 0 END) AS expected_locked,
      SUM(CASE WHEN typeof(deposit) = 'integer' AND deposit >= 0 THEN 0 ELSE 1 END) AS invalid_snapshots
    FROM claim_deposits GROUP BY cultivator_id
  )
  SELECT c.id AS cultivator_id,
    COALESCE(b.token_balance, 0) AS token_balance,
    COALESCE(b.locked_balance, 0) AS locked_balance,
    COALESCE(b.cultivation_balance, 0) AS cultivation_balance,
    COALESCE(b.merit_balance, 0) AS merit_balance,
    COALESCE(e.expected_locked, 0) + (SELECT COALESCE(SUM(fee), 0) FROM realm_trials WHERE cultivator_id = c.id AND state = 'active') AS expected_locked,
    COALESCE(e.invalid_snapshots, 0) AS invalid_snapshots,
    COALESCE(b.unknown_resources, 0) AS unknown_resources
  FROM cultivators c
  LEFT JOIN balances b ON b.cultivator_id = c.id
  LEFT JOIN expected e ON e.cultivator_id = c.id
  ORDER BY c.id
`;

export function economyAuditProblems(rows: EconomyAuditRow[]) {
  return rows.filter((row) => row.token_balance < 0 || row.locked_balance < 0 ||
    row.cultivation_balance < 0 || row.merit_balance < 0 ||
    row.locked_balance !== row.expected_locked || row.invalid_snapshots > 0 || row.unknown_resources > 0);
}
