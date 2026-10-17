import { loadPublishedVersions } from "./published-versions.ts";

export function versionsPageNumber(value: unknown): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : null;
}

export async function publishedVersionsResponse(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!["GET", "HEAD"].includes(request.method)) {
    return Response.json({ error: "公开版本接口只读" }, { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
  }
  const params = new URL(request.url).searchParams, values = params.getAll("page");
  const page = versionsPageNumber(values.length > 1 ? values : values[0]);
  if (page === null || [...params.keys()].some((key) => key !== "page")) {
    return Response.json({ error: "请输入单个正整数页码" }, { status: 400, headers });
  }
  const result = await loadPublishedVersions(page, fetcher);
  const response = Response.json(result, { status: result.state === "available" ? 200 : 503, headers });
  return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
}
