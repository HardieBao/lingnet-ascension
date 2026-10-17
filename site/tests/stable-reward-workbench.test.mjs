import assert from "node:assert/strict";
import test from "node:test";
import { isRecoveryReviewer, lockedStableReward } from "../lib/stable-reward-workbench.ts";

test("recovery console is reserved for the configured GitHub identity", () => {
  assert.equal(isRecoveryReviewer({ provider: "github", provider_id: "404" }, "404"), true);
  for (const configured of [undefined, "", "0404", "403", 404]) {
    assert.equal(isRecoveryReviewer({ provider: "github", provider_id: "404" }, configured), false);
  }
  assert.equal(isRecoveryReviewer({ provider: "local", provider_id: "404" }, "404"), false);
});

test("grant confirmation exposes only the locked three-resource contract", () => {
  const reward = { policyVersion: 1, minimumVersionGapMs: 604800000, token: 10, cultivation: 20, merit: 1 };
  const snapshot = JSON.stringify({ stable: { ...reward, privateExtra: "not for client serialization" } });
  assert.deepEqual(lockedStableReward(snapshot), reward);
});

test("legacy, invalid amounts and a changed stable policy never become grant options", () => {
  const reward = { policyVersion: 1, minimumVersionGapMs: 604800000, token: 10, cultivation: 20, merit: 1 };
  for (const snapshot of ["broken", "null", "{}", JSON.stringify({ stable: { ...reward, token: -1 } }),
    JSON.stringify({ stable: { ...reward, merit: "1" } }), JSON.stringify({ stable: { ...reward, cultivation: Number.MAX_SAFE_INTEGER + 1 } }),
    JSON.stringify({ stable: { ...reward, policyVersion: 2 } }), JSON.stringify({ stable: { ...reward, minimumVersionGapMs: 1 } })]) {
    assert.equal(lockedStableReward(snapshot), null);
  }
});
