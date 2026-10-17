import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildUsageReport } from "../public/runner-usage-report.mjs";

function taskPackage(now) {
  const payload = { schemaVersion: 4, cultivatorId: "synthetic-usage-owner", claim: { id: randomUUID(), expiresAt: now - 1 },
    repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit: "a".repeat(40) },
    mission: { id: "GOV-001", title: "Synthetic", description: "Synthetic", acceptance: "Synthetic", allowedPaths: ["GOVERNANCE.md"], artifactPath: "GOVERNANCE.md" },
    model: { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" },
    equipment: { localPreflight: false, checkpointSlots: 1, heartTalisman: false, presetSlots: 1 }, gameReward: { token: 0, cultivation: 0, merit: 0 } };
  return { payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

test("an expired task exports unknown usage without initializing state or declaring paid usage zero", async () => {
  const root = await mkdtemp(join(tmpdir(), "lingnet-usage-report-")), now = 1900000000000;
  const task = taskPackage(now), { payload } = task;
  const report = await buildUsageReport(task, { root, now });
  assert.equal(report.claimId, payload.claim.id); assert.equal(report.source, "local-runner-observation");
  assert.deepEqual(report.budget, { status: "unknown", knownSpent: null, remaining: null, reserved: null, halted: null });
  assert.equal(report.observedAt, now); assert.equal(report.model.id, "gpt-5.6-sol");
  assert.deepEqual(await readdir(root), []);
});

test("public Runner CLI exports only numeric observations and cannot overwrite or write outside its root", async () => {
  const root = await mkdtemp(join(tmpdir(), "lingnet-usage-cli-")), task = taskPackage(Date.now());
  await writeFile(join(root, "task.json"), JSON.stringify(task));
  const directory = join(root, ".lingnet", "budgets", task.payload.claim.id); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "budget.json"), JSON.stringify({ version: 1, model: "gpt-5.6-sol", tokenBudget: 30000,
    knownSpent: 24500, remaining: 3000, halted: true, privateKey: "synthetic-private-key", prompt: "synthetic-private-prompt" }));
  const runner = fileURLToPath(new URL("../public/runner.mjs", import.meta.url));
  const invoke = (file) => spawnSync(process.execPath, [runner, "usage-report", "task.json", file], { cwd: root, encoding: "utf8" });
  const result = invoke("report.json"); assert.equal(result.status, 0, result.stderr);
  const bytes = await readFile(join(root, "report.json"), "utf8"), report = JSON.parse(bytes);
  assert.deepEqual(report.budget, { status: "observed", knownSpent: 24500, remaining: 3000, reserved: 2500, halted: true });
  assert(!bytes.includes("synthetic-private")); assert(!result.stdout.includes("synthetic-private"));
  assert.equal(invoke("report.json").status, 1); assert.equal(await readFile(join(root, "report.json"), "utf8"), bytes);
  assert.equal(invoke("../outside-report.json").status, 1);
});
