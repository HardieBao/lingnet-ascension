import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildCodeCheckArgs, classifyChangedPaths, verifyPullRequest } from "../../ci/verify-pr.mjs";
import { validateProfileCandidate } from "../../ci/profile-candidate.mjs";

const paths = ["site/app/api/profile/route.ts", "site/app/api/profiles/[publicId]/route.ts",
  "site/app/cultivators/[publicId]/page.tsx", "site/app/dwelling/dwelling.css", "site/app/dwelling/page.tsx",
  "site/app/dwelling/profile-settings.tsx", "site/app/page.tsx", "site/db/schema.ts",
  "site/drizzle/0017_cultivator_profiles.sql", "site/drizzle/meta/0017_snapshot.json",
  "site/drizzle/meta/_journal.json", "site/lib/cultivator-profile.ts", "site/scripts/verify-profile-privacy.mjs"];

test("the complete PR21 profile slice has a dedicated audit instead of skipping its migration and verification materials", () => {
  assert.equal(classifyChangedPaths(paths), "profile-privacy");
  for (const path of ["ci/verify-pr.mjs", ".github/workflows/trusted-baseline.yml", "site/package.json",
    "site/tests/ci-scope.test.mjs", "site/drizzle/0016_deep_mother_askani.sql", "site/drizzle/0018_community.sql",
    "site/.dev.vars", "site/wrangler.production.jsonc", "site/app/../package.json"]) {
    assert.equal(classifyChangedPaths([...paths, path]), "unsupported", path);
  }
  assert.equal(classifyChangedPaths(paths.filter((path) => path !== "site/drizzle/meta/0017_snapshot.json")), "unsupported");
});

test("the actual verifier rejects changed migration contents before applying or executing the contribution", () => {
  const candidate = mkdtempSync(join(tmpdir(), "lingnet-profile-ci-")), trusted = join(candidate, "unused-trusted");
  const git = (...args) => execFileSync("git", args, { cwd: candidate, encoding: "utf8" }).trim();
  git("init", "-q"); git("config", "user.name", "Synthetic fixture"); git("config", "user.email", "fixture@local.invalid");
  git("config", "commit.gpgsign", "false"); git("config", "core.autocrlf", "false");
  writeFileSync(join(candidate, "README.md"), "Synthetic only\n"); git("add", "README.md"); git("commit", "-qm", "baseline");
  const base = git("rev-parse", "HEAD");
  for (const path of paths) { mkdirSync(dirname(join(candidate, path)), { recursive: true }); writeFileSync(join(candidate, path), "Synthetic modified contract\n"); }
  git("add", "site"); git("commit", "-qm", "invalid profile artifacts");
  assert.throws(() => verifyPullRequest(trusted, candidate, base), /不匹配固定契约/);
  assert.throws(() => validateProfileCandidate(candidate, paths), /不匹配固定契约/);
  writeFileSync(join(candidate, "unrecorded.txt"), "Synthetic dirty file\n");
  assert.throws(() => validateProfileCandidate(candidate, paths), /干净/);
});

test("the profile route keeps baseline checks and runs a baseline-owned privacy harness inside the restricted container", () => {
  const args = buildCodeCheckArgs("/trusted", "profile-privacy");
  assert.match(args.at(-1), /npm test && npm run typecheck -- --incremental false && npm run lint && npm run build/);
  assert.match(args.at(-1), /node \.\.\/ci\/check-profile-privacy\.mjs$/);
  assert.doesNotMatch(args.at(-1), /node scripts\/verify-profile-privacy/);
  for (const value of ["--read-only", "none", "10001:10001", "--cpus", "2", "--memory", "3g", "--pids-limit", "512"]) assert(args.includes(value));
});
