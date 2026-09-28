import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { HEARTBEAT_UPDATE_SQL, heartbeatExpiry } from "@/lib/claim-lease";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const now = Date.now();
  const db = database();
  const claim = await db.prepare(
    "SELECT c.started_at, m.rank FROM claims c JOIN missions m ON m.id = c.mission_id WHERE c.id = ? AND c.cultivator_id = ? AND c.state = 'running' AND c.expires_at > ?"
  ).bind(id, cultivator.id, now).first<{ started_at: number | null; rank: string }>();
  const expiresAt = claim ? heartbeatExpiry(now, claim.started_at, claim.rank) : null;
  if (!claim || expiresAt === null || claim.started_at === null) {
    return Response.json({ error: "租约已达任务时限或已失效" }, { status: 409 });
  }
  const result = await db.prepare(HEARTBEAT_UPDATE_SQL)
    .bind(expiresAt, id, cultivator.id, now, claim.started_at, claim.rank).run();
  if (result.meta.changes !== 1) return Response.json({ error: "租约已失效" }, { status: 409 });
  return Response.json({ id, expiresAt });
}
