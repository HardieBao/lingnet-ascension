import type { Claim } from "@/lib/claims";
import type { Mission } from "@/lib/missions";
import { isCodeArtifactPath } from "./code-artifact.ts";
import { artifactPathForMission } from "./verifier.ts";
import { MODEL_CONTRACT } from "./model-budget.ts";
import type { StableReward } from "./rewards.ts";

export const REPOSITORY_URL = "https://github.com/HardieBao/lingnet-ascension.git";

export type TaskPackage = {
  payload: {
    schemaVersion: 2 | 3 | 4;
    cultivatorId?: string;
    claim: { id: string; expiresAt: number };
    repository: { url: string; baseCommit: string };
    mission: {
      id: string;
      title: string;
      description: string;
      acceptance: string;
      allowedPaths: string[];
      artifactPath: string;
    };
    model: { harness: "codex-cli"; tokenBudget: number | null } | ({ harness: "codex-cli" } & typeof MODEL_CONTRACT);
    equipment: { localPreflight: boolean; checkpointSlots?: 1 | 2; heartTalisman?: boolean; presetSlots?: 1 | 2 };
    gameReward: { token: number; officialToken: number; cultivation: number; merit: number; stable?: StableReward };
  };
  sha256: string;
};

export async function buildTaskPackage(claim: Claim, mission: Mission, {
  calculationArrayEquipped = false, storageBagEquipped = false, heartTalismanEquipped = false, teachingSlipEquipped = false,
}: { calculationArrayEquipped?: boolean; storageBagEquipped?: boolean; heartTalismanEquipped?: boolean; teachingSlipEquipped?: boolean } = {}): Promise<TaskPackage> {
  const snapshot = JSON.parse(claim.reward_snapshot) as {
    token: number; officialToken: number; cultivation: number; merit: number; baseCommit: string;
    title: string; description: string; acceptance: string; allowedPaths: string;
    budgetTokens: number | null;
    modelContract?: typeof MODEL_CONTRACT;
    stable?: StableReward;
  };
  if (snapshot.modelContract && (snapshot.budgetTokens !== MODEL_CONTRACT.tokenBudget ||
      Object.entries(MODEL_CONTRACT).some(([key, value]) => snapshot.modelContract?.[key as keyof typeof MODEL_CONTRACT] !== value))) {
    throw new Error("模型预算快照无效");
  }
  if (snapshot.modelContract && (typeof claim.cultivator_id !== "string" || !/^[a-zA-Z0-9_:.-]{1,160}$/.test(claim.cultivator_id))) {
    throw new Error("修士编号无效");
  }
  const artifactPath = artifactPathForMission(mission.id) ??
    (isCodeArtifactPath(snapshot.allowedPaths) ? snapshot.allowedPaths : null);
  if (!artifactPath || snapshot.allowedPaths !== artifactPath) throw new Error("任务交付范围不受支持");
  const checkpointSlots: 1 | 2 = storageBagEquipped ? 2 : 1;
  const presetSlots: 1 | 2 = teachingSlipEquipped ? 2 : 1;
  const payload: TaskPackage["payload"] = {
    schemaVersion: snapshot.modelContract ? 4 : 2,
    ...(snapshot.modelContract ? { cultivatorId: claim.cultivator_id } : {}),
    claim: { id: claim.id, expiresAt: claim.expires_at },
    repository: { url: REPOSITORY_URL, baseCommit: snapshot.baseCommit },
    mission: {
      id: mission.id,
      title: snapshot.title,
      description: snapshot.description,
      acceptance: snapshot.acceptance,
      allowedPaths: snapshot.allowedPaths.split(";").map((path) => path.trim()).filter(Boolean),
      artifactPath,
    },
    model: snapshot.modelContract ? { harness: "codex-cli", ...snapshot.modelContract } : { harness: "codex-cli", tokenBudget: snapshot.budgetTokens },
    equipment: { localPreflight: calculationArrayEquipped,
      ...(snapshot.modelContract ? { checkpointSlots, heartTalisman: heartTalismanEquipped, presetSlots } : {}) },
    gameReward: {
      token: snapshot.token,
      officialToken: snapshot.officialToken,
      cultivation: snapshot.cultivation,
      merit: snapshot.merit,
      ...(snapshot.stable ? { stable: snapshot.stable } : {}),
    },
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { payload, sha256 };
}
