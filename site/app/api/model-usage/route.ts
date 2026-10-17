import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { loadOwnUsageReports, parseUsageReport, saveOwnUsageReport } from "@/lib/model-usage";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" }, actor = await getCurrentCultivator();
  if (!actor) return Response.json({ error: "请先登录" }, { status: 401, headers });
  const params = new URL(request.url).searchParams, claim = params.get("claim"), before = params.get("before");
  const cursor = before === null ? null : /^(\d{1,16}):([a-f0-9-]{36})$/i.exec(before);
  if ([...params.keys()].some((key) => !["claim", "before"].includes(key)) || params.getAll("claim").length > 1 ||
      params.getAll("before").length > 1 || claim !== null && !/^[a-f0-9-]{36}$/i.test(claim) ||
      before !== null && (!cursor || !Number.isSafeInteger(Number(cursor[1])))) return Response.json({ error: "用量查询参数无效" }, { status: 400, headers });
  try { return Response.json(await loadOwnUsageReports(database(), actor.id, claim ?? undefined, before ?? undefined), { headers }); }
  catch { return Response.json({ error: "模型用量记录暂不可用，当前状态未知" }, { status: 503, headers }); }
}
export async function HEAD(request: Request) {
  const response = await GET(request); return new Response(null, { status: response.status, headers: response.headers });
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" }, foreign = rejectForeignMutation(request);
  if (foreign) { foreign.headers.set("Cache-Control", "no-store"); return foreign; }
  const actor = await getCurrentCultivator();
  if (!actor) return Response.json({ error: "请先登录" }, { status: 401, headers });
  const report = parseUsageReport(await readSmallJson(request).catch(() => null));
  if (!report) return Response.json({ error: "用量报告格式、预算或本机时间无效；仅接受Runner导出的数值报告" }, { status: 400, headers });
  try {
    const result = await saveOwnUsageReport(database(), actor.id, report), { status, ...body } = result;
    return Response.json(body, { status, headers });
  } catch { return Response.json({ error: "用量保存结果未确认，请先刷新核对记录" }, { status: 503, headers }); }
}
