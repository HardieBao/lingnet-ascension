import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { currentTokenAdjustmentRole } from "@/lib/token-adjustment-auth";
import { TOKEN_ADJUSTMENT_DECISION_SQL } from "@/lib/token-adjustments";
import { readSmallJson } from "@/lib/small-json";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  if (currentTokenAdjustmentRole(cultivator) !== "approver") {
    return Response.json({ error: "双人调账尚未开放或没有审批权限" }, { status: 403 });
  }
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(id)) return Response.json({ error: "申请编号无效" }, { status: 400 });
  const input = await readSmallJson(request) as { decision?: unknown; reason?: unknown } | null;
  const decision = input?.decision;
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if ((decision !== "approve" && decision !== "reject") || !reason || reason.length > 500) {
    return Response.json({ error: "审批决定或理由无效" }, { status: 400 });
  }
  try {
    const result = await database().prepare(TOKEN_ADJUSTMENT_DECISION_SQL).bind(
      decision, cultivator.id, reason, Date.now(), id, cultivator.id
    ).run();
    if (result.meta.changes < 1) return Response.json({ error: "申请不存在、已审批或不能自批" }, { status: 409 });
  } catch {
    return Response.json({ error: "审批未完成；请核对目标余额或稍后重试" }, { status: 409 });
  }
  return Response.json({ adjustment: { id, decision } });
}
