import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { isCodeArtifactPath } from "../lib/code-artifact.ts";
import { buildTaskPackage } from "../lib/manifest.ts";
import { validateTaskPackage } from "../public/runner.mjs";

const path = "site/lib/mission-graph.ts";
const claim = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  expires_at: Date.now() + 60_000,
  reward_snapshot: JSON.stringify({
    token: 100, officialToken: 30, cultivation: 200, merit: 10,
    baseCommit: "a".repeat(40), title: "任务依赖图", description: "检查循环依赖",
    acceptance: "仅修改单个 TypeScript 文件并通过可信 CI。",
    allowedPaths: path, budgetTokens: null,
  }),
};
const mission = { id: "PLAT-003C" };

test("equipped code task package requests complete preflight without changing its scope or rewards", async () => {
  const taskPackage = await buildTaskPackage(claim, mission, { calculationArrayEquipped: true });
  assert.equal(taskPackage.payload.mission.artifactPath, path);
  assert.deepEqual(taskPackage.payload.mission.allowedPaths, [path]);
  assert.equal(taskPackage.payload.equipment.localPreflight, true);
  assert.deepEqual(taskPackage.payload.gameReward, { token: 100, officialToken: 30, cultivation: 200, merit: 10 });
  assert.deepEqual(validateTaskPackage(taskPackage), taskPackage.payload);
});

test("code task package rejects traversal and extra paths even with a recalculated digest", async () => {
  for (const badPath of ["site/lib/../auth.ts", "site/lib/file.ts;site/lib/other.ts", ".github/workflows/check.yml"]) {
    assert.equal(isCodeArtifactPath(badPath), false);
    await assert.rejects(buildTaskPackage({
      ...claim, reward_snapshot: JSON.stringify({ ...JSON.parse(claim.reward_snapshot), allowedPaths: badPath }),
    }, mission), /交付范围/);
  }
  const tampered = structuredClone(await buildTaskPackage(claim, mission));
  tampered.payload.mission.allowedPaths.push("site/lib/other.ts");
  tampered.sha256 = createHash("sha256").update(JSON.stringify(tampered.payload)).digest("hex");
  assert.throws(() => validateTaskPackage(tampered), /运行范围/);
});

test("code task package rejects mission IDs that could escape the output directory", async () => {
  const original = await buildTaskPackage(claim, mission);
  for (const badId of ["../outside", "..\\outside", "M/../outside", "M:outside", "M".repeat(65)]) {
    const tampered = structuredClone(original);
    tampered.payload.mission.id = badId;
    tampered.sha256 = createHash("sha256").update(JSON.stringify(tampered.payload)).digest("hex");
    assert.throws(() => validateTaskPackage(tampered), /运行范围/);
  }
});
