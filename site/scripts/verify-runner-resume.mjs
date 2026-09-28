import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Confirmed seam: real public Runner/CLI → interrupted count service → checkpoint → same-budget continuation.
const execute = promisify(execFile), site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "lingnet-runner-resume-"));
const invalidArtifact = process.argv.includes("--invalid-artifact");
const source = join(temporary, "source"), bundle = join(temporary, "bundle"), owner = join(temporary, "owner");
for (const path of [source, bundle, owner]) await mkdir(path);
const environment = { ...process.env, LINGNET_MODEL_API_KEY: "synthetic-upstream-private-key",
  LINGNET_MODEL_BASE_URL: "http://127.0.0.1:8800/v1", LINGNET_PROVIDER_LIMITS_VERIFIED: "1" };
for (const name of Object.keys(environment)) if (/(API_KEY|ACCESS_TOKEN|SECRET|PASSWORD|GIT_CONFIG)/i.test(name) && !name.startsWith("LINGNET_MODEL_")) delete environment[name];
const command = (program, args, cwd = source) => execute(program, args, { cwd, env: environment,
  windowsHide: true, timeout: 60_000, maxBuffer: 2_000_000 });
try {
  await writeFile(join(source, "plan.md"), "Synthetic only");
  await writeFile(join(source, "task.md"), "Synthetic scoped artifact only");
  await command("git", ["init", "--initial-branch=main"]);
  await command("git", ["add", "plan.md", "task.md"]);
  await command("git", ["-c", "user.name=Synthetic", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Synthetic baseline"]);
  const baseCommit = (await command("git", ["rev-parse", "HEAD"])).stdout.trim();
  Object.assign(environment, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.${source.replaceAll("\\", "/")}.insteadOf`,
    GIT_CONFIG_VALUE_0: "https://github.com/HardieBao/lingnet-ascension.git" });
  for (const file of ["runner.mjs", "runner-sandbox.mjs", "runner-workspace.mjs", "runner-checkpoints.mjs", "runner-presets.mjs"]) await copyFile(join(site, "public", file), join(bundle, file));
  await writeFile(join(bundle, "budget-gateway.mjs"), await readFile(join(site, "scripts", "fixtures", "runner-resume-provider.mjs"), "utf8") +
    "\n" + await readFile(join(site, "public", "budget-gateway.mjs"), "utf8"));
  const payload = { schemaVersion: 4, cultivatorId: "synthetic-owner", claim: { id: randomUUID(), expiresAt: Date.now() + 72 * 3600_000 },
    repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit },
    mission: { id: "PLAT-003C", title: "Synthetic", description: "Synthetic", acceptance: "Synthetic",
      allowedPaths: ["site/lib/mission-graph.ts"], artifactPath: "site/lib/mission-graph.ts" },
    model: { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" },
    equipment: { localPreflight: false, checkpointSlots: 1, heartTalisman: true, presetSlots: 1 }, gameReward: { token: 0, cultivation: 0, merit: 0 } };
  const task = join(owner, "task.json"), runner = join(bundle, "runner.mjs");
  await writeFile(task, JSON.stringify({ payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") }));
  const config = join(owner, "preset.json");
  await writeFile(config, JSON.stringify({ name: "谨慎修订", reasoningEffort: "low", maxOutputTokens: 128, promptSupplement: "坚持任务允许范围。" }));
  const preset = JSON.parse((await command(process.execPath, [runner, "preset-save", task, config], owner)).stdout);
  await assert.rejects(command(process.execPath, [runner, "run", task, "--preset", preset.id, "--ack-model-costs"], owner));
  const first = JSON.parse((await command(process.execPath, [runner, "checkpoints", task], owner)).stdout);
  assert.equal(first.length, 1);
  assert.equal(first[0].context.status, "model-failed");
  assert.equal(first[0].heartExtended, true);
  assert.equal(first[0].retainUntil - first[0].createdAt, 172800000);
  const records = async () => Promise.all((await readdir(join(owner, ".lingnet", "runs"))).map(async (id) =>
    JSON.parse(await readFile(join(owner, ".lingnet", "runs", id, "finished.json"), "utf8"))));
  const failed = (await records())[0];
  assert.equal(failed.status, "model-failed");
  assert.equal(failed.budget.knownSpent, 3);
  assert.equal(failed.budget.remaining, 29997);
  assert.equal(failed.budget.halted, false, "Count failed before generation, so there is no unknown paid request");
  if (invalidArtifact) {
    await writeFile(join(owner, ".lingnet", "budgets", payload.claim.id, "synthetic-invalid-resume"), "Synthetic provider scenario");
    await assert.rejects(command(process.execPath, [runner, "resume", task, first[0].id, "--preset", preset.id, "--ack-model-costs"], owner));
    assert.deepEqual(JSON.parse((await command(process.execPath, [runner, "checkpoints", task], owner)).stdout), []);
    await assert.rejects(readFile(join(owner, "PLAT-003C-mission-graph.ts")), /ENOENT/);
    const rejected = (await records()).find((record) => record.status === "model-completed");
    assert.equal(rejected.budget.knownSpent, 9);
    assert.equal(rejected.budget.remaining, 29991);
    assert.equal(rejected.claimId, failed.claimId);
    console.log("Actual isolated CLI: restored safe work followed by out-of-scope output cannot create another checkpoint or exported artifact; same budget spends 3 → 9, no refill. Synthetic only.");
    process.exitCode = 0;
  } else {
  await command(process.execPath, [runner, "resume", task, first[0].id, "--preset", preset.id, "--ack-model-costs"], owner);
  assert.equal((await readFile(join(owner, "PLAT-003C-mission-graph.ts"), "utf8")).trim(), "export const partial = true;");
  const completed = (await records()).find((record) => record.status === "model-completed");
  assert.equal(completed.claimId, failed.claimId);
  assert.equal(completed.budget.knownSpent, 6);
  assert.equal(completed.budget.remaining, 29994);
  assert.equal(completed.budget.tokenBudget, 30000);
  assert.equal(completed.presetId, preset.id);
  assert.equal(completed.reasoningEffort, "low");
  assert.equal(completed.requestOutputLimit, 128);
  assert.deepEqual(JSON.parse((await command(process.execPath, [runner, "checkpoints", task], owner)).stdout), []);
  await assert.rejects(command(process.execPath, [runner, "resume", task, first[0].id, "--ack-model-costs"], owner));
  assert.equal(JSON.stringify(await records()).includes(environment.LINGNET_MODEL_API_KEY), false);
  console.log("Actual isolated CLI: pre-generation service failure preserves safe partial work; checkpoint resumes once, no new allowance (spent 3 → 6 / 30,000), heart extension once, lease unchanged. Synthetic provider only.");
  }
} finally { console.log(`Synthetic resume workspace retained: ${temporary}`); }
