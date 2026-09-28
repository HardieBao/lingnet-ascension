import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function adjustmentDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE cultivators (id TEXT PRIMARY KEY);
    CREATE TABLE ledger_events (id TEXT PRIMARY KEY, cultivator_id TEXT NOT NULL, resource TEXT NOT NULL, delta INTEGER NOT NULL, source_key TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(source_key, resource));
    INSERT INTO cultivators VALUES ('requester'), ('approver'), ('target');
    INSERT INTO ledger_events VALUES ('seed', 'target', 'token', 100, 'seed:target', 1);
  `);
  for (const name of ["0007_ledger_immutable.sql", "0008_nonnegative_ledger.sql", "0009_token_adjustments.sql"]) {
    const migration = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) db.exec(statement);
  }
  return db;
}

test("administrator adjustment requires two distinct GitHub identities", async () => {
  const { tokenAdjustmentRole } = await import("../lib/token-adjustments.ts");
  const maintainer = { provider: "github", provider_id: "101" };
  const approver = { provider: "github", provider_id: "202" };
  assert.equal(tokenAdjustmentRole(maintainer, "101", "202"), "requester");
  assert.equal(tokenAdjustmentRole(approver, "101", "202"), "approver");
  assert.equal(tokenAdjustmentRole(maintainer, "101", "101"), null);
  assert.equal(tokenAdjustmentRole(maintainer, "101", undefined), null);
  assert.equal(tokenAdjustmentRole(maintainer, "HardieBao", "202"), null);
  assert.equal(tokenAdjustmentRole({ provider: "local", provider_id: "101" }, "101", "202"), null);
});

test("approved adjustment appends exactly one audited Token event", async () => {
  const { TOKEN_ADJUSTMENT_REQUEST_SQL, TOKEN_ADJUSTMENT_DECISION_SQL } = await import("../lib/token-adjustments.ts");
  const db = adjustmentDatabase();
  try {
    assert.equal(db.prepare(TOKEN_ADJUSTMENT_REQUEST_SQL).run(
      "request-1", "target", 25, "case-1", "经核对后的任务奖励差额补发申请说明，已查验原始任务记录与既有流水", "requester", 2
    ).changes, 1);
    assert.equal(db.prepare(TOKEN_ADJUSTMENT_DECISION_SQL).run(
      "approve", "approver", "已核对相关任务和原始流水", 3, "request-1", "approver"
    ).changes, 1);
    assert.equal(db.prepare("SELECT SUM(delta) AS balance FROM ledger_events WHERE cultivator_id='target' AND resource='token'").get().balance, 125);
    assert.equal(db.prepare(TOKEN_ADJUSTMENT_DECISION_SQL).run(
      "approve", "approver", "重复审批不得二次入账", 4, "request-1", "approver"
    ).changes, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ledger_events WHERE source_key='admin-adjustment:request-1'").get().count, 1);
    assert.throws(() => db.exec("UPDATE token_adjustment_requests SET delta=10000 WHERE id='request-1'"), /append only/);
    assert.throws(() => db.exec("DELETE FROM token_adjustment_decisions WHERE request_id='request-1'"), /append only/);
  } finally {
    db.close();
  }
});

test("self approval, duplicate reference, rejected and overdraft adjustments never mint Token", async () => {
  const { TOKEN_ADJUSTMENT_REQUEST_SQL, TOKEN_ADJUSTMENT_DECISION_SQL } = await import("../lib/token-adjustments.ts");
  const db = adjustmentDatabase();
  try {
    const request = db.prepare(TOKEN_ADJUSTMENT_REQUEST_SQL);
    const decision = db.prepare(TOKEN_ADJUSTMENT_DECISION_SQL);
    const reason = "申请理由已核对任务、修士身份、原始流水及所需修正的准确金额";
    assert.equal(request.run("reject-1", "target", 10, "case-reject", reason, "requester", 2).changes, 1);
    assert.throws(() => request.run("duplicate", "target", 10, "case-reject", reason, "requester", 2), /UNIQUE/);
    assert.equal(decision.run("approve", "requester", "不能审批自己的申请", 3, "reject-1", "requester").changes, 0);
    assert.equal(decision.run("reject", "approver", "没有足够证据支持这笔补发", 4, "reject-1", "approver").changes, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ledger_events WHERE source_key='admin-adjustment:reject-1'").get().count, 0);

    assert.equal(request.run("overdraft", "target", -101, "case-overdraft", reason, "requester", 5).changes, 1);
    assert.throws(() => decision.run("approve", "approver", "核对后尝试扣回超额 Token", 6, "overdraft", "approver"), /cannot be negative/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM token_adjustment_decisions WHERE request_id='overdraft'").get().count, 0);
    assert.equal(db.prepare("SELECT SUM(delta) AS balance FROM ledger_events WHERE cultivator_id='target' AND resource='token'").get().balance, 100);
    assert.throws(() => request.run("out-of-range", "target", 10001, "case-too-large", reason, "requester", 7), /CHECK/);
  } finally {
    db.close();
  }
});
