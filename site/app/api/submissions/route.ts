import { database } from "@/db/runtime";
import { ARTIFACT_INSERT_SQL } from "@/lib/artifact-storage";
import { getCurrentCultivator } from "@/lib/auth";
import { getClaim } from "@/lib/claims";
import { artifactSafetyIssues } from "@/lib/artifact-safety";
import { artifactPathForMission, matchesArtifactUploadName, verifyMissionContent } from "@/lib/verifier";
import { rejectForeignMutation } from "@/lib/request-origin";
import { MAX_FAILED_SUBMISSIONS_PER_MISSION, MAX_SUBMISSIONS_PER_CLAIM, SUBMISSION_INSERT_SQL, SUBMISSION_LIMIT_SQL, SUBMISSION_REVIEW_CLAIM_SQL } from "@/lib/submission-limit";

type SubmissionLimits = { claim_count: number; mission_failures: number };

function submissionLimitReached(limits: SubmissionLimits | null) {
  return !!limits && (limits.claim_count >= MAX_SUBMISSIONS_PER_CLAIM || limits.mission_failures >= MAX_FAILED_SUBMISSIONS_PER_MISSION);
}

function submissionLimitResponse() {
  return Response.json({ error: "提交次数已达上限，请联系维护者处理" }, { status: 429 });
}

export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;") || !request.body) {
    return Response.json({ error: "请使用文件上传表单" }, { status: 400 });
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let uploadSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    uploadSize += value.byteLength;
    if (uploadSize > 160 * 1024) {
      await reader.cancel();
      return Response.json({ error: "上传内容超过 160 KiB 限制" }, { status: 413 });
    }
    chunks.push(value);
  }
  const boundedBody = new Uint8Array(new ArrayBuffer(uploadSize));
  let offset = 0;
  for (const chunk of chunks) {
    boundedBody.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const form = await new Request(request.url, {
    method: "POST", headers: { "Content-Type": contentType }, body: boundedBody.buffer,
  }).formData().catch(() => null);
  const claimId = form?.get("claimId");
  const artifact = form?.get("artifact");
  if (typeof claimId !== "string" || !(artifact instanceof File)) {
    return Response.json({ error: "请上传任务成果" }, { status: 400 });
  }
  const claim = await getClaim(claimId);
  if (!claim || claim.cultivator_id !== cultivator.id || claim.state !== "running" || claim.expires_at <= Date.now()) {
    return Response.json({ error: "认领无效或已过期" }, { status: 409 });
  }
  const artifactPath = artifactPathForMission(claim.mission_id);
  const artifactName = artifactPath?.split("/").at(-1);
  if (!artifactPath || !matchesArtifactUploadName(claim.mission_id, artifact.name) || artifact.size > 131072) {
    return Response.json({ error: "请上传本悬赏指定的 Markdown 成果，且不超过 128 KiB" }, { status: 400 });
  }
  const db = database();
  const limits = await db.prepare(SUBMISSION_LIMIT_SQL).bind(claim.id, cultivator.id).first<SubmissionLimits>();
  if (submissionLimitReached(limits)) return submissionLimitResponse();
  const bytes = await artifact.arrayBuffer();
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return Response.json({ error: "Markdown 必须使用 UTF-8 编码" }, { status: 400 });
  }
  const safetyIssues = artifactSafetyIssues(content);
  const frozen = safetyIssues.length > 0;
  const verdict = frozen ? { passed: false, quarantined: true, checks: safetyIssues.map((name) => ({
    name, passed: false, detail: "成果已隔离，原文不保存；请移除敏感内容并联系独立维护者复核。",
  })) } : verifyMissionContent(claim.mission_id, content)!;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const submissionId = crypto.randomUUID();
  const key = `submissions/${claim.id}/${submissionId}/${artifactName}`;

  const now = Date.now();
  const state = frozen ? "frozen" : verdict.passed ? "awaiting_review" : "needs_revision";
  const statements = [
    db.prepare(SUBMISSION_INSERT_SQL).bind(
      submissionId, cultivator.id, key, sha256, state, JSON.stringify(verdict), now,
      claim.id, cultivator.id, now, MAX_SUBMISSIONS_PER_CLAIM, MAX_FAILED_SUBMISSIONS_PER_MISSION,
    ),
  ];
  if (!frozen) statements.push(db.prepare(ARTIFACT_INSERT_SQL).bind(key, submissionId, content, sha256, now, submissionId, key));
  if (frozen) {
    statements.push(
      db.prepare("UPDATE claims SET state = 'frozen' WHERE id = ? AND cultivator_id = ? AND state = 'running' AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND claim_id = ? AND state = 'frozen')")
        .bind(claim.id, cultivator.id, submissionId, claim.id),
      db.prepare("UPDATE missions SET state = 'frozen' WHERE id = ? AND state = 'open' AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = 'frozen') AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'frozen')")
        .bind(claim.mission_id, claim.id, submissionId),
    );
  } else if (verdict.passed) {
    statements.push(
      db.prepare(SUBMISSION_REVIEW_CLAIM_SQL)
        .bind(claim.id, cultivator.id, now, submissionId, claim.id, cultivator.id)
    );
  }
  let results: D1Result[];
  try {
    results = await db.batch(statements);
  } catch {
    return Response.json({ error: "提交暂不可用，请稍后重试" }, { status: 503 });
  }
  if (results[0].meta.changes !== 1) {
    const latestLimits = await db.prepare(SUBMISSION_LIMIT_SQL).bind(claim.id, cultivator.id).first<SubmissionLimits>();
    if (submissionLimitReached(latestLimits)) return submissionLimitResponse();
    return Response.json({ error: "任务状态已改变，请刷新后重试" }, { status: 409 });
  }
  return Response.json({ submission: { id: submissionId, state, verdict } }, { status: 201 });
}

export async function GET() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const rows = await database().prepare(
    "SELECT id, claim_id, state, verdict, review_reason, created_at, reviewed_at FROM submissions WHERE cultivator_id = ? ORDER BY created_at DESC LIMIT 30"
  ).bind(cultivator.id).all();
  return Response.json({ submissions: rows.results });
}
