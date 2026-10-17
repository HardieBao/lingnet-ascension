import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platformCandidateScope, verifyPlatformCandidate } from "../../ci/verify-platform-candidate.mjs";

test("a separate platform audit includes migrations and verification materials but refuses its trusted commands and deployment settings", () => {
  assert.equal(platformCandidateScope(["site/app/model-usage/page.tsx", "site/lib/model-usage.ts", "site/drizzle/0019_model_usage.sql",
    "site/drizzle/meta/0019_snapshot.json", "site/drizzle/meta/_journal.json", "site/scripts/verify-model-usage.mjs", "site/tests/runner-usage-report.test.mjs"]), "platform-candidate");
  for (const path of ["ci/verify-pr.mjs", "ci/verify-platform-candidate.mjs", ".github/workflows/trusted-baseline.yml", "GOVERNANCE.md",
    "site/package.json", "site/package-lock.json", "site/wrangler.production.jsonc", "site/.dev.vars", "site/.env.local", "site/scripts/run-framework.mjs",
    "site/app/../package.json", "site/public/.env", "site/tests/../../ci/verify-pr.mjs", "site/drizzle/meta/unknown.json"]) {
    assert.equal(platformCandidateScope(["site/app/page.tsx", path]), "unsupported", path);
  }
});

test("platform audit rejects moved commits, dirty copies and protected paths before executing candidate programs", () => {
  const root = mkdtempSync(join(tmpdir(), "lingnet-platform-guard-")), trusted = join(root, "trusted"), candidate = join(root, "candidate");
  const git = (dir, args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  mkdirSync(trusted); git(trusted, ["init", "-q"]);
  git(trusted, ["config", "user.name", "Synthetic CI fixture"]); git(trusted, ["config", "user.email", "fixture@local.invalid"]);
  git(trusted, ["config", "core.autocrlf", "false"]);
  writeFileSync(join(trusted, "README.md"), "Synthetic guard fixture only\n"); git(trusted, ["add", "README.md"]); git(trusted, ["commit", "-qm", "Synthetic baseline"]);
  const base = git(trusted, ["rev-parse", "HEAD"]);
  execFileSync("git", ["-c", "core.autocrlf=false", "clone", "--quiet", "--no-hardlinks", trusted, candidate]);
  git(candidate, ["config", "user.name", "Synthetic CI fixture"]); git(candidate, ["config", "user.email", "fixture@local.invalid"]);
  git(candidate, ["config", "core.autocrlf", "false"]);
  mkdirSync(join(candidate, "site")); writeFileSync(join(candidate, "site", "package.json"), "{}\n");
  git(candidate, ["add", "site/package.json"]); git(candidate, ["commit", "-qm", "Synthetic protected path"]);
  const head = git(candidate, ["rev-parse", "HEAD"]);
  assert.throws(() => verifyPlatformCandidate(trusted, candidate, base, "a".repeat(40)), /提交已变化/);
  assert.throws(() => verifyPlatformCandidate(trusted, candidate, base, head), /受保护规则/);
  writeFileSync(join(trusted, "unrecorded.txt"), "Synthetic dirty boundary\n");
  assert.throws(() => verifyPlatformCandidate(trusted, candidate, base, head), /未记录/);
  assert.equal(git(trusted, ["rev-parse", "HEAD"]), base);
});

test("platform audit does not authorize unrelated migrations or snapshots", () => {
  for (const path of ["site/drizzle/0020_unreviewed.sql", "site/drizzle/0019_other.sql", "site/drizzle/meta/0020_snapshot.json"]) {
    assert.equal(platformCandidateScope(["site/app/page.tsx", path]), "unsupported", path);
  }
});

test("platform audit rejects altered approved-name migration bytes before changing the baseline", () => {
  const root = mkdtempSync(join(tmpdir(), "lingnet-platform-migration-")), trusted = join(root, "trusted"), candidate = join(root, "candidate");
  const git = (dir, args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  mkdirSync(trusted); git(trusted, ["init", "-q"]);
  git(trusted, ["config", "user.name", "Synthetic CI fixture"]); git(trusted, ["config", "user.email", "fixture@local.invalid"]);
  git(trusted, ["config", "core.autocrlf", "false"]);
  writeFileSync(join(trusted, "README.md"), "Synthetic immutable migration guard\n");
  git(trusted, ["add", "README.md"]); git(trusted, ["commit", "-qm", "Synthetic baseline"]);
  const base = git(trusted, ["rev-parse", "HEAD"]);
  execFileSync("git", ["-c", "core.autocrlf=false", "clone", "--quiet", "--no-hardlinks", trusted, candidate]);
  git(candidate, ["config", "user.name", "Synthetic CI fixture"]); git(candidate, ["config", "user.email", "fixture@local.invalid"]);
  git(candidate, ["config", "core.autocrlf", "false"]);
  mkdirSync(join(candidate, "site", "drizzle"), { recursive: true });
  writeFileSync(join(candidate, "site", "drizzle", "0019_model_usage.sql"), "CREATE TABLE unreviewed_change (id INTEGER);\n");
  git(candidate, ["add", "site/drizzle/0019_model_usage.sql"]); git(candidate, ["commit", "-qm", "Synthetic altered migration"]);
  const head = git(candidate, ["rev-parse", "HEAD"]);
  assert.throws(() => verifyPlatformCandidate(trusted, candidate, base, head), /迁移内容不匹配/);
  assert.equal(git(trusted, ["status", "--porcelain"]), "");
  assert.equal(git(trusted, ["rev-parse", "HEAD"]), base);
});
