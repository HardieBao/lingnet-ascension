import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { GOV003_GATE_BACKFILL_SQL, UNLOCK_READY_MISSIONS_SQL } from "../lib/mission-unlock.ts";

test("dependency graph unlocks only published tasks with all formal prerequisites", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE missions (id TEXT PRIMARY KEY, state TEXT NOT NULL, base_commit TEXT NOT NULL);
      CREATE TABLE claims (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL);
      CREATE TABLE submissions (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, state TEXT NOT NULL, integrated_commit TEXT, integrated_at INTEGER);
    `);
    const migration = readFileSync(new URL("../drizzle/0005_small_king_cobra.sql", import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) db.exec(statement);
    db.exec(readFileSync(new URL("../drizzle/0006_jittery_cobalt_man.sql", import.meta.url), "utf8").replaceAll("--> statement-breakpoint", "\n"));
    db.exec(`
      INSERT INTO missions (id, state, base_commit, contract_ready) VALUES
        ('GOV-001', 'open', 'initial', 1),
        ('GOV-002', 'blocked', 'initial', 1),
        ('GOV-003', 'blocked', 'initial', 0),
        ('GOV-004T', 'blocked', 'initial', 1),
        ('UNPUBLISHED', 'blocked', 'initial', 1);
      INSERT INTO mission_dependencies VALUES ('GOV-002', 'GOV-001'), ('GOV-003', 'GOV-001'), ('GOV-003', 'GOV-002'), ('GOV-004T', 'GOV-001');
    `);
    const state = (id) => ({ ...db.prepare("SELECT state, base_commit FROM missions WHERE id = ?").get(id) });
    db.exec(UNLOCK_READY_MISSIONS_SQL);
    assert.equal(state("GOV-002").state, "blocked");
    assert.equal(state("GOV-004T").state, "blocked");

    db.exec("INSERT INTO claims VALUES ('claim-1', 'GOV-001')");
    db.prepare("INSERT INTO submissions VALUES ('submission-1', 'claim-1', 'accepted', ?, 1)").run("a".repeat(40));
    db.exec(UNLOCK_READY_MISSIONS_SQL);
    assert.equal(state("GOV-002").state, "blocked");
    assert.equal(state("GOV-004T").state, "blocked");

    db.exec("UPDATE missions SET state = 'done' WHERE id = 'GOV-001'");
    db.exec(UNLOCK_READY_MISSIONS_SQL);
    assert.deepEqual(state("GOV-002"), { state: "open", base_commit: "a".repeat(40) });
    assert.deepEqual(state("GOV-004T"), { state: "open", base_commit: "a".repeat(40) });

    db.exec("UPDATE missions SET state = 'done' WHERE id = 'GOV-002'");
    db.exec("INSERT INTO claims VALUES ('claim-2', 'GOV-002')");
    db.prepare("INSERT INTO submissions VALUES ('submission-2', 'claim-2', 'accepted', ?, 2)").run("b".repeat(40));
    db.exec(UNLOCK_READY_MISSIONS_SQL);
    assert.equal(state("GOV-003").state, "blocked");
    assert.equal(state("UNPUBLISHED").state, "blocked");

    db.exec("UPDATE missions SET contract_ready = 1, required_realm = 'foundation', required_merit = 50 WHERE id = 'GOV-003'");
    assert.equal(db.prepare(GOV003_GATE_BACKFILL_SQL).run("mortal", 0).changes, 1);
    db.exec(UNLOCK_READY_MISSIONS_SQL);
    assert.deepEqual(state("GOV-003"), { state: "open", base_commit: "b".repeat(40) });
    assert.deepEqual({ ...db.prepare("SELECT required_realm, required_merit FROM missions WHERE id = 'GOV-003'").get() }, { required_realm: "mortal", required_merit: 0 });
  } finally {
    db.close();
  }
});
