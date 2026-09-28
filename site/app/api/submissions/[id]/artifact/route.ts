import { artifactBytes, database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const submission = await database().prepare(
    "SELECT cultivator_id, artifact_key, state FROM submissions WHERE id = ?"
  ).bind(id).first<{ cultivator_id: string; artifact_key: string; state: string }>();
  if (!submission) return Response.json({ error: "成果不存在" }, { status: 404 });
  if (submission.cultivator_id !== cultivator.id && !isMaintainer(cultivator)) {
    return Response.json({ error: "无权查看该成果" }, { status: 403 });
  }
  if (submission.state === "frozen") return Response.json({ error: "成果已隔离，原文不可读取" }, { status: 404 });
  let artifact;
  try { artifact = await artifactBytes(submission.artifact_key); }
  catch { return Response.json({ error: "成果存储暂不可用或摘要校验失败" }, { status: 503 }); }
  if (!artifact) return Response.json({ error: "成果文件暂不可用" }, { status: 404 });
  return new Response(artifact, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
