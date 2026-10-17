import { database } from "@/db/runtime";
import { loadContributionBoard } from "@/lib/contributions";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" }, params = new URL(request.url).searchParams;
  const raw = params.get("page") ?? "1";
  if ([...params.keys()].some((key) => key !== "page") || params.getAll("page").length > 1 || !/^[1-9]\d{0,5}$/.test(raw) || Number(raw) > 100000) {
    return Response.json({ error: "榜单页码无效" }, { status: 400, headers });
  }
  try { return Response.json(await loadContributionBoard(database(), Number(raw)), { headers }); }
  catch { return Response.json({ error: "贡献榜暂不可用" }, { status: 503, headers }); }
}
export async function HEAD(request: Request) {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
