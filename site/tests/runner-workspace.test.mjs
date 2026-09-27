import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("model writes have a hard workspace cap and no writable host or daemon log sink", async () => {
  const source = await readFile(new URL("../public/runner-sandbox.mjs", import.meta.url), "utf8");
  assert.match(source, /\/workspace:rw,[^"\n]*size=64m/);
  assert.match(source, /source=\$\{workspace\},target=\/baseline,readonly/);
  assert.doesNotMatch(source, /source=\$\{workspace\},target=\/workspace[`",]/);
  assert.match(source, /"--log-driver", "none"/);
  assert.match(source, /"--memory-swap", "512m"/);
});

test("workspace export accepts only the same opened bounded regular artifact", async () => {
  const { exportArtifact, initializeWorkspace } = await import("../public/runner-workspace.mjs");
  const root = await mkdtemp(join(tmpdir(), "lingnet-workspace-unit-"));
  const baseline = join(root, "baseline"), workspace = join(root, "workspace");
  await mkdir(baseline); await mkdir(workspace);
  await writeFile(join(baseline, "tracked.md"), "Baseline");
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) if (/(API_KEY|TOKEN|SECRET|PASSWORD|GIT_CONFIG)/i.test(name)) delete environment[name];
  const git = (args) => execFileSync("git", args, { cwd: baseline, env: environment,
    windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "--initial-branch=main"]); git(["add", "tracked.md"]);
  git(["-c", "user.name=Synthetic", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Synthetic baseline"]);
  const commit = git(["rev-parse", "HEAD"]);
  await initializeWorkspace(baseline, workspace);
  await assert.rejects(readFile(join(workspace, ".git", "HEAD")), /ENOENT/);
  // Emulates the container's readonly metadata overlay; no model executes here.
  await symlink(join(baseline, ".git"), join(workspace, ".git"), "junction");
  await writeFile(join(workspace, "tracked.md"), "Valid changed artifact");
  const result = await exportArtifact(workspace, "tracked.md", commit);
  assert.equal(Buffer.from(result.base64, "base64").toString(), "Valid changed artifact");
  await assert.rejects(exportArtifact(workspace, "../tracked.md", commit), /路径/);
  await assert.rejects(exportArtifact(workspace, "tracked.md", "0".repeat(40)), /基线/);
  await writeFile(join(workspace, "extra.md"), "Out of scope");
  await assert.rejects(exportArtifact(workspace, "tracked.md", commit), /范围/);
});
