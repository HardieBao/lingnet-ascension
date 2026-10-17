import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readRunnerStatus } from "../public/runner-status.mjs";

// Adopted local read-only status seam; synthetic files only, no model or platform calls.
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lingnet-status-"));
  const payload = { schemaVersion: 4, cultivatorId: "synthetic-status-owner", claim: { id: randomUUID(), expiresAt: 2000000000000 },
    repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit: "a".repeat(40) },
    mission: { id: "GOV-001", title: "Synthetic", description: "Synthetic", acceptance: "Synthetic", allowedPaths: ["GOVERNANCE.md"], artifactPath: "GOVERNANCE.md" },
    model: { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" },
    equipment: { localPreflight: false, checkpointSlots: 1, heartTalisman: false, presetSlots: 1 }, gameReward: { token: 0, cultivation: 0, merit: 0 } };
  const task = { payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  return { root, payload, task };
}

test("local status with no gateway record reports unknown usage without initializing storage", async () => {
  const f = await fixture();
  const status = await readRunnerStatus(f.task, { root: f.root, now: 1900000000000 });
  assert.equal(status.claim.packageState, "current");
  assert.equal(status.budget.status, "unknown");
  assert.equal(status.budget.knownSpent, null);
  assert.equal(status.budget.remaining, null);
  assert.equal(status.budget.nearLimit, null);
  assert.deepEqual(status.checkpoints.entries, []);
  assert.deepEqual(await readdir(f.root), []);
});

test("local status reads changing gateway accounting and warns at 90 percent including reservations", async () => {
  const f = await fixture(), directory = join(f.root, ".lingnet", "budgets", f.payload.claim.id);
  await mkdir(directory, { recursive: true });
  const path = join(directory, "budget.json");
  await writeFile(path, JSON.stringify({ version: 1, model: "gpt-5.6-sol", tokenBudget: 30000, remaining: 3001, knownSpent: 26999, halted: false }));
  let status = await readRunnerStatus(f.task, { root: f.root, now: 1900000000000 });
  assert.equal(status.budget.status, "observed");
  assert.equal(status.budget.nearLimit, false);
  const bytes = JSON.stringify({ version: 1, model: "gpt-5.6-sol", tokenBudget: 30000, remaining: 3000, knownSpent: 24500, halted: true,
    apiKey: "synthetic-private-key", privatePrompt: "synthetic-private-prompt" });
  await writeFile(path, bytes);
  status = await readRunnerStatus(f.task, { root: f.root, now: 1900000000000 });
  assert.equal(status.budget.knownSpent, 24500);
  assert.equal(status.budget.remaining, 3000);
  assert.equal(status.budget.reserved, 2500);
  assert.equal(status.budget.nearLimit, true);
  assert.equal(status.budget.halted, true);
  assert.equal(status.budget.source, "local-capped-gateway-snapshot");
  assert(!JSON.stringify(status).includes("synthetic-private"));
  assert.equal(await readFile(path, "utf8"), bytes);
});

test("checkpoint status returns owner-scoped metadata without deleting expired cache or exposing artifacts", async () => {
  const f = await fixture(), now = 1900000000000;
  const owner = createHash("sha256").update(f.payload.cultivatorId).digest("hex");
  const directory = join(f.root, ".lingnet", "checkpoints", owner);
  await mkdir(directory, { recursive: true });
  const identity = createHash("sha256").update(JSON.stringify({ claimId: f.payload.claim.id, cultivatorId: f.payload.cultivatorId,
    repository: f.payload.repository, missionId: f.payload.mission.id, artifactPath: f.payload.mission.artifactPath, model: f.payload.model })).digest("hex");
  const current = { version: 1, id: randomUUID(), claimId: f.payload.claim.id, identity,
    createdAt: now - 3600000, retainUntil: now + 23 * 3600000, heartExtended: false,
    context: { mode: "artifact-reconstruction", harness: "codex-cli", model: "gpt-5.6-sol", status: "model-failed", privateSession: "private-session" },
    artifact: { base64: Buffer.from("private-artifact").toString("base64"), sha256: "b".repeat(64) } };
  const expired = { ...current, id: randomUUID(), claimId: randomUUID(), identity: "c".repeat(64), createdAt: now - 25 * 3600000, retainUntil: now - 3600000 };
  await writeFile(join(directory, `${current.id}.json`), JSON.stringify(current));
  await writeFile(join(directory, `${expired.id}.json`), JSON.stringify(expired));
  await writeFile(join(directory, `${current.id}.used`), "synthetic restoration marker");
  const status = await readRunnerStatus(f.task, { root: f.root, now });
  assert.equal(status.checkpoints.status, "observed");
  assert.equal(status.checkpoints.source, "local-metadata-only");
  assert.equal(status.checkpoints.slots, 1);
  assert.equal(status.checkpoints.entries.length, 2);
  const entry = status.checkpoints.entries.find((entry) => entry.id === current.id);
  assert.equal(entry.expired, false);
  assert.equal(entry.forCurrentClaim, true);
  assert.equal(entry.restoreMarker, true);
  assert.equal(status.checkpoints.entries.find((entry) => entry.id === expired.id).expired, true);
  assert(!JSON.stringify(status).includes("private"));
  assert(!JSON.stringify(status).includes(current.artifact.base64));
  assert.equal((await readdir(directory)).length, 3);
});

test("invalid or oversized gateway records stay unknown instead of restoring allowance", async () => {
  const f = await fixture(), directory = join(f.root, ".lingnet", "budgets", f.payload.claim.id);
  await mkdir(directory, { recursive: true });
  const path = join(directory, "budget.json");
  for (const value of ["not-json", "x".repeat(16385), "null",
    JSON.stringify({ version: 1, model: "other-model", tokenBudget: 30000, remaining: 30000, knownSpent: 0, halted: false }),
    JSON.stringify({ version: 1, model: "gpt-5.6-sol", tokenBudget: 30000, remaining: 30000, knownSpent: 1, halted: false }),
    JSON.stringify({ version: 1, model: "gpt-5.6-sol", tokenBudget: 30000, remaining: -1, knownSpent: 0, halted: false })]) {
    await writeFile(path, value);
    const status = await readRunnerStatus(f.task, { root: f.root, now: 1900000000000 });
    assert.equal(status.budget.status, "unavailable");
    assert.equal(status.budget.knownSpent, null);
    assert.equal(status.budget.remaining, null);
    assert.equal(await readFile(path, "utf8"), value);
  }
});

test("linked local state directories are refused and another owner's checkpoints are not read", async () => {
  const f = await fixture(), outside = await mkdtemp(join(tmpdir(), "lingnet-status-outside-"));
  await mkdir(join(f.root, ".lingnet", "budgets"), { recursive: true });
  await writeFile(join(outside, "budget.json"), JSON.stringify({ version: 1, model: "gpt-5.6-sol", tokenBudget: 30000, remaining: 0, knownSpent: 30000, halted: true }));
  await symlink(outside, join(f.root, ".lingnet", "budgets", f.payload.claim.id), process.platform === "win32" ? "junction" : "dir");
  const foreign = createHash("sha256").update("another-synthetic-owner").digest("hex");
  await mkdir(join(f.root, ".lingnet", "checkpoints", foreign), { recursive: true });
  await writeFile(join(f.root, ".lingnet", "checkpoints", foreign, `${randomUUID()}.json`), "private-synthetic-data");
  const status = await readRunnerStatus(f.task, { root: f.root, now: 1900000000000 });
  assert.equal(status.budget.status, "unavailable");
  assert.equal(status.budget.knownSpent, null);
  assert.equal(status.checkpoints.status, "unknown");
  assert.deepEqual(status.checkpoints.entries, []);
});

test("an expired task package stays distinguishable from unknown local observations and cannot reset accounting", async () => {
  const f = await fixture(), directory = join(f.root, ".lingnet", "budgets", f.payload.claim.id);
  await mkdir(directory, { recursive: true });
  const path = join(directory, "budget.json");
  await writeFile(path, JSON.stringify({ version: 1, model: "gpt-5.6-sol", tokenBudget: 30000, remaining: 0, knownSpent: 30000, halted: true }));
  const status = await readRunnerStatus(f.task, { root: f.root, now: f.payload.claim.expiresAt });
  assert.equal(status.claim.packageState, "expired");
  assert.equal(status.budget.remaining, 0);
  assert.equal(status.budget.knownSpent, 30000);
  assert.equal(status.budget.halted, true);
  assert.equal(status.budget.nearLimit, true);
  const tampered = structuredClone(f.task);
  tampered.payload.claim.id = randomUUID();
  await assert.rejects(readRunnerStatus(tampered, { root: f.root }), /摘要不匹配/);
});
