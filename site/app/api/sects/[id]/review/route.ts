import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { parseSectReview, reviewSect } from "@/lib/sects";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" }, foreign = rejectForeignMutation(request);
  if (foreign) { foreign.headers.set("Cache-Control", "no-store"); return foreign; }
  const actor = await getCurrentCultivator();
  if (!actor) return Response.json({ error: "请先登录" }, { status: 401, headers });
  if (!isMaintainer(actor)) return Response.json({ error: "需要平台维护者权限" }, { status: 403, headers });
  const { id } = await context.params, input = parseSectReview(await readSmallJson(request).catch(() => null));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !input) return Response.json({ error: "请选择审核决定并填写8–500字理由" }, { status: 400, headers });
  try {
    if (!await reviewSect(database(), actor.id, id, input)) return Response.json({ error: "申请已处理，或不能审核本人创建的宗门" }, { status: 409, headers });
    return Response.json({ updated: true }, { headers });
  } catch { return Response.json({ error: "审核结果未确认，请刷新核对" }, { status: 503, headers }); }
}
