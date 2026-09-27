import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { expireClaims, getClaim } from "@/lib/claims";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const now = Date.now();
  await expireClaims(now);
  const claim = await getClaim(id);
  if (!claim || claim.cultivator_id !== cultivator.id || !["claimed", "running"].includes(claim.state)) {
    return Response.json({ error: "任务不能释放" }, { status: 409 });
  }
  const deposit = (JSON.parse(claim.reward_snapshot) as { deposit: number }).deposit;
  const db = database();
  const statements = [
    db.prepare("UPDATE claims SET state = 'released' WHERE id = ? AND cultivator_id = ? AND state IN ('claimed', 'running')")
      .bind(id, cultivator.id),
  ];
  if (deposit > 0) {
    statements.push(
      db.prepare(
        "INSERT OR IGNORE INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, 'token', ?, ?, ? WHERE EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = 'released')"
      ).bind(crypto.randomUUID(), cultivator.id, deposit, `${id}:release:refund`, now, id),
      db.prepare(
        "INSERT OR IGNORE INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, 'token_locked', ?, ?, ? WHERE EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = 'released')"
      ).bind(crypto.randomUUID(), cultivator.id, -deposit, `${id}:release:unlock`, now, id)
    );
  }
  const result = await db.batch(statements);
  if (result[0].meta.changes !== 1) return Response.json({ error: "任务状态已改变" }, { status: 409 });
  return Response.json({ id, state: "released" });
}
