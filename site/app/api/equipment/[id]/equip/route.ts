import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { getEquipmentItem } from "@/lib/equipment";
import { readSmallJson } from "@/lib/small-json";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  if (!getEquipmentItem(id)) return Response.json({ error: "装备不存在" }, { status: 404 });
  const input = await readSmallJson(request) as { equipped?: unknown } | null;
  if (typeof input?.equipped !== "boolean") return Response.json({ error: "装备状态无效" }, { status: 400 });
  const equippedAt = input.equipped ? Date.now() : null;
  const result = await database().prepare(
    "UPDATE inventory SET equipped_at = ? WHERE cultivator_id = ? AND item_id = ?"
  ).bind(equippedAt, cultivator.id, id).run();
  if (result.meta.changes !== 1) return Response.json({ error: "尚未拥有该装备" }, { status: 404 });
  return Response.json({ itemId: id, equipped: input.equipped });
}
