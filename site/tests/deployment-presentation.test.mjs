import assert from "node:assert/strict";
import test from "node:test";
import { deploymentPresentation } from "../lib/deployment-presentation.ts";

test("production labelling requires explicit deployment stage and no restricted preview", () => {
  for (const settings of [{}, { DEPLOYMENT_STAGE: "prod" }, { DEPLOYMENT_STAGE: "production", PREVIEW_ONLY_GITHUB_ID: "123" }]) {
    assert.equal(deploymentPresentation(settings).stage, "Pre-Alpha");
  }
  assert.equal(deploymentPresentation({ DEPLOYMENT_STAGE: "production" }).stage, "生产版");
});
test("source link pins only a complete commit and never fabricates the deployed source", () => {
  const sha = "a".repeat(40);
  assert(deploymentPresentation({ SOURCE_REVISION: sha }).sourceUrl.endsWith(`/tree/${sha}`));
  for (const revision of ["main", "123", "https://foreign.invalid", undefined]) {
    const result = deploymentPresentation({ SOURCE_REVISION: revision });
    assert.equal(result.sourceUrl, "https://github.com/HardieBao/lingnet-ascension");
    assert.match(result.sourceLabel, /待核对/);
  }
});

test("the complete candidate keeps the invitation Beta label without claiming production approval", () => {
  const result = deploymentPresentation({ DEPLOYMENT_STAGE: "beta", PREVIEW_ONLY_GITHUB_ID: "123", SOURCE_REVISION: "a".repeat(40) });
  assert.equal(result.stage, "邀请制 Beta");
  assert.match(result.description, /模型执行、奖励复核与调账暂不开放/);
  assert.match(result.description, /尚非完整生产 MVP/);
});
