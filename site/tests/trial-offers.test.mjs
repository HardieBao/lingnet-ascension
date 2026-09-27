import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { REALM_TRIAL_OFFERS_SQL } from "../lib/realm-trials.ts";

test("trial offer discovery only reads own live unsubmitted contracts for the current realm", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE cultivators (id TEXT PRIMARY KEY, realm TEXT);
      CREATE TABLE missions (id TEXT PRIMARY KEY,title TEXT,state TEXT,contract_ready INTEGER);
      CREATE TABLE claims (id TEXT PRIMARY KEY,mission_id TEXT,cultivator_id TEXT,state TEXT,expires_at INTEGER,reward_snapshot TEXT,claimed_at INTEGER);
      CREATE TABLE realm_trial_contracts (mission_id TEXT,target_realm TEXT,duration_ms INTEGER);
      CREATE TABLE submissions (claim_id TEXT);
      CREATE TABLE realm_trials (claim_id TEXT,cultivator_id TEXT,state TEXT);
      INSERT INTO cultivators VALUES ('owner','foundation'),('other','foundation');
    `);
    for (const [id, owner, state, ready, expiry, target] of [
      ['good','owner','running',1,2000,'core'], ['other','other','running',1,2000,'core'],
      ['expired','owner','running',1,1000,'core'], ['not-running','owner','claimed',1,2000,'core'],
      ['not-ready','owner','running',0,2000,'core'], ['wrong-realm','owner','running',1,2000,'foundation'],
      ['submitted','owner','running',1,2000,'core'], ['tried','owner','running',1,2000,'core'],
    ]) {
      db.prepare("INSERT INTO missions VALUES (?,?,'open',?)").run(id, `Updated ${id}`, ready);
      db.prepare("INSERT INTO claims VALUES (?,?,?,?,?,?,1)").run(id,id,owner,state,expiry,JSON.stringify({title:`Locked ${id}`}));
      db.prepare("INSERT INTO realm_trial_contracts VALUES (?,?,60000)").run(id,target);
    }
    db.exec("INSERT INTO submissions VALUES ('submitted'); INSERT INTO realm_trials VALUES ('tried','owner','withdrawn')");
    const offers = () => db.prepare(REALM_TRIAL_OFFERS_SQL).all('owner',1000).map((row) => ({...row}));
    assert.deepEqual(offers(), [{claim_id:'good',mission_id:'good',title:'Locked good',target_realm:'core',duration_ms:60000,fee:2000}]);
    db.exec("INSERT INTO realm_trials VALUES ('another','owner','active')");
    assert.deepEqual(offers(), []);
  } finally { db.close(); }
});
