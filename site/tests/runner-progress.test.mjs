import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { startRunnerProgress, progressDirectoryParts } from "../public/runner-progress.mjs";
import { readRunnerStatus } from "../public/runner-status.mjs";
import { startRunnerStatusWorkbench } from "../public/runner-status-workbench.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lingnet-progress-"));
  const payload = { schemaVersion: 4, cultivatorId: "progress-owner", claim: { id: randomUUID(), expiresAt: Date.now() + 3600000 },
    repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit: "a".repeat(40) },
    mission: { id: "GOV-001", title: "Synthetic", description: "Synthetic", acceptance: "Synthetic", allowedPaths: ["GOVERNANCE.md"], artifactPath: "GOVERNANCE.md" },
    model: { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" },
    equipment: { localPreflight: false, checkpointSlots: 1, heartTalisman: false, presetSlots: 1 }, gameReward: { token: 0, cultivation: 0, merit: 0 } };
  const task = { payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  return { root, payload, task };
}

test("Runner progress is visible through owner HTTP, updates its heartbeat and ends at ready", async (t) => {
  const f = await fixture(), run = await startRunnerProgress(f.payload, { root: f.root });
  t.after(() => run.finish("failed"));
  const bench = await startRunnerStatusWorkbench(f.task, { root: f.root });
  t.after(() => bench.close());
  const get = async () => {
    const response = await fetch(`${bench.origin}/api/status`, { headers: { "X-Lingnet-Status": bench.token } });
    assert.equal(response.status, 200);
    return response.json();
  };
  let status = await get();
  assert.equal(status.progress.entries[0].phase, "preparing");
  assert.equal(status.progress.entries[0].heartbeat, "recent");
  const firstBeat = status.progress.entries[0].updatedAt;
  await delay(2200);
  status = await get();
  assert(status.progress.entries[0].updatedAt > firstBeat);
  for (const phase of ["restoring", "model", "validating", "exporting", "preflight"]) {
    await run.phase(phase);
    assert.equal((await get()).progress.entries[0].phase, phase);
  }
  await run.finish("ready");
  status = await get();
  assert.equal(status.progress.entries[0].phase, "ready");
  assert.equal(status.progress.entries[0].heartbeat, "ended");
  assert.equal(status.budget.knownSpent, null, "Stage observations do not invent model usage");
  assert.equal(status.claim.expiresAt, f.payload.claim.expiresAt);
  await assert.rejects(run.phase("model"), /阶段无效/);
});

test("lost heartbeat differs from completion and never changes the task lease", async (t) => {
  const f = await fixture(), run = await startRunnerProgress(f.payload, { root: f.root });
  t.after(() => run.finish("failed"));
  await run.phase("model");
  const now = Date.now() + 11000;
  let status = await readRunnerStatus(f.task, { root: f.root, now });
  assert.equal(status.progress.entries[0].heartbeat, "stale");
  assert.equal(status.progress.entries[0].finishedAt, null);
  assert.equal(status.claim.expiresAt, f.payload.claim.expiresAt);
  await run.finish("failed");
  status = await readRunnerStatus(f.task, { root: f.root });
  assert.equal(status.progress.entries[0].phase, "failed");
  assert.equal(status.progress.entries[0].heartbeat, "ended");
});

test("parallel attempts retain their own state and another owner sees none", async (t) => {
  const f = await fixture(), first = await startRunnerProgress(f.payload, { root: f.root }), second = await startRunnerProgress(f.payload, { root: f.root });
  t.after(() => Promise.all([first.finish("failed"), second.finish("failed")]));
  await first.phase("model");
  await second.finish("failed");
  const status = await readRunnerStatus(f.task, { root: f.root });
  assert.equal(status.progress.entries.length, 2);
  assert.equal(status.progress.entries.find((entry) => entry.id === first.id).heartbeat, "recent");
  assert.equal(status.progress.entries.find((entry) => entry.id === second.id).phase, "failed");
  const payload = { ...f.payload, cultivatorId: "another-owner" }, task = { payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  assert.deepEqual((await readRunnerStatus(task, { root: f.root })).progress, { status: "unknown", entries: [] });
});

test("progress returns only fixed metadata and malformed progress is unavailable", async () => {
  const f = await fixture(), run = await startRunnerProgress(f.payload, { root: f.root });
  await run.finish("ready");
  const path = join(f.root, ...progressDirectoryParts(f.payload), `${run.id}.json`);
  const record = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, JSON.stringify({ ...record, privatePrompt: "synthetic-private-prompt", error: "synthetic-private-error" }));
  const status = await readRunnerStatus(f.task, { root: f.root });
  assert(!JSON.stringify(status).includes("synthetic-private"));
  assert.deepEqual(Object.keys(status.progress.entries[0]).sort(), ["finishedAt", "heartbeat", "id", "phase", "startedAt", "updatedAt"]);
  await writeFile(path, JSON.stringify({ ...record, phase: "untrusted arbitrary text" }));
  assert.deepEqual((await readRunnerStatus(f.task, { root: f.root })).progress, { status: "unavailable", entries: [] });
});
