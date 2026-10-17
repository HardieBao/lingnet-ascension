import type { Cultivator } from "./auth";
import type { StableReward } from "./rewards";

export function isRecoveryReviewer(cultivator: Pick<Cultivator, "provider" | "provider_id">, configuredId: unknown): boolean {
  return cultivator.provider === "github" && typeof configuredId === "string" &&
    /^[1-9]\d*$/.test(configuredId) && cultivator.provider_id === configuredId;
}

export function lockedStableReward(snapshot: string): StableReward | null {
  try {
    const stable = (JSON.parse(snapshot) as { stable?: StableReward } | null)?.stable;
    if (!stable || stable.policyVersion !== 1 || stable.minimumVersionGapMs !== 604800000 ||
        [stable.token, stable.cultivation, stable.merit].some((amount) => !Number.isSafeInteger(amount) || amount < 0)) return null;
    return { policyVersion: 1, minimumVersionGapMs: 604800000,
      token: stable.token, cultivation: stable.cultivation, merit: stable.merit };
  } catch { return null; }
}

export type StableGrantTarget = {
  submission_id: string; mission_id: string; title: string; author: string;
  cultivator_id: string; reward_snapshot: string;
};
export type StableGrantOption = Omit<StableGrantTarget, "reward_snapshot"> & { reward: StableReward };

export type StableSettlementRecord = {
  id: string; submission_id: string; cultivator_id: string; mission_id: string; title: string; author: string;
  first_tag: string; first_commit: string; second_tag: string; second_commit: string;
  token: number; cultivation: number; merit: number; review_reason: string; reviewed_by: string; settled_at: number;
  revocation_id: string | null; revoke_reason: string | null; revoked_by: string | null; revoked_at: number | null;
  main_commit: string | null; token_offset: number | null; cultivation_offset: number | null; merit_offset: number | null;
  hold_released_by: string | null; hold_reason: string | null; hold_released_at: number | null;
  token_outstanding: number; cultivation_outstanding: number; merit_outstanding: number;
};

export const STABLE_GRANT_TARGETS_SQL = `
  SELECT s.id AS submission_id, c.mission_id, m.title, author.display_name AS author,
    s.cultivator_id, c.reward_snapshot
  FROM submissions s JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id
    JOIN missions m ON m.id = c.mission_id JOIN cultivators author ON author.id = s.cultivator_id
  WHERE s.state = 'accepted' AND c.state = 'completed' AND m.state = 'done'
    AND s.integrated_at IS NOT NULL AND json_valid(c.reward_snapshot) AND s.cultivator_id != ?
    AND NOT EXISTS (SELECT 1 FROM stable_reward_settlements t WHERE t.submission_id = s.id)
  ORDER BY s.integrated_at DESC, s.id DESC LIMIT 50
`;

export const STABLE_SETTLEMENT_RECORDS_SQL = `
  SELECT t.*, c.mission_id, m.title, author.display_name AS author,
    r.settlement_id AS revocation_id, r.reason AS revoke_reason, r.revoked_by, r.revoked_at,
    r.main_commit, r.token_offset, r.cultivation_offset, r.merit_offset,
    h.reviewed_by AS hold_released_by, h.reason AS hold_reason, h.reviewed_at AS hold_released_at,
    COALESCE((SELECT outstanding FROM stable_reward_debts d WHERE d.cultivator_id = t.cultivator_id AND d.resource = 'token'), 0) AS token_outstanding,
    COALESCE((SELECT outstanding FROM stable_reward_debts d WHERE d.cultivator_id = t.cultivator_id AND d.resource = 'cultivation'), 0) AS cultivation_outstanding,
    COALESCE((SELECT outstanding FROM stable_reward_debts d WHERE d.cultivator_id = t.cultivator_id AND d.resource = 'merit'), 0) AS merit_outstanding
  FROM stable_reward_settlements t JOIN claims c ON c.id = t.claim_id
    JOIN missions m ON m.id = c.mission_id JOIN cultivators author ON author.id = t.cultivator_id
    LEFT JOIN stable_reward_revocations r ON r.settlement_id = t.id
    LEFT JOIN stable_reward_hold_releases h ON h.settlement_id = t.id
`;
