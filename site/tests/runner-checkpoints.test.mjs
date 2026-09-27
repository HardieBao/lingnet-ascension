import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listCheckpoints, restoreCheckpoint, saveCheckpoint } from "../public/runner-checkpoints.mjs";
import * as checkpointApi from "../public/runner-checkpoints.mjs";

// Confirmed seam: public checkpoint API → scoped artifact in a fresh Git baseline.
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lingnet-checkpoints-")), source = join(root, "source"), target = join(root, "target");
  await mkdir(source);
  await writeFile(join(source, "plan.md"), "Synthetic only");
  const git = (args, cwd = source) => execFileSync("git", args, { cwd, windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "--initial-branch=main"]);
  git(["add", "plan.md"]);
  git(["-c", "user.name=Synthetic", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Synthetic baseline"]);
  const baseCommit = git(["rev-parse", "HEAD"]);
  git(["clone", source, target], root);
  await mkdir(join(source, "site", "lib"), { recursive: true });
  await writeFile(join(source, "site", "lib", "mission-graph.ts"), "export const partial = true;\n");
  const payload = { schemaVersion: 4, cultivatorId: "synthetic-owner", claim: { id: randomUUID(), expiresAt: Date.now() + 72 * 3600_000 },
    repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit },
    mission: { id: "PLAT-003C", title: "Synthetic", description: "Synthetic", acceptance: "Synthetic",
      allowedPaths: ["site/lib/mission-graph.ts"], artifactPath: "site/lib/mission-graph.ts" },
    model: { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" },
    equipment: { localPreflight: false, checkpointSlots: 1, heartTalisman: false }, gameReward: { token: 0, cultivation: 0, merit: 0 } };
  const signed = (value = payload) => ({ payload: value, sha256: createHash("sha256").update(JSON.stringify(value)).digest("hex") });
  return { root, source, target, payload, signed };
}

test("a checkpoint restores only the scoped artifact once, without changing the task lease or budget", async () => {
  const f = await fixture(), task = f.signed();
  const saved = await saveCheckpoint(task, f.source, { root: f.root });
  assert.equal(saved.retainUntil - saved.createdAt, 24 * 3600_000);
  assert.equal(saved.claimId, f.payload.claim.id);
  assert.equal(saved.context.mode, "artifact-reconstruction");
  const listed = await listCheckpoints(task, { root: f.root });
  assert.equal(listed.length, 1);
  assert.equal("content" in listed[0], false);
  await restoreCheckpoint(task, saved.id, f.target, { root: f.root });
  assert.equal(await readFile(join(f.target, "site", "lib", "mission-graph.ts"), "utf8"), "export const partial = true;\n");
  assert.equal(task.payload.claim.expiresAt, f.payload.claim.expiresAt);
  assert.equal(task.payload.model.tokenBudget, 30000);
  await assert.rejects(restoreCheckpoint(task, saved.id, f.target, { root: f.root }), /已恢复/);
  assert.deepEqual(await listCheckpoints(task, { root: f.root }), []);
});

test("base slots are shared across a cultivator's claims; a bag grants exactly one more slot without evicting old work", async () => {
  const f = await fixture(), first = await saveCheckpoint(f.signed(), f.source, { root: f.root });
  const next = { ...f.payload, claim: { ...f.payload.claim, id: randomUUID() } };
  await assert.rejects(saveCheckpoint(f.signed(next), f.source, { root: f.root }), /槽位已满/);
  const bag = { ...next, equipment: { ...next.equipment, checkpointSlots: 2 } };
  const second = await saveCheckpoint(f.signed(bag), f.source, { root: f.root });
  assert.notEqual(second.id, first.id);
  assert.equal((await listCheckpoints(f.signed(bag), { root: f.root })).length, 2);
  await assert.rejects(saveCheckpoint(f.signed(bag), f.source, { root: f.root }), /槽位已满/);
  await assert.rejects(saveCheckpoint(f.signed(next), f.source, { root: f.root }), /槽位已满/);
  assert.equal((await listCheckpoints(f.signed(next), { root: f.root })).length, 2);
  const other = { ...f.payload, cultivatorId: "another-synthetic-owner" };
  assert.deepEqual(await listCheckpoints(f.signed(other), { root: f.root }), []);
  await saveCheckpoint(f.signed(other), f.source, { root: f.root });
  assert.equal((await listCheckpoints(f.signed(), { root: f.root })).length, 2);
});

test("heart talisman extends a failed checkpoint once per claim, not every retry", async () => {
  const f = await fixture(), equipped = { ...f.payload, equipment: { ...f.payload.equipment, heartTalisman: true } };
  const first = await saveCheckpoint(f.signed(equipped), f.source, { root: f.root });
  assert.equal(first.retainUntil - first.createdAt, 48 * 3600_000);
  await restoreCheckpoint(f.signed(equipped), first.id, f.target, { root: f.root });
  const second = await saveCheckpoint(f.signed(equipped), f.source, { root: f.root });
  assert.equal(second.retainUntil - second.createdAt, 24 * 3600_000);
});

test("expiry cleans only cached copies and an expired lease cannot consume a still-retained checkpoint", async () => {
  const f = await fixture(), saved = await saveCheckpoint(f.signed(), f.source, { root: f.root });
  const expiredLease = { ...f.payload, claim: { ...f.payload.claim, expiresAt: saved.createdAt + 1000 } };
  await assert.rejects(restoreCheckpoint(f.signed(expiredLease), saved.id, f.target,
    { root: f.root, now: saved.createdAt + 1001 }), /不受当前 Runner 支持/);
  assert.equal((await listCheckpoints(f.signed(), { root: f.root })).length, 1);
  assert.deepEqual(await listCheckpoints(f.signed(), { root: f.root, now: saved.retainUntil }), []);
  assert.equal(await readFile(join(f.source, "site", "lib", "mission-graph.ts"), "utf8"), "export const partial = true;\n");
  await assert.rejects(restoreCheckpoint(f.signed(), saved.id, f.target,
    { root: f.root, now: saved.retainUntil }), /不存在或已过期/);
});

test("mismatched claims and dirty targets preserve both the checkpoint and user changes", async () => {
  const f = await fixture(), saved = await saveCheckpoint(f.signed(), f.source, { root: f.root });
  const wrongClaim = { ...f.payload, claim: { ...f.payload.claim, id: randomUUID() } };
  await assert.rejects(restoreCheckpoint(f.signed(wrongClaim), saved.id, f.target, { root: f.root }), /不属于/);
  await writeFile(join(f.target, "plan.md"), "Existing user changes");
  await assert.rejects(restoreCheckpoint(f.signed(), saved.id, f.target, { root: f.root }), /不会覆盖已有改动/);
  assert.equal(await readFile(join(f.target, "plan.md"), "utf8"), "Existing user changes");
  assert.equal((await listCheckpoints(f.signed(), { root: f.root })).length, 1);
});

test("concurrent restore attempts have exactly one winner", async () => {
  const f = await fixture(), saved = await saveCheckpoint(f.signed(), f.source, { root: f.root });
  const attempts = await Promise.allSettled(Array.from({ length: 10 }, () =>
    restoreCheckpoint(f.signed(), saved.id, f.target, { root: f.root })));
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 9);
});

test("sensitive artifacts and invalid status never become checkpoints", async () => {
  const f = await fixture();
  for (const content of ["sk-" + "F".repeat(40), "-----BEGIN PRIVATE KEY-----", 'API_KEY="synthetic-private-value"']) {
    await writeFile(join(f.source, "site", "lib", "mission-graph.ts"), content);
    await assert.rejects(saveCheckpoint(f.signed(), f.source, { root: f.root }), /凭据|私人配置/);
    assert.deepEqual(await listCheckpoints(f.signed(), { root: f.root }), []);
  }
  await assert.rejects(saveCheckpoint(f.signed(), f.source, { root: f.root, status: "PRIVATE_ERROR_TEXT" }), /状态无效/);
});

test("a corrupt checkpoint reports no private JSON fragments", async () => {
  const f = await fixture(), saved = await saveCheckpoint(f.signed(), f.source, { root: f.root });
  const privateMarker = "synthetic-private-corrupt-value";
  const [directory] = await readdir(join(f.root, ".lingnet", "checkpoints"));
  await writeFile(join(f.root, ".lingnet", "checkpoints", directory, `${saved.id}.json`), `{"value":"${privateMarker}" BROKEN`);
  await assert.rejects(listCheckpoints(f.signed(), { root: f.root }), (error) =>
    /检查点格式无效/.test(error.message) && !error.message.includes(privateMarker));
});

test("explicit discard frees a slot without deleting the original work", async () => {
  const f = await fixture(), saved = await saveCheckpoint(f.signed(), f.source, { root: f.root });
  assert.deepEqual(await checkpointApi.discardCheckpoint(f.signed(), saved.id, { root: f.root }), { discarded: true });
  assert.deepEqual(await listCheckpoints(f.signed(), { root: f.root }), []);
  assert.equal(await readFile(join(f.source, "site", "lib", "mission-graph.ts"), "utf8"), "export const partial = true;\n");
  await saveCheckpoint(f.signed(), f.source, { root: f.root });
});

test("the public CLI lists checkpoint metadata without loading model credentials", async () => {
  const f = await fixture(), task = f.signed(), saved = await saveCheckpoint(task, f.source, { root: f.root });
  const taskPath = join(f.root, "task.json");
  await writeFile(taskPath, JSON.stringify(task));
  const output = execFileSync(process.execPath, [fileURLToPath(new URL("../public/runner.mjs", import.meta.url)), "checkpoints", taskPath],
    { cwd: f.root, windowsHide: true, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
  const listed = JSON.parse(output);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, saved.id);
  assert.equal(output.includes("export const partial"), false);
});
