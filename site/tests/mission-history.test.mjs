import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MISSION_FAILURE_SUMMARY_SQL } from "../lib/mission-history.ts";

test("mirror history counts only failure states without exposing review details", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE claims (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, state TEXT NOT NULL);
      CREATE TABLE submissions (claim_id TEXT NOT NULL, state TEXT NOT NULL, review_reason TEXT);
      INSERT INTO claims VALUES ('c1','M1','expired'),('c2','M1','rejected'),('c3','M1','running'),('c4','M1','completed'),('c5','M2','rejected');
      INSERT INTO submissions VALUES ('c2','rejected','private reason'),('c3','needs_revision','private revision'),('c3','needs_revision','another revision'),('c4','accepted',NULL),('c5','rejected','other mission');
    `);
    assert.deepEqual({ ...db.prepare(MISSION_FAILURE_SUMMARY_SQL).get("M1") }, {
      expired_claims: 1,
      revision_requests: 2,
      rejected_submissions: 1,
    });
    assert.deepEqual({ ...db.prepare(MISSION_FAILURE_SUMMARY_SQL).get("missing") }, {
      expired_claims: 0,
      revision_requests: 0,
      rejected_submissions: 0,
    });
  } finally {
    db.close();
  }
});
