import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { HEARTBEAT_UPDATE_SQL, heartbeatExpiry } from "../lib/claim-lease.ts";

const hour = 60 * 60_000;
const started = 1_000_000;

test("heartbeat cannot extend beyond the rank's absolute lifetime", () => {
  assert.equal(heartbeatExpiry(started + hour, started, "黄阶"), started + 2 * hour);
  assert.equal(heartbeatExpiry(started + 2 * hour, started, "黄阶"), null);
  assert.equal(heartbeatExpiry(started + 5 * hour, started, "玄阶"), started + 6 * hour);
  assert.equal(heartbeatExpiry(started + 15 * hour, started, "地阶"), started + 16 * hour);
  assert.equal(heartbeatExpiry(started + 71 * hour, started, "天阶"), started + 72 * hour);
  assert.equal(heartbeatExpiry(started, started, "渡劫"), null);
  assert.equal(heartbeatExpiry(started, started + 1, "黄阶"), null);
  assert.equal(heartbeatExpiry(started, null, "黄阶"), null);
});

test("lease update retains owner, running state, time and rank gates", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE missions (id TEXT PRIMARY KEY, rank TEXT NOT NULL);
      CREATE TABLE claims (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, cultivator_id TEXT NOT NULL, state TEXT NOT NULL, started_at INTEGER, expires_at INTEGER NOT NULL);
      INSERT INTO missions VALUES ('M', '玄阶');
      INSERT INTO claims VALUES ('C', 'M', 'owner', 'running', ${started}, ${started + 2 * hour});
    `);
    const now = started + hour;
    const expiresAt = heartbeatExpiry(now, started, "玄阶");
    const update = (owner, time, claimStarted, rank) => db.prepare(HEARTBEAT_UPDATE_SQL)
      .run(expiresAt, "C", owner, time, claimStarted, rank).changes;
    assert.equal(update("other", now, started, "玄阶"), 0);
    assert.equal(update("owner", now, started + 1, "玄阶"), 0);
    assert.equal(update("owner", started + 2 * hour, started, "玄阶"), 0);
    assert.equal(update("owner", now, started, "玄阶"), 1);
    assert.equal(db.prepare("SELECT expires_at FROM claims WHERE id = 'C'").get().expires_at, started + 3 * hour);
    db.exec("UPDATE missions SET rank = '地阶' WHERE id = 'M'");
    assert.equal(update("owner", now, started, "玄阶"), 0);
    db.exec("UPDATE claims SET state = 'released' WHERE id = 'C'");
    assert.equal(update("owner", now, started, "地阶"), 0);
  } finally {
    db.close();
  }
});
