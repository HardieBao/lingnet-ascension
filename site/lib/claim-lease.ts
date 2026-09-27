const HOUR = 60 * 60_000;
export const RUNNING_LEASE_MS = 2 * HOUR;

const maxRunningTime = new Map([
  ["黄阶", 2 * HOUR],
  ["玄阶", 6 * HOUR],
  ["地阶", 16 * HOUR],
  ["天阶", 72 * HOUR],
]);

export function heartbeatExpiry(now: number, startedAt: number | null, rank: string): number | null {
  const maximum = maxRunningTime.get(rank);
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(startedAt) ||
      startedAt === null || startedAt > now || !maximum) return null;
  const deadline = startedAt + maximum;
  return now < deadline && Number.isSafeInteger(deadline)
    ? Math.min(now + RUNNING_LEASE_MS, deadline)
    : null;
}

export const HEARTBEAT_UPDATE_SQL = `
  UPDATE claims SET expires_at = ?
  WHERE id = ? AND cultivator_id = ? AND state = 'running'
    AND expires_at > ? AND started_at = ?
    AND EXISTS (SELECT 1 FROM missions WHERE id = claims.mission_id AND rank = ?)
`;
