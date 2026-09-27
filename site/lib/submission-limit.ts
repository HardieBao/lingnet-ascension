export const MAX_SUBMISSIONS_PER_CLAIM = 5;
export const MAX_FAILED_SUBMISSIONS_PER_MISSION = 10;

export const SUBMISSION_LIMIT_SQL = `
  SELECT
    (SELECT COUNT(*) FROM submissions WHERE claim_id = c.id) AS claim_count,
    (SELECT COUNT(*) FROM submissions s JOIN claims previous ON previous.id = s.claim_id
      WHERE previous.mission_id = c.mission_id AND s.cultivator_id = c.cultivator_id
        AND s.state = 'needs_revision') AS mission_failures
  FROM claims c WHERE c.id = ? AND c.cultivator_id = ?
`;

export const SUBMISSION_INSERT_SQL = `
  INSERT INTO submissions (id, claim_id, cultivator_id, artifact_key, artifact_sha256, state, verdict, created_at)
  SELECT ?, c.id, ?, ?, ?, ?, ?, ? FROM claims c
  WHERE c.id = ? AND c.cultivator_id = ? AND c.state = 'running' AND c.expires_at > ?
    AND (SELECT COUNT(*) FROM submissions WHERE claim_id = c.id) < ?
    AND (SELECT COUNT(*) FROM submissions s JOIN claims previous ON previous.id = s.claim_id
      WHERE previous.mission_id = c.mission_id AND s.cultivator_id = c.cultivator_id
        AND s.state = 'needs_revision') < ?
`;

export const SUBMISSION_REVIEW_CLAIM_SQL = `
  UPDATE claims SET state = 'review'
  WHERE id = ? AND cultivator_id = ? AND state = 'running' AND expires_at > ?
    AND EXISTS (SELECT 1 FROM submissions
      WHERE id = ? AND claim_id = ? AND cultivator_id = ? AND state = 'awaiting_review')
`;
