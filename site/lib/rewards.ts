const officialTokenByRank: Record<string, number> = {
  "黄阶": 30,
  "玄阶": 100,
  "地阶": 300,
  "天阶": 1000,
};

export function officialTokenBonus(rank: string): number {
  return officialTokenByRank[rank] ?? 0;
}
