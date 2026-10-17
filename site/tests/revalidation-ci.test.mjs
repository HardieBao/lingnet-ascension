import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { classifyChangedPaths } from "../../ci/verify-pr.mjs";

test("ordinary baseline routes one report to dedicated revalidation, never arbitrary source changes", () => {
  const path = "revalidations/11111111-1111-4111-8111-111111111111.json";
  assert.equal(classifyChangedPaths([path]), "revalidation-report");
  assert.equal(classifyChangedPaths([path, ".github/workflows/revalidation.yml"]), "unsupported");
  assert.equal(classifyChangedPaths(["revalidations/../site/lib/verifier.ts"]), "unsupported");
});

test("trusted revalidation CLI replays the exact integrated document without applying the report as code", () => {
  const directory = mkdtempSync(join(tmpdir(), "lingnet-revalidation-ci-test-"));
  const repository = join(directory, "repository");
  mkdirSync(repository);
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Revalidation Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "commit.gpgsign", "false");
    git("config", "core.autocrlf", "false");
    const content = readFileSync(new URL("./fixtures/gov001-charter.md", import.meta.url));
    copyFileSync(new URL("./fixtures/gov001-charter.md", import.meta.url), join(repository, "GOVERNANCE.md"));
    git("add", "GOVERNANCE.md");
    git("commit", "-m", "integrated fixture");
    const commit = git("rev-parse", "HEAD");
    mkdirSync(join(repository, "revalidations"));
    writeFileSync(join(repository, "revalidations", "11111111-1111-4111-8111-111111111111.json"), JSON.stringify({
      version: 1, submissionId: "11111111-1111-4111-8111-111111111111", missionId: "GOV-001", artifactPath: "GOVERNANCE.md",
      integratedCommit: commit, artifactSha256: createHash("sha256").update(content).digest("hex"),
      validatorBaseCommit: commit, reporterGitHubId: "202", findings: "隔离报告：重新执行固定提交的章程验收，不修改成果或可信验证器。",
    }));
    git("add", "revalidations");
    git("commit", "-m", "report fixture");
    const environment = { ...process.env };
    delete environment.GITHUB_OUTPUT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types",
      fileURLToPath(new URL("../../ci/verify-revalidation.mjs", import.meta.url)), repository, repository, commit, "202"],
    { encoding: "utf8", env: environment, timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /revalidation_result=passed/);
    assert.equal(git("status", "--porcelain"), "");
  } finally {
    const target = resolve(directory);
    assert(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith("lingnet-revalidation-ci-test-"));
    rmSync(target, { recursive: true, force: true });
  }
});
