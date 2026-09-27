export function rejectForeignMutation(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin === new URL(request.url).origin) return null;
  return Response.json({ error: "请求来源无效，请从本站重试" }, { status: 403 });
}
