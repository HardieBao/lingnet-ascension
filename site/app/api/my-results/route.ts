import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { loadOwnResults } from "@/lib/own-results";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const actor = await getCurrentCultivator();
    if (!actor) return Response.json({ error: "请先登录" }, { status: 401, headers });
    const params = new URL(request.url).searchParams, cursors = params.getAll("before");
    if (cursors.length > 1 || [...params.keys()].some((key) => key !== "before")) {
      return Response.json({ error: "成果分页参数无效，请返回最新记录" }, { status: 400, headers });
    }
    const page = await loadOwnResults(database(), actor.id, cursors[0]);
    if (page.error) return Response.json({ error: page.error }, { status: 400, headers });
    return Response.json({ source: "accepted-integration-records", results: page.results, nextCursor: page.nextCursor }, { headers });
  } catch {
    return Response.json({ error: "本人成果记录暂不可用，当前状态未知" }, { status: 503, headers });
  }
}

export async function HEAD(request: Request) {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
