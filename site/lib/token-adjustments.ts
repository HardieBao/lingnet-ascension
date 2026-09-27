type GitHubIdentity = { provider: string; provider_id: string };

export type TokenAdjustment = {
  id: string;
  target_cultivator_id: string;
  delta: number;
  reference: string;
  reason: string;
  requested_by: string;
  requested_at: number;
  decision: "approve" | "reject" | null;
  decided_by: string | null;
  decision_reason: string | null;
  decided_at: number | null;
};

export const TOKEN_ADJUSTMENTS_LIST_SQL = `
  SELECT r.id, r.target_cultivator_id, r.delta, r.reference, r.reason, r.requested_by, r.requested_at,
    d.decision, d.decided_by, d.reason AS decision_reason, d.decided_at
  FROM token_adjustment_requests r LEFT JOIN token_adjustment_decisions d ON d.request_id = r.id
  ORDER BY r.requested_at DESC, r.id DESC LIMIT 50
`;

export function tokenAdjustmentRole(identity: GitHubIdentity, maintainerId?: string, approverId?: string): "requester" | "approver" | null {
  if (identity.provider !== "github" || !maintainerId || !approverId || maintainerId === approverId ||
      !/^[1-9]\d*$/.test(maintainerId) || !/^[1-9]\d*$/.test(approverId)) return null;
  if (identity.provider_id === maintainerId) return "requester";
  if (identity.provider_id === approverId) return "approver";
  return null;
}

export const TOKEN_ADJUSTMENT_REQUEST_SQL = `
  INSERT INTO token_adjustment_requests
    (id, target_cultivator_id, delta, reference, reason, requested_by, requested_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

export const TOKEN_ADJUSTMENT_DECISION_SQL = `
  INSERT INTO token_adjustment_decisions (request_id, decision, decided_by, reason, decided_at)
  SELECT r.id, ?, ?, ?, ? FROM token_adjustment_requests r
  WHERE r.id = ? AND r.requested_by != ?
    AND NOT EXISTS (SELECT 1 FROM token_adjustment_decisions d WHERE d.request_id = r.id)
`;
