import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { changeMembership, parseMembershipAction } from "@/lib/sects";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" }, foreign = rejectForeignMutation(request);
  if (foreign) { foreign.headers.set("Cache-Control", "no-store"); return foreign; }
  const actor = await getCurrentCultivator();
  if (!actor) return Response.json({ error: "请先登录" }, { status: 401, headers });
  const { id } = await context.params, input = parseMembershipAction(await readSmallJson(request).catch(() => null));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !input) return Response.json({ error: "成员操作参数无效，请刷新核对" }, { status: 400, headers });
  try {
    if (!await changeMembership(database(), actor.id, id, input)) return Response.json({ error: "记录已变更、宗门不可用或无权操作，请刷新核对" }, { status: 409, headers });
    return Response.json({ updated: true }, { headers });
  } catch (error) {
    return error instanceof Error && /UNIQUE constraint/i.test(error.message)
      ? Response.json({ error: "已有宗门或待处理申请，请先退出或取消" }, { status: 409, headers })
      : Response.json({ error: "操作结果未确认，请刷新核对" }, { status: 503, headers });
  }
}
