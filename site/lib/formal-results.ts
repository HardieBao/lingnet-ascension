export const FORMAL_RESULTS_COUNT_SUBQUERY = `(
  SELECT COUNT(DISTINCT c.mission_id)
  FROM claims c
  JOIN submissions s ON s.claim_id = c.id AND s.cultivator_id = c.cultivator_id
  JOIN missions m ON m.id = c.mission_id
  WHERE c.cultivator_id = ? AND c.state = 'completed'
    AND s.state = 'accepted' AND s.integrated_commit IS NOT NULL
    AND LENGTH(s.integrated_commit) = 40 AND s.integrated_at IS NOT NULL
    AND m.state = 'done'
)`;
