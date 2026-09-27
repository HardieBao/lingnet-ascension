import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { inspectCodePullRequest } from "../lib/code-pull-request.ts";

const base = "a".repeat(40);
const head = "b".repeat(40);
const blob = "c".repeat(40);
const merge = "d".repeat(40);
const path = "site/lib/mission-graph.ts";
const content = "export function hasCycle() { return false; }\n";
const digest = createHash("sha256").update(content).digest("hex");

function fixture(overrides = {}) {
  const pull = {
    state: "open", draft: false, changed_files: 1, mergeable: true,
    merge_commit_sha: merge, user: { id: 123 },
    base: { ref: "main", repo: { full_name: "HardieBao/lingnet-ascension" } },
    head: { sha: head, repo: { full_name: "contributor/lingnet-ascension" } },
    ...overrides.pull,
  };
  const comparison = {
    url: `https://api.github.com/repos/HardieBao/lingnet-ascension/compare/${base}...${head}`,
    status: "ahead", base_commit: { sha: base }, merge_base_commit: { sha: base },
    files: overrides.files ?? [{ filename: path, status: "added", sha: blob }],
    ...overrides.comparison,
  };
  const file = {
    type: "file", encoding: "base64", content: Buffer.from(content).toString("base64"),
    size: Buffer.byteLength(content), sha: blob,
    ...overrides.file,
  };
  const runs = overrides.runs ?? { workflow_runs: [{
    id: 42, run_attempt: 1, name: "Trusted baseline gate", path: ".github/workflows/trusted-baseline.yml@main",
    event: "pull_request", head_sha: head, status: "completed", conclusion: "success",
  }] };
  const jobs = overrides.jobs ?? { jobs: [{ name: "pull-request", head_sha: head, run_attempt: 1, status: "completed", conclusion: "success",
    steps: [{ name: `Verified ${head} on merge ${merge}`, status: "completed", conclusion: "success" }] }] };
  const responses = [Response.json(pull), Response.json(comparison), Response.json(file), Response.json(runs), Response.json(jobs)];
  const requests = [];
  return {
    requests,
    fetcher: async (url) => {
      requests.push(url);
      return responses.shift() ?? Response.json({}, { status: 500 });
    },
  };
}

test("code PR source is bound to author, fixed base, one path and exact head bytes", async () => {
  const { requests, fetcher } = fixture();
  assert.deepEqual(await inspectCodePullRequest(7, "123", base, path, fetcher), {
    passed: true, number: 7,
    url: "https://github.com/HardieBao/lingnet-ascension/pull/7",
    headSha: head, filePath: path, fileSha256: digest, ciRunId: 42, ciRunAttempt: 1, testMergeSha: merge,
  });
  assert.match(requests[1], new RegExp(`compare/${base}\\.\\.\\.${head}`));
  assert.equal(requests.some((request) => request.includes("/pulls/7/files")), false);
  assert.match(requests[2], new RegExp(`repos/contributor/lingnet-ascension/contents/${path}\\?ref=${head}`));
  assert.match(requests[3], new RegExp(`head_sha=${head}`));
  assert.match(requests[4], /actions\/runs\/42\/attempts\/1\/jobs/);
});

test("code PR rejects invalid task input before network access", async () => {
  const { requests, fetcher } = fixture();
  assert.equal((await inspectCodePullRequest(0, "123", base, path, fetcher)).passed, false);
  assert.equal((await inspectCodePullRequest(7, "123", base, "site/lib/../secrets.ts", fetcher)).passed, false);
  assert.equal((await inspectCodePullRequest(7, "123", base, ".github/workflows/ci.yml", fetcher)).passed, false);
  assert.deepEqual(requests, []);
});

test("code PR rejects another author, a draft and changed task scope", async () => {
  for (const pull of [{ user: { id: 999 } }, { draft: true }, { changed_files: 2 },
    { base: { ref: "dev", repo: { full_name: "HardieBao/lingnet-ascension" } } }]) {
    const { requests, fetcher } = fixture({ pull });
    assert.equal((await inspectCodePullRequest(7, "123", base, path, fetcher)).passed, false);
    assert.equal(requests.length, 1);
  }
});

test("code PR cannot mix a fixed workflow change with a later live allowed-file list", async () => {
  const { requests, fetcher } = fixture({
    comparison: { files: [{ filename: ".github/workflows/trusted-baseline.yml", status: "modified", sha: "e".repeat(40) }] },
    files: [{ filename: path, status: "modified", sha: blob }],
  });
  assert.equal((await inspectCodePullRequest(7, "123", base, path, fetcher)).passed, false);
  assert.equal(requests.length, 2);
});

test("code PR accepts the real comparison shape without an invented head_commit", async () => {
  const { fetcher } = fixture({ comparison: {
    commits: [{ sha: "e".repeat(40) }],
  } });
  assert.equal((await inspectCodePullRequest(7, "123", base, path, fetcher)).passed, true);
});

test("code PR rejects commits outside the locked base or a changed head", async () => {
  for (const comparison of [{ merge_base_commit: { sha: "d".repeat(40) } },
    { base_commit: { sha: "d".repeat(40) } },
    { url: `https://api.github.com/repos/HardieBao/lingnet-ascension/compare/${base}...${"e".repeat(40)}` },
    { url: undefined }, { status: "diverged" }]) {
    const { requests, fetcher } = fixture({ comparison });
    assert.equal((await inspectCodePullRequest(7, "123", base, path, fetcher)).passed, false);
    assert.equal(requests.length, 2);
  }
});

test("code PR rejects other paths, renames, symlinks and oversized artifacts", async () => {
  for (const overrides of [
    { files: [{ filename: "site/lib/other.ts", status: "added", sha: blob }] },
    { files: [{ filename: path, status: "renamed", sha: blob }] },
    { files: [{ filename: path, status: "modified", sha: "invalid" }] },
    { comparison: { files: undefined } },
    { files: [{ filename: path, status: "added", sha: blob }, { filename: ".github/workflows/extra.yml", status: "added", sha: blob }] },
    { file: { type: "symlink", target: "../other.ts" } },
    { file: { size: 131073 } },
    { file: { sha: "d".repeat(40) } },
  ]) {
    const { fetcher } = fixture(overrides);
    assert.equal((await inspectCodePullRequest(7, "123", base, path, fetcher)).passed, false);
  }
});

test("code PR accepts canonical workflow paths but not similarly named workflows", async () => {
  for (const [workflowPath, passed] of [
    [".github/workflows/trusted-baseline.yml", true],
    [".github/workflows/trusted-baseline.yml@main", true],
    [".github/workflows/trusted-baseline.yml-extra@main", false],
    [".github/workflows/other.yml@main", false],
  ]) {
    const { fetcher } = fixture({ runs: { workflow_runs: [{
      id: 42, run_attempt: 1, name: "Trusted baseline gate", path: workflowPath,
      event: "pull_request", head_sha: head, status: "completed", conclusion: "success",
    }] } });
    assert.equal((await inspectCodePullRequest(7, "123", base, path, fetcher)).passed, passed);
  }
});

test("code CI binds the API head SHA and a successful exact test-merge marker", async () => {
  const { fetcher } = fixture({ runs: { workflow_runs: [{
    id: 42, run_attempt: 1, name: "Trusted baseline gate", path: ".github/workflows/trusted-baseline.yml",
    event: "pull_request", head_sha: head, status: "completed", conclusion: "success",
  }] } });
  assert.equal((await inspectCodePullRequest(7, "123", base, path, fetcher)).passed, true);
});

test("code PR requires the latest successful head-bound trusted CI run", async () => {
  for (const runs of [
    { workflow_runs: [] },
    { workflow_runs: [{ id: 42, run_attempt: 1, name: "Trusted baseline gate", path: ".github/workflows/trusted-baseline.yml@main", event: "pull_request", head_sha: merge, status: "completed", conclusion: "success" }] },
    { workflow_runs: [{ id: 43, run_attempt: 1, name: "Trusted baseline gate", path: ".github/workflows/trusted-baseline.yml@main", event: "pull_request", head_sha: head, status: "completed", conclusion: "failure" }, { id: 42, run_attempt: 1, name: "Trusted baseline gate", path: ".github/workflows/trusted-baseline.yml@main", event: "pull_request", head_sha: head, status: "completed", conclusion: "success" }] },
    { workflow_runs: [{ id: 42, run_attempt: 1, name: "Trusted baseline gate", path: ".github/workflows/trusted-baseline.yml@main", event: "pull_request", head_sha: head, status: "completed", conclusion: "success" }, { id: 43, run_attempt: 1, name: "Trusted baseline gate", path: ".github/workflows/trusted-baseline.yml@main", event: "pull_request", head_sha: head, status: "completed", conclusion: "failure" }] },
  ]) {
    const { requests, fetcher } = fixture({ runs });
    assert.equal((await inspectCodePullRequest(7, "123", base, path, fetcher)).passed, false);
    assert.equal(requests.length, 4);
  }
});

test("a green run without its exact successful head/merge/attempt marker is rejected", async () => {
  for (const job of [null, { name: "main" }, { head_sha: "e".repeat(40) }, { run_attempt: 2 }, { conclusion: "failure" },
    { steps: [] }, { steps: [{ name: `Verified ${head} on merge ${"e".repeat(40)}`, status: "completed", conclusion: "success" }] },
    { steps: [{ name: `Verified ${"e".repeat(40)} on merge ${merge}`, status: "completed", conclusion: "success" }] },
    { steps: [{ name: `Verified ${head} on merge ${merge}`, status: "completed", conclusion: "skipped" }] }]) {
    const jobs = { jobs: job === null ? [] : [{ name: "pull-request", head_sha: head, run_attempt: 1, status: "completed", conclusion: "success",
      steps: [{ name: `Verified ${head} on merge ${merge}`, status: "completed", conclusion: "success" }], ...job }] };
    const { fetcher } = fixture({ jobs });
    assert.equal((await inspectCodePullRequest(7, "123", base, path, fetcher)).passed, false);
  }
});
