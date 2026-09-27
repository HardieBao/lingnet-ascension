import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MISSION_SEED_STATUS_SQL, missionSeedsReady } from "../lib/mission-seed.ts";

test("complete mission bootstrap is detected without a write", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE missions (id TEXT PRIMARY KEY, contract_ready INTEGER NOT NULL);
      CREATE TABLE mission_dependencies (mission_id TEXT NOT NULL, prerequisite_id TEXT NOT NULL);
    `);
    const status = () => db.prepare(MISSION_SEED_STATUS_SQL).get();
    assert.equal(missionSeedsReady(status()), false);
    db.exec(`
      INSERT INTO missions VALUES ('GOV-001', 1), ('GOV-002', 1), ('GOV-003', 0), ('GOV-004T', 1), ('PLAT-003C', 0);
      INSERT INTO mission_dependencies VALUES ('GOV-002', 'GOV-001'), ('GOV-003', 'GOV-001'),
        ('GOV-003', 'GOV-002'), ('GOV-004T', 'GOV-001'), ('PLAT-003C', 'GOV-001');
    `);
    assert.equal(missionSeedsReady(status()), false);
    db.exec("UPDATE missions SET contract_ready = 1 WHERE id = 'GOV-003'");
    assert.equal(missionSeedsReady(status()), true);
    db.exec("DELETE FROM mission_dependencies WHERE mission_id = 'GOV-002'");
    assert.equal(missionSeedsReady(status()), false);
  } finally {
    db.close();
  }
});
