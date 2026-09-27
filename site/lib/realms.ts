export type Realm = "mortal" | "qi" | "foundation" | "core";

export const realmNames: Record<Realm, string> = {
  mortal: "凡人",
  qi: "炼气",
  foundation: "筑基",
  core: "金丹",
};

export const breakthroughs = {
  qi: { from: "mortal", cultivation: 100, merit: 5, token: 0, formalResults: 1, independentReviews: 0, trial: false },
  foundation: { from: "qi", cultivation: 1000, merit: 50, token: 500, formalResults: 3, independentReviews: 0, trial: true },
  core: { from: "foundation", cultivation: 5000, merit: 200, token: 2000, formalResults: 10, independentReviews: 1, trial: true },
} as const;

export type RealmProgress = {
  cultivation: number;
  merit: number;
  token: number;
  formalResults: number;
  independentReviews: number;
  trialPassed: boolean;
};

export function nextBreakthrough(current: Realm) {
  if (current === "mortal") return { target: "qi" as const, ...breakthroughs.qi };
  if (current === "qi") return { target: "foundation" as const, ...breakthroughs.foundation };
  if (current === "foundation") return { target: "core" as const, ...breakthroughs.core };
  return null;
}

export function assessBreakthrough(current: Realm, progress: RealmProgress) {
  const rule = nextBreakthrough(current);
  if (!rule) return { target: null, eligible: false, missing: ["元婴及以上将在 MVP 后开放"], rule: null };
  const missing: string[] = [];
  if (progress.cultivation < rule.cultivation) missing.push(`修为还需 ${rule.cultivation - progress.cultivation}`);
  if (progress.merit < rule.merit) missing.push(`功德还需 ${rule.merit - progress.merit}`);
  if (progress.formalResults < rule.formalResults) missing.push(`正式成果还需 ${rule.formalResults - progress.formalResults} 个`);
  if (progress.token < rule.token) missing.push(`游戏 Token 还需 ${rule.token - progress.token}`);
  if (progress.independentReviews < rule.independentReviews) missing.push("还需一次被采纳的独立复验");
  if (rule.trial && !progress.trialPassed) missing.push("专属渡劫尚未通过");
  return { target: rule.target, eligible: missing.length === 0, missing, rule };
}
