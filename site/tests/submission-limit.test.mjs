import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import * as submissionLimit from "../lib/submission-limit.ts";
import {
  MAX_FAILED_SUBMISSIONS_PER_MISSION,
  MAX_SUBMISSIONS_PER_CLAIM,
  SUBMISSION_INSERT_SQL,
  SUBMISSION_LIMIT_SQL,
} from "../lib/submission-limit.ts";

test("raced fifth failed upload cannot strand a claim in review", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE claims (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, state TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE submissions (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, artifact_key TEXT NOT NULL, artifact_sha256 TEXT NOT NULL, state TEXT NOT NULL, verdict TEXT, created_at INTEGER NOT NULL);
      INSERT INTO claims VALUES ('c1', 'M1', 'owner', 'running', 2000);
      INSERT INTO submissions VALUES
        ('s1', 'c1', 'owner', 'a1', 'hash', 'needs_revision', '{}', 100),
        ('s2', 'c1', 'owner', 'a2', 'hash', 'needs_revision', '{}', 200),
        ('s3', 'c1', 'owner', 'a3', 'hash', 'needs_revision', '{}', 300),
        ('s4', 'c1', 'owner', 'a4', 'hash', 'needs_revision', '{}', 400);
    `);
    assert.equal(db.prepare(SUBMISSION_LIMIT_SQL).get("c1", "owner").claim_count, 4);
    const insert = db.prepare(SUBMISSION_INSERT_SQL);
    assert.equal(insert.run("s5", "owner", "a5", "hash", "needs_revision", "{}", 1000,
      "c1", "owner", 1000, MAX_SUBMISSIONS_PER_CLAIM, MAX_FAILED_SUBMISSIONS_PER_MISSION).changes, 1);
    assert.equal(insert.run("s6", "owner", "a6", "hash", "awaiting_review", "{}", 1000,
      "c1", "owner", 1000, MAX_SUBMISSIONS_PER_CLAIM, MAX_FAILED_SUBMISSIONS_PER_MISSION).changes, 0);
    assert.equal(typeof submissionLimit.SUBMISSION_REVIEW_CLAIM_SQL, "string");
    assert.equal(db.prepare(submissionLimit.SUBMISSION_REVIEW_CLAIM_SQL)
      .run("c1", "owner", 1000, "s6", "c1", "owner").changes, 0);
    assert.equal(db.prepare("SELECT state FROM claims WHERE id = 'c1'").get().state, "running");
  } finally {
    db.close();
  }
});

test("successful upload advances its own claim to review", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE claims (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, state TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE submissions (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, artifact_key TEXT NOT NULL, artifact_sha256 TEXT NOT NULL, state TEXT NOT NULL, verdict TEXT, created_at INTEGER NOT NULL);
      INSERT INTO claims VALUES ('c1', 'M1', 'owner', 'running', 2000), ('c2', 'M2', 'other', 'running', 2000);
      INSERT INTO submissions VALUES ('other-submission', 'c2', 'other', 'a2', 'hash', 'awaiting_review', '{}', 100);
    `);
    const insert = db.prepare(SUBMISSION_INSERT_SQL);
    assert.equal(insert.run("own-submission", "owner", "a1", "hash", "awaiting_review", "{}", 1000,
      "c1", "owner", 1000, MAX_SUBMISSIONS_PER_CLAIM, MAX_FAILED_SUBMISSIONS_PER_MISSION).changes, 1);
    const review = db.prepare(submissionLimit.SUBMISSION_REVIEW_CLAIM_SQL);
    assert.equal(review.run("c1", "owner", 1000, "other-submission", "c1", "owner").changes, 0);
    assert.equal(review.run("c1", "owner", 1000, "own-submission", "c1", "owner").changes, 1);
    assert.equal(db.prepare("SELECT state FROM claims WHERE id = 'c1'").get().state, "review");
  } finally {
    db.close();
  }
});

test("submission limits apply across claims and inside the atomic insert", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE claims (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, state TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE submissions (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, artifact_key TEXT NOT NULL, artifact_sha256 TEXT NOT NULL, state TEXT NOT NULL, verdict TEXT, created_at INTEGER NOT NULL);
      INSERT INTO claims VALUES ('c1', 'M1', 'owner', 'running', 2000), ('c2', 'M1', 'owner', 'running', 2000),
        ('c3', 'M2', 'owner', 'running', 2000), ('c4', 'M1', 'other', 'running', 2000);
    `);
    const insert = (claimId, owner = "owner", state = "needs_revision", now = 1000) => {
      const id = crypto.randomUUID();
      return db.prepare(SUBMISSION_INSERT_SQL).run(
        id, owner, `artifact/${id}`, "hash", state, "{}", now,
        claimId, owner, now, MAX_SUBMISSIONS_PER_CLAIM, MAX_FAILED_SUBMISSIONS_PER_MISSION,
      ).changes;
    };
    const limits = (claimId) => ({ ...db.prepare(SUBMISSION_LIMIT_SQL).get(claimId, "owner") });

    assert.deepEqual(limits("c1"), { claim_count: 0, mission_failures: 0 });
    assert.equal(insert("c1", "other"), 0);
    for (let i = 0; i < MAX_SUBMISSIONS_PER_CLAIM; i++) assert.equal(insert("c1"), 1);
    assert.equal(insert("c1"), 0);
    assert.deepEqual(limits("c1"), { claim_count: 5, mission_failures: 5 });
    for (let i = 0; i < MAX_SUBMISSIONS_PER_CLAIM; i++) assert.equal(insert("c2"), 1);
    assert.equal(insert("c2"), 0);
    assert.deepEqual(limits("c2"), { claim_count: 5, mission_failures: 10 });
    db.exec("INSERT INTO claims VALUES ('c5', 'M1', 'owner', 'running', 2000)");
    assert.equal(insert("c5"), 0);
    assert.equal(insert("c3"), 1);
    assert.equal(insert("c4", "other"), 1);
    assert.equal(insert("c3", "owner", "awaiting_review", 2000), 0);
  } finally {
    db.close();
  }
});

test("successful submission also consumes a per-claim slot", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE claims (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, state TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE submissions (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, artifact_key TEXT NOT NULL, artifact_sha256 TEXT NOT NULL, state TEXT NOT NULL, verdict TEXT, created_at INTEGER NOT NULL);
      INSERT INTO claims VALUES ('c1', 'M1', 'owner', 'running', 2000);
    `);
    const insert = (state) => {
      const id = crypto.randomUUID();
      return db.prepare(SUBMISSION_INSERT_SQL).run(
        id, "owner", `artifact/${id}`, "hash", state, "{}", 1000,
        "c1", "owner", 1000, MAX_SUBMISSIONS_PER_CLAIM, MAX_FAILED_SUBMISSIONS_PER_MISSION,
      ).changes;
    };
    assert.equal(insert("awaiting_review"), 1);
    assert.deepEqual({ ...db.prepare(SUBMISSION_LIMIT_SQL).get("c1", "owner") }, { claim_count: 1, mission_failures: 0 });
  } finally {
    db.close();
  }
});
