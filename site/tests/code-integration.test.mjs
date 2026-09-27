import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyCodeIntegration } from "../lib/code-integration.ts";

const head = "b".repeat(40);
const merged = "c".repeat(40);
const content = "export const answer = 42;\n";
const source = {
  kind: "github-pr", number: 7, headSha: head,
  filePath: "site/lib/mission-graph.ts",
  fileSha256: createHash("sha256").update(content).digest("hex"),
};

function fixture(prChanges = {}, relationship = "ahead", mergedContent = content) {
  const requests = [];
  const responses = [
    Response.json({
      state: "closed", merged_at: "2026-09-24T00:00:00Z", merge_commit_sha: merged,
      user: { id: 123 }, head: { sha: head },
      base: { ref: "main", repo: { full_name: "HardieBao/lingnet-ascension" } },
      ...prChanges,
    }),
    Response.json({ status: relationship }),
    new Response(mergedContent),
  ];
  return {
    requests,
    fetcher: async (url) => {
      requests.push(url);
      return responses.shift() ?? Response.json({}, { status: 500 });
    },
  };
}

test("code result requires merged PR and byte-identical file on main", async () => {
  const { requests, fetcher } = fixture();
  assert.deepEqual(await verifyCodeIntegration(source, "123", merged, fetcher), { passed: true });
  assert.match(requests[0], /pulls\/7$/);
  assert.match(requests[1], new RegExp(`compare/${merged}\\.\\.\\.main`));
  assert.match(requests[2], new RegExp(`contents/${source.filePath}\\?ref=${merged}`));
});

test("code result rejects changed PR head, wrong merger, author and target branch", async () => {
  for (const change of [
    { head: { sha: "d".repeat(40) } },
    { merge_commit_sha: "d".repeat(40) },
    { user: { id: 999 } },
    { base: { ref: "dev", repo: { full_name: "HardieBao/lingnet-ascension" } } },
    { state: "open", merged_at: null },
  ]) {
    const { requests, fetcher } = fixture(change);
    assert.equal((await verifyCodeIntegration(source, "123", merged, fetcher)).passed, false);
    assert.equal(requests.length, 1);
  }
});

test("code result rejects unmerged commits and changed file bytes", async () => {
  const notMain = fixture({}, "diverged");
  assert.equal((await verifyCodeIntegration(source, "123", merged, notMain.fetcher)).passed, false);
  const changed = fixture({}, "ahead", "different contents");
  assert.equal((await verifyCodeIntegration(source, "123", merged, changed.fetcher)).passed, false);
});
