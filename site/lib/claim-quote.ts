import type { Mission } from "./missions.ts";
import { MODEL_CONTRACT } from "./model-budget.ts";

export type ClaimOffer = Pick<Mission, "title" | "rank" | "base_commit" | "allowed_paths" | "deposit" | "reward_token" | "reward_cultivation" | "reward_merit">
  & { quote: string; model: typeof MODEL_CONTRACT };

export function claimTerms(mission: Mission) {
  return [mission.title, mission.description, mission.rank, mission.base_commit, mission.allowed_paths, mission.acceptance,
    mission.reward_token, mission.reward_cultivation, mission.reward_merit, mission.deposit, mission.required_realm, mission.required_merit];
}

// The insert and its ledger writes must use the same terms read for this request.
export const CLAIM_TERMS_MATCH_SQL = `
  AND json_array(m.title, m.description, m.rank, m.base_commit, m.allowed_paths, m.acceptance,
    m.reward_token, m.reward_cultivation, m.reward_merit, m.deposit, m.required_realm, m.required_merit) = ?
`;

export async function claimQuote(mission: Mission) {
  const bytes = new TextEncoder().encode(JSON.stringify([mission.id, ...claimTerms(mission), MODEL_CONTRACT]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
