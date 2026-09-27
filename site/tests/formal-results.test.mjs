import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { FORMAL_RESULTS_COUNT_SUBQUERY } from "../lib/formal-results.ts";
import { ADVANCE_QI_INSERT_SQL } from "../lib/realm-advance.ts";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE cultivators (id TEXT PRIMARY KEY, realm TEXT NOT NULL);
    CREATE TABLE ledger_events (cultivator_id TEXT NOT NULL, resource TEXT NOT NULL, delta INTEGER NOT NULL);
    CREATE TABLE missions (id TEXT PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE claims (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, state TEXT NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, state TEXT NOT NULL, integrated_commit TEXT, integrated_at INTEGER);
    CREATE TABLE realm_events (id TEXT PRIMARY KEY, cultivator_id TEXT NOT NULL, from_realm TEXT NOT NULL, to_realm TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(cultivator_id, to_realm));
    INSERT INTO cultivators VALUES ('author','mortal'), ('other','mortal');
    INSERT INTO ledger_events VALUES ('author','cultivation',100), ('author','merit',5);
    INSERT INTO missions VALUES ('M1','done'), ('M2','done');
    INSERT INTO claims VALUES ('C1','M1','author','completed'), ('C2','M1','author','completed'), ('C3','M2','author','completed');
  `);
  return db;
}

test("formal result count requires accepted integration and deduplicates missions", () => {
  const db = database();
  const count = () => db.prepare(`SELECT ${FORMAL_RESULTS_COUNT_SUBQUERY} AS count`).get("author").count;
  try {
    assert.equal(count(), 0);
    db.exec("INSERT INTO submissions VALUES ('S1','C1','author','accepted',NULL,NULL)");
    assert.equal(count(), 0);
    db.exec("UPDATE submissions SET integrated_commit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' WHERE id = 'S1'");
    assert.equal(count(), 0);
    db.exec("UPDATE submissions SET integrated_at = 1 WHERE id = 'S1'");
    assert.equal(count(), 1);
    db.exec("UPDATE missions SET state = 'open' WHERE id = 'M1'");
    assert.equal(count(), 0);
    db.exec("UPDATE missions SET state = 'done' WHERE id = 'M1'");
    db.exec("INSERT INTO submissions VALUES ('S2','C2','author','accepted','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',2)");
    assert.equal(count(), 1);
    db.exec("INSERT INTO submissions VALUES ('S3','C3','other','accepted','cccccccccccccccccccccccccccccccccccccccc',3)");
    assert.equal(count(), 1);
    db.exec("UPDATE submissions SET cultivator_id = 'author' WHERE id = 'S3'");
    assert.equal(count(), 2);
  } finally {
    db.close();
  }
});

test("qi breakthrough cannot use a completed claim without formal evidence", () => {
  const db = database();
  const advance = (id) => db.prepare(ADVANCE_QI_INSERT_SQL).run(id, 1, "author", "author", "author", "author", "author").changes;
  try {
    assert.equal(advance("E1"), 0);
    db.exec("INSERT INTO submissions VALUES ('S1','C1','author','approved',NULL,NULL)");
    assert.equal(advance("E2"), 0);
    db.exec("UPDATE submissions SET state='accepted',integrated_commit='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',integrated_at=2 WHERE id='S1'");
    assert.equal(advance("E3"), 1);
    assert.equal(advance("E4"), 0);
  } finally {
    db.close();
  }
});
