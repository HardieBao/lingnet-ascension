import { database } from "@/db/runtime";
import { ARTIFACT_INSERT_SQL } from "@/lib/artifact-storage";
import { getCurrentCultivator } from "@/lib/auth";
import { getClaim } from "@/lib/claims";
import { isCodeArtifactPath } from "@/lib/code-artifact";
import { inspectCodePullRequest } from "@/lib/code-pull-request";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";
import { MAX_FAILED_SUBMISSIONS_PER_MISSION, MAX_SUBMISSIONS_PER_CLAIM, SUBMISSION_INSERT_SQL } from "@/lib/submission-limit";

export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator || cultivator.provider !== "github") {
    return Response.json({ error: "请先使用 GitHub 登录" }, { status: 401 });
  }
  const input = await readSmallJson(request) as { claimId?: unknown; pullNumber?: unknown } | null;
  if (typeof input?.claimId !== "string" || !Number.isSafeInteger(input.pullNumber) ||
      (input.pullNumber as number) < 1) {
    return Response.json({ error: "请提供认领编号和 PR 编号" }, { status: 400 });
  }
  const claim = await getClaim(input.claimId);
  if (!claim || claim.cultivator_id !== cultivator.id || claim.state !== "running" || claim.expires_at <= Date.now()) {
    return Response.json({ error: "认领无效或已过期" }, { status: 409 });
  }
  let snapshot: { allowedPaths?: unknown; baseCommit?: unknown };
  try {
    snapshot = JSON.parse(claim.reward_snapshot);
  } catch {
    return Response.json({ error: "认领契约无效" }, { status: 409 });
  }
  if (!isCodeArtifactPath(snapshot.allowedPaths) || typeof snapshot.baseCommit !== "string") {
    return Response.json({ error: "本悬赏尚未开放代码 PR 交付" }, { status: 409 });
  }

  let source;
  try {
    source = await inspectCodePullRequest(input.pullNumber as number, cultivator.provider_id,
      snapshot.baseCommit, snapshot.allowedPaths);
  } catch {
    return Response.json({ error: "暂时无法核对 GitHub PR 与可信 CI" }, { status: 502 });
  }
  if (!source.passed && source.quarantine) {
    const id = crypto.randomUUID(), now = Date.now();
    const verdict = { passed: false, quarantined: true, checks: source.quarantine.issues.map((name) => ({
      name, passed: false, detail: "成果已隔离，原文不保存；请撤销泄露凭据、清理公开来源并联系独立维护者复核。",
    })), source: { kind: "github-pr", number: input.pullNumber,
      url: `https://github.com/HardieBao/lingnet-ascension/pull/${input.pullNumber}` } };
    const db = database();
    try {
      const results = await db.batch([
        db.prepare(SUBMISSION_INSERT_SQL).bind(
          id, cultivator.id, `submissions/${claim.id}/${id}/discarded-sensitive-code`, source.quarantine.fileSha256,
          "frozen", JSON.stringify(verdict), now, claim.id, cultivator.id, now,
          MAX_SUBMISSIONS_PER_CLAIM, MAX_FAILED_SUBMISSIONS_PER_MISSION,
        ),
        db.prepare("UPDATE claims SET state = 'frozen' WHERE id = ? AND cultivator_id = ? AND state = 'running' AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND claim_id = ? AND state = 'frozen')")
          .bind(claim.id, cultivator.id, id, claim.id),
        db.prepare("UPDATE missions SET state = 'frozen' WHERE id = ? AND state = 'open' AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = 'frozen') AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'frozen')")
          .bind(claim.mission_id, claim.id, id),
      ]);
      if (results[0].meta.changes !== 1) return Response.json({ error: "任务状态或提交次数已变化，请联系维护者核对" }, { status: 409 });
    } catch {
      return Response.json({ error: "敏感成果隔离暂不可用，请稍后重试" }, { status: 503 });
    }
    return Response.json({ submission: { id, state: "frozen", verdict } }, { status: 201 });
  }
  if (!source.passed) return Response.json({ error: source.reason }, { status: 409 });

  const id = crypto.randomUUID();
  const now = Date.now();
  const key = `submissions/${claim.id}/${id}/pull-request.json`;
  const record = { kind: "github-pr", claimId: claim.id, baseCommit: snapshot.baseCommit, verifiedAt: now, ...source };
  const content = JSON.stringify(record);
  const contentBytes = new TextEncoder().encode(content);
  if (contentBytes.byteLength > 131072) return Response.json({ error: "代码复核记录超过 128 KiB" }, { status: 413 });
  const contentDigest = await crypto.subtle.digest("SHA-256", contentBytes);
  const contentSha256 = Array.from(new Uint8Array(contentDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const verdict = { passed: true, checks: [
    { name: "PR 作者与范围", passed: true, detail: "GitHub PR 作者和单文件范围与认领契约一致。" },
    { name: "固定基线", passed: true, detail: "PR 提交基于认领时锁定的提交。" },
    { name: "可信 CI", passed: true, detail: `当前测试合并提交的可信检查 #${source.ciRunId} 已通过。` },
  ], source: record };
  try {
    const db = database();
    const results = await db.batch([
      db.prepare(
        "INSERT INTO submissions (id, claim_id, cultivator_id, artifact_key, artifact_sha256, state, verdict, created_at) SELECT ?, id, ?, ?, ?, 'awaiting_review', ?, ? FROM claims WHERE id = ? AND cultivator_id = ? AND state = 'running' AND expires_at > ?"
      ).bind(id, cultivator.id, key, source.fileSha256, JSON.stringify(verdict), now, claim.id, cultivator.id, now),
      db.prepare(ARTIFACT_INSERT_SQL).bind(key, id, content, contentSha256, now, id, key),
      db.prepare(
        "UPDATE claims SET state = 'review' WHERE id = ? AND cultivator_id = ? AND state = 'running' AND expires_at > ? AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'awaiting_review')"
      ).bind(claim.id, cultivator.id, now, id),
    ]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1 || results[2].meta.changes !== 1) {
      return Response.json({ error: "任务状态已变化，请刷新后重试" }, { status: 409 });
    }
  } catch {
    return Response.json({ error: "代码提交暂不可用，请稍后重试" }, { status: 503 });
  }
  return Response.json({ submission: { id, state: "awaiting_review", pullRequest: source.url } }, { status: 201 });
}
