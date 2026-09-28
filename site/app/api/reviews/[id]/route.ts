import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { artifactSafetyIssues } from "@/lib/artifact-safety";
import { heartbeatExpiry } from "@/lib/claim-lease";
import { rejectForeignMutation } from "@/lib/request-origin";
import { REVIEW_REJECT_REFUND_SQL } from "@/lib/review-refund";
import { readSmallJson } from "@/lib/small-json";

type ReviewRow = {
  id: string;
  claim_id: string;
  mission_id: string;
  cultivator_id: string;
  state: string;
  reward_snapshot: string;
  started_at: number | null;
  rank: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const reviewer = await getCurrentCultivator();
  if (!reviewer || !isMaintainer(reviewer)) return Response.json({ error: "需要维护者权限" }, { status: 403 });
  const input = await readSmallJson(request) as { decision?: unknown; reason?: unknown } | null;
  if (!input || !["accept", "revise", "reject"].includes(String(input.decision)) || typeof input.reason !== "string" || input.reason.trim().length < 8) {
    return Response.json({ error: "请提供决定和至少 8 个字符的理由" }, { status: 400 });
  }
  if (artifactSafetyIssues(input.reason).length) return Response.json({ error: "复核理由不能包含密钥或私人凭据，请仅说明处理依据" }, { status: 400 });
  const { id } = await context.params;
  const db = database();
  const submission = await db.prepare(
    "SELECT s.id, s.claim_id, c.mission_id, s.cultivator_id, s.state, c.reward_snapshot, c.started_at, m.rank FROM submissions s JOIN claims c ON c.id = s.claim_id JOIN missions m ON m.id = c.mission_id WHERE s.id = ?"
  ).bind(id).first<ReviewRow>();
  if (!submission || !["awaiting_review", "frozen"].includes(submission.state)) return Response.json({ error: "提交不在待复核状态" }, { status: 409 });
  if (submission.cultivator_id === reviewer.id) return Response.json({ error: "不能复核自己的成果" }, { status: 403 });
  const now = Date.now();
  const decision = input.decision as "accept" | "revise" | "reject";
  const frozen = submission.state === "frozen";
  const claimState = frozen ? "frozen" : "review";
  if (frozen && decision === "accept") return Response.json({ error: "冻结成果不能批准，请独立复核后允许重新上传或驳回" }, { status: 409 });
  const revisionExpiry = decision === "revise" ? heartbeatExpiry(now, submission.started_at, submission.rank) : null;
  if (decision === "revise" && revisionExpiry === null) {
    return Response.json({ error: frozen ? "任务已超过累计运行期限，不能恢复；请驳回冻结成果" : "任务已超过累计运行期限，不能再次开跑；请接受或驳回现有成果" }, { status: 409 });
  }
  const nextState = decision === "accept" ? "approved" : decision === "revise" ? "needs_revision" : "rejected";
  const snapshot = JSON.parse(submission.reward_snapshot) as { deposit: number; token: number; cultivation: number; merit: number };
  if ([snapshot.deposit, snapshot.token, snapshot.cultivation, snapshot.merit].some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
    return Response.json({ error: "认领记录缺少已锁定的奖励" }, { status: 409 });
  }
  const statements = [
    db.prepare(
      "UPDATE submissions SET state = ?, reviewer_id = ?, review_reason = ?, reviewed_at = ? WHERE id = ? AND state = ? AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = ?)"
    ).bind(nextState, reviewer.id, input.reason.trim(), now, id, submission.state, submission.claim_id, claimState),
  ];
  if (decision === "accept") {
    statements.push(
      db.prepare("UPDATE claims SET state = 'approved' WHERE id = ? AND state = 'review' AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'approved' AND reviewer_id = ?)")
        .bind(submission.claim_id, id, reviewer.id)
    );
    for (const [resource, amount] of [
      ["token", snapshot.token],
      ["cultivation", snapshot.cultivation],
      ["merit", snapshot.merit],
    ] as const) {
      statements.push(db.prepare(
        "INSERT OR IGNORE INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = 'approved' AND reviewer_id = ?) AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = 'approved')"
      ).bind(crypto.randomUUID(), submission.cultivator_id, resource, amount, `${submission.claim_id}:verified`, now, id, reviewer.id, submission.claim_id));
    }
  } else {
    statements.push(db.prepare(
      "UPDATE claims SET state = ?, expires_at = ? WHERE id = ? AND state = ? AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = ? AND reviewer_id = ?)"
    ).bind(decision === "revise" ? "running" : "rejected", revisionExpiry ?? now + 2 * 60 * 60_000, submission.claim_id, claimState, id, nextState, reviewer.id));
  }
  if (frozen) {
    statements.push(db.prepare(
      "UPDATE missions SET state = 'open' WHERE id = ? AND state = 'frozen' AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND state = ? AND reviewer_id = ?) AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND state = ?)"
    ).bind(submission.mission_id, id, nextState, reviewer.id, submission.claim_id, decision === "revise" ? "running" : "rejected"));
  }
  if (snapshot.deposit > 0 && decision === "reject") {
    for (const [resource, delta, sourceKey] of [
      ["token", snapshot.deposit, `${submission.claim_id}:review:refund`],
      ["token_locked", -snapshot.deposit, `${submission.claim_id}:review:unlock`],
    ] as const) {
      statements.push(db.prepare(REVIEW_REJECT_REFUND_SQL).bind(
        crypto.randomUUID(), submission.cultivator_id, resource, delta, sourceKey, now,
        id, reviewer.id, submission.claim_id, submission.cultivator_id,
        submission.cultivator_id, `${submission.claim_id}:deposit:locked`, snapshot.deposit
      ));
    }
  }
  const results = await db.batch(statements);
  if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) return Response.json({ error: "提交已被复核或任务状态已变化" }, { status: 409 });
  return Response.json({ id, state: nextState });
}
