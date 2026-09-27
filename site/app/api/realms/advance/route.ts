import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { ADVANCE_QI_INSERT_SQL } from "@/lib/realm-advance";
import { getRealmState } from "@/lib/realm-state";
import { readSmallJson } from "@/lib/small-json";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const input = await readSmallJson(request) as { target?: unknown } | null;
  if (!input || typeof input.target !== "string" || !["qi", "foundation", "core"].includes(input.target)) {
    return Response.json({ error: "目标境界无效" }, { status: 400 });
  }
  if (input.target !== "qi") {
    return Response.json({ error: "专属渡劫尚未开放，Token 不会被预先冻结" }, { status: 409 });
  }
  const state = await getRealmState(cultivator.id);
  if (state.realm !== "mortal" || !state.next.eligible) {
    return Response.json({ error: "尚未满足炼气条件，或已经突破", missing: state.next.missing }, { status: 409 });
  }
  const db = database();
  const eventId = crypto.randomUUID();
  const now = Date.now();
  try {
    const results = await db.batch([
      db.prepare(ADVANCE_QI_INSERT_SQL).bind(eventId, now, cultivator.id, cultivator.id, cultivator.id, cultivator.id, cultivator.id),
      db.prepare(
        "UPDATE cultivators SET realm = 'qi' WHERE id = ? AND realm = 'mortal' AND EXISTS (SELECT 1 FROM realm_events WHERE id = ? AND cultivator_id = ?)"
      ).bind(cultivator.id, eventId, cultivator.id),
    ]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      return Response.json({ error: "突破状态已变化，请刷新后重试" }, { status: 409 });
    }
    return Response.json({ realm: "qi", name: "炼气" });
  } catch {
    return Response.json({ error: "突破已完成或资格状态变化，请刷新后重试" }, { status: 409 });
  }
}
