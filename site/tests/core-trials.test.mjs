import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { REALM_TRIAL_EXPIRE_SQL, REALM_TRIAL_PASS_SQL, REALM_TRIAL_START_SQL } from "../lib/realm-trials.ts";

const base = "a".repeat(40), digest = "b".repeat(64);
function database(realm = "foundation") {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(new URL(file, directory), "utf8").split("--> statement-breakpoint")) db.exec(sql);
  }
  db.exec(`
    INSERT INTO cultivators (id,provider,provider_id,handle,display_name,realm,created_at) VALUES
      ('player','github','101','Fixture','Fixture','${realm}',1),('author','github','202','Fixture','Fixture','mortal',1),
      ('reviewer','github','303','Fixture','Fixture','mortal',1);
    INSERT INTO ledger_events VALUES ('t','player','token',3000,'fixture:t',1),
      ('c','player','cultivation',5000,'fixture:c',1),('m','player','merit',200,'fixture:m',1);
  `);
  const mission = db.prepare(`INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,
    reward_token,reward_cultivation,reward_merit,created_at,contract_ready) VALUES (?, 'Fixture','Synthetic','地阶','Fixture',?,?,'fixture.md','Synthetic',0,0,0,1,1)`);
  const claim = db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,?,?,?,1,1,100000,?)");
  const submit = db.prepare(`INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at)
    VALUES (?,?,?,'fixture.md',?,'accepted','reviewer',?,10,2)`);
  for (let index = 0; index < 10; index++) {
    mission.run(`M${index}`, "done", base);
    claim.run(`C${index}`, `M${index}`, "player", "completed", JSON.stringify({ deposit: 0, baseCommit: base }));
    submit.run(`S${index}`, `C${index}`, "player", digest, base);
  }
  mission.run("REPLAY", "done", base);
  claim.run("REPLAY-C", "REPLAY", "author", "completed", "{}");
  submit.run("REPLAY-S", "REPLAY-C", "author", digest, base);
  db.prepare("INSERT INTO result_revalidations VALUES ('R','REPLAY-S','player',7,?,99,1,?,?,?,'passed',?,20)")
    .run(base, base, base, digest, "完整合成复验观察，仅用于测试独立采纳资格，不是真实社区贡献。");
  db.exec("INSERT INTO result_revalidation_decisions VALUES ('R','accept','reviewer','独立核对合成记录',30)");
  mission.run("TRIAL", "open", base);
  claim.run("TRIAL-C", "TRIAL", "player", "running", JSON.stringify({ deposit: 0, baseCommit: base }));
  db.exec(`INSERT INTO realm_trial_contracts VALUES ('TRIAL','${realm === "qi" ? "foundation" : "core"}',60000)`);
  return db;
}
const start = (db, id = "T") => db.prepare(REALM_TRIAL_START_SQL).run(id, 1000, 1000, "TRIAL-C", "player", 1000, "player", "player").changes;
const finish = (db) => db.prepare(REALM_TRIAL_PASS_SQL).run(2000, "player", "T", "T", "player", "player").changes;
const balance = (db, resource) => db.prepare("SELECT COALESCE(SUM(delta),0) AS total FROM ledger_events WHERE cultivator_id='player' AND resource=?").get(resource).total;
function ownFormal(db, reviewer = "reviewer", commit = base) {
  db.exec("UPDATE claims SET state='completed' WHERE id='TRIAL-C'; UPDATE missions SET state='done' WHERE id='TRIAL'");
  db.prepare(`INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at)
    VALUES ('TRIAL-S','TRIAL-C','player','fixture.md',?,'accepted',?,?,1500,1200)`).run(digest, reviewer, commit);
}

test("core freezes 2000 once and requires its own on-time independent formal result before one settlement", () => {
  const db = database();
  try {
    assert(start(db) >= 1);
    assert.equal(start(db, "again"), 0);
    assert.equal(balance(db, "token"), 1000);
    assert.equal(balance(db, "token_locked"), 2000);
    assert.equal(finish(db), 0);
    ownFormal(db);
    assert(finish(db) >= 1);
    assert.equal(finish(db), 0);
    assert.equal(balance(db, "token"), 1000);
    assert.equal(balance(db, "token_locked"), 0);
    assert.equal(db.prepare("SELECT realm FROM cultivators WHERE id='player'").get().realm, "core");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM realm_events WHERE cultivator_id='player'").get().count, 1);
  } finally { db.close(); }
});

test("each missing core prerequisite prevents both API SQL insertion and direct database bypass", () => {
  for (const alter of [
    "UPDATE cultivators SET realm='qi' WHERE id='player'",
    "INSERT INTO ledger_events VALUES ('less-t','player','token',-1001,'fixture:less-t',40)",
    "INSERT INTO ledger_events VALUES ('less-c','player','cultivation',-1,'fixture:less-c',40)",
    "INSERT INTO ledger_events VALUES ('less-m','player','merit',-1,'fixture:less-m',40)",
    "UPDATE missions SET state='open' WHERE id='M9'",
    "UPDATE missions SET state='open' WHERE id='REPLAY'",
    "UPDATE claims SET state='released' WHERE id='TRIAL-C'",
  ]) {
    const db = database();
    try {
      db.exec(alter);
      const tokens = balance(db, "token");
      assert.equal(start(db), 0, alter);
      assert.throws(() => db.prepare("INSERT INTO realm_trials (id,claim_id,cultivator_id,from_realm,target_realm,fee,base_commit,started_at,expires_at) VALUES ('bypass','TRIAL-C','player','foundation','core',2000,?,1000,61000)").run(base), /core trial requires/);
      assert.equal(balance(db, "token"), tokens);
      assert.equal(balance(db, "token_locked"), 0);
    } finally { db.close(); }
  }
});

test("revoked replay, self review, changed baseline or late evidence cannot finish core", () => {
  for (const alter of [
    "UPDATE missions SET state='open' WHERE id='REPLAY'",
    "UPDATE submissions SET reviewer_id='player' WHERE id='TRIAL-S'",
    `UPDATE claims SET reward_snapshot='{"baseCommit":"${"d".repeat(40)}"}' WHERE id='TRIAL-C'`,
    "UPDATE submissions SET integrated_at=62000 WHERE id='TRIAL-S'",
  ]) {
    const db = database();
    try {
      start(db); ownFormal(db); db.exec(alter);
      assert.equal(finish(db), 0, alter);
      assert.throws(() => db.exec("UPDATE realm_trials SET state='passed',finished_at=62000,finish_reason='attempt bypass' WHERE id='T'"), /trial requires/);
      assert.equal(balance(db, "token_locked"), 2000);
      assert.equal(db.prepare("SELECT realm FROM cultivators WHERE id='player'").get().realm, "foundation");
    } finally { db.close(); }
  }
});

test("core failure refunds fully once; foundation remains a 500 fee trial", () => {
  for (const terminal of ["withdrawn", "platform_failure", "expired"]) {
    const db = database();
    try {
      start(db);
      if (terminal === "expired") db.prepare(REALM_TRIAL_EXPIRE_SQL).run(62000,62000,62000,"player",62000,62000);
      else db.prepare("UPDATE realm_trials SET state=?,finished_at=2000,finish_reason='synthetic refund' WHERE id='T' AND state='active'").run(terminal);
      assert.equal(balance(db, "token"), 3000);
      assert.equal(balance(db, "token_locked"), 0);
      assert.equal(finish(db), 0);
    } finally { db.close(); }
  }
  const db = database("qi");
  try {
    start(db);
    assert.equal(balance(db, "token_locked"), 500);
    ownFormal(db); finish(db);
    assert.equal(balance(db, "token"), 2500);
    assert.equal(balance(db, "token_locked"), 0);
    assert.equal(db.prepare("SELECT realm FROM cultivators WHERE id='player'").get().realm, "foundation");
  } finally { db.close(); }
});
