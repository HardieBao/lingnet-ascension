import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildCodeCheckArgs, buildCodeTypegenArgs, classifyChangedPaths, verifyCharter, verifyDocument, verifyPullRequest } from "../../ci/verify-pr.mjs";

test("only a single GOV-001 document uses the charter verifier", () => {
  assert.equal(classifyChangedPaths(["GOVERNANCE.md"]), "charter");
  assert.equal(classifyChangedPaths(["GOVERNANCE.md", "site/lib/verifier.ts"]), "unsupported");
  assert.doesNotThrow(() => verifyCharter(new URL("./fixtures/gov001-charter.md", import.meta.url)));
});

test("GOV-002 has a separate trusted document gate", () => {
  assert.equal(classifyChangedPaths(["docs/WORLD_BRIEF.md"]), "world-brief");
  assert.equal(classifyChangedPaths(["docs/WORLD_BRIEF.md", "site/lib/verifier.ts"]), "unsupported");
  assert.doesNotThrow(() => verifyDocument("GOV-002", new URL("./fixtures/gov002-world-brief.md", import.meta.url)));
});

test("GOV-003 architecture report has its own trusted single-file gate", () => {
  assert.equal(classifyChangedPaths(["docs/ARCHITECTURE_SPIKE.md"]), "architecture-spike");
  assert.equal(classifyChangedPaths(["docs/ARCHITECTURE_SPIKE.md", "site/lib/verifier.ts"]), "unsupported");
  assert.doesNotThrow(() => verifyDocument("GOV-003", new URL("./fixtures/gov003-architecture-spike.md", import.meta.url)));
});

test("GOV-004T has a separate trusted Token terms gate", () => {
  assert.equal(classifyChangedPaths(["docs/TOKEN_TERMS.md"]), "token-terms");
  assert.equal(classifyChangedPaths(["docs/TOKEN_TERMS.md", "site/lib/verifier.ts"]), "unsupported");
  assert.doesNotThrow(() => verifyDocument("GOV-004T", new URL("./fixtures/gov004t-token-terms.md", import.meta.url)));
});

test("code regression scope cannot alter verifier commands or tests", () => {
  assert.equal(classifyChangedPaths(["site/app/page.tsx", "site/lib/realms.ts"]), "code-regression");
  assert.equal(classifyChangedPaths(["site/package.json"]), "unsupported");
  assert.equal(classifyChangedPaths(["site/tests/verifier.test.mjs"]), "unsupported");
  assert.equal(classifyChangedPaths([".github/workflows/trusted-baseline.yml"]), "unsupported");
});

test("candidate code checks run with read-only source and no network", () => {
  const args = buildCodeCheckArgs("/trusted");
  assert.ok(args.includes("--read-only"));
  assert.ok(args.includes("--network"));
  assert.ok(args.includes("none"));
  assert.ok(args.includes("--cap-drop"));
  assert.ok(args.includes("no-new-privileges"));
  assert.ok(args.includes("type=bind,source=/trusted,target=/work,readonly"));
  assert.ok(args.includes("/work/site/node_modules/.vite-temp:rw,nosuid,nodev,mode=1777"));
  assert.ok(args.includes("10001:10001"));
  assert.ok(args.includes("LINGNET_CI_READONLY=1"));
  assert.ok(args.some((arg) => arg.includes("npm test && npm run typecheck -- --incremental false && npm run lint && npm run build")));
});

test("framework type preparation can write only the generated declaration before read-only checks", () => {
  const prepare = buildCodeTypegenArgs("/trusted");
  assert(prepare.includes("--read-only"));
  assert(prepare.includes("none"));
  assert(prepare.includes("no-new-privileges"));
  assert(prepare.includes("10001:10001"));
  assert(prepare.includes("type=bind,source=/trusted,target=/work,readonly"));
  assert(prepare.some((argument) => argument.replaceAll("\\", "/") === "type=bind,source=/trusted/site/next-env.d.ts,target=/work/site/next-env.d.ts"));
  assert.equal(prepare.at(-1), "cd /work/site && node node_modules/vinext/dist/cli.js typegen");
  assert.equal(buildCodeCheckArgs("/trusted").some((argument) => argument.includes("target=/work/site/next-env.d.ts")), false);
});

test("trusted verifier accepts a charter-only Git change", () => {
  const directory = mkdtempSync(join(tmpdir(), "lingnet-ci-test-"));
  const candidate = join(directory, "candidate");
  mkdirSync(candidate);
  const git = (...args) => execFileSync("git", ["-C", candidate, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-b", "main");
    git("config", "user.name", "CI Test");
    git("config", "user.email", "ci-test@example.invalid");
    git("config", "commit.gpgsign", "false");
    writeFileSync(join(candidate, "README.md"), "base\n");
    git("add", "README.md");
    git("commit", "-m", "base");
    const baseSha = git("rev-parse", "HEAD");
    copyFileSync(new URL("./fixtures/gov001-charter.md", import.meta.url), join(candidate, "GOVERNANCE.md"));
    git("add", "GOVERNANCE.md");
    git("commit", "-m", "add charter");
    const trusted = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    assert.doesNotThrow(() => verifyPullRequest(trusted, candidate, baseSha));
  } finally {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith("lingnet-ci-test-"));
    rmSync(target, { recursive: true, force: true });
  }
});

test("trusted verifier rejects a protected file renamed into an allowed code path", () => {
  const directory = mkdtempSync(join(tmpdir(), "lingnet-ci-test-"));
  const candidate = join(directory, "candidate");
  const trusted = join(directory, "trusted");
  mkdirSync(candidate);
  mkdirSync(trusted);
  const git = (...args) => execFileSync("git", ["-C", candidate, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-b", "main");
    git("config", "user.name", "CI Test");
    git("config", "user.email", "ci-test@example.invalid");
    git("config", "commit.gpgsign", "false");
    git("config", "diff.renames", "true");
    mkdirSync(join(candidate, ".github", "workflows"), { recursive: true });
    writeFileSync(join(candidate, ".github", "workflows", "trusted-baseline.yml"), "name: gate\n");
    git("add", ".github/workflows/trusted-baseline.yml");
    git("commit", "-m", "base");
    const baseSha = git("rev-parse", "HEAD");
    mkdirSync(join(candidate, "site", "public"), { recursive: true });
    git("mv", ".github/workflows/trusted-baseline.yml", "site/public/trusted-baseline.yml");
    git("commit", "-m", "move protected workflow");
    assert.throws(() => verifyPullRequest(trusted, candidate, baseSha), /没有对应的可信验证器/);
  } finally {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith("lingnet-ci-test-"));
    rmSync(target, { recursive: true, force: true });
  }
});
