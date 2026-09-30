import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { startPresetWorkbench } from "../public/runner-preset-workbench.mjs";

const root = await mkdtemp(join(tmpdir(), "lingnet-preset-ui-fixture-"));
const payload = { schemaVersion: 4, cultivatorId: "synthetic-ui-owner", claim: { id: randomUUID(), expiresAt: Date.now() + 3600000 },
  repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit: "a".repeat(40) },
  mission: { id: "GOV-001", title: "合成任务，不计社区贡献", description: "Synthetic", acceptance: "Synthetic", allowedPaths: ["GOVERNANCE.md"], artifactPath: "GOVERNANCE.md" },
  model: { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" },
  equipment: { localPreflight: false, checkpointSlots: 1, heartTalisman: false, presetSlots: process.argv.includes("--two") ? 2 : 1 },
  gameReward: { token: 0, cultivation: 0, merit: 0 } };
const definition = { name: "合成谨慎修订", reasoningEffort: "low", maxOutputTokens: 256, promptSupplement: "只作最小修改，不计真实贡献。" };
await writeFile(join(root, "safe-import.json"), JSON.stringify(definition));
await writeFile(join(root, "unsafe-import.json"), JSON.stringify({ ...definition, apiKey: "synthetic-forbidden-field" }));
let workbench;
try {
  workbench = await startPresetWorkbench({ payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") }, { root });
  console.log(`LOCAL_PRESET_UI=${workbench.origin}/`);
  console.log(`SYNTHETIC_PRESET_FIXTURES=${root}`);
  console.log("Local synthetic-only preset management; no model, real GitHub or cloud database. Send stop to close.");
  await new Promise((done) => { process.stdin.once("data", done); process.once("SIGINT", done); process.once("SIGTERM", done); });
} finally {
  process.stdin.pause();
  if (workbench) await workbench.close();
  const target = await realpath(root);
  assert(target.startsWith(await realpath(tmpdir()) + sep) && basename(target).startsWith("lingnet-preset-ui-fixture-"));
  await rm(target, { recursive: true, force: true });
}
