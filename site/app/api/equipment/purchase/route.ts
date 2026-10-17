import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { EQUIPMENT_CATALOG_VERSION, getEquipmentItem } from "@/lib/equipment";
import { readSmallJson } from "@/lib/small-json";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return Response.json({ error: "请先登录" }, { status: 401 });
  const input = await readSmallJson(request) as { itemId?: unknown; expectedPrice?: unknown; catalogVersion?: unknown } | null;
  const item = typeof input?.itemId === "string" ? getEquipmentItem(input.itemId) : undefined;
  if (!item) return Response.json({ error: "装备不存在" }, { status: 400 });
  const quoted = input?.expectedPrice !== undefined || input?.catalogVersion !== undefined;
  if (quoted && (typeof input?.expectedPrice !== "number" || !Number.isSafeInteger(input.expectedPrice) || input.expectedPrice < 0 ||
      typeof input.catalogVersion !== "number" || !Number.isSafeInteger(input.catalogVersion) || input.catalogVersion < 1)) {
    return Response.json({ error: "购买确认信息无效，请刷新后重新核对" }, { status: 400 });
  }
  if (quoted && (input?.expectedPrice !== item.price || input?.catalogVersion !== EQUIPMENT_CATALOG_VERSION)) {
    return Response.json({ error: "装备目录或价格已变更，请刷新后重新确认购买" }, { status: 409 });
  }

  const db = database();
  const inventoryId = crypto.randomUUID();
  const now = Date.now();
  const sourceKey = `equipment:${cultivator.id}:${item.id}:v${EQUIPMENT_CATALOG_VERSION}`;
  try {
    const results = await db.batch([
      db.prepare(
        "INSERT INTO inventory (id, cultivator_id, item_id, acquired_at, price_paid, catalog_version, equipped_at) SELECT ?, ?, ?, ?, ?, ?, NULL WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE cultivator_id = ? AND item_id = ?) AND (SELECT COALESCE(SUM(delta), 0) FROM ledger_events WHERE cultivator_id = ? AND resource = 'token') >= ?"
      ).bind(inventoryId, cultivator.id, item.id, now, item.price, EQUIPMENT_CATALOG_VERSION, cultivator.id, item.id, cultivator.id, item.price),
      db.prepare(
        "INSERT INTO ledger_events (id, cultivator_id, resource, delta, source_key, created_at) SELECT ?, ?, 'token', ?, ?, ? WHERE EXISTS (SELECT 1 FROM inventory WHERE id = ? AND cultivator_id = ?)"
      ).bind(crypto.randomUUID(), cultivator.id, -item.price, sourceKey, now, inventoryId, cultivator.id),
    ]);
    if (results[0].meta.changes !== 1) {
      return Response.json({ error: "装备已拥有，或 Token 余额不足" }, { status: 409 });
    }
    if (results[1].meta.changes !== 1) throw new Error("装备扣款未完成");
    return Response.json({ itemId: item.id, pricePaid: item.price, catalogVersion: EQUIPMENT_CATALOG_VERSION }, { status: 201 });
  } catch {
    return Response.json({ error: "购买暂不可用，请稍后重试" }, { status: 503 });
  }
}
