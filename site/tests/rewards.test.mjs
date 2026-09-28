import assert from "node:assert/strict";
import test from "node:test";
import { officialTokenBonus } from "../lib/rewards.ts";

test("official bonus follows the season rank table", () => {
  assert.equal(officialTokenBonus("黄阶"), 30);
  assert.equal(officialTokenBonus("玄阶"), 100);
  assert.equal(officialTokenBonus("地阶"), 300);
  assert.equal(officialTokenBonus("天阶"), 1000);
  assert.equal(officialTokenBonus("渡劫"), 0);
});
