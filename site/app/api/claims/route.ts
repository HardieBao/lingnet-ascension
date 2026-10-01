import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { CLAIM_INSERT_SQL } from "@/lib/claim-insert";
import { claimQuote, claimTerms, CLAIM_TERMS_MATCH_SQL } from "@/lib/claim-quote";
import { expireClaims } from "@/lib/claims";
import { BASE_ACTIVE_CLAIM_LIMIT, SPLIT_MIND_ACTIVE_CLAIM_LIMIT, SPLIT_MIND_PENDANT_ID } from "@/lib/equipment";
import { getMission } from "@/lib/missions";
import { MODEL_CONTRACT } from "@/lib/model-budget";
import { officialTokenBonus, stableRewardSnapshot } from "@/lib/rewards";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";

export async function GET() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  await expireClaims();
  const rows = await database().prepare(
    "SELECT id, mission_id, state, claimed_at, started_at, expires_at FROM claims WHERE cultivator_id = ? ORDER BY claimed_at DESC LIMIT 30"
  ).bind(cultivator.id).all();
  return Response.json({ claims: rows.results });
}

export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const input = await readSmallJson(request) as { missionId?: unknown; quote?: unknown } | null;
  if (typeof input?.missionId !== "string") return Response.json({ error: "任务编号无效" }, { status: 400 });
  if (input.quote !== undefined && (typeof input.quote !== "string" || !/^[a-f0-9]{64}$/.test(input.quote))) {
    return Response.json({ error: "认领确认信息无效，请刷新后重新核对" }, { status: 400 });
  }
  const mission = await getMission(input.missionId);
  if (!mission) return Response.json({ error: "悬赏不存在" }, { status: 404 });
  if (mission.state !== "open") return Response.json({ error: "前置成果尚未完成" }, { status: 409 });
  if (input.quote !== undefined && input.quote !== await claimQuote(mission)) {
    return Response.json({ error: "悬赏确认信息已变化，请刷新并重新核对后认领" }, { status: 409 });
  }

  const db = database();
  const now = Date.now();
  await expireClaims(now);
  const id = crypto.randomUUID();
  const expiresAt = now + 20 * 60_000;
  const rewardSnapshot = JSON.stringify({
    token: mission.reward_token,
    officialToken: officialTokenBonus(mission.rank),
    cultivation: mission.reward_cultivation,
    merit: mission.reward_merit,
    stable: stableRewardSnapshot(mission.rank, mission.reward_token, mission.reward_merit),
    deposit: mission.deposit,
    baseCommit: mission.base_commit,
    title: mission.title,
    description: mission.description,
    acceptance: mission.acceptance,
    allowedPaths: mission.allowed_paths,
    budgetTokens: MODEL_CONTRACT.tokenBudget,
    modelContract: MODEL_CONTRACT,
  });

  try {
    const statements = [
      db.prepare(CLAIM_INSERT_SQL + CLAIM_TERMS_MATCH_SQL).bind(id, cultivator.id, now, expiresAt, rewardSnapshot, cultivator.id, mission.id, mission.id,
        cultivator.id, cultivator.id, SPLIT_MIND_PENDANT_ID, SPLIT_MIND_ACTIVE_CLAIM_LIMIT,
        BASE_ACTIVE_CLAIM_LIMIT, cultivator.id, mission.deposit, JSON.stringify(claimTerms(mission))),
    ];
    if (mission.deposit > 0) {
      statements.push(
        db.prepare(
          "INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, 'token', ?, ?, ? WHERE EXISTS (SELECT 1 FROM claims WHERE id = ?)"
        ).bind(crypto.randomUUID(), cultivator.id, -mission.deposit, `${id}:deposit:hold`, now, id),
        db.prepare(
          "INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, 'token_locked', ?, ?, ? WHERE EXISTS (SELECT 1 FROM claims WHERE id = ?)"
        ).bind(crypto.randomUUID(), cultivator.id, mission.deposit, `${id}:deposit:locked`, now, id)
      );
    }
    const results = await db.batch(statements);
    if ((results[0].meta.changes ?? 0) !== 1) {
      return Response.json({ error: "任务已被认领，或境界、功德、席位、Token 不足" }, { status: 409 });
    }
    return Response.json({ claim: { id, missionId: mission.id, state: "claimed", expiresAt } }, { status: 201 });
  } catch {
    return Response.json({ error: "认领条件已变化，请刷新后核对任务门槛与余额" }, { status: 409 });
  }
}
