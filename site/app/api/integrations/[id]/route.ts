import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { verifyCodeIntegration, type CodeReviewSource } from "@/lib/code-integration";
import { verifyMissionIntegration } from "@/lib/github-integration";
import { UNLOCK_READY_MISSIONS_SQL } from "@/lib/mission-unlock";
import { artifactPathForMission } from "@/lib/verifier";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";

type IntegrationRow = {
  id: string;
  claim_id: string;
  cultivator_id: string;
  mission_id: string;
  state: string;
  claim_state: string;
  artifact_sha256: string;
  verdict: string | null;
  reward_snapshot: string;
  author_provider: string;
  author_provider_id: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const maintainer = await getCurrentCultivator();
  if (!maintainer || !isMaintainer(maintainer)) return Response.json({ error: "需要维护者权限" }, { status: 403 });
  const input = await readSmallJson(request) as { commit?: unknown } | null;
  if (typeof input?.commit !== "string" || !/^[a-f0-9]{40}$/i.test(input.commit)) {
    return Response.json({ error: "请输入完整的 Git 提交 SHA" }, { status: 400 });
  }
  const { id } = await context.params;
  const db = database();
  const submission = await db.prepare(
    "SELECT s.id, s.claim_id, s.cultivator_id, s.state, s.artifact_sha256, s.verdict, c.mission_id, c.state AS claim_state, c.reward_snapshot, u.provider AS author_provider, u.provider_id AS author_provider_id FROM submissions s JOIN claims c ON c.id = s.claim_id JOIN cultivators u ON u.id = s.cultivator_id WHERE s.id = ?"
  ).bind(id).first<IntegrationRow>();
  if (!submission || submission.state !== "approved" || submission.claim_state !== "approved") {
    return Response.json({ error: "成果尚未批准或已完成合入" }, { status: 409 });
  }
  if (submission.cultivator_id === maintainer.id) return Response.json({ error: "作者不能确认自己的正式成果" }, { status: 403 });
  const snapshot = JSON.parse(submission.reward_snapshot) as { officialToken?: number; deposit?: number };
  const officialToken = snapshot.officialToken;
  const deposit = snapshot.deposit;
  if (typeof officialToken !== "number" || !Number.isSafeInteger(officialToken) || officialToken < 0 ||
      typeof deposit !== "number" || !Number.isSafeInteger(deposit) || deposit < 0) {
    return Response.json({ error: "认领记录缺少已锁定的奖励" }, { status: 409 });
  }
  let check;
  try {
    if (artifactPathForMission(submission.mission_id)) {
      check = await verifyMissionIntegration(submission.mission_id, input.commit, submission.artifact_sha256);
    } else {
      const contract = JSON.parse(submission.reward_snapshot) as { allowedPaths?: unknown; baseCommit?: unknown };
      const review = JSON.parse(submission.verdict ?? "null") as { passed?: boolean; source?: CodeReviewSource & {
        claimId?: unknown; baseCommit?: unknown; ciRunId?: unknown;
      } } | null;
      const source = review?.source;
      if (submission.author_provider !== "github" || review?.passed !== true || source?.kind !== "github-pr" ||
          source.claimId !== submission.claim_id || source.baseCommit !== contract.baseCommit ||
          source.filePath !== contract.allowedPaths || source.fileSha256 !== submission.artifact_sha256 ||
          !Number.isSafeInteger(source.ciRunId) || (source.ciRunId as number) < 1) {
        return Response.json({ error: "代码成果缺少与认领契约一致的 PR 复核证据" }, { status: 409 });
      }
      check = await verifyCodeIntegration(source, submission.author_provider_id, input.commit);
    }
  } catch {
    return Response.json({ error: "暂时无法核对 GitHub 合入状态" }, { status: 502 });
  }
  if (!check.passed) return Response.json({ error: check.reason }, { status: 409 });

  const now = Date.now();
  const statements = [
    db.prepare(
      "UPDATE submissions SET state = 'accepted', integrated_commit = ?, integrated_at = ? WHERE id = ? AND state = 'approved' AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = 'approved') AND EXISTS (SELECT 1 FROM missions WHERE id = ? AND state = 'open')"
    ).bind(input.commit, now, id, submission.claim_id, submission.mission_id),
    db.prepare(
      "UPDATE claims SET state = 'completed' WHERE id = ? AND state = 'approved' AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'accepted')"
    ).bind(submission.claim_id, id),
    db.prepare(
      "UPDATE missions SET state = 'done' WHERE id = ? AND state = 'open' AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'accepted')"
    ).bind(submission.mission_id, id),
    db.prepare(UNLOCK_READY_MISSIONS_SQL),
  ];
  if (officialToken > 0) {
    statements.push(db.prepare(
      "INSERT OR IGNORE INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, 'token', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'accepted')"
    ).bind(crypto.randomUUID(), submission.cultivator_id, officialToken, `${submission.claim_id}:official`, now, id));
  }
  if (deposit > 0) {
    statements.push(
      db.prepare(
        "INSERT OR IGNORE INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, 'token', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'accepted')"
      ).bind(crypto.randomUUID(), submission.cultivator_id, deposit, `${submission.claim_id}:integrated:refund`, now, id),
      db.prepare(
        "INSERT OR IGNORE INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, 'token_locked', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'accepted')"
      ).bind(crypto.randomUUID(), submission.cultivator_id, -deposit, `${submission.claim_id}:integrated:unlock`, now, id)
    );
  }
  const results = await db.batch(statements);
  if (results.slice(0, 3).some((result) => result.meta.changes !== 1)) {
    return Response.json({ error: "合入状态已变化，请刷新后重试" }, { status: 409 });
  }
  return Response.json({ id, state: "accepted", commit: input.commit });
}
