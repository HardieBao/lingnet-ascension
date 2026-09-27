export type MissionFailureSummary = {
  expired_claims: number;
  revision_requests: number;
  rejected_submissions: number;
};

export const MISSION_FAILURE_SUMMARY_SQL = `
  SELECT
    COUNT(DISTINCT CASE WHEN c.state = 'expired' THEN c.id END) AS expired_claims,
    COALESCE(SUM(CASE WHEN s.state = 'needs_revision' THEN 1 ELSE 0 END), 0) AS revision_requests,
    COALESCE(SUM(CASE WHEN s.state = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected_submissions
  FROM claims c LEFT JOIN submissions s ON s.claim_id = c.id
  WHERE c.mission_id = ?
`;
