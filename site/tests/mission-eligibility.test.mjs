import assert from "node:assert/strict";
import test from "node:test";
import { missionAccessReason } from "../lib/mission-eligibility.ts";

test("mission-specific gates preserve newcomer tasks and explain restricted tasks", () => {
  assert.equal(missionAccessReason("mortal", 0, "mortal", 0), null);
  assert.equal(missionAccessReason("mortal", 0, "foundation", 50), "需要达到筑基境。");
  assert.equal(missionAccessReason("foundation", 49, "foundation", 50), "功德还需 1 点。");
  assert.equal(missionAccessReason("core", 50, "foundation", 50), null);
  assert.equal(missionAccessReason("core", 999, "unknown", 0), "任务门槛配置无效，请联系维护者。");
});
