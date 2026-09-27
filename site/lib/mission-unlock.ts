export const UNLOCK_READY_MISSIONS_SQL = `
  UPDATE missions SET state = 'open', base_commit = (
    SELECT s.integrated_commit FROM mission_dependencies d
    JOIN claims c ON c.mission_id = d.prerequisite_id
    JOIN submissions s ON s.claim_id = c.id
    WHERE d.mission_id = missions.id AND s.state = 'accepted' AND s.integrated_commit IS NOT NULL
    ORDER BY s.integrated_at DESC, s.id DESC LIMIT 1
  )
  WHERE state = 'blocked' AND contract_ready = 1
    AND EXISTS (SELECT 1 FROM mission_dependencies d WHERE d.mission_id = missions.id)
    AND NOT EXISTS (
      SELECT 1 FROM mission_dependencies d
      JOIN missions prerequisite ON prerequisite.id = d.prerequisite_id
      WHERE d.mission_id = missions.id AND (
        prerequisite.state != 'done' OR NOT EXISTS (
          SELECT 1 FROM claims c JOIN submissions s ON s.claim_id = c.id
          WHERE c.mission_id = d.prerequisite_id AND s.state = 'accepted' AND s.integrated_commit IS NOT NULL
        )
      )
    )
`;

export const GOV003_GATE_BACKFILL_SQL = `
  UPDATE missions SET required_realm = ?, required_merit = ?
  WHERE id = 'GOV-003' AND state IN ('blocked', 'open')
    AND required_realm = 'foundation' AND required_merit = 50
`;
