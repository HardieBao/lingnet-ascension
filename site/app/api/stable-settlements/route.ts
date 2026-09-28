import { env } from "cloudflare:workers";
import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { artifactSafetyIssues } from "@/lib/artifact-safety";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";
import { inspectStableVersions } from "@/lib/stable-versions";
import type { StableReward } from "@/lib/rewards";

type Target = {
  claim_id: string; cultivator_id: string; reward_snapshot: string; artifact_path: string;
  artifact_sha256: string; integrated_commit: string; integrated_at: number;
};

export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const reviewer = await getCurrentCultivator();
  if (!reviewer || !isMaintainer(reviewer)) return Response.json({ error: "需要独立维护者权限" }, { status: 403 });
  if (Reflect.get(env, "ENABLE_STABLE_SETTLEMENTS") !== "true") {
    return Response.json({ error: "稳定奖励结算尚未开放" }, { status: 503 });
  }
  const input = await readSmallJson(request) as { submissionId?: unknown; firstTag?: unknown; secondTag?: unknown; reason?: unknown } | null;
  if (typeof input?.submissionId !== "string" || typeof input.firstTag !== "string" ||
      typeof input.secondTag !== "string" || typeof input.reason !== "string" ||
      input.reason.trim().length < 20 || input.reason.trim().length > 500 || artifactSafetyIssues(input.reason).length) {
    return Response.json({ error: "请提供正式成果、两个版本和 20–500 字独立核对理由" }, { status: 400 });
  }
  const db = database();
  const target = await db.prepare(`
    SELECT c.id AS claim_id, s.cultivator_id, c.reward_snapshot,
      json_extract(c.reward_snapshot, '$.allowedPaths') AS artifact_path,
      lower(s.artifact_sha256) AS artifact_sha256, lower(s.integrated_commit) AS integrated_commit,
      s.integrated_at
    FROM submissions s JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id
      JOIN missions m ON m.id = c.mission_id
    WHERE s.id = ? AND s.state = 'accepted' AND c.state = 'completed' AND m.state = 'done'
      AND json_valid(c.reward_snapshot) AND s.integrated_at IS NOT NULL
  `).bind(input.submissionId).first<Target>();
  if (!target) return Response.json({ error: "没有可结算的正式成果" }, { status: 409 });
  if (target.cultivator_id === reviewer.id) return Response.json({ error: "作者不能核对自己的稳定奖励" }, { status: 403 });
  let snapshot: { stable?: StableReward };
  try { snapshot = JSON.parse(target.reward_snapshot); } catch { return Response.json({ error: "认领奖励快照无效" }, { status: 409 }); }
  if (!snapshot || typeof snapshot !== "object") return Response.json({ error: "认领奖励快照无效" }, { status: 409 });
  const stable = snapshot.stable;
  if (!stable || stable.policyVersion !== 1 || stable.minimumVersionGapMs !== 604800000 ||
      [stable.token, stable.cultivation, stable.merit].some((value) => !Number.isSafeInteger(value) || value < 0) ||
      typeof target.artifact_path !== "string") {
    return Response.json({ error: "旧认领或缺少锁定的稳定奖励" }, { status: 409 });
  }
  let proof;
  try {
    proof = await inspectStableVersions({ firstTag: input.firstTag, secondTag: input.secondTag,
      integratedCommit: target.integrated_commit, integratedAt: target.integrated_at,
      artifactPath: target.artifact_path, artifactSha256: target.artifact_sha256,
      minimumVersionGapMs: stable.minimumVersionGapMs });
  } catch {
    return Response.json({ error: "暂时无法核验公开版本，未发放奖励" }, { status: 502 });
  }
  if (!proof.passed) return Response.json({ error: proof.reason }, { status: 409 });
  const id = crypto.randomUUID(), now = Date.now();
  try {
    const statements = [db.prepare(`
      INSERT INTO stable_reward_settlements (id, submission_id, claim_id, cultivator_id,
        first_release_id, first_tag, first_commit, first_published_at,
        second_release_id, second_tag, second_commit, second_published_at,
        artifact_sha256, token, cultivation, merit, reviewed_by, review_reason, settled_at)
      SELECT ?, s.id, c.id, s.cultivator_id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM submissions s JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id
        JOIN missions m ON m.id = c.mission_id
      WHERE s.id = ? AND s.state = 'accepted' AND c.state = 'completed' AND m.state = 'done'
        AND lower(s.artifact_sha256) = ? AND lower(s.integrated_commit) = ?
        AND c.reward_snapshot = ? AND s.integrated_at = ? AND s.cultivator_id != ?
    `).bind(id, proof.proof.first.releaseId, proof.proof.first.tag, proof.proof.first.commit, proof.proof.first.publishedAt,
      proof.proof.second.releaseId, proof.proof.second.tag, proof.proof.second.commit, proof.proof.second.publishedAt,
      target.artifact_sha256, stable.token, stable.cultivation, stable.merit, reviewer.id, input.reason.trim(), now,
      input.submissionId, target.artifact_sha256, target.integrated_commit, target.reward_snapshot, target.integrated_at, reviewer.id)];
    for (const [resource, amount] of [["token", stable.token], ["cultivation", stable.cultivation], ["merit", stable.merit]] as const) {
      if (amount > 0) statements.push(db.prepare(`
        INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at)
        SELECT ?, cultivator_id, ?, ?, ?, ? FROM stable_reward_settlements WHERE id = ?
      `).bind(crypto.randomUUID(), resource, amount, `${target.claim_id}:stable`, now, id));
    }
    const result = await db.batch(statements);
    if (result[0].meta.changes !== 1) return Response.json({ error: "正式成果状态已变化" }, { status: 409 });
    return Response.json({ id, state: "settled" }, { status: 201 });
  } catch {
    return Response.json({ error: "稳定奖励已结算或账本状态已变化" }, { status: 409 });
  }
}
