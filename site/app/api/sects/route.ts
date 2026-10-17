import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { loadSectBoard } from "@/lib/contributions";
import { createSect, parseSectCreation } from "@/lib/sects";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  if (new URL(request.url).search) return Response.json({ error: "宗门目录不接受附加参数" }, { status: 400, headers });
  try { return Response.json({ sects: await loadSectBoard(database()) }, { headers }); }
  catch { return Response.json({ error: "宗门目录暂不可用" }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) { foreign.headers.set("Cache-Control", "no-store"); return foreign; }
  const actor = await getCurrentCultivator();
  if (!actor) return Response.json({ error: "请先登录" }, { status: 401, headers });
  const input = parseSectCreation(await readSmallJson(request).catch(() => null));
  if (!input) return Response.json({ error: "名称须1–40字、简介最多500字，不能包含凭据或控制字符" }, { status: 400, headers });
  try {
    const id = await createSect(database(), actor.id, input);
    return id ? Response.json({ id, state: "pending" }, { status: 201, headers })
      : Response.json({ error: "请先结束当前宗门或申请，再创建宗门" }, { status: 409, headers });
  } catch (error) {
    return error instanceof Error && /UNIQUE constraint/i.test(error.message)
      ? Response.json({ error: "名称已占用，或已有当前宗门申请" }, { status: 409, headers })
      : Response.json({ error: "创建结果未确认，请刷新核对" }, { status: 503, headers });
  }
}
