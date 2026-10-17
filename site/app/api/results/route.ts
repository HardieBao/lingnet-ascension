import { database } from "@/db/runtime";
import { loadPublishedResults, publishedResultsQuery } from "@/lib/published-results";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" }, query = publishedResultsQuery(new URL(request.url).searchParams);
  if (!query) return Response.json({ error: "请选择公开版本及有效页码" }, { status: 400, headers });
  try {
    const data = await loadPublishedResults(database(), query.releaseId, query.page);
    return data ? Response.json(data, { headers }) : Response.json({ error: "版本证据暂不可用，不能确认成果" }, { status: 503, headers });
  } catch { return Response.json({ error: "成果目录暂不可用，当前状态未知" }, { status: 503, headers }); }
}
export async function HEAD(request: Request) {
  const result = await GET(request); return new Response(null, { status: result.status, headers: result.headers });
}
