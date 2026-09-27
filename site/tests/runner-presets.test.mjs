import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getPreset, listPresets, savePreset } from "../public/runner-presets.mjs";

// Confirmed seam: public local preset API, with the same server-supplied slot contract.
const payload = { schemaVersion: 4, cultivatorId: "synthetic-owner", claim: { id: randomUUID(), expiresAt: Date.now() + 3600_000 },
  repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit: "a".repeat(40) },
  mission: { id: "GOV-001", title: "Synthetic", description: "Synthetic", acceptance: "Synthetic", allowedPaths: ["GOVERNANCE.md"], artifactPath: "GOVERNANCE.md" },
  model: { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" },
  equipment: { localPreflight: false, checkpointSlots: 1, heartTalisman: false, presetSlots: 1 }, gameReward: { token: 0, cultivation: 0, merit: 0 } };
const task = (value = payload) => ({ payload: value, sha256: createHash("sha256").update(JSON.stringify(value)).digest("hex") });
const definition = { name: "谨慎修订", reasoningEffort: "low", maxOutputTokens: 256, promptSupplement: "优先最小修改，并说明未验证项。" };

test("a preset applies only allowed choices and does not replace the task's model budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "lingnet-presets-"));
  const saved = await savePreset(task(), definition, { root });
  const read = await getPreset(task(), saved.id, { root });
  assert.equal(read.reasoningEffort, "low");
  assert.equal(read.maxOutputTokens, 256);
  assert.equal(read.promptSupplement, definition.promptSupplement);
  assert.equal(task().payload.model.tokenBudget, 30000);
  assert.equal((await listPresets(task(), { root })).length, 1);
  await assert.rejects(savePreset(task(), definition, { root }), /槽位已满/);
  const equipped = { ...payload, equipment: { ...payload.equipment, presetSlots: 2 } };
  await savePreset(task(equipped), { ...definition, name: "严谨复核", reasoningEffort: "high" }, { root });
  assert.equal((await listPresets(task(equipped), { root })).length, 2);
  await assert.rejects(savePreset(task(equipped), definition, { root }), /槽位已满/);
});

test("presets reject secrets, custom commands, other models and expanded budgets", async () => {
  const root = await mkdtemp(join(tmpdir(), "lingnet-presets-safety-"));
  for (const changed of [{ promptSupplement: "sk-" + "S".repeat(40) }, { apiKey: "synthetic-key" },
    { command: "npm install" }, { model: "other-model" }, { maxOutputTokens: 2049 }, { tokenBudget: 999999 }, { reasoningEffort: "unlisted" }]) {
    await assert.rejects(savePreset(task(), { ...definition, ...changed }, { root }));
  }
  assert.deepEqual(await listPresets(task(), { root }), []);
});

test("unequipping retains extra presets but cannot activate an extra slot", async () => {
  const root = await mkdtemp(join(tmpdir(), "lingnet-presets-slots-"));
  const equipped = { ...payload, equipment: { ...payload.equipment, presetSlots: 2 } };
  await savePreset(task(equipped), definition, { root });
  const second = await savePreset(task(equipped), { ...definition, name: "第二功法" }, { root });
  assert.equal((await listPresets(task(), { root })).length, 2);
  await assert.rejects(getPreset(task(), second.id, { root }), /槽位权限/);
  assert.equal((await getPreset(task(equipped), second.id, { root })).name, "第二功法");
});
