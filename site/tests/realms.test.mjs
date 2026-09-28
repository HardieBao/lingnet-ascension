import assert from "node:assert/strict";
import test from "node:test";
import { assessBreakthrough, nextBreakthrough, realmNames } from "../lib/realms.ts";

test("mortal advances only with cultivation, merit and an official result", () => {
  const ready = { cultivation: 100, merit: 5, token: 0, formalResults: 1, independentReviews: 0, trialPassed: false };
  assert.equal(assessBreakthrough("mortal", ready).eligible, true);
  assert.equal(assessBreakthrough("mortal", { ...ready, formalResults: 0 }).eligible, false);
  assert.equal(assessBreakthrough("mortal", { ...ready, merit: 0, token: 9999 }).eligible, false);
});

test("foundation and core cannot be bought with Token alone", () => {
  const rich = { cultivation: 5000, merit: 200, token: 10000, formalResults: 10, independentReviews: 1, trialPassed: false };
  assert.equal(assessBreakthrough("qi", rich).eligible, false);
  assert.ok(assessBreakthrough("qi", rich).missing.some((reason) => reason.includes("渡劫")));
  assert.equal(assessBreakthrough("foundation", { ...rich, trialPassed: true, independentReviews: 0 }).eligible, false);
  assert.equal(assessBreakthrough("foundation", { ...rich, trialPassed: true }).eligible, true);
});

test("MVP stops at core and never unlocks nascent realm", () => {
  assert.equal(realmNames.core, "金丹");
  assert.equal(nextBreakthrough("core"), null);
  assert.equal(assessBreakthrough("core", { cultivation: 20000, merit: 1000, token: 10000, formalResults: 50, independentReviews: 5, trialPassed: true }).eligible, false);
});
