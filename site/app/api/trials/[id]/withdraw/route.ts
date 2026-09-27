import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { readSmallJson } from "@/lib/small-json";
import { rejectForeignMutation } from "@/lib/request-origin";
import { settleRealmTrials } from "@/lib/realm-trial-runtime";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "渡劫编号无效" }, { status: 400 });
  }
  const input = await readSmallJson(request) as { reason?: unknown } | null;
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 500) return Response.json({ error: "请填写 1–500 字退出理由" }, { status: 400 });
  try {
    await settleRealmTrials(cultivator.id);
    const result = await database().prepare(
      "UPDATE realm_trials SET state = 'withdrawn', finished_at = ?, finish_reason = ? WHERE id = ? AND cultivator_id = ? AND state = 'active'"
    ).bind(Date.now(), reason, id, cultivator.id).run();
    if (result.meta.changes < 1) return Response.json({ error: "渡劫已结算或没有操作权限" }, { status: 409 });
    return Response.json({ id, state: "withdrawn", message: "渡劫费用已全额解冻，原悬赏认领仍保留" });
  } catch {
    return Response.json({ error: "退出结果未确认，请核对渡劫记录和余额后再重试" }, { status: 409 });
  }
}
