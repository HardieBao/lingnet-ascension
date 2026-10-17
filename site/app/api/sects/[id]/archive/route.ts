import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { archiveSect } from "@/lib/sects";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" }, foreign = rejectForeignMutation(request);
  if (foreign) { foreign.headers.set("Cache-Control", "no-store"); return foreign; }
  const actor = await getCurrentCultivator();
  if (!actor) return Response.json({ error: "请先登录" }, { status: 401, headers });
  const { id } = await context.params, input = await readSmallJson(request).catch(() => null);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 1 || Reflect.get(input, "confirm") !== "archive") {
    return Response.json({ error: "请明确确认归档宗门" }, { status: 400, headers });
  }
  try {
    if (!await archiveSect(database(), actor.id, id)) return Response.json({ error: "宗门已归档或无权操作" }, { status: 409, headers });
    return Response.json({ archived: true }, { headers });
  } catch { return Response.json({ error: "归档结果未确认，请刷新核对" }, { status: 503, headers }); }
}
