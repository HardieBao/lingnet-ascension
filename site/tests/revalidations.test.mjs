import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { INDEPENDENT_REVIEWS_COUNT_SUBQUERY, REVALIDATION_DECISION_SQL, REVALIDATION_INSERT_SQL,
  REVALIDATION_TARGET_SQL, revalidationTargetReport } from "../lib/revalidations.ts";

const submission = "11111111-1111-4111-8111-111111111111";
const commit = "a".repeat(40), digest = "b".repeat(64), head = "c".repeat(40);
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(new URL(file, directory), "utf8").split("--> statement-breakpoint")) db.exec(sql);
  }
  db.exec(`
    INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES
      ('author','github','101','Fixture','Fixture',1),('reporter','github','202','Fixture','Fixture',1),
      ('adopter','github','303','Fixture','Fixture',1),('second','github','404','Fixture','Fixture',1),
      ('local','local','505','Fixture','Fixture',1);
    INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,
      reward_token,reward_cultivation,reward_merit,created_at) VALUES
      ('GOV-001','Fixture','Synthetic','黄阶','Fixture','done','${commit}','GOVERNANCE.md','Synthetic',0,0,0,1);
    INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot) VALUES
      ('claim','GOV-001','author','completed',1,1000,'{"allowedPaths":"GOVERNANCE.md"}');
    INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at)
      VALUES ('${submission}','claim','author','fixture.md','${digest}','accepted','adopter','${commit}',10,2);
  `);
  return db;
}
const insert = (db, id = "r1", actor = "reporter", run = 99, outcome = "passed", original = submission, sha = digest) =>
  db.prepare(REVALIDATION_INSERT_SQL).run(id, original, actor, 7, head, run, 1, commit, commit, sha, outcome,
    "完整合成复验观察，只验证记录约束，不代表真实用户或真实可信 CI 运行。", 20);
const decide = (db, id = "r1", actor = "adopter", decision = "accept") =>
  db.prepare(REVALIDATION_DECISION_SQL).run(decision, actor, "独立核对合成证据，不是真实采纳", 30, id);
const count = (db, actor = "reporter") => db.prepare(`SELECT ${INDEPENDENT_REVIEWS_COUNT_SUBQUERY} AS count`).get(actor).count;

test("only an independently adopted current formal result grants one qualification, never game rewards", () => {
  const db = database();
  try {
    const target = { ...db.prepare(REVALIDATION_TARGET_SQL).get(submission) };
    assert(revalidationTargetReport(target, "202"));
    assert.equal(insert(db).changes, 1);
    assert.equal(count(db), 0);
    assert.equal(decide(db).changes, 1);
    assert.equal(count(db), 1);
    assert.equal(count(db, "second"), 0);
    assert.equal(decide(db).changes, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ledger_events").get().count, 0);
    assert.throws(() => insert(db, "r2", "reporter", 100), /pending or adopted/);
    db.exec("UPDATE missions SET state='open' WHERE id='GOV-001'");
    assert.equal(count(db), 0);
    db.exec("UPDATE missions SET state='done' WHERE id='GOV-001'");
    assert.equal(count(db), 1);
    db.exec(`UPDATE submissions SET artifact_sha256='${"d".repeat(64)}' WHERE id='${submission}'`);
    assert.equal(count(db), 0);
  } finally { db.close(); }
});

test("self replay, non-GitHub identity, self adoption, original-author adoption and wrong evidence are refused", () => {
  const db = database();
  try {
    assert.throws(() => insert(db, "self", "author"), /different author/);
    assert.throws(() => insert(db, "local", "local"), /different author/);
    assert.throws(() => insert(db, "wrong", "reporter", 99, "passed", submission, "d".repeat(64)), /current formal evidence/);
    insert(db);
    for (const actor of ["reporter", "author", "local"]) assert.throws(() => decide(db, "r1", actor), /independent GitHub reviewer/);
    assert.equal(count(db), 0);
    db.exec(`UPDATE submissions SET integrated_commit='${"e".repeat(40)}' WHERE id='${submission}'`);
    assert.throws(() => decide(db), /current formal evidence/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM result_revalidation_decisions").get().count, 0);
  } finally { db.close(); }
});

test("pending duplication is blocked; rejected retry requires a new CI run; accepted failure replay can count", () => {
  const db = database();
  try {
    insert(db);
    assert.throws(() => insert(db, "pending", "reporter", 100), /pending or adopted/);
    assert.equal(decide(db, "r1", "adopter", "reject").changes, 1);
    assert.equal(count(db), 0);
    assert.throws(() => insert(db, "same-run"), /UNIQUE/);
    insert(db, "retry", "reporter", 100, "failed");
    assert.equal(decide(db, "retry").changes, 1);
    assert.equal(count(db), 1);
    assert.throws(() => db.exec("UPDATE result_revalidations SET outcome='passed' WHERE id='retry'"), /append only/);
    assert.throws(() => db.exec("DELETE FROM result_revalidations WHERE id='retry'"), /append only/);
    assert.throws(() => db.exec("UPDATE result_revalidation_decisions SET decision='reject' WHERE revalidation_id='retry'"), /append only/);
    assert.throws(() => db.exec("DELETE FROM result_revalidation_decisions WHERE revalidation_id='retry'"), /append only/);
  } finally { db.close(); }
});

test("qualification deduplicates multiple formal submissions for the same mission", () => {
  const db = database();
  try {
    insert(db); decide(db);
    const duplicate = "22222222-2222-4222-8222-222222222222";
    db.exec(`INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at)
      VALUES ('${duplicate}','claim','author','fixture.md','${digest}','accepted','adopter','${commit}',10,2)`);
    insert(db, "duplicate-target", "reporter", 101, "passed", duplicate); decide(db, "duplicate-target");
    assert.equal(count(db), 1);
  } finally { db.close(); }
});
