import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskPackage, REPOSITORY_URL } from "../lib/manifest.ts";

const claim = {
  id: "claim-1",
  expires_at: Date.now() + 60_000,
  reward_snapshot: JSON.stringify({
    token: 50, officialToken: 30, cultivation: 100, merit: 5, baseCommit: "a".repeat(40),
    title: "章程", description: "制定产品章程", acceptance: "独立复核",
    allowedPaths: "GOVERNANCE.md", budgetTokens: null,
  }),
};
const mission = {
  id: "GOV-001",
  title: "章程",
  description: "制定产品章程",
  acceptance: "独立复核",
  allowed_paths: "GOVERNANCE.md",
  budget_tokens: null,
  reward_token: 999,
  reward_cultivation: 999,
  reward_merit: 999,
};

test("task package locks the claim snapshot and separates model usage from game rewards", async () => {
  const taskPackage = await buildTaskPackage(claim, mission);
  assert.equal(taskPackage.payload.repository.url, REPOSITORY_URL);
  assert.equal(taskPackage.payload.repository.baseCommit, "a".repeat(40));
  assert.deepEqual(taskPackage.payload.mission.allowedPaths, ["GOVERNANCE.md"]);
  assert.equal(taskPackage.payload.model.tokenBudget, null);
  assert.equal(taskPackage.payload.schemaVersion, 2);
  assert.deepEqual(taskPackage.payload.equipment, { localPreflight: false });
  assert.deepEqual(taskPackage.payload.gameReward, { token: 50, officialToken: 30, cultivation: 100, merit: 5 });
  assert.equal(taskPackage.sha256.length, 64);
});

test("task package records the equipped local preflight without changing rewards", async () => {
  const taskPackage = await buildTaskPackage(claim, mission, { calculationArrayEquipped: true });
  assert.deepEqual(taskPackage.payload.equipment, { localPreflight: true });
  assert.deepEqual(taskPackage.payload.gameReward, { token: 50, officialToken: 30, cultivation: 100, merit: 5 });
  assert.notEqual(taskPackage.sha256, (await buildTaskPackage(claim, mission)).sha256);
});

test("changing manifest content changes the digest", async () => {
  const original = await buildTaskPackage(claim, mission);
  const changed = await buildTaskPackage({
    ...claim,
    reward_snapshot: JSON.stringify({ ...JSON.parse(claim.reward_snapshot), acceptance: "新的验收规则" }),
  }, mission);
  assert.notEqual(original.sha256, changed.sha256);
});

test("mission edits after claim do not change the accepted task package", async () => {
  const original = await buildTaskPackage(claim, mission);
  const changedMission = await buildTaskPackage(claim, { ...mission, title: "修改标题", acceptance: "修改验收", allowed_paths: ".env" });
  assert.deepEqual(changedMission, original);
});

test("GOV-002 task package locks its independent deliverable", async () => {
  const worldClaim = {
    ...claim,
    reward_snapshot: JSON.stringify({ ...JSON.parse(claim.reward_snapshot), allowedPaths: "docs/WORLD_BRIEF.md" }),
  };
  const packageForWorld = await buildTaskPackage(worldClaim, { ...mission, id: "GOV-002" });
  assert.equal(packageForWorld.payload.mission.artifactPath, "docs/WORLD_BRIEF.md");
  assert.deepEqual(packageForWorld.payload.mission.allowedPaths, ["docs/WORLD_BRIEF.md"]);
  await assert.rejects(buildTaskPackage(claim, { ...mission, id: "GOV-002" }), /交付范围/);
});

test("GOV-003 task package locks the architecture report path", async () => {
  const architectureClaim = {
    ...claim,
    reward_snapshot: JSON.stringify({ ...JSON.parse(claim.reward_snapshot), allowedPaths: "docs/ARCHITECTURE_SPIKE.md" }),
  };
  const taskPackage = await buildTaskPackage(architectureClaim, { ...mission, id: "GOV-003" });
  assert.equal(taskPackage.payload.mission.artifactPath, "docs/ARCHITECTURE_SPIKE.md");
  assert.deepEqual(taskPackage.payload.mission.allowedPaths, ["docs/ARCHITECTURE_SPIKE.md"]);
  await assert.rejects(buildTaskPackage(claim, { ...mission, id: "GOV-003" }), /交付范围/);
});

test("GOV-004T task package locks its Token terms deliverable", async () => {
  const tokenClaim = {
    ...claim,
    reward_snapshot: JSON.stringify({ ...JSON.parse(claim.reward_snapshot), allowedPaths: "docs/TOKEN_TERMS.md" }),
  };
  const taskPackage = await buildTaskPackage(tokenClaim, { ...mission, id: "GOV-004T" });
  assert.equal(taskPackage.payload.mission.artifactPath, "docs/TOKEN_TERMS.md");
  assert.deepEqual(taskPackage.payload.mission.allowedPaths, ["docs/TOKEN_TERMS.md"]);
  await assert.rejects(buildTaskPackage(claim, { ...mission, id: "GOV-004T" }), /交付范围/);
});
