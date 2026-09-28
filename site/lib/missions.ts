import { database } from "@/db/runtime";
import { MISSION_SEED_STATUS_SQL, missionSeedsReady } from "./mission-seed.ts";
import { GOV003_GATE_BACKFILL_SQL, UNLOCK_READY_MISSIONS_SQL } from "./mission-unlock.ts";
import { MODEL_CONTRACT } from "./model-budget.ts";

export type Mission = {
  id: string;
  title: string;
  description: string;
  rank: string;
  branch: string;
  state: string;
  base_commit: string;
  allowed_paths: string;
  acceptance: string;
  reward_token: number;
  reward_cultivation: number;
  reward_merit: number;
  deposit: number;
  budget_tokens: number | null;
  required_realm: string;
  required_merit: number;
};

export type ListedMission = Mission & {
  contract_ready: number;
  prerequisites: Array<{ id: string; title: string; state: string; integrated: boolean }>;
};

type SeedMission = Mission & { contractReady: boolean; prerequisites: string[] };

const initialMissions: SeedMission[] = [
  {
    id: "GOV-001",
    title: "制定产品章程与停止条件",
    description: "依据产品计划完成可执行章程，明确任务边界、三账本经济、维护者责任和停止条件。",
    rank: "黄阶",
    branch: "宗门治理",
    state: "open",
    base_commit: "35802fe8167c5a24e8d66787d14b984aa1da3aa5",
    allowed_paths: "GOVERNANCE.md",
    acceptance: "Markdown 必须包含产品边界、三账本、角色职责、停止条件和签署信息。维护者独立复核。",
    reward_token: 50,
    reward_cultivation: 100,
    reward_merit: 5,
    deposit: 0,
    budget_tokens: MODEL_CONTRACT.tokenBudget,
    required_realm: "mortal",
    required_merit: 0,
    contractReady: true,
    prerequisites: [],
  },
  {
    id: "GOV-002",
    title: "确定「灵网初开」世界观",
    description: "定义修士、本命法器、任务、宗门与渡劫的统一体验语言。",
    rank: "玄阶",
    branch: "叙事",
    state: "blocked",
    base_commit: "35802fe8167c5a24e8d66787d14b984aa1da3aa5",
    allowed_paths: "docs/WORLD_BRIEF.md",
    acceptance: "提交 docs/WORLD_BRIEF.md 一页体验简报：将修仙概念映射到真实任务状态，写出核心循环、页面语气正反例和敏感表达清单；记录 5 名测试者能否区分真实模型算力 Token 与游戏 Token。维护者核实测试证据并独立复核。",
    reward_token: 150,
    reward_cultivation: 350,
    reward_merit: 20,
    deposit: 0,
    budget_tokens: MODEL_CONTRACT.tokenBudget,
    required_realm: "mortal",
    required_merit: 0,
    contractReady: true,
    prerequisites: ["GOV-001"],
  },
  {
    id: "GOV-003",
    title: "技术尖峰与架构决策",
    description: "按固定基线复现任务、Runner、独立复核与账本的纵向流程，提交带证据的架构决策。",
    rank: "地阶",
    branch: "技术",
    state: "blocked",
    base_commit: "35802fe8167c5a24e8d66787d14b984aa1da3aa5",
    allowed_paths: "docs/ARCHITECTURE_SPIKE.md",
    acceptance: "提交 docs/ARCHITECTURE_SPIKE.md：写明固定基线、执行环境和时间，记录一张模拟悬赏从认领、Runner、上传、审判、复核、合入到三账本的复验步骤与命令输出；附架构图、至少两种技术方案的评分矩阵（所选方案不少于 75 分）、技术 ADR、凭据隔离与模型 Token 边界、风险和未验证项。必须提供可复核证据，维护者独立重跑关键步骤并核实来源；结构检查本身不发奖励。",
    reward_token: 500,
    reward_cultivation: 1000,
    reward_merit: 60,
    deposit: 0,
    budget_tokens: MODEL_CONTRACT.tokenBudget,
    required_realm: "mortal",
    required_merit: 0,
    contractReady: true,
    prerequisites: ["GOV-001", "GOV-002"],
  },
  {
    id: "GOV-004T",
    title: "写清游戏 Token 与模型费用条款",
    description: "把游戏灵石和用户真实模型费用的边界写成可公开审查的说明，不替代许可证或法律复核。",
    rank: "黄阶",
    branch: "宗门治理",
    state: "blocked",
    base_commit: "35802fe8167c5a24e8d66787d14b984aa1da3aa5",
    allowed_paths: "docs/TOKEN_TERMS.md",
    acceptance: "提交 docs/TOKEN_TERMS.md：明确游戏 Token 不可充值、提现、交易或转赠，不等于现金与模型额度；本机模型费用由用户承担；写清装备消费、任务押金和退款边界、禁止购买验收或功德、无收益承诺及争议和变更流程。维护者独立复核，许可证与资源许可仍由 GOV-004 处理。",
    reward_token: 50,
    reward_cultivation: 100,
    reward_merit: 5,
    deposit: 0,
    budget_tokens: MODEL_CONTRACT.tokenBudget,
    required_realm: "mortal",
    required_merit: 0,
    contractReady: true,
    prerequisites: ["GOV-001"],
  },
  {
    id: "PLAT-003C",
    title: "实现悬赏前置图的循环检测",
    description: "为任务依赖图增加可复用的循环检测，阻止互相依赖的悬赏进入发布流程。",
    rank: "黄阶",
    branch: "技术",
    state: "blocked",
    base_commit: "35802fe8167c5a24e8d66787d14b984aa1da3aa5",
    allowed_paths: "site/lib/mission-graph.ts",
    acceptance: "只提交 site/lib/mission-graph.ts，导出 findDependencyCycle(edges)。输入为 missionId/prerequisiteId 边；无环返回 null，有环返回首尾相同且每一跳都属于输入边的节点序列。正确处理空图、自环、分离子图和菱形无环图，不修改输入。可信 CI、维护者独立复核和真实合入均为必需。",
    reward_token: 100,
    reward_cultivation: 200,
    reward_merit: 10,
    deposit: 0,
    budget_tokens: MODEL_CONTRACT.tokenBudget,
    required_realm: "mortal",
    required_merit: 0,
    contractReady: false,
    prerequisites: ["GOV-001"],
  },
];

export async function seedMissions() {
  const db = database();
  // Only future offers change; existing claim snapshots are never rewritten.
  await db.prepare("UPDATE missions SET budget_tokens = ? WHERE budget_tokens IS NULL AND state IN ('open', 'blocked')")
    .bind(MODEL_CONTRACT.tokenBudget).run();
  if (missionSeedsReady(await db.prepare(MISSION_SEED_STATUS_SQL).first())) return;
  const worldBrief = initialMissions.find((mission) => mission.id === "GOV-002")!;
  const technicalSpike = initialMissions.find((mission) => mission.id === "GOV-003")!;
  const dependencies = initialMissions.flatMap((mission) => mission.prerequisites.map((prerequisite) => [mission.id, prerequisite]));
  await db.batch([...initialMissions.map((mission) =>
    db.prepare(
      "INSERT OR IGNORE INTO missions (id, title, description, rank, branch, state, base_commit, allowed_paths, acceptance, reward_token, reward_cultivation, reward_merit, deposit, budget_tokens, contract_ready, required_realm, required_merit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      mission.id, mission.title, mission.description, mission.rank, mission.branch,
      mission.state, mission.base_commit, mission.allowed_paths, mission.acceptance,
      mission.reward_token, mission.reward_cultivation, mission.reward_merit,
      mission.deposit, mission.budget_tokens, mission.contractReady ? 1 : 0,
      mission.required_realm, mission.required_merit, 1790182800
    )
  ),
    ...dependencies.map(([missionId, prerequisiteId]) => db.prepare(
      "INSERT OR IGNORE INTO mission_dependencies (mission_id, prerequisite_id) VALUES (?, ?)"
    ).bind(missionId, prerequisiteId)),
    db.prepare(
      "UPDATE missions SET contract_ready = 1 WHERE id IN ('GOV-001', 'GOV-002') AND contract_ready = 0 AND state IN ('open', 'blocked', 'done')"
    ),
    db.prepare(
      "UPDATE missions SET allowed_paths = ?, acceptance = ? WHERE id = 'GOV-002' AND state = 'blocked'"
    ).bind(worldBrief.allowed_paths, worldBrief.acceptance),
    db.prepare(
      "UPDATE missions SET allowed_paths = ?, acceptance = ?, contract_ready = 1 WHERE id = 'GOV-003' AND state = 'blocked'"
    ).bind(technicalSpike.allowed_paths, technicalSpike.acceptance),
    db.prepare(GOV003_GATE_BACKFILL_SQL).bind(technicalSpike.required_realm, technicalSpike.required_merit),
    db.prepare(UNLOCK_READY_MISSIONS_SQL),
  ]);
}

export async function listMissions(): Promise<ListedMission[]> {
  await seedMissions();
  const db = database();
  const [missions, dependencies] = await Promise.all([
    db.prepare(
      "SELECT id, title, description, rank, branch, state, base_commit, allowed_paths, acceptance, reward_token, reward_cultivation, reward_merit, deposit, budget_tokens, contract_ready, required_realm, required_merit FROM missions ORDER BY id"
    ).all<Mission & { contract_ready: number }>(),
    db.prepare(`
      SELECT d.mission_id, p.id, p.title, p.state,
        CASE WHEN p.state = 'done' AND EXISTS (
          SELECT 1 FROM claims c JOIN submissions s ON s.claim_id = c.id
          WHERE c.mission_id = p.id AND s.state = 'accepted' AND s.integrated_commit IS NOT NULL
        ) THEN 1 ELSE 0 END AS integrated
      FROM mission_dependencies d JOIN missions p ON p.id = d.prerequisite_id
      ORDER BY d.mission_id, p.id
    `).all<{ mission_id: string; id: string; title: string; state: string; integrated: number }>(),
  ]);
  const byMission = new Map<string, ListedMission["prerequisites"]>();
  for (const row of dependencies.results) {
    const list = byMission.get(row.mission_id) ?? [];
    list.push({ id: row.id, title: row.title, state: row.state, integrated: row.integrated === 1 });
    byMission.set(row.mission_id, list);
  }
  return missions.results.map((mission) => ({ ...mission, prerequisites: byMission.get(mission.id) ?? [] }));
}

export async function getMission(id: string): Promise<Mission | null> {
  await seedMissions();
  return database().prepare(
    "SELECT id, title, description, rank, branch, state, base_commit, allowed_paths, acceptance, reward_token, reward_cultivation, reward_merit, deposit, budget_tokens, required_realm, required_merit FROM missions WHERE id = ?"
  ).bind(id).first<Mission>();
}
