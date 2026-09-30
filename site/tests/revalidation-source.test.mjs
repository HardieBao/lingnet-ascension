import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

const commit = "a".repeat(40), base = "b".repeat(40), head = "c".repeat(40), merge = "d".repeat(40);
const content = "fixed integrated fixture";
const expected = { submissionId: "11111111-1111-4111-8111-111111111111", missionId: "GOV-001", artifactPath: "GOVERNANCE.md",
  integratedCommit: commit, artifactSha256: createHash("sha256").update(content).digest("hex") };
const repo = "HardieBao/lingnet-ascension";

function fixture() {
  const report = { version: 1, ...expected, validatorBaseCommit: base, reporterGitHubId: "202", findings: "固定提交复验的合成报告，说明实际观察结果及维护者需要核查的证据。" };
  const pull = { state: "open", draft: false, mergeable: true, changed_files: 1, user: { id: 202 }, merge_commit_sha: merge,
    base: { ref: "main", sha: base, repo: { full_name: repo } }, head: { sha: head, repo: { full_name: "Fixture/lingnet-ascension" } } };
  const run = { id: 99, name: "LingNet independent revalidation", path: ".github/workflows/revalidation.yml",
    event: "pull_request", status: "completed", conclusion: "success", head_sha: head, actor: { id: 202 }, run_attempt: 1,
    display_title: "LingNet revalidation #7", pull_requests: [] };
  const jobs = { jobs: [{ name: "Revalidate integrated result", status: "completed", conclusion: "success", run_attempt: 1,
    steps: [{ name: "Replay passed", status: "completed", conclusion: "success" }, { name: "Replay failed", status: "completed", conclusion: "skipped" }] }] };
  const path = `revalidations/${expected.submissionId}.json`;
  const comparison = { url: `https://api.github.com/repos/${repo}/compare/${base}...${head}`,
    status: "ahead", base_commit: { sha: base }, merge_base_commit: { sha: base },
    files: [{ filename: path, status: "added", sha: "blob" }] };
  const fetcher = async (url) => {
    if (url.endsWith("/pulls/7")) return Response.json(pull);
    if (url.includes(`/compare/${base}...${head}?`)) return Response.json(comparison);
    if (url.includes(`/contents/${path}?`)) {
      const bytes = Buffer.from(JSON.stringify(report));
      return Response.json({ type: "file", encoding: "base64", size: bytes.length, sha: "blob", content: bytes.toString("base64") });
    }
    if (url.endsWith("/actions/runs/99")) return Response.json(run);
    if (url.includes("/actions/runs/99/jobs")) return Response.json(jobs);
    if (url.includes(`/compare/${commit}...main`)) return Response.json({ status: "ahead" });
    if (url.includes(`/contents/GOVERNANCE.md?ref=${commit}`)) return new Response(content);
    return new Response("unexpected fixture endpoint", { status: 404 });
  };
  return { report, pull, run, jobs, comparison, fetcher };
}

test("revalidation evidence binds the report author, original artifact and a dedicated completed replay", async () => {
  const { inspectRevalidationPullRequest } = await import("../lib/revalidation-source.ts");
  const data = fixture();
  const result = await inspectRevalidationPullRequest(7, 99, "202", expected, data.fetcher);
  assert.equal(result.passed, true);
  assert.equal(result.outcome, "passed");
  assert.equal(result.runAttempt, 1);
  assert.equal(result.headSha, head);
});

test("revalidation accepts the real comparison shape without an invented head_commit", async () => {
  const { inspectRevalidationPullRequest } = await import("../lib/revalidation-source.ts");
  const data = fixture();
  data.comparison.commits = [{ sha: "e".repeat(40) }];
  assert.equal((await inspectRevalidationPullRequest(7, 99, "202", expected, data.fetcher)).passed, true);
});

test("missing current commit evidence cannot be replaced with an ordinary green CI run", async () => {
  const { inspectRevalidationPullRequest } = await import("../lib/revalidation-source.ts");
  const data = fixture();
  delete data.run.head_sha;
  delete data.pull.merge_commit_sha;
  assert.equal((await inspectRevalidationPullRequest(7, 99, "202", expected, data.fetcher)).passed, false);
});

test("ordinary CI, another reporter, a stale head and a mismatched artifact never become revalidation evidence", async () => {
  const { inspectRevalidationPullRequest } = await import("../lib/revalidation-source.ts");
  for (const change of [
    (data) => { data.run.path = ".github/workflows/trusted-baseline.yml"; },
    (data) => { data.pull.user.id = 303; },
    (data) => { data.run.head_sha = "e".repeat(40); },
    (data) => { data.report.artifactSha256 = "f".repeat(64); },
    (data) => { data.run.display_title = "LingNet revalidation #8"; },
    (data) => { data.jobs.jobs[0].steps[0].conclusion = "skipped"; },
  ]) {
    const data = fixture();
    change(data);
    assert.equal((await inspectRevalidationPullRequest(7, 99, "202", expected, data.fetcher)).passed, false);
  }
});

test("a trusted replay that exposes a target failure remains evidence for human adoption, not automatic acceptance", async () => {
  const { inspectRevalidationPullRequest } = await import("../lib/revalidation-source.ts");
  const data = fixture();
  data.jobs.jobs[0].steps[0].conclusion = "skipped";
  data.jobs.jobs[0].steps[1].conclusion = "success";
  const result = await inspectRevalidationPullRequest(7, 99, "202", expected, data.fetcher);
  assert.equal(result.passed, true);
  assert.equal(result.outcome, "failed");
});

test("revalidation scope is bound to immutable base/head, not a live PR file listing", async () => {
  const { inspectRevalidationPullRequest } = await import("../lib/revalidation-source.ts");
  for (const change of [
    (data) => { data.comparison.files[0].filename = ".github/workflows/revalidation.yml"; },
    (data) => { data.comparison.url = `https://api.github.com/repos/${repo}/compare/${base}...${"e".repeat(40)}`; },
    (data) => { delete data.comparison.url; },
    (data) => { data.comparison.base_commit.sha = "e".repeat(40); },
    (data) => { data.comparison.merge_base_commit.sha = "e".repeat(40); },
    (data) => { data.comparison.status = "diverged"; },
  ]) {
    const data = fixture();
    change(data);
    const fetcher = async (url, options) => {
      assert(!url.includes("/pulls/7/files"), "Mutable PR scope must not be used");
      return data.fetcher(url, options);
    };
    assert.equal((await inspectRevalidationPullRequest(7, 99, "202", expected, fetcher)).passed, false);
  }
});

test("credential-shaped findings are refused without returning their content", async () => {
  const { inspectRevalidationPullRequest } = await import("../lib/revalidation-source.ts");
  for (const findings of [
    "合成报告中的访问凭据 sk-" + "x".repeat(24),
    "合成报告中的私人配置 PASSWORD=synthetic_private_password",
    "合成报告中的私钥头 -----BEGIN PRIVATE KEY-----",
  ]) {
    const data = fixture();
    data.report.findings = findings;
    const result = await inspectRevalidationPullRequest(7, 99, "202", expected, data.fetcher);
    assert.equal(result.passed, false);
    assert(!JSON.stringify(result).includes(findings), "A refusal must not echo the sensitive observation");
  }
});
