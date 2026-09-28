import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { EQUIPMENT_CATALOG_VERSION, equipmentCatalog } from "@/lib/equipment";

export async function GET() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) {
    return Response.json({ catalogVersion: EQUIPMENT_CATALOG_VERSION, items: equipmentCatalog, inventory: [], tokenBalance: null });
  }
  const db = database();
  const [inventory, balance] = await Promise.all([
    db.prepare(
      "SELECT item_id, acquired_at, price_paid, catalog_version, equipped_at FROM inventory WHERE cultivator_id = ? ORDER BY acquired_at"
    ).bind(cultivator.id).all(),
    db.prepare(
      "SELECT COALESCE(SUM(delta), 0) AS balance FROM ledger_events WHERE cultivator_id = ? AND resource = 'token'"
    ).bind(cultivator.id).first<{ balance: number }>(),
  ]);
  return Response.json({
    catalogVersion: EQUIPMENT_CATALOG_VERSION,
    items: equipmentCatalog,
    inventory: inventory.results,
    tokenBalance: balance?.balance ?? 0,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
