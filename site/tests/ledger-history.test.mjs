import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LEDGER_BALANCES_SQL, LEDGER_EVENTS_SQL, ledgerSourceLabel } from "../lib/ledger-history.ts";

test("administrator Token adjustment is distinct from task rewards in the ledger", () => {
  assert.equal(ledgerSourceLabel("admin-adjustment:request-1"), "管理员双人调账");
});

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ledger_events (id TEXT PRIMARY KEY, cultivator_id TEXT NOT NULL, resource TEXT NOT NULL, delta INTEGER NOT NULL, source_key TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(source_key, resource))");
  return db;
}

test("ledger history isolates accounts and pages equal timestamps without losing events", () => {
  const db = database();
  try {
    db.exec(`
      INSERT INTO ledger_events VALUES
        ('a','author','token',100,'claim:verified',10),
        ('b','author','token',-20,'equipment:author:bag:v1',10),
        ('c','author','token_locked',10,'claim:deposit:locked',9),
        ('d','other','token',999,'other:verified',11);
    `);
    assert.deepEqual({ ...db.prepare(LEDGER_BALANCES_SQL).get("author") }, {
      token: 80, token_locked: 10, cultivation: 0, merit: 0, token_in: 100, token_out: 20,
    });
    const first = db.prepare(LEDGER_EVENTS_SQL).all("author", null, null, null, null, 2).map((row) => row.id);
    const second = db.prepare(LEDGER_EVENTS_SQL).all("author", 10, 10, 10, "a", 2).map((row) => row.id);
    assert.deepEqual(first, ["b", "a"]);
    assert.deepEqual(second, ["c"]);
    assert.equal(ledgerSourceLabel("equipment:author:bag:v1"), "装备购买");
  } finally {
    db.close();
  }
});

test("ledger migration blocks edits and deletion but permits new events", () => {
  const db = database();
  try {
    const migration = readFileSync(new URL("../drizzle/0007_ledger_immutable.sql", import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) db.exec(statement);
    db.exec("INSERT INTO ledger_events VALUES ('a','author','token',5,'reward:a',1)");
    assert.throws(() => db.exec("UPDATE ledger_events SET delta = 100 WHERE id = 'a'"), /append only/);
    assert.throws(() => db.exec("DELETE FROM ledger_events WHERE id = 'a'"), /append only/);
    assert.equal(db.prepare("SELECT delta FROM ledger_events WHERE id = 'a'").get().delta, 5);
    assert.equal(db.prepare("INSERT OR IGNORE INTO ledger_events VALUES ('b','author','token',5,'reward:a',2)").run().changes, 0);
  } finally {
    db.close();
  }
});
