import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Confirmed seam: actual public Runner → isolated CLI → model HTTP → artifact and budget record.
const exec = promisify(execFile), site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "lingnet-bounded-runner-"));
const source = join(temporary, "source"), bundle = join(temporary, "bundle"), owner = join(temporary, "owner");
for (const path of [source, bundle, owner]) await mkdir(path);
const environment = { ...process.env, LINGNET_MODEL_API_KEY: "synthetic-upstream-private-key",
  LINGNET_MODEL_BASE_URL: "http://127.0.0.1:8800/v1", LINGNET_PROVIDER_LIMITS_VERIFIED: "1" }; // Applies only to this controlled mock, not the real proxy.
for (const name of Object.keys(environment)) if (/(API_KEY|ACCESS_TOKEN|SECRET|PASSWORD|GIT_CONFIG)/i.test(name) && !name.startsWith("LINGNET_MODEL_")) delete environment[name];
async function command(program, args, cwd = source, env = environment) {
  return exec(program, args, { cwd, env, windowsHide: true, timeout: 120_000, maxBuffer: 2_000_000 });
}
try {
  await writeFile(join(source, "plan.md"), "Synthetic fixture, not community evidence.");
  await writeFile(join(source, "task.md"), "Synthetic artifact only.");
  await command("git", ["init", "--initial-branch=main"]);
  await command("git", ["add", "plan.md", "task.md"]);
  await command("git", ["-c", "user.name=Synthetic", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Synthetic baseline"]);
  const baseCommit = (await command("git", ["rev-parse", "HEAD"])).stdout.trim();
  // Rewrite only this fixture process's external repository URL to a synthetic local Git server.
  Object.assign(environment, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.${source.replaceAll("\\", "/")}.insteadOf`,
    GIT_CONFIG_VALUE_0: "https://github.com/HardieBao/lingnet-ascension.git" });
  for (const file of ["runner.mjs", "runner-sandbox.mjs", "runner-workspace.mjs"]) await copyFile(join(site, "public", file), join(bundle, file));
  // Copy the real gateway unchanged; prepend only an external mock provider on container loopback.
  await writeFile(join(bundle, "budget-gateway.mjs"),
    await readFile(join(site, "scripts", "fixtures", "runner-artifact-provider.mjs"), "utf8") + "\n" + await readFile(join(site, "public", "budget-gateway.mjs"), "utf8"));
  const payload = { schemaVersion: 3, claim: { id: randomUUID(), expiresAt: Date.now() + 3600_000 },
    repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit },
    mission: { id: "PLAT-003C", title: "Synthetic", description: "Synthetic only", acceptance: "Synthetic",
      allowedPaths: ["site/lib/mission-graph.ts"], artifactPath: "site/lib/mission-graph.ts" },
    model: { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" },
    equipment: { localPreflight: false }, gameReward: { token: 0, cultivation: 0, merit: 0 } };
  const taskPath = join(owner, "task.json"), runner = join(bundle, "runner.mjs");
  await writeFile(taskPath, JSON.stringify({ payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") }));
  await command(process.execPath, [runner, "run", taskPath, "--ack-model-costs"], owner);
  assert.equal((await readFile(join(owner, "PLAT-003C-mission-graph.ts"), "utf8")).trim(), "export const syntheticArtifact = true;");
  const records = async () => Promise.all((await readdir(join(owner, ".lingnet", "runs"))).map(async (id) =>
    JSON.parse(await readFile(join(owner, ".lingnet", "runs", id, "finished.json"), "utf8"))));
  const first = await records();
  assert.equal(first.length, 1);
  assert.equal(first[0].status, "model-completed");
  assert.equal(first[0].budget.knownSpent, 30000);
  assert.equal(first[0].budget.remaining, 0);
  assert.equal(first[0].budgetSource, "local-capped-gateway");
  // Same claim, changed task hash: equipment/lease refreshes must not mint another model allowance.
  const refreshed = { ...payload, claim: { ...payload.claim, expiresAt: Date.now() + 7200_000 } };
  await writeFile(taskPath, JSON.stringify({ payload: refreshed, sha256: createHash("sha256").update(JSON.stringify(refreshed)).digest("hex") }));
  await assert.rejects(command(process.execPath, [runner, "run", taskPath, "--ack-model-costs"], owner));
  const all = await records();
  assert.equal(all.length, 2);
  const failed = all.find((record) => record.status === "model-failed");
  assert.equal(failed.budget.knownSpent, 30000);
  assert.equal(failed.budget.remaining, 0);
  assert.equal((await readdir(join(owner, ".lingnet", "budgets", payload.claim.id))).some((name) => name.endsWith(".env") || name.endsWith(".lock")), false);
  assert.equal(JSON.stringify(all).includes(environment.LINGNET_MODEL_API_KEY), false);
  console.log("Public Runner: real isolated CLI writes scoped artifact; 30,000-token claim budget persists; refreshed package cannot refill; only numeric receipts, no private key.");
} finally { console.log(`Synthetic Runner workspace retained: ${temporary}`); }
