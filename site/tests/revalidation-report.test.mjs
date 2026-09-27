import assert from "node:assert/strict";
import test from "node:test";

export const report = {
  version: 1,
  submissionId: "11111111-1111-4111-8111-111111111111",
  missionId: "GOV-001",
  artifactPath: "GOVERNANCE.md",
  integratedCommit: "a".repeat(40),
  artifactSha256: "c".repeat(64),
  validatorBaseCommit: "b".repeat(40),
  reporterGitHubId: "202",
  findings: "重新执行该成果的固定验收契约，逐项记录复现过程、观察结果及尚需人工判断的内容。",
};

test("revalidation report identifies the exact integrated document and trusted verifier baseline", async () => {
  const { parseRevalidationReport } = await import("../lib/revalidation-report.ts");
  const parsed = parseRevalidationReport(report);
  assert(parsed);
  assert.equal(parsed.kind, "document");
  assert.equal(parsed.artifactPath, "GOVERNANCE.md");
  assert.equal(parsed.submissionId, "11111111-1111-4111-8111-111111111111");
  assert.equal(parsed.reporterGitHubId, "202");
});

test("revalidation report cannot switch document targets, escape paths or supply an invalid commit", async () => {
  const { parseRevalidationReport } = await import("../lib/revalidation-report.ts");
  for (const change of [
    { artifactPath: "docs/WORLD_BRIEF.md" }, { artifactPath: "../GOVERNANCE.md" },
    { integratedCommit: "main" }, { reporterGitHubId: "0202" }, { findings: "通过" },
  ]) assert.equal(parseRevalidationReport({ ...report, ...change }), null);
});
