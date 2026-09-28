import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ECONOMY_AUDIT_SQL, economyAuditProblems } from "../lib/economy-audit.ts";

test("economy audit finds negative balances and mismatched active deposits", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE cultivators (id TEXT PRIMARY KEY);
      CREATE TABLE ledger_events (id TEXT PRIMARY KEY, cultivator_id TEXT NOT NULL, resource TEXT NOT NULL, delta INTEGER NOT NULL);
      CREATE TABLE claims (id TEXT PRIMARY KEY, cultivator_id TEXT NOT NULL, state TEXT NOT NULL, reward_snapshot TEXT NOT NULL);
      CREATE TABLE realm_trials (cultivator_id TEXT NOT NULL, state TEXT NOT NULL, fee INTEGER NOT NULL);
      INSERT INTO cultivators VALUES ('sound'), ('mismatch'), ('negative'), ('negative_merit'), ('invalid');
      INSERT INTO ledger_events VALUES
        ('s1','sound','token',100),('s2','sound','token',-10),('s3','sound','token_locked',10),
        ('m1','mismatch','token_locked',5),('n1','negative','token',-1),('n2','negative_merit','merit',-1),('i1','invalid','unknown',1);
      INSERT INTO claims VALUES
        ('s','sound','running','{"deposit":10}'),
        ('m','mismatch','approved','{"deposit":10}'),
        ('i','invalid','claimed','broken json');
    `);
    const rows = db.prepare(ECONOMY_AUDIT_SQL).all().map((row) => ({ ...row }));
    assert.deepEqual(rows[4], { cultivator_id: "sound", token_balance: 90, locked_balance: 10, cultivation_balance: 0, merit_balance: 0, expected_locked: 10, invalid_snapshots: 0, unknown_resources: 0 });
    assert.deepEqual(economyAuditProblems(rows).map((row) => row.cultivator_id), ["invalid", "mismatch", "negative", "negative_merit"]);
  } finally {
    db.close();
  }
});

test("new ledger events cannot make a resource balance negative", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE ledger_events (id TEXT PRIMARY KEY, cultivator_id TEXT NOT NULL, resource TEXT NOT NULL, delta INTEGER NOT NULL)");
    db.exec(readFileSync(new URL("../drizzle/0008_nonnegative_ledger.sql", import.meta.url), "utf8"));
    assert.throws(() => db.exec("INSERT INTO ledger_events VALUES ('a','one','token',-1)"), /cannot be negative/);
    db.exec("INSERT INTO ledger_events VALUES ('b','one','token',5)");
    db.exec("INSERT INTO ledger_events VALUES ('c','one','token',-5)");
    assert.throws(() => db.exec("INSERT INTO ledger_events VALUES ('d','one','token_locked',-1)"), /cannot be negative/);
    db.exec("INSERT INTO ledger_events VALUES ('e','one','token_locked',3)");
    db.exec("INSERT INTO ledger_events VALUES ('f','one','token_locked',-3)");
    assert.equal(db.prepare("SELECT SUM(delta) AS balance FROM ledger_events WHERE cultivator_id='one' AND resource='token_locked'").get().balance, 0);
  } finally {
    db.close();
  }
});
