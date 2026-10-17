import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState, demoAction } from "../lib/demo-game.ts";

test("a demo claim is synthetic and cannot change resource or model balances", () => {
  const initial = createDemoState();
  const claimed = demoAction(initial, { type: "claim", rank: "黄阶" });
  assert.equal(claimed.mode, "simulation");
  assert.equal(claimed.claim.phase, "claimed");
  assert.equal(claimed.claim.modelUsed, 0);
  assert.equal(claimed.token, 300);
  assert.equal(claimed.cultivation, 0);
  assert.equal(claimed.merit, 0);
  assert.equal(initial.claim, null);
});

test("demo rewards wait for simulated independent review and settle only once", () => {
  let state = demoAction(createDemoState(), { type: "claim", rank: "黄阶" });
  for (const type of ["run", "submit", "judge", "review"]) state = demoAction(state, { type });
  assert.equal(state.token, 300);
  const settled = demoAction(state, { type: "settle" });
  assert.equal(settled.token, 380);
  assert.equal(settled.cultivation, 100);
  assert.equal(settled.merit, 5);
  assert.equal(settled.formalResults, 1);
  assert.equal(settled.claim.modelUsed, 1200);
  assert.equal(demoAction(settled, { type: "settle" }).token, 380);
});

function complete(state, rank = "黄阶") {
  let result = demoAction(state, { type: "claim", rank });
  for (const type of ["run", "submit", "judge", "review", "settle"]) result = demoAction(result, { type });
  return result;
}

test("demo qi advancement retains the actual contribution gate", () => {
  assert.equal(demoAction(createDemoState(), { type: "advance" }).realm, "mortal");
  const qi = demoAction(complete(createDemoState()), { type: "advance" });
  assert.equal(qi.realm, "qi");
  assert.equal(qi.token, 380);
  assert.equal(qi.formalResults, 1);
});

function foundationReady() {
  let state = demoAction(complete(createDemoState()), { type: "advance" });
  for (let i = 0; i < 3; i++) state = complete(state, "玄阶");
  return state;
}

test("demo trial freezes once and unsuccessful withdrawal refunds in full", () => {
  const ready = foundationReady();
  const started = demoAction(ready, { type: "trial" });
  assert.equal(started.token, 630);
  assert.equal(started.tokenLocked, 500);
  assert.equal(demoAction(started, { type: "trial" }).tokenLocked, 500);
  const withdrawn = demoAction(started, { type: "withdraw" });
  assert.equal(withdrawn.token, 1130);
  assert.equal(withdrawn.tokenLocked, 0);
  assert.equal(withdrawn.realm, "qi");
  assert.equal(withdrawn.formalResults, 4);
});

test("demo foundation trial requires simulated reviewed results before consuming fee", () => {
  let state = demoAction(foundationReady(), { type: "trial" });
  assert.equal(demoAction(state, { type: "settle" }).realm, "qi");
  for (const type of ["run", "submit", "judge", "review", "settle"]) state = demoAction(state, { type });
  assert.equal(state.realm, "foundation");
  assert.equal(state.token, 880);
  assert.equal(state.tokenLocked, 0);
  assert.equal(state.formalResults, 5);
  assert.equal(demoAction(state, { type: "settle" }).token, 880);
});

test("demo equipment purchase charges once, ownership and equipment are separate", () => {
  let state = demoAction(createDemoState(), { type: "buy", itemId: "storage-bag" });
  assert.equal(state.token, 100);
  assert.equal(state.items[0].equipped, false);
  assert.equal(demoAction(state, { type: "buy", itemId: "storage-bag" }).token, 100);
  state = demoAction(state, { type: "equip", itemId: "storage-bag" });
  assert.equal(state.items[0].equipped, true);
  assert.equal(state.token, 100);
  assert.equal(demoAction(state, { type: "buy", itemId: "split-mind-pendant" }).token, 100);
});

test("demo core trial needs another synthetic author's adopted revalidation", () => {
  let state = demoAction(foundationReady(), { type: "trial" });
  for (const type of ["run", "submit", "judge", "review", "settle"]) state = demoAction(state, { type });
  for (let i = 0; i < 5; i++) state = complete(state, "地阶");
  assert.equal(demoAction(state, { type: "trial" }).tokenLocked, 0);
  assert.equal(demoAction(state, { type: "revalidate", author: "self" }).independentReviews, 0);
  state = demoAction(state, { type: "revalidate", author: "other" });
  assert.equal(state.independentReviews, 1);
  assert.equal(state.token, 4880);
  state = demoAction(state, { type: "trial" });
  assert.equal(state.tokenLocked, 2000);
  for (const type of ["run", "submit", "judge", "review", "settle"]) state = demoAction(state, { type });
  assert.equal(state.realm, "core");
  assert.equal(state.token, 3680);
  assert.equal(state.tokenLocked, 0);
});

test("a simulated failed judgment spends only mock model tokens and never awards", () => {
  let state = demoAction(createDemoState(), { type: "claim", rank: "黄阶" });
  for (const type of ["run", "submit"]) state = demoAction(state, { type });
  state = demoAction(state, { type: "judge", failure: true });
  assert.equal(state.claim.phase, "claimed");
  assert.equal(state.token, 300);
  assert.equal(state.formalResults, 0);
  state = demoAction(state, { type: "run" });
  assert.equal(state.claim.modelUsed, 2400);
});
