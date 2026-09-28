import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { REVIEW_REJECT_REFUND_SQL } from "../lib/review-refund.ts";

test("review refunds require a successful rejection and a real locked deposit", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE submissions (id TEXT PRIMARY KEY, state TEXT NOT NULL, reviewer_id TEXT);
      CREATE TABLE claims (id TEXT PRIMARY KEY, state TEXT NOT NULL, cultivator_id TEXT NOT NULL);
      CREATE TABLE ledger_events (id TEXT PRIMARY KEY, cultivator_id TEXT NOT NULL, resource TEXT NOT NULL, delta INTEGER NOT NULL, source_key TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(source_key, resource));
      INSERT INTO submissions VALUES ('submission', 'awaiting_review', NULL);
      INSERT INTO claims VALUES ('claim', 'review', 'author');
    `);
    const refund = (resource, delta, suffix) => db.prepare(REVIEW_REJECT_REFUND_SQL).run(
      `event-${suffix}`, "author", resource, delta, `claim:review:${suffix}`, 1,
      "submission", "reviewer", "claim", "author", "author", "claim:deposit:locked", 10
    ).changes;
    assert.equal(refund("token", 10, "refund"), 0);
    db.exec("UPDATE submissions SET state = 'approved', reviewer_id = 'reviewer'; UPDATE claims SET state = 'approved'");
    assert.equal(refund("token", 10, "refund"), 0);
    db.exec("UPDATE submissions SET state = 'rejected'; UPDATE claims SET state = 'rejected'");
    assert.equal(refund("token", 10, "refund"), 0);
    db.exec("INSERT INTO ledger_events VALUES ('hold', 'author', 'token_locked', 10, 'claim:deposit:locked', 1)");
    db.exec("UPDATE submissions SET reviewer_id = 'other-reviewer'");
    assert.equal(refund("token", 10, "refund"), 0);
    db.exec("UPDATE submissions SET reviewer_id = 'reviewer'");
    assert.equal(refund("token", 10, "refund"), 1);
    assert.equal(refund("token_locked", -10, "unlock"), 1);
    assert.equal(refund("token", 10, "refund"), 0);
    assert.equal(refund("token_locked", -10, "unlock"), 0);
    assert.deepEqual(db.prepare("SELECT resource, SUM(delta) AS balance FROM ledger_events GROUP BY resource ORDER BY resource").all().map((row) => ({ ...row })), [
      { resource: "token", balance: 10 },
      { resource: "token_locked", balance: 0 },
    ]);
  } finally {
    db.close();
  }
});
