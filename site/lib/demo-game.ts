// Pure browser-only simulation. No persistence, network, real identities or credentials.
import { officialTokenBonus } from "./rewards.ts";
import { assessBreakthrough } from "./realms.ts";
import { getEquipmentItem } from "./equipment.ts";
import { MODEL_CONTRACT } from "./model-budget.ts";

export type DemoRank = "黄阶" | "玄阶" | "地阶";
export type DemoPhase = "claimed" | "generated" | "submitted" | "verified" | "reviewed" | "completed";
export const DEMO_REWARDS = {
  "黄阶": { token: 50, cultivation: 100, merit: 5 },
  "玄阶": { token: 150, cultivation: 350, merit: 20 },
  "地阶": { token: 500, cultivation: 1000, merit: 60 },
};
export type DemoState = {
  mode: "simulation";
  realm: "mortal" | "qi" | "foundation" | "core";
  token: number;
  tokenLocked: number;
  cultivation: number;
  merit: number;
  formalResults: number;
  independentReviews: number;
  message: string;
  ledger: string[];
  items: Array<{ itemId: string; equipped: boolean }>;
  claim: { rank: DemoRank; phase: DemoPhase; modelUsed: number; trial: "foundation" | "core" | null; fee: number } | null;
};
export type DemoAction = { type: "claim"; rank: DemoRank } | { type: "buy" | "equip"; itemId: string }
  | { type: "revalidate"; author: "self" | "other" } | { type: "judge"; failure?: boolean }
  | { type: "run" | "submit" | "review" | "settle" | "advance" | "trial" | "withdraw" };

export function createDemoState(): DemoState {
  return { mode: "simulation", realm: "mortal", token: 300, tokenLocked: 0, cultivation: 0, merit: 0, claim: null,
    formalResults: 0, independentReviews: 0, items: [], message: "演示赠送300游戏 Token；不进入真实账号。", ledger: ["模拟开场赠送：+300游戏 Token"] };
}

export function demoAction(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "revalidate") {
    if (action.author !== "other" || state.independentReviews > 0 || state.realm !== "foundation" && state.realm !== "core") {
      return { ...state, message: "模拟复验不通过：不可自审，也不可重复领取记录。" };
    }
    return { ...state, independentReviews: 1, message: "模拟采纳了对另一位合成修士成果的复验；不计真实功德或审批。", ledger: [...state.ledger, "模拟独立复验：另一位合成修士的成果，采纳1次"] };
  }
  if (action.type === "buy" || action.type === "equip") {
    const item = getEquipmentItem(action.itemId);
    const owned = state.items.find((entry) => entry.itemId === action.itemId);
    if (!item || action.type === "buy" && (owned || state.token < item.price) || action.type === "equip" && !owned) {
      return { ...state, message: "模拟装备操作未完成：不存在、已拥有或游戏 Token 不足。" };
    }
    if (action.type === "equip") return { ...state, items: state.items.map((entry) => entry.itemId === item.id ? { ...entry, equipped: !entry.equipped } : entry), message: "模拟装备状态已切换，不再次扣费。" };
    return { ...state, token: state.token - item.price, items: [...state.items, { itemId: item.id, equipped: false }],
      message: "模拟购买入库，需另行装备；真实账号与费用不变。", ledger: [...state.ledger, `模拟购买${item.name}：-${item.price}游戏 Token`] };
  }
  const busy = !!state.claim && state.claim.phase !== "completed";
  if (action.type === "withdraw") {
    if (!busy || !state.claim) return state;
    return { ...state, token: state.token + state.claim.fee, tokenLocked: state.tokenLocked - state.claim.fee,
      claim: null, message: "模拟退出：全额解冻，保留失败记录，不发奖励。",
      ledger: [...state.ledger, `模拟退出：解冻${state.claim.fee}游戏 Token；无奖励`] };
  }
  if (action.type === "trial") {
    const next = assessBreakthrough(state.realm, { ...state, trialPassed: true });
    if (busy || !next.eligible || !next.rule?.trial || next.target !== "foundation" && next.target !== "core") {
      return { ...state, message: "渡劫资格不足或已有未结算任务。" };
    }
    const fee = next.rule.token;
    return { ...state, token: state.token - fee, tokenLocked: state.tokenLocked + fee,
      claim: { rank: next.target === "foundation" ? "玄阶" : "地阶", phase: "claimed", modelUsed: 0, trial: next.target, fee },
      message: `模拟渡劫开始，仅冻结${fee}游戏 Token；未成功可全额解冻。`,
      ledger: [...state.ledger, `模拟渡劫费用：可用-${fee} / 冻结+${fee}游戏 Token`] };
  }
  if (action.type === "advance") {
    const next = assessBreakthrough(state.realm, { ...state, trialPassed: false });
    if (next.target !== "qi" || !next.eligible || busy) return { ...state, message: "境界门槛尚未满足，或当前任务尚未结算。" };
    return { ...state, realm: "qi", message: "已在模拟世界突破炼气；真实账号不变。", ledger: [...state.ledger, "模拟境界突破：凡人 → 炼气"] };
  }
  if (action.type === "claim") {
    const rankLevel = { "黄阶": 0, "玄阶": 1, "地阶": 2 }[action.rank];
    const realmLevel = { mortal: 0, qi: 1, foundation: 2, core: 3 }[state.realm];
    if (busy || rankLevel === undefined || rankLevel > realmLevel) return { ...state, message: "这项模拟任务尚未解锁，或已有进行中的任务。" };
    return { ...state, claim: { rank: action.rank, phase: "claimed", modelUsed: 0, trial: null, fee: 0 }, message: "已认领合成任务，尚未调用真实模型。" };
  }
  const claim = state.claim;
  if (!claim) return state;
  if (action.type === "judge" && action.failure && claim.phase === "submitted") {
    return { ...state, claim: { ...claim, phase: "claimed" }, message: "模拟审判失败，可重新推演；不发奖励，保留模拟用量。", ledger: [...state.ledger, "模拟审判失败：无奖励，可修订"] };
  }
  if (action.type === "run" && claim.modelUsed + 1200 > MODEL_CONTRACT.tokenBudget) {
    return { ...state, message: "本次任务的模拟模型额度已耗尽；重试不补额度。" };
  }
  const transitions = {
    run: { from: "claimed", to: "generated", message: "模拟推演完成，模拟模型 Token 消耗1200；真实模型未调用。" },
    submit: { from: "generated", to: "submitted", message: "合成产物已进入模拟提交队列；没有上传文件。" },
    judge: { from: "submitted", to: "verified", message: "模拟天道审判通过，仍未发放奖励。" },
    review: { from: "verified", to: "reviewed", message: "模拟维护者乙接受了成果；这不是独立真人审批。" },
  } as const;
  if (action.type !== "settle") {
    const transition = transitions[action.type];
    if (claim.phase !== transition.from) return state;
    return { ...state, claim: { ...claim, phase: transition.to, modelUsed: action.type === "run" ? claim.modelUsed + 1200 : claim.modelUsed }, message: transition.message };
  }
  if (claim.phase !== "reviewed") return { ...state, message: "当前成果不能再次结算；没有发放新奖励。" };
  const reward = DEMO_REWARDS[claim.rank];
  const token = reward.token + officialTokenBonus(claim.rank);
  return { ...state, token: state.token + token, tokenLocked: state.tokenLocked - claim.fee,
    realm: claim.trial ?? state.realm, cultivation: state.cultivation + reward.cultivation,
    merit: state.merit + reward.merit, formalResults: state.formalResults + 1,
    claim: { ...claim, phase: "completed" }, message: "模拟合入与奖励结算完成；不创建真实PR或社区成果。",
    ledger: [...state.ledger, `模拟成果${state.formalResults + 1}：+${token}游戏 Token / +${reward.cultivation}修为 / +${reward.merit}功德`,
      ...(claim.trial ? [`模拟渡劫通过：冻结费用-${claim.fee}，突破${claim.trial === "foundation" ? "筑基" : "金丹"}`] : [])] };
}
