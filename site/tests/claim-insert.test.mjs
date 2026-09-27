import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { CLAIM_INSERT_SQL } from "../lib/claim-insert.ts";
import { BASE_ACTIVE_CLAIM_LIMIT, SPLIT_MIND_ACTIVE_CLAIM_LIMIT, SPLIT_MIND_PENDANT_ID } from "../lib/equipment.ts";

test("equipped pendant grants two claim slots without bypassing mission or balance gates", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE cultivators (id TEXT PRIMARY KEY, realm TEXT NOT NULL);
      CREATE TABLE missions (id TEXT PRIMARY KEY, state TEXT NOT NULL, contract_ready INTEGER NOT NULL, required_realm TEXT NOT NULL, required_merit INTEGER NOT NULL);
      CREATE TABLE claims (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, state TEXT NOT NULL, claimed_at INTEGER NOT NULL, started_at INTEGER, expires_at INTEGER NOT NULL, reward_snapshot TEXT NOT NULL);
      CREATE TABLE inventory (cultivator_id TEXT NOT NULL, item_id TEXT NOT NULL, equipped_at INTEGER);
      CREATE TABLE ledger_events (cultivator_id TEXT NOT NULL, resource TEXT NOT NULL, delta INTEGER NOT NULL);
      INSERT INTO cultivators VALUES ('author', 'mortal'), ('other', 'mortal');
      INSERT INTO missions VALUES ('M1', 'open', 1, 'mortal', 0), ('M2', 'open', 1, 'mortal', 0),
        ('M3', 'open', 1, 'mortal', 0), ('M4', 'blocked', 1, 'mortal', 0), ('M5', 'open', 0, 'mortal', 0),
        ('M6', 'open', 1, 'qi', 5), ('M7', 'open', 1, 'foundation', 50),
        ('M8', 'open', 1, 'core', 200), ('M9', 'open', 1, 'unknown', 0);
    `);
    let sequence = 0;
    const claim = (missionId, deposit = 0, cultivatorId = "author") => db.prepare(CLAIM_INSERT_SQL).run(
      `claim-${++sequence}`, cultivatorId, 1, 1000, "{}", cultivatorId, missionId, missionId,
      cultivatorId, cultivatorId, SPLIT_MIND_PENDANT_ID, SPLIT_MIND_ACTIVE_CLAIM_LIMIT,
      BASE_ACTIVE_CLAIM_LIMIT, cultivatorId, deposit
    ).changes;

    assert.equal(claim("M1"), 1);
    assert.equal(claim("M2"), 0);
    assert.equal(claim("M1", 0, "other"), 0);
    db.exec("INSERT INTO inventory VALUES ('author', 'split-mind-pendant', NULL)");
    assert.equal(claim("M2"), 0);
    db.exec("UPDATE inventory SET equipped_at = 1 WHERE cultivator_id = 'author'");
    assert.equal(claim("M2"), 1);
    assert.equal(claim("M3"), 0);

    db.exec("UPDATE claims SET state = 'released' WHERE cultivator_id = 'author'");
    assert.equal(claim("M4"), 0);
    assert.equal(claim("M5"), 0);
    db.exec("INSERT INTO ledger_events VALUES ('author', 'token', 10)");
    assert.equal(claim("M3", 11), 0);
    assert.equal(claim("M3", 10), 1);

    db.exec("UPDATE claims SET state = 'released' WHERE cultivator_id = 'author'");
    assert.equal(claim("M6"), 0);
    db.exec("INSERT INTO ledger_events VALUES ('author', 'merit', 5)");
    assert.equal(claim("M6"), 0);
    db.exec("UPDATE cultivators SET realm = 'qi' WHERE id = 'author'");
    assert.equal(claim("M6"), 1);

    db.exec("UPDATE claims SET state = 'released' WHERE cultivator_id = 'author'");
    assert.equal(claim("M7"), 0);
    db.exec("UPDATE cultivators SET realm = 'foundation' WHERE id = 'author'");
    assert.equal(claim("M7"), 0);
    db.exec("INSERT INTO ledger_events VALUES ('author', 'merit', 44)");
    assert.equal(claim("M7"), 0);
    db.exec("INSERT INTO ledger_events VALUES ('author', 'merit', 1)");
    assert.equal(claim("M7"), 1);

    db.exec("UPDATE claims SET state = 'released' WHERE cultivator_id = 'author'");
    assert.equal(claim("M8"), 0);
    assert.equal(claim("M9"), 0);
  } finally {
    db.close();
  }
});
