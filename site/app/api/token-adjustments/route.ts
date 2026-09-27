import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { currentTokenAdjustmentRole } from "@/lib/token-adjustment-auth";
import { TOKEN_ADJUSTMENT_REQUEST_SQL, TOKEN_ADJUSTMENTS_LIST_SQL } from "@/lib/token-adjustments";
import { readSmallJson } from "@/lib/small-json";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function GET() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!currentTokenAdjustmentRole(cultivator)) return Response.json({ error: "双人调账尚未开放或没有权限" }, { status: 403 });
  const rows = await database().prepare(TOKEN_ADJUSTMENTS_LIST_SQL).all();
  return Response.json({ adjustments: rows.results }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  if (currentTokenAdjustmentRole(cultivator) !== "requester") {
    return Response.json({ error: "双人调账尚未开放或没有申请权限" }, { status: 403 });
  }
  const input = await readSmallJson(request) as { targetCultivatorId?: unknown; delta?: unknown; reference?: unknown; reason?: unknown } | null;
  const targetId = typeof input?.targetCultivatorId === "string" ? input.targetCultivatorId.trim() : "";
  const reference = typeof input?.reference === "string" ? input.reference.trim() : "";
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  const delta = input?.delta;
  if (!targetId || targetId.length > 100 || !reference || reference.length > 100 ||
      reason.length < 20 || reason.length > 500 || !Number.isSafeInteger(delta) ||
      delta === 0 || Math.abs(delta as number) > 10000) {
    return Response.json({ error: "目标、非零调整额、业务引用或申请理由无效" }, { status: 400 });
  }
  const db = database();
  const target = await db.prepare("SELECT id FROM cultivators WHERE id = ?").bind(targetId).first();
  if (!target) return Response.json({ error: "目标修士不存在" }, { status: 404 });
  const id = crypto.randomUUID();
  try {
    await db.prepare(TOKEN_ADJUSTMENT_REQUEST_SQL).bind(
      id, targetId, delta, reference, reason, cultivator.id, Date.now()
    ).run();
  } catch {
    return Response.json({ error: "申请未保存；请核对业务引用是否重复" }, { status: 409 });
  }
  return Response.json({ adjustment: { id, state: "pending" } }, { status: 201 });
}
