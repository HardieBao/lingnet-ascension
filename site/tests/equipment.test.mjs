import assert from "node:assert/strict";
import test from "node:test";
import { BASE_ACTIVE_CLAIM_LIMIT, EQUIPMENT_CATALOG_VERSION, SPLIT_MIND_ACTIVE_CLAIM_LIMIT, SPLIT_MIND_PENDANT_ID, equipmentCatalog, getEquipmentItem } from "../lib/equipment.ts";

test("season-one catalog has six unique, priced items", () => {
  assert.equal(EQUIPMENT_CATALOG_VERSION, 1);
  assert.equal(equipmentCatalog.length, 6);
  assert.equal(new Set(equipmentCatalog.map((item) => item.id)).size, 6);
  assert.deepEqual(equipmentCatalog.map((item) => [item.name, item.price]), [
    ["初级储物袋", 200], ["天机镜", 350], ["演算阵盘", 500],
    ["护心符", 300], ["分神玉佩", 1200], ["传功玉简", 800],
  ]);
  assert.equal(getEquipmentItem("not-an-item"), undefined);
  assert.equal(BASE_ACTIVE_CLAIM_LIMIT, 1);
  assert.equal(SPLIT_MIND_ACTIVE_CLAIM_LIMIT, 2);
  assert.equal(getEquipmentItem(SPLIT_MIND_PENDANT_ID)?.name, "分神玉佩");
});
