import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { startRunnerStatusWorkbench } from "../public/runner-status-workbench.mjs";

// Previously adopted seams: loopback HTTP and public CLI, synthetic files only.
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lingnet-status-http-"));
  const payload = { schemaVersion: 4, cultivatorId: "synthetic-status-owner", claim: { id: randomUUID(), expiresAt: Date.now() + 3600000 },
    repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit: "a".repeat(40) },
    mission: { id: "GOV-001", title: "Synthetic", description: "Synthetic", acceptance: "Synthetic", allowedPaths: ["GOVERNANCE.md"], artifactPath: "GOVERNANCE.md" },
    model: { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" },
    equipment: { localPreflight: false, checkpointSlots: 1, heartTalisman: false, presetSlots: 1 }, gameReward: { token: 0, cultivation: 0, merit: 0 } };
  const task = { payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  return { root, task, payload };
}

test("owner loopback HTTP reads current budget snapshots without initializing a missing Runner store", async (t) => {
  const f = await fixture(), bench = await startRunnerStatusWorkbench(f.task, { root: f.root });
  t.after(() => bench.close());
  assert.equal(new URL(bench.origin).hostname, "127.0.0.1");
  const get = () => fetch(`${bench.origin}/api/status`, { headers: { "X-Lingnet-Status": bench.token } });
  let response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).budget.knownSpent, null);
  assert.deepEqual(await readdir(f.root), []);
  const directory = join(f.root, ".lingnet", "budgets", f.payload.claim.id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "budget.json"), JSON.stringify({ version: 1, model: "gpt-5.6-sol", tokenBudget: 30000,
    knownSpent: 24500, remaining: 3000, halted: true, privateInput: "synthetic-private-input" }));
  response = await get();
  const status = await response.json();
  assert.equal(status.budget.knownSpent, 24500);
  assert.equal(status.budget.reserved, 2500);
  assert.equal(status.budget.nearLimit, true);
  assert(!JSON.stringify(status).includes("synthetic-private-input"));
});

test("local page bootstraps a nonce-bound read-only session and rejects other origins or operations", async (t) => {
  const f = await fixture(), bench = await startRunnerStatusWorkbench(f.task, { root: f.root });
  t.after(() => bench.close());
  const response = await fetch(`${bench.origin}/`), html = await response.text();
  assert.equal(response.status, 200);
  assert(html.includes("本机闭关状态"));
  assert(html.includes("只读"));
  assert(html.includes("FINISH: unreviewed and undocumented is unfinished"));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert(response.headers.get("content-security-policy").includes(`script-src 'nonce-${bench.token}'`));
  assert(response.headers.get("content-security-policy").includes("frame-ancestors 'none'"));
  for (const headers of [{}, { "X-Lingnet-Status": "wrong" }, { "X-Lingnet-Status": bench.token, Origin: "https://foreign.invalid" },
    { "X-Lingnet-Status": bench.token, "Sec-Fetch-Site": "cross-site" }]) {
    assert.equal((await fetch(`${bench.origin}/api/status`, { headers })).status, 403);
  }
  const wrongHost = await new Promise((done, reject) => {
    const call = request(`${bench.origin}/api/status`, { headers: { Host: "foreign.invalid", "X-Lingnet-Status": bench.token } },
      (response) => { response.resume(); done(response.statusCode); });
    call.once("error", reject); call.end();
  });
  assert.equal(wrongHost, 403);
  assert.equal((await fetch(`${bench.origin}/`, { headers: { Origin: "https://foreign.invalid" } })).status, 403);
  assert.equal((await fetch(`${bench.origin}/api/status`, { method: "POST", headers: { "X-Lingnet-Status": bench.token } })).status, 405);
  assert.equal((await fetch(`${bench.origin}/api/status?root=elsewhere`, { headers: { "X-Lingnet-Status": bench.token } })).status, 404);
});

test("the public status CLI needs no model consent, stops normally and preserves local task files", async (t) => {
  const f = await fixture(), packagePath = join(f.root, "task.json");
  await writeFile(packagePath, JSON.stringify(f.task));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../public/runner-status-cli.mjs", import.meta.url)), packagePath],
    { cwd: f.root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const exited = new Promise((done) => child.once("exit", (code) => done(code)));
  t.after(async () => { if (child.exitCode === null) child.stdin.end("stop\n"); await exited; });
  let stdout = "", stderr = "";
  child.stderr.on("data", (value) => { stderr += value; });
  const origin = await new Promise((done, reject) => {
    const timeout = setTimeout(() => reject(new Error("Status CLI failed to become ready")), 5000);
    child.stdout.on("data", (value) => {
      stdout += value;
      const match = stdout.match(/LOCAL_RUNNER_STATUS=(http:\/\/127\.0\.0\.1:\d+)\//);
      if (match) { clearTimeout(timeout); done(match[1]); }
    });
    child.once("exit", () => { clearTimeout(timeout); reject(new Error("Status CLI exited before ready")); });
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
  });
  assert.equal((await fetch(`${origin}/`)).status, 200);
  child.stdin.end("stop\n");
  assert.equal(await exited, 0);
  assert.equal(stderr, "");
  assert.deepEqual(await readdir(f.root), ["task.json"]);
  await assert.rejects(fetch(`${origin}/`));
});

test("the status session pins its root and expired task instead of accepting changed caller contracts", async (t) => {
  const f = await fixture();
  f.payload.claim.expiresAt = Date.now() - 1000;
  f.task.sha256 = createHash("sha256").update(JSON.stringify(f.payload)).digest("hex");
  const claimId = f.payload.claim.id, bench = await startRunnerStatusWorkbench(f.task, { root: f.root });
  t.after(() => bench.close());
  f.payload.claim.id = randomUUID();
  f.payload.claim.expiresAt = Date.now() + 3600000;
  const response = await fetch(`${bench.origin}/api/status`, { headers: { "X-Lingnet-Status": bench.token } });
  const status = await response.json();
  assert.equal(response.status, 200);
  assert.equal(status.claim.id, claimId);
  assert.equal(status.claim.packageState, "expired");
  assert.equal(status.budget.remaining, null);
  assert.equal("gameReward" in status, false);
});

test("invalid or oversized CLI task files fail without echoing private contents or creating state", async () => {
  const f = await fixture(), path = join(f.root, "bad.json");
  for (const value of ["synthetic-private-content", "x".repeat(131073)]) {
    await writeFile(path, value);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../public/runner-status-cli.mjs", import.meta.url)), path],
      { cwd: f.root, windowsHide: true, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert(!result.stderr.includes(value));
    assert.deepEqual(await readdir(f.root), ["bad.json"]);
  }
});
