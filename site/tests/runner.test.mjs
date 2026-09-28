import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import test from "node:test";
import { assertOnlyAllowedChanges, beginRunRecord, finishRunRecord, preflightMissionContent, reportedCliUsage, requireUsageConsent, runPreflight, runTask, validateTaskPackage } from "../public/runner.mjs";
import { verifyMissionContent } from "../lib/verifier.ts";

function signed(payload) {
  return { payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

const payload = {
  schemaVersion: 2,
  claim: { id: "12345678-1234-1234-1234-123456789abc", expiresAt: Date.now() + 60_000 },
  repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit: "a".repeat(40) },
  mission: { id: "GOV-001", title: "章程", description: "写章程", acceptance: "独立验收", allowedPaths: ["GOVERNANCE.md"], artifactPath: "GOVERNANCE.md" },
  model: { harness: "codex-cli", tokenBudget: null },
  equipment: { localPreflight: false },
  gameReward: { token: 50, cultivation: 100, merit: 5 },
};

test("runner accepts a current, unmodified task package", () => {
  assert.equal(validateTaskPackage(signed(payload)).mission.id, "GOV-001");
});

test("CLI usage captures only valid numeric counters, not private stream items", () => {
  const usage = { input_tokens: 100, cached_input_tokens: 60, output_tokens: 20, privateField: "PRIVATE_FIXTURE" };
  const event = JSON.stringify({ type: "turn.completed", usage });
  assert.deepEqual(reportedCliUsage(`not json\n${JSON.stringify({ type: "item.completed", text: "PRIVATE_FIXTURE" })}\n${event}\n`),
    { input_tokens: 100, cached_input_tokens: 60, output_tokens: 20 });
  assert.equal(reportedCliUsage(`${event}\n${event}`), null);
  assert.equal(reportedCliUsage(""), null);
  for (const invalid of [null, {}, { input_tokens: -1, output_tokens: 2 }, { input_tokens: "100", output_tokens: 2 },
    { input_tokens: 100, output_tokens: 1.5 }, { input_tokens: 100, output_tokens: 2, cached_input_tokens: 101 }]) {
    assert.equal(reportedCliUsage(JSON.stringify({ type: "turn.completed", usage: invalid })), null);
  }
  assert.deepEqual(reportedCliUsage(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 0, output_tokens: 0 } })),
    { input_tokens: 0, output_tokens: 0, cached_input_tokens: null });
});

test("model run records bind the task and retain one terminal event without payload or secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lingnet-run-record-"));
  try {
    const taskPackage = signed({ ...payload, privateField: "PRIVATE_FIXTURE" });
    const run = await beginRunRecord(taskPackage, directory);
    const startedText = await readFile(join(run.directory, "started.json"), "utf8");
    const started = JSON.parse(startedText);
    assert.equal(started.status, "model-running");
    assert.equal(started.claimId, payload.claim.id);
    assert.equal(started.taskPackageSha256, taskPackage.sha256);
    assert.equal(started.model, null);
    assert.equal(startedText.includes("PRIVATE_FIXTURE"), false);
    assert.throws(() => { run.record.privateField = "PRIVATE_FIXTURE"; }, TypeError);
    await finishRunRecord(run, "model-failed", { input_tokens: 10, output_tokens: 3, privateField: "PRIVATE_FIXTURE" });
    const finishedText = await readFile(join(run.directory, "finished.json"), "utf8");
    const finished = JSON.parse(finishedText);
    assert.equal(finished.status, "model-failed");
    assert.deepEqual(finished.usage, { input_tokens: 10, output_tokens: 3, cached_input_tokens: null });
    assert.equal(finished.usageSource, "codex-cli-reported");
    assert.equal(finished.usageCoverage, "reported-turn-only");
    assert.equal(finishedText.includes("PRIVATE_FIXTURE"), false);
    assert.equal(await readFile(join(run.directory, "started.json"), "utf8"), startedText);
    await assert.rejects(finishRunRecord(run, "model-completed"), { code: "EEXIST" });
    assert.equal(await readFile(join(run.directory, "finished.json"), "utf8"), finishedText);
    const other = await beginRunRecord(taskPackage, directory);
    assert.notEqual(other.record.id, run.record.id);
    await finishRunRecord(other, "model-completed", { input_tokens: -1, output_tokens: 2 });
    const unknown = JSON.parse(await readFile(join(other.directory, "finished.json"), "utf8"));
    assert.equal(unknown.usage, null);
    assert.equal(unknown.usageSource, "unknown");
    assert.equal(unknown.usageCoverage, "unknown");
  } finally {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith("lingnet-run-record-"));
    await rm(target, { recursive: true, force: true });
  }
});

test("model records reject linked storage and invalid tasks before any model call", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lingnet-run-record-link-"));
  try {
    const outside = join(directory, "outside");
    await mkdir(outside);
    await symlink(outside, join(directory, ".lingnet"), "junction");
    await assert.rejects(beginRunRecord(signed(payload), directory), /运行记录目录无效/);
    assert.deepEqual(await readdir(outside), []);
    await assert.rejects(beginRunRecord(signed({ ...payload, claim: { ...payload.claim, expiresAt: 1 } }), directory), /不受当前 Runner 支持/);
  } finally {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith("lingnet-run-record-link-"));
    await rm(target, { recursive: true, force: true });
  }
});

test("runner rejects tampered, expired, and out-of-scope packages", () => {
  const tampered = signed(payload);
  tampered.payload.mission.title = "变更后";
  assert.throws(() => validateTaskPackage(tampered), /摘要/);
  assert.throws(() => validateTaskPackage(signed({ ...payload, claim: { ...payload.claim, expiresAt: 1 } })), /不受当前 Runner 支持/);
  assert.throws(() => validateTaskPackage(signed({ ...payload, mission: { ...payload.mission, allowedPaths: ["GOVERNANCE.md", ".env"] } })), /不受当前 Runner 支持/);
  assert.throws(() => validateTaskPackage(signed({ ...payload, equipment: { localPreflight: "yes" } })), /不受当前 Runner 支持/);
  assert.throws(() => validateTaskPackage(signed({ ...payload, model: { ...payload.model, tokenBudget: 1000 } })), /不受当前 Runner 支持/);
});

test("Runner local checks match the trusted structural verifier for current missions", async () => {
  for (const [missionId, fixture] of [
    ["GOV-001", "gov001-charter.md"],
    ["GOV-002", "gov002-world-brief.md"],
    ["GOV-003", "gov003-architecture-spike.md"],
    ["GOV-004T", "gov004t-token-terms.md"],
  ]) {
    const valid = await readFile(new URL(`./fixtures/${fixture}`, import.meta.url), "utf8");
    for (const content of [valid, "内容太短", valid.replaceAll("Token", "余额")]) {
      assert.deepEqual(preflightMissionContent(missionId, content), verifyMissionContent(missionId, content));
    }
  }
});

test("manual preflight checks bad and good documents without starting Codex", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lingnet-preflight-"));
  try {
    const taskPackagePath = join(directory, "task.json");
    const artifactPath = join(directory, "GOVERNANCE.md");
    await writeFile(taskPackagePath, JSON.stringify(signed(payload)));
    await writeFile(artifactPath, "内容太短");
    await assert.rejects(runPreflight(taskPackagePath, artifactPath), /本地预检未通过/);
    await writeFile(artifactPath, await readFile(new URL("./fixtures/gov001-charter.md", import.meta.url), "utf8"));
    await assert.doesNotReject(runPreflight(taskPackagePath, artifactPath));
  } finally {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith("lingnet-preflight-"));
    await rm(target, { recursive: true, force: true });
  }
});

test("runner rejects changes outside the one allowed artifact", () => {
  assert.doesNotThrow(() => assertOnlyAllowedChanges("?? GOVERNANCE.md\n"));
  assert.throws(() => assertOnlyAllowedChanges("?? GOVERNANCE.md\n?? .env\n"), /范围之外/);
  assert.throws(() => assertOnlyAllowedChanges("?? other.md\n"), /范围之外/);
});

test("runner accepts only the GOV-002 world brief path", () => {
  const worldMission = { ...payload.mission, id: "GOV-002", artifactPath: "docs/WORLD_BRIEF.md", allowedPaths: ["docs/WORLD_BRIEF.md"] };
  assert.equal(validateTaskPackage(signed({ ...payload, mission: worldMission })).mission.id, "GOV-002");
  assert.doesNotThrow(() => assertOnlyAllowedChanges("?? docs/WORLD_BRIEF.md\n", worldMission.artifactPath));
  assert.throws(() => assertOnlyAllowedChanges("?? docs/OTHER.md\n", worldMission.artifactPath), /范围之外/);
  assert.throws(() => validateTaskPackage(signed({ ...payload, mission: { ...worldMission, artifactPath: "GOVERNANCE.md" } })), /不受当前 Runner 支持/);
});

test("runner accepts GOV-003 only within its architecture report", () => {
  const architectureMission = { ...payload.mission, id: "GOV-003", artifactPath: "docs/ARCHITECTURE_SPIKE.md", allowedPaths: ["docs/ARCHITECTURE_SPIKE.md"] };
  assert.equal(validateTaskPackage(signed({ ...payload, mission: architectureMission })).mission.id, "GOV-003");
  assert.doesNotThrow(() => assertOnlyAllowedChanges("?? docs/ARCHITECTURE_SPIKE.md\n", architectureMission.artifactPath));
  assert.throws(() => validateTaskPackage(signed({ ...payload, mission: { ...architectureMission, allowedPaths: ["site/"] } })), /不受当前 Runner 支持/);
});

test("runner accepts GOV-004T only within its Token terms file", () => {
  const tokenMission = { ...payload.mission, id: "GOV-004T", artifactPath: "docs/TOKEN_TERMS.md", allowedPaths: ["docs/TOKEN_TERMS.md"] };
  assert.equal(validateTaskPackage(signed({ ...payload, mission: tokenMission })).mission.id, "GOV-004T");
  assert.doesNotThrow(() => assertOnlyAllowedChanges("?? docs/TOKEN_TERMS.md\n", tokenMission.artifactPath));
  assert.throws(() => validateTaskPackage(signed({ ...payload, mission: { ...tokenMission, allowedPaths: ["docs/"] } })), /不受当前 Runner 支持/);
});

test("legacy unbounded tasks cannot launch a model even with old consent", () => {
  const current = validateTaskPackage(signed(payload));
  assert.throws(() => requireUsageConsent(current, false), /未设模型 Token 硬预算/);
  assert.throws(() => requireUsageConsent(current, true), /未设模型 Token 硬预算/);
});

test("bounded contract accepts only the adopted model limits and requires cost consent", () => {
  const bounded = { ...payload, schemaVersion: 3, model: { harness: "codex-cli", id: "gpt-5.6-sol",
    tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" } };
  const current = validateTaskPackage(signed(bounded));
  assert.throws(() => requireUsageConsent(current, false), /ack-model-costs/);
  assert.doesNotThrow(() => requireUsageConsent(current, true));
  for (const change of [{ tokenBudget: 30001 }, { tokenBudget: null }, { maxOutputTokens: 2049 },
    { id: "other-model" }, { budgetAccounting: "output-only" }]) {
    assert.throws(() => validateTaskPackage(signed({ ...bounded, model: { ...bounded.model, ...change } })), /不受当前 Runner 支持/);
  }
});

test("an existing modified artifact keeps its leading Git status column", () => {
  assert.doesNotThrow(() => assertOnlyAllowedChanges(" M GOVERNANCE.md\n"));
});

test("the full runner refuses before starting Codex when consent is absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lingnet-usage-consent-"));
  try {
    const taskPackagePath = join(directory, "task.json");
    await writeFile(taskPackagePath, JSON.stringify(signed(payload)));
    await assert.rejects(runTask(taskPackagePath), /未设模型 Token 硬预算/);
  } finally {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith("lingnet-usage-consent-"));
    await rm(target, { recursive: true, force: true });
  }
});
