export const MISSION_SEED_STATUS_SQL = `
  SELECT
    (SELECT COUNT(*) FROM missions WHERE id IN ('GOV-001', 'GOV-002', 'GOV-003', 'GOV-004T', 'PLAT-003C')) AS mission_count,
    (SELECT COUNT(*) FROM mission_dependencies WHERE
      (mission_id = 'GOV-002' AND prerequisite_id = 'GOV-001') OR
      (mission_id = 'GOV-003' AND prerequisite_id = 'GOV-001') OR
      (mission_id = 'GOV-003' AND prerequisite_id = 'GOV-002') OR
      (mission_id = 'GOV-004T' AND prerequisite_id = 'GOV-001') OR
      (mission_id = 'PLAT-003C' AND prerequisite_id = 'GOV-001')) AS dependency_count,
    (SELECT COUNT(*) FROM missions WHERE id IN ('GOV-001', 'GOV-002', 'GOV-003') AND contract_ready = 1) AS ready_count
`;

type MissionSeedStatus = { mission_count: number; dependency_count: number; ready_count: number };

export function missionSeedsReady(status: MissionSeedStatus | null): boolean {
  return !!status && status.mission_count === 5 && status.dependency_count === 5 && status.ready_count === 3;
}
