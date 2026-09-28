export type RecoveryState = {
  hold: boolean;
  debt: { token: number; cultivation: number; merit: number };
};

export const RECOVERY_STATE_SQL = `
  SELECT
    EXISTS (SELECT 1 FROM active_stable_reward_holds h WHERE h.cultivator_id = ?) AS hold,
    COALESCE((SELECT outstanding FROM stable_reward_debts WHERE cultivator_id = ? AND resource = 'token'), 0) AS token,
    COALESCE((SELECT outstanding FROM stable_reward_debts WHERE cultivator_id = ? AND resource = 'cultivation'), 0) AS cultivation,
    COALESCE((SELECT outstanding FROM stable_reward_debts WHERE cultivator_id = ? AND resource = 'merit'), 0) AS merit
`;

export async function recoveryState(db: D1Database, cultivatorId: string): Promise<RecoveryState> {
  const row = await db.prepare(RECOVERY_STATE_SQL).bind(cultivatorId, cultivatorId, cultivatorId, cultivatorId)
    .first<{ hold: number; token: number; cultivation: number; merit: number }>();
  return { hold: row?.hold === 1, debt: { token: row?.token ?? 0,
    cultivation: row?.cultivation ?? 0, merit: row?.merit ?? 0 } };
}
