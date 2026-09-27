import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { getClaim } from "@/lib/claims";
import { CALCULATION_ARRAY_ID } from "@/lib/equipment";
import { getMission } from "@/lib/missions";
import { buildTaskPackage } from "@/lib/manifest";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const claim = await getClaim(id);
  if (!claim || claim.cultivator_id !== cultivator.id || claim.state !== "running" || claim.expires_at <= Date.now()) {
    return Response.json({ error: "认领无效、尚未开跑或已过期" }, { status: 409 });
  }
  const mission = await getMission(claim.mission_id);
  if (!mission) {
    return Response.json({ error: "该任务尚无可运行的任务包" }, { status: 409 });
  }
  const equipped = await database().prepare(
    "SELECT item_id FROM inventory WHERE cultivator_id = ? AND item_id IN (?, 'storage-bag', 'heart-talisman', 'teaching-slip') AND equipped_at IS NOT NULL"
  ).bind(cultivator.id, CALCULATION_ARRAY_ID).all<{ item_id: string }>();
  const items = new Set(equipped.results.map((row) => row.item_id));
  let taskPackage;
  try {
    taskPackage = await buildTaskPackage(claim, mission, { calculationArrayEquipped: items.has(CALCULATION_ARRAY_ID),
      storageBagEquipped: items.has("storage-bag"), heartTalismanEquipped: items.has("heart-talisman"), teachingSlipEquipped: items.has("teaching-slip") });
  } catch {
    return Response.json({ error: "该任务尚无可运行的任务包" }, { status: 409 });
  }
  return Response.json(taskPackage, {
    headers: {
      "Content-Disposition": `attachment; filename="lingnet-${mission.id}-${claim.id}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
