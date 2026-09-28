import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { artifactSafetyIssues } from "@/lib/artifact-safety";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";
import { inspectCurrentRollback } from "@/lib/stable-versions";

type Settlement = {
  claim_id: string; cultivator_id: string; artifact_sha256: string;
  artifact_path: string; token: number; cultivation: number; merit: number;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const reviewer = await getCurrentCultivator();
  if (!reviewer || !isMaintainer(reviewer)) return Response.json({ error: "需要维护者权限" }, { status: 403 });
  const input = await readSmallJson(request) as { reason?: unknown } | null;
  if (typeof input?.reason !== "string" || input.reason.trim().length < 20 ||
      input.reason.trim().length > 500 || artifactSafetyIssues(input.reason).length) {
    return Response.json({ error: "请说明 20–500 字回滚证据" }, { status: 400 });
  }
  const { id } = await context.params;
  const db = database();
  const settlement = await db.prepare(`
    SELECT s.claim_id, s.cultivator_id, s.artifact_sha256,
      json_extract(c.reward_snapshot, '$.allowedPaths') AS artifact_path,
      s.token, s.cultivation, s.merit
    FROM stable_reward_settlements s JOIN claims c ON c.id = s.claim_id
    WHERE s.id = ? AND NOT EXISTS (SELECT 1 FROM stable_reward_revocations r WHERE r.settlement_id = s.id)
  `).bind(id).first<Settlement>();
  if (!settlement) return Response.json({ error: "结算不存在或已追回" }, { status: 409 });
  if (settlement.cultivator_id === reviewer.id) return Response.json({ error: "作者不能核对自己的回滚" }, { status: 403 });
  let observed;
  try {
    observed = await inspectCurrentRollback({ artifactPath: settlement.artifact_path,
      artifactSha256: settlement.artifact_sha256 });
  } catch { return Response.json({ error: "无法核验当前主分支，未执行追回" }, { status: 502 }); }
  if (!observed.rolledBack) return Response.json({ error: "成果仍与正式版本一致，不能追回" }, { status: 409 });
  const balances = await db.prepare(`
    SELECT resource, COALESCE(SUM(delta), 0) AS balance FROM ledger_events
    WHERE cultivator_id = ? AND resource IN ('token','cultivation','merit') GROUP BY resource
  `).bind(settlement.cultivator_id).all<{ resource: string; balance: number }>();
  const available = Object.fromEntries(balances.results.map((row) => [row.resource, row.balance]));
  const offset = {
    token: Math.min(settlement.token, Math.max(0, available.token ?? 0)),
    cultivation: Math.min(settlement.cultivation, Math.max(0, available.cultivation ?? 0)),
    merit: Math.min(settlement.merit, Math.max(0, available.merit ?? 0)),
  };
  const debt = { token: settlement.token - offset.token,
    cultivation: settlement.cultivation - offset.cultivation, merit: settlement.merit - offset.merit };
  const now = Date.now();
  try {
    const statements = [db.prepare(`
      INSERT INTO stable_reward_revocations (settlement_id, cultivator_id, main_commit,
        token_offset, cultivation_offset, merit_offset, token_debt, cultivation_debt, merit_debt,
        revoked_by, reason, revoked_at)
      SELECT id, cultivator_id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM stable_reward_settlements
      WHERE id = ? AND cultivator_id = ? AND NOT EXISTS
        (SELECT 1 FROM stable_reward_revocations WHERE settlement_id = ?)
    `).bind(observed.mainCommit, offset.token, offset.cultivation, offset.merit,
      debt.token, debt.cultivation, debt.merit, reviewer.id, input.reason.trim(), now,
      id, settlement.cultivator_id, id)];
    for (const [resource, amount] of Object.entries(offset)) {
      if (amount > 0) statements.push(db.prepare(`
        INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
        SELECT ?, cultivator_id, ?, ?, ?, ? FROM stable_reward_revocations WHERE settlement_id = ?
      `).bind(crypto.randomUUID(), resource, -amount, `${settlement.claim_id}:stable:reversal`, now, id));
    }
    const results = await db.batch(statements);
    if (results[0].meta.changes !== 1) return Response.json({ error: "已由其他请求处理" }, { status: 409 });
    return Response.json({ id, state: "revoked", offset, debt }, { status: 201 });
  } catch {
    return Response.json({ error: "追回未确认；余额或结算状态已变化" }, { status: 409 });
  }
}
