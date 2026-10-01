import { missionAccessReason } from "./mission-eligibility.ts";
import type { ListedMission } from "./missions.ts";
import type { Realm } from "./realms.ts";

export const HALL_STATUS_LABELS = {
  available: "可认领", occupied: "已认领", frozen: "冻结待复核", approved: "待合入",
  done: "已完成", prerequisite: "等待前置", unpublished: "待发布", ineligible: "门槛未达",
};
export type HallSearchParams = Record<string, string | string[] | undefined>;

export function selectMissionHall(missions: ListedMission[], occupied: Map<string, string>, realm: Realm | null, merit: number, params: HallSearchParams) {
  const keys = ["q", "rank", "branch", "status", "budget"] as const;
  const filters = { q: "", rank: "", branch: "", status: "", budget: "" };
  let invalid = false;
  for (const key of keys) {
    const value = params[key];
    if (Array.isArray(value)) invalid = true;
    filters[key] = typeof value === "string" ? value.trim() : "";
  }
  const branches = [...new Set(missions.map((mission) => mission.branch))].sort();
  invalid ||= filters.q.length > 80
    || !!filters.rank && !["黄阶", "玄阶", "地阶", "天阶"].includes(filters.rank)
    || !!filters.branch && !branches.includes(filters.branch)
    || !!filters.status && !Object.hasOwn(HALL_STATUS_LABELS, filters.status)
    || !!filters.budget && (!/^\d+$/.test(filters.budget) || !Number.isSafeInteger(Number(filters.budget)));
  const entries = missions.map((mission) => {
    const occupancy = occupied.get(mission.id);
    const status: keyof typeof HALL_STATUS_LABELS = mission.state === "done" ? "done"
      : occupancy === "frozen" ? "frozen" : occupancy === "approved" ? "approved" : occupancy ? "occupied"
      : !mission.contract_ready ? "unpublished"
      : mission.prerequisites.some((prerequisite) => !prerequisite.integrated) || mission.state !== "open" ? "prerequisite"
      : realm && missionAccessReason(realm, merit, mission.required_realm, mission.required_merit) ? "ineligible" : "available";
    return { mission, status };
  });
  const q = filters.q.toLocaleLowerCase("zh-CN");
  const visible = invalid ? [] : entries.filter(({ mission, status }) =>
    (!q || `${mission.id} ${mission.title}`.toLocaleLowerCase("zh-CN").includes(q))
    && (!filters.rank || mission.rank === filters.rank)
    && (!filters.branch || mission.branch === filters.branch)
    && (!filters.status || status === filters.status)
    && (!filters.budget || mission.budget_tokens !== null && mission.budget_tokens <= Number(filters.budget))
  );
  return { filters, branches, visible, openCount: entries.filter(({ status }) => status === "available").length,
    error: invalid ? "筛选条件无效。关键词最多 80 字，预算须为非负整数；请重新选择条件或清空筛选。" : null };
}
