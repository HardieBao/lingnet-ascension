import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Reuse agreed seams: actual built page, equipment/claim/manifest/upload/account APIs.
// SQL initializes isolated synthetic fixtures only; no models, R2 or external calls.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-six-equipment-"));
const secret = "synthetic-six-equipment-session-not-production";
const items = [["storage-bag", 200], ["heavenly-mirror", 350], ["calculation-array", 500],
  ["heart-talisman", 300], ["split-mind-pendant", 1200], ["teaching-slip", 800]];
const actors = [...items.map((_, index) => `fixture-six-${index}`), "fixture-pendant", "fixture-private-history"];
const privateCanary = "SYNTHETIC_PRIVATE_REVIEW_CANARY";
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: "2026-09-27", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "synthetic-six-equipment" }, bindings: { SESSION_SECRET: secret },
    outboundService: () => { throw new Error("Six-equipment verification forbids external services"); },
  }] }));
function headers(actor) {
  const payload = Buffer.from(JSON.stringify({ sub: actor, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return { Cookie: `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`, Origin: "http://fixture.local" };
}
async function api(actor, path, input, status = 200) {
  const response = await mf.dispatchFetch(`http://fixture.local${path}`, { method: input === undefined ? "GET" : "POST",
    headers: { ...headers(actor), "Content-Type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  assert.equal(response.status, status, `${path}: ${await response.clone().text()}`);
  return response.json();
}
async function page(actor) {
  const response = await mf.dispatchFetch("http://fixture.local/?mission=GOV-001", { headers: headers(actor) });
  assert.equal(response.status, 200);
  return (await response.text()).replace(/<!--[\s\S]*?-->/g, "");
}
async function badArtifact(actor, claimId) {
  const form = new FormData();
  form.set("claimId", claimId);
  form.set("artifact", new File(["Synthetic incomplete charter; deliberately missing the required sections."], "GOVERNANCE.md", { type: "text/markdown" }));
  const upload = new Request("http://fixture.local/api/submissions", { method: "POST", headers: headers(actor), body: form });
  const response = await mf.dispatchFetch(upload.url, { method: "POST", headers: upload.headers, body: await upload.arrayBuffer() });
  assert.equal(response.status, 201, await response.clone().text());
  const result = (await response.json()).submission;
  assert.equal(result.state, "needs_revision");
  assert.equal(result.verdict.passed, false);
  return result.verdict;
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  const now = Date.now();
  for (const [index, actor] of actors.entries()) {
    await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github',?,?,?,?)")
      .bind(actor, String(8100 + index), "Synthetic" + index, "合成装备边界验收", now).run();
    await db.prepare("INSERT INTO ledger_events (id,cultivator_id,resource,delta,source_key,created_at) VALUES (?,?,'token',10000,?,?)")
      .bind(actor + ":fund", actor, actor + ":synthetic-funding", now).run();
  }
  await api(actors[0], "/api/missions");
  // Initialization deliberately includes unrelated and private failures for visibility checks.
  for (const [id, mission, state] of [["past-expired", "GOV-001", "expired"], ["past-revision", "GOV-001", "released"],
    ["past-rejected", "GOV-001", "rejected"], ["past-unrelated", "GOV-002", "rejected"]]) {
    await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot) VALUES (?,?,? ,?,?,?,'{}')")
      .bind(id, mission, "fixture-private-history", state, now - 2000, now - 1000).run();
  }
  for (const [id, claim, state] of [["past-revision-1", "past-revision", "needs_revision"], ["past-revision-2", "past-revision", "needs_revision"],
    ["past-rejected-1", "past-rejected", "rejected"], ["past-unrelated-1", "past-unrelated", "rejected"]]) {
    await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,verdict,review_reason,created_at) VALUES (?,?,? ,?,?,?, ?,?,?)")
      .bind(id, claim, "fixture-private-history", id + ":private-artifact", "a".repeat(64), state,
        JSON.stringify({ passed: false, privateDetail: privateCanary }), privateCanary, now - 1000).run();
  }
  for (const [id, realm, merit] of [["SLOT-ONE", "mortal", 0], ["SLOT-TWO", "mortal", 0], ["SLOT-THREE", "mortal", 0],
    ["SLOT-REALM", "qi", 0], ["SLOT-MERIT", "mortal", 1]]) {
    await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,deposit,budget_tokens,contract_ready,required_realm,required_merit,created_at) VALUES (?,?,'Synthetic only','黄阶','合成装备验收','open',?,'site/lib/small-json.ts','Synthetic only',0,0,0,0,30000,1,?,?,?)")
      .bind(id, id, "40d8180f3b9b0573a6deb3314ad7176156cc7370", realm, merit, now).run();
  }
  for (const [index, [itemId, price]] of items.entries()) {
    const actor = actors[index];
    const claim = (await api(actor, "/api/claims", { missionId: "GOV-001" }, 201)).claim;
    await api(actor, `/api/claims/${claim.id}/start`, {});
    const before = await api(actor, `/api/claims/${claim.id}/manifest`);
    const originalVerdict = await badArtifact(actor, claim.id);
    if (itemId === "heavenly-mirror") assert.doesNotMatch(await page(actor), /aria-label="天机镜情报"/);
    await api(actor, "/api/equipment/purchase", { itemId, expectedPrice: price, catalogVersion: 1 }, 201);
    const owned = await api(actor, `/api/claims/${claim.id}/manifest`);
    assert.deepEqual(owned.payload.equipment, before.payload.equipment, "Ownership alone must not enable any Runner effect");
    if (itemId === "heavenly-mirror") assert.doesNotMatch(await page(actor), /aria-label="天机镜情报"/);
    await api(actor, `/api/equipment/${itemId}/equip`, { equipped: true });
    const equipped = await api(actor, `/api/claims/${claim.id}/manifest`);
    const expected = { localPreflight: itemId === "calculation-array", checkpointSlots: itemId === "storage-bag" ? 2 : 1,
      heartTalisman: itemId === "heart-talisman", presetSlots: itemId === "teaching-slip" ? 2 : 1 };
    assert.deepEqual(equipped.payload.equipment, expected);
    assert.deepEqual(equipped.payload.model, before.payload.model);
    assert.deepEqual(equipped.payload.gameReward, before.payload.gameReward);
    assert.deepEqual(equipped.payload.repository, before.payload.repository);
    assert.deepEqual(equipped.payload.mission, before.payload.mission);
    assert.deepEqual(equipped.payload.claim, before.payload.claim);
    if (itemId === "heavenly-mirror") {
      const html = await page(actor), intelligence = html.match(/<section class="heavenly-mirror"[\s\S]*?<\/section>/)?.[0];
      assert.ok(intelligence, "Equipping the mirror must actually render its task intelligence");
      assert.match(intelligence, /mission=GOV-002/);
      assert.match(intelligence, /mission=GOV-004T/);
      // Two seeded revisions + two earlier bag submissions + this mirror actor's first submission.
      assert.match(intelligence, /要求修订 5 次 · 驳回 1 次 · 租约过期 1 次/);
      assert.doesNotMatch(html, /SYNTHETIC_PRIVATE_REVIEW_CANARY|past-revision|past-rejected|private-artifact/);
    }
    assert.deepEqual(await badArtifact(actor, claim.id), originalVerdict, `${itemId} must not change the same failed verdict`);
    await api(actor, "/api/realms/advance", { target: "qi" }, 409);
    const realmState = await api(actor, "/api/realms");
    assert.equal(realmState.progress.formalResults, 0);
    assert.equal(realmState.realm, "mortal");
    const account = await api(actor, "/api/me");
    assert.deepEqual(account.balances, { token: 10000 - price, tokenLocked: 0, cultivation: 0, merit: 0 });
    await api(actor, `/api/equipment/${itemId}/equip`, { equipped: false });
    assert.deepEqual((await api(actor, `/api/claims/${claim.id}/manifest`)).payload.equipment, before.payload.equipment);
    if (itemId === "heavenly-mirror") assert.doesNotMatch(await page(actor), /aria-label="天机镜情报"/);
    await api(actor, `/api/claims/${claim.id}/release`, {});
    console.log(`${itemId}: ownership/equipment separation, unchanged model/reward/lease/scope, same bad artifact rejected before and after, no advancement or minting.`);
  }
  const actor = "fixture-pendant";
  const first = (await api(actor, "/api/claims", { missionId: "SLOT-ONE" }, 201)).claim;
  await api(actor, "/api/claims", { missionId: "SLOT-TWO" }, 409);
  await api(actor, "/api/equipment/purchase", { itemId: "split-mind-pendant", expectedPrice: 1200, catalogVersion: 1 }, 201);
  await api(actor, "/api/claims", { missionId: "SLOT-TWO" }, 409);
  await api(actor, "/api/equipment/split-mind-pendant/equip", { equipped: true });
  const second = (await api(actor, "/api/claims", { missionId: "SLOT-TWO" }, 201)).claim;
  await api(actor, "/api/claims", { missionId: "SLOT-THREE" }, 409);
  await api(actor, "/api/equipment/split-mind-pendant/equip", { equipped: false });
  assert.equal((await api(actor, "/api/claims")).claims.filter((claim) => claim.state === "claimed").length, 2);
  await api(actor, `/api/claims/${first.id}/release`, {});
  await api(actor, "/api/claims", { missionId: "SLOT-THREE" }, 409);
  await api(actor, `/api/claims/${second.id}/release`, {});
  await api(actor, "/api/equipment/split-mind-pendant/equip", { equipped: true });
  await api(actor, "/api/claims", { missionId: "SLOT-REALM" }, 409);
  await api(actor, "/api/claims", { missionId: "SLOT-MERIT" }, 409);
  const third = (await api(actor, "/api/claims", { missionId: "SLOT-THREE" }, 201)).claim;
  await api(actor, `/api/claims/${third.id}/release`, {});
  assert.deepEqual((await api(actor, "/api/me")).balances, { token: 8800, tokenLocked: 0, cultivation: 0, merit: 0 });
  console.log("Pendant: actual claim cap 1→2→1, no cancellation of existing work, third claim refused, realm/merit gates retained with free seats. Synthetic only.");
} finally { await mf.dispose(); console.log(`Synthetic six-equipment data retained: ${temporary}`); }
