import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { rejectForeignMutation } from "@/lib/request-origin";
import { inspectRevalidationPullRequest } from "@/lib/revalidation-source";
import { REVALIDATION_DECISION_SQL, REVALIDATION_RECORD_SQL, REVALIDATION_TARGET_SQL,
  revalidationTargetReport, type RevalidationRecord, type RevalidationTarget } from "@/lib/revalidations";
import { readSmallJson } from "@/lib/small-json";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const reviewer = await getCurrentCultivator();
  if (!reviewer || !isMaintainer(reviewer)) return Response.json({ error: "需要维护者权限" }, { status: 403 });
  const input = await readSmallJson(request) as { decision?: unknown; reason?: unknown } | null;
  if (!input || !["accept", "reject"].includes(String(input.decision)) || typeof input.reason !== "string" ||
      input.reason.trim().length < 8 || input.reason.trim().length > 500) {
    return Response.json({ error: "请选择采纳或驳回，并提供 8–500 字理由" }, { status: 400 });
  }
  const { id } = await context.params;
  const db = database();
  const record = await db.prepare(`${REVALIDATION_RECORD_SQL} WHERE r.id = ?`).bind(id).first<RevalidationRecord>();
  if (!record || record.decision) return Response.json({ error: "复验不存在或已处理" }, { status: 409 });
  const target = await db.prepare(REVALIDATION_TARGET_SQL).bind(record.submission_id).first<RevalidationTarget>();
  if (reviewer.id === record.cultivator_id || target?.author_id === reviewer.id) {
    return Response.json({ error: "复验人和原成果作者不能采纳或驳回此报告" }, { status: 403 });
  }
  if (input.decision === "accept") {
    const reporter = await db.prepare("SELECT provider_id FROM cultivators WHERE id = ? AND provider = 'github'")
      .bind(record.cultivator_id).first<{ provider_id: string }>();
    const expected = target && reporter && revalidationTargetReport(target, reporter.provider_id);
    if (!expected) return Response.json({ error: "正式成果已变化，不能采纳" }, { status: 409 });
    try {
      const proof = await inspectRevalidationPullRequest(record.pull_number, record.ci_run_id, reporter.provider_id, expected);
      if (!proof.passed || proof.headSha.toLowerCase() !== record.head_sha || proof.runAttempt !== record.ci_run_attempt ||
          proof.report.validatorBaseCommit !== record.validator_base_commit || proof.outcome !== record.outcome ||
          proof.report.findings !== record.findings || proof.report.integratedCommit !== record.integrated_commit ||
          proof.report.artifactSha256 !== record.artifact_sha256) {
        return Response.json({ error: "报告、正式成果或复验运行已变化，请驳回后重新提交可信证据" }, { status: 409 });
      }
    } catch {
      return Response.json({ error: "暂时无法重新核验复验来源，未作采纳决定" }, { status: 502 });
    }
  }
  try {
    const result = await db.prepare(REVALIDATION_DECISION_SQL).bind(input.decision, reviewer.id,
      input.reason.trim(), Date.now(), id).run();
    if (result.meta.changes < 1) return Response.json({ error: "复验已由其他请求处理" }, { status: 409 });
    return Response.json({ id, decision: input.decision });
  } catch {
    return Response.json({ error: "决定未确认，请核对记录、独立身份与成果状态后再重试" }, { status: 409 });
  }
}
