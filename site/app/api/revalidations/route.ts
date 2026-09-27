import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { rejectForeignMutation } from "@/lib/request-origin";
import { inspectRevalidationPullRequest } from "@/lib/revalidation-source";
import { REVALIDATION_INSERT_SQL, REVALIDATION_RECORD_SQL, REVALIDATION_TARGET_SQL,
  revalidationTargetReport, type RevalidationRecord, type RevalidationTarget } from "@/lib/revalidations";
import { readSmallJson } from "@/lib/small-json";

export async function GET() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const records = await database().prepare(`${REVALIDATION_RECORD_SQL}
      WHERE (? = 1 OR r.cultivator_id = ?) ORDER BY r.created_at DESC, r.id DESC LIMIT 50`)
      .bind(isMaintainer(cultivator) ? 1 : 0, cultivator.id).all<RevalidationRecord>();
    return Response.json({ revalidations: records.results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "复验记录暂不可用" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator || cultivator.provider !== "github") return Response.json({ error: "请使用 GitHub 登录" }, { status: 401 });
  const input = await readSmallJson(request) as { submissionId?: unknown; pullNumber?: unknown; runId?: unknown } | null;
  if (typeof input?.submissionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.submissionId) ||
      !Number.isSafeInteger(input.pullNumber) || (input.pullNumber as number) < 1 ||
      !Number.isSafeInteger(input.runId) || (input.runId as number) < 1) {
    return Response.json({ error: "请提供正式成果编号、报告 PR 和专用复验运行编号" }, { status: 400 });
  }
  const db = database();
  const target = await db.prepare(REVALIDATION_TARGET_SQL).bind(input.submissionId.toLowerCase()).first<RevalidationTarget>();
  if (!target) return Response.json({ error: "成果尚未正式合入或契约不可复验" }, { status: 409 });
  if (target.author_id === cultivator.id) return Response.json({ error: "不能复验自己的成果" }, { status: 403 });
  const expected = revalidationTargetReport(target, cultivator.provider_id);
  if (!expected) return Response.json({ error: "正式成果缺少有效契约与摘要" }, { status: 409 });
  let proof;
  try {
    proof = await inspectRevalidationPullRequest(input.pullNumber as number, input.runId as number, cultivator.provider_id, expected);
  } catch {
    return Response.json({ error: "暂时无法核验 GitHub 复验来源" }, { status: 502 });
  }
  if (!proof.passed) return Response.json({ error: proof.reason }, { status: 409 });
  const id = crypto.randomUUID();
  try {
    await db.prepare(REVALIDATION_INSERT_SQL).bind(id, expected.submissionId, cultivator.id,
      input.pullNumber, proof.headSha.toLowerCase(), proof.runId, proof.runAttempt, proof.report.validatorBaseCommit,
      proof.report.integratedCommit, proof.report.artifactSha256, proof.outcome, proof.report.findings, Date.now()).run();
    return Response.json({ revalidation: { id, decision: null, outcome: proof.outcome } }, { status: 201 });
  } catch {
    return Response.json({ error: "记录未确认；成果可能已变化或存在待审/已采纳复验，请先核对记录" }, { status: 409 });
  }
}
