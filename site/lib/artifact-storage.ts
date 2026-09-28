// Kept in the same D1 batch as the submission/claim state change; no external orphan objects.
export const ARTIFACT_INSERT_SQL = `
  INSERT INTO artifact_payloads (artifact_key, submission_id, content, sha256, created_at)
  SELECT ?, ?, ?, ?, ?
  WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND artifact_key = ? AND state != 'frozen')
`;
