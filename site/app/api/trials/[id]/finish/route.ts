import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { REALM_TRIAL_PASS_SQL } from "@/lib/realm-trials";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "渡劫编号无效" }, { status: 400 });
  }
  try {
    const db = database();
    const trial = await db.prepare("SELECT target_realm FROM realm_trials WHERE id = ? AND cultivator_id = ? AND state = 'active'")
      .bind(id, cultivator.id).first<{ target_realm: string }>();
    if (!trial) return Response.json({ error: "渡劫不存在、已结算或没有操作权限" }, { status: 409 });
    const result = await db.prepare(REALM_TRIAL_PASS_SQL).bind(Date.now(), cultivator.id, id, id, cultivator.id, cultivator.id).run();
    if (result.meta.changes < 1) return Response.json({ error: "缺少本次按时合入的正式成果与独立复核，或渡劫已经结算" }, { status: 409 });
    return Response.json({ id, state: "passed", realm: trial.target_realm });
  } catch {
    return Response.json({ error: "突破结果未确认，请核对渡劫记录与境界后再重试" }, { status: 409 });
  }
}
