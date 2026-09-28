import { env } from "cloudflare:workers";
import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { artifactSafetyIssues } from "@/lib/artifact-safety";
import { rejectForeignMutation } from "@/lib/request-origin";
import { readSmallJson } from "@/lib/small-json";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const reviewer = await getCurrentCultivator();
  const approvedId: unknown = Reflect.get(env, "RECOVERY_APPROVER_GITHUB_ID");
  if (!reviewer || reviewer.provider !== "github" || typeof approvedId !== "string" ||
      !/^[1-9]\d*$/.test(approvedId) || reviewer.provider_id !== approvedId) {
    return Response.json({ error: "需要独立的追回复核人" }, { status: 403 });
  }
  const input = await readSmallJson(request) as { reason?: unknown } | null;
  if (typeof input?.reason !== "string" || input.reason.trim().length < 20 ||
      input.reason.trim().length > 500 || artifactSafetyIssues(input.reason).length) {
    return Response.json({ error: "请说明 20–500 字独立复核理由" }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const result = await database().prepare(`
      INSERT INTO stable_reward_hold_releases (settlement_id, reviewed_by, reason, reviewed_at)
      SELECT r.settlement_id, ?, ?, ? FROM stable_reward_revocations r
      WHERE r.settlement_id = ? AND r.revoked_by != ? AND r.cultivator_id != ?
        AND NOT EXISTS (SELECT 1 FROM stable_reward_hold_releases h WHERE h.settlement_id = r.settlement_id)
    `).bind(reviewer.id, input.reason.trim(), Date.now(), id, reviewer.id, reviewer.id).run();
    if (result.meta.changes !== 1) return Response.json({ error: "追回不存在、复核不独立或已经解除" }, { status: 409 });
    return Response.json({ id, state: "hold_released" });
  } catch { return Response.json({ error: "复核未确认，请核对独立身份与记录" }, { status: 409 }); }
}
