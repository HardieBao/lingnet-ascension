import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const now = Date.now();
  const expiresAt = now + 2 * 60 * 60_000;
  const result = await database().prepare(
    "UPDATE claims SET state = 'running', started_at = ?, expires_at = ? WHERE id = ? AND cultivator_id = ? AND state = 'claimed' AND expires_at > ?"
  ).bind(now, expiresAt, id, cultivator.id, now).run();
  if (result.meta.changes !== 1) return Response.json({ error: "认领已失效或无法开跑" }, { status: 409 });
  return Response.json({ id, state: "running", expiresAt });
}
