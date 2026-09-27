const officialTokenByRank: Record<string, number> = {
  "黄阶": 30,
  "玄阶": 100,
  "地阶": 300,
  "天阶": 1000,
};

export function officialTokenBonus(rank: string): number {
  return officialTokenByRank[rank] ?? 0;
}

export type StableReward = {
  policyVersion: 1; token: number; cultivation: number; merit: number; minimumVersionGapMs: 604800000;
};

const stableCultivationByRank: Record<string, number> = { "黄阶": 20, "玄阶": 80, "地阶": 250, "天阶": 800 };

export function stableRewardSnapshot(rank: string, token: number, merit: number): StableReward | undefined {
  const cultivation = stableCultivationByRank[rank];
  if (cultivation === undefined) return undefined; // Trials have their own declared contract.
  return { policyVersion: 1, token: Math.floor(token / 5), cultivation, merit: Math.floor(merit / 5), minimumVersionGapMs: 604800000 };
}
