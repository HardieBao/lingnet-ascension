import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { readSmallJson } from "@/lib/small-json";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const maintainer = await getCurrentCultivator();
  if (!maintainer || !isMaintainer(maintainer)) return Response.json({ error: "需要维护者确认平台故障" }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "渡劫编号无效" }, { status: 400 });
  }
  const input = await readSmallJson(request) as { reason?: unknown } | null;
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  const prefix = `维护者 ${maintainer.id} 确认平台故障：`;
  if (reason.length < 20 || prefix.length + reason.length > 500) return Response.json({ error: "请填写足够具体的故障证据，完整记录不得超过 500 字" }, { status: 400 });
  try {
    const result = await database().prepare(
      "UPDATE realm_trials SET state = 'platform_failure', finished_at = ?, finish_reason = ? WHERE id = ? AND state = 'active' AND NOT EXISTS (SELECT 1 FROM submissions WHERE claim_id = realm_trials.claim_id AND state = 'accepted')"
    ).bind(Date.now(), prefix + reason, id).run();
    if (result.meta.changes < 1) return Response.json({ error: "渡劫已结算或已有正式成果，不能按平台故障退款" }, { status: 409 });
    return Response.json({ id, state: "platform_failure" });
  } catch {
    return Response.json({ error: "故障中止结果未确认，请核对记录与余额后重试" }, { status: 409 });
  }
}
