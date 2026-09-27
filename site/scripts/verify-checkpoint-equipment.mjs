import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { discardCheckpoint, listCheckpoints, saveCheckpoint } from "../public/runner-checkpoints.mjs";
import { savePreset } from "../public/runner-presets.mjs";

// Confirmed seam: actual purchase/equip → task package → actual checkpoint behavior.
const site = resolve(dirname(fileURLToPath(import.meta.url)), ".."), server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-checkpoint-equipment-")), workspace = join(temporary, "source");
mkdirSync(workspace);
writeFileSync(join(workspace, "plan.md"), "Synthetic only");
const git = (args) => execFileSync("git", args, { cwd: workspace, windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
git(["init", "--initial-branch=main"]); git(["add", "plan.md"]);
git(["-c", "user.name=Synthetic", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Synthetic baseline"]);
const baseline = git(["rev-parse", "HEAD"]);
writeFileSync(join(workspace, "GOVERNANCE.md"), "Synthetic incomplete artifact, deliberately fails the independent structural verifier.");
const secret = "synthetic-checkpoint-equipment-secret-not-a-real-credential", actor = "github:611";
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), r2Persist: join(temporary, "r2"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: "2026-09-21", compatibilityFlags: ["nodejs_compat"], d1Databases: { DB: "checkpoint-equipment" }, r2Buckets: ["BUCKET"],
    bindings: { SESSION_SECRET: secret }, outboundService: () => { throw new Error("Equipment verification forbids external network"); },
  }] }));
const session = Buffer.from(JSON.stringify({ sub: actor, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
const cookie = `lingnet_session=${session}.${createHmac("sha256", secret).update(session).digest("base64url")}`;
async function api(path, input) {
  const response = await mf.dispatchFetch(`http://fixture.local${path}`, { method: input === undefined ? "GET" : "POST",
    headers: { Cookie: cookie, Origin: "http://fixture.local", "Content-Type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  assert(response.ok, `${response.status}: ${await response.clone().text()}`); return response.json();
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github','611','Fixture','Synthetic',?)").bind(actor, Date.now()).run();
  await db.prepare("INSERT INTO ledger_events (id,cultivator_id,resource,delta,source_key,created_at) VALUES ('fixture-funding',?,'token',5000,'fixture:funding',?)").bind(actor, Date.now()).run();
  await api("/api/missions");
  await db.prepare("UPDATE missions SET base_commit=? WHERE id='GOV-001'").bind(baseline).run();
  const claim = (await api("/api/claims", { missionId: "GOV-001" })).claim;
  await api(`/api/claims/${claim.id}/start`, {});
  const manifest = () => api(`/api/claims/${claim.id}/manifest`);
  async function rejectedArtifact() {
    const boundary = `fixture-${randomUUID()}`;
    const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="claimId"\r\n\r\n${claim.id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="artifact"; filename="GOVERNANCE.md"\r\nContent-Type: text/markdown\r\n\r\n${readFileSync(join(workspace, "GOVERNANCE.md"), "utf8")}\r\n--${boundary}--\r\n`);
    const response = await mf.dispatchFetch("http://fixture.local/api/submissions", { method: "POST",
      headers: { Cookie: cookie, Origin: "http://fixture.local", "Content-Type": `multipart/form-data; boundary=${boundary}` }, body });
    assert.equal(response.status, 201, await response.clone().text());
    assert.equal((await response.json()).submission.verdict.passed, false);
  }
  const basic = await manifest();
  assert.equal(basic.payload.schemaVersion, 4);
  assert.equal(basic.payload.cultivatorId, actor);
  assert.equal(basic.payload.equipment.checkpointSlots, 1);
  const first = await saveCheckpoint(basic, workspace, { root: temporary });
  await rejectedArtifact();
  assert.equal(first.retainUntil - first.createdAt, 86400000);
  await assert.rejects(saveCheckpoint(basic, workspace, { root: temporary }), /槽位已满/);
  await api("/api/equipment/purchase", { itemId: "storage-bag" });
  assert.equal((await manifest()).payload.equipment.checkpointSlots, 1, "Purchasing is not equipping");
  await api("/api/equipment/storage-bag/equip", { equipped: true });
  const bag = await manifest();
  assert.equal(bag.payload.equipment.checkpointSlots, 2);
  await saveCheckpoint(bag, workspace, { root: temporary });
  assert.equal((await listCheckpoints(bag, { root: temporary })).length, 2);
  await api("/api/equipment/purchase", { itemId: "heart-talisman" });
  await api("/api/equipment/heart-talisman/equip", { equipped: true });
  const heart = await manifest();
  assert.equal(heart.payload.equipment.heartTalisman, true);
  await discardCheckpoint(heart, first.id, { root: temporary });
  const extended = await saveCheckpoint(heart, workspace, { root: temporary });
  assert.equal(extended.retainUntil - extended.createdAt, 172800000);
  assert.equal(heart.payload.claim.expiresAt, basic.payload.claim.expiresAt);
  assert.deepEqual(heart.payload.model, basic.payload.model);
  assert.equal((await api("/api/me")).balances.token, 4500);
  await rejectedArtifact();
  const unchanged = (await api("/api/me")).balances;
  assert.equal(unchanged.token, 4500);
  assert.equal(unchanged.cultivation, 0);
  assert.equal(unchanged.merit, 0);
  const definition = { name: "谨慎修订", reasoningEffort: "low", maxOutputTokens: 128, promptSupplement: "坚持任务允许范围。" };
  assert.equal(heart.payload.equipment.presetSlots, 1);
  await savePreset(heart, definition, { root: temporary });
  await assert.rejects(savePreset(heart, definition, { root: temporary }), /槽位已满/);
  await api("/api/equipment/purchase", { itemId: "teaching-slip" });
  assert.equal((await manifest()).payload.equipment.presetSlots, 1);
  await api("/api/equipment/teaching-slip/equip", { equipped: true });
  const teaching = await manifest();
  assert.equal(teaching.payload.equipment.presetSlots, 2);
  await savePreset(teaching, { ...definition, name: "严谨复核", reasoningEffort: "high" }, { root: temporary });
  assert.deepEqual(teaching.payload.model, basic.payload.model);
  assert.equal((await api("/api/me")).balances.token, 3700);
  console.log("Actual local purchase/equip → v4 task package → one/two shared slots and one 24-hour heart extension; lease/model allowance unchanged.");
} finally { await mf.dispose(); console.log(`Synthetic equipment workspace retained: ${temporary}`); }
