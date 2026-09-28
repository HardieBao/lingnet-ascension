import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Agreed seam: independent review → owner claim, task package and next upload.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-review-lease-"));
const secret = "isolated-review-lease-secret-not-a-real-credential";
const actor = "fixture-lease-owner", reviewer = "fixture-lease-reviewer";
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), r2Persist: join(temporary, "r2"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: "2026-09-21", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "isolated-review-lease" }, r2Buckets: ["BUCKET"],
    bindings: { SESSION_SECRET: secret, MAINTAINER_GITHUB_ID: "302" },
    outboundService: () => { throw new Error("Review lease verification forbids external network"); },
  }] }));
function cookie(id) {
  const payload = Buffer.from(JSON.stringify({ sub: id, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
async function api(id, path, input) {
  return mf.dispatchFetch(`http://fixture.local${path}`, {
    method: input ? "POST" : "GET",
    headers: { Cookie: cookie(id), Origin: "http://fixture.local", "Content-Type": "application/json" },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  const now = Date.now(), startedAt = now - 24 * 3600_000;
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github','301','Fixture','Synthetic owner',?), (?,'github','302','Fixture','Synthetic reviewer',?)").bind(actor, now, reviewer, now).run();
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,created_at) VALUES ('GOV-001','Fixture','Synthetic only','黄阶','Fixture','open',?,'GOVERNANCE.md','Synthetic',10,1,1,1,?)").bind("a".repeat(40), now).run();
  const snapshot = JSON.stringify({ deposit: 0, token: 10, officialToken: 0, cultivation: 1, merit: 1,
    baseCommit: "a".repeat(40), title: "Fixture", description: "Synthetic only", acceptance: "Synthetic",
    allowedPaths: "GOVERNANCE.md", budgetTokens: null });
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES ('fixture-expired-claim','GOV-001',?,'review',?,?,?,?)").bind(actor, startedAt, startedAt, startedAt + 2 * 3600_000, snapshot).run();
  await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,created_at) VALUES ('fixture-expired-result','fixture-expired-claim',?,'fixture.md',?,'awaiting_review',?)").bind(actor, "b".repeat(64), startedAt + 1000).run();
  const expired = await api(reviewer, "/api/reviews/fixture-expired-result", { decision: "revise", reason: "Synthetic revision exceeds absolute lease" });
  assert.equal(expired.status, 409, "A review must not restart a yellow claim 24 hours after its original start");
  const claims = await api(actor, "/api/claims");
  assert.equal(claims.status, 200);
  const claim = (await claims.json()).claims.find(({ id }) => id === "fixture-expired-claim");
  assert.equal(claim.state, "review", "Expired revision must leave the submitted result available for acceptance or rejection");
  assert.equal(claim.started_at, startedAt);
  assert.equal(claim.expires_at, startedAt + 2 * 3600_000);
  assert.equal((await api(actor, "/api/claims/fixture-expired-claim/manifest")).status, 409);
  console.log("Independent review cannot reopen an absolute-expired claim; original submission and lease remain unchanged.");
  assert.equal((await api(reviewer, "/api/reviews/fixture-expired-result", { decision: "reject", reason: "Synthetic expired result rejected" })).status, 200);
  const good = readFileSync(join(site, "tests", "fixtures", "gov001-charter.md"), "utf8");
  for (const [rank, maximumHours] of [["黄阶", 2], ["玄阶", 6], ["地阶", 16], ["天阶", 72]]) {
    const id = `fixture-revision-${maximumHours}`, start = Date.now() - (maximumHours - 1) * 3600_000;
    const deadline = start + maximumHours * 3600_000; // Independent plan §4 lease contract.
    await db.prepare("UPDATE missions SET rank=? WHERE id='GOV-001'").bind(rank).run();
    await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,'GOV-001',?,'review',?,?,?,?)").bind(id, actor, start, start, deadline, snapshot).run();
    await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,created_at) VALUES (?,?,?,'fixture.md',?,'awaiting_review',?)").bind(`${id}:result`, id, actor, "b".repeat(64), start + 1000).run();
    const revised = await api(reviewer, `/api/reviews/${id}:result`, { decision: "revise", reason: "Synthetic revision within original lease" });
    assert.equal(revised.status, 200, await revised.clone().text());
    assert.equal((await api(reviewer, `/api/reviews/${id}:result`, { decision: "revise", reason: "Synthetic duplicate review request" })).status, 409);
    const active = (await (await api(actor, "/api/claims")).json()).claims.find((claim) => claim.id === id);
    assert.equal(active.state, "running");
    assert.equal(active.started_at, start);
    assert.equal(active.expires_at, deadline, `${rank} revision must retain its absolute deadline`);
    const manifest = await api(actor, `/api/claims/${id}/manifest`);
    assert.equal(manifest.status, 200, await manifest.clone().text());
    assert.equal((await manifest.json()).payload.claim.expiresAt, deadline);
    const boundary = `fixture-${crypto.randomUUID()}`;
    const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="claimId"\r\n\r\n${id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="artifact"; filename="GOVERNANCE.md"\r\nContent-Type: text/markdown\r\n\r\n${good}\r\n--${boundary}--\r\n`);
    const uploaded = await mf.dispatchFetch("http://fixture.local/api/submissions", {
      method: "POST", headers: { Cookie: cookie(actor), Origin: "http://fixture.local", "Content-Type": `multipart/form-data; boundary=${boundary}` }, body,
    });
    assert.equal(uploaded.status, 201, await uploaded.clone().text());
    const result = (await uploaded.json()).submission;
    assert.equal(result.state, "awaiting_review");
    assert.equal((await api(reviewer, `/api/reviews/${result.id}`, { decision: "reject", reason: "Synthetic result released after lease test" })).status, 200);
  }
  const balances = (await (await api(actor, "/api/me")).json()).balances;
  assert.equal(balances.token, 0);
  assert.equal(balances.tokenLocked, 0);
  assert.equal(balances.cultivation, 0);
  assert.equal(balances.merit, 0);
  console.log("All four ranks: revision remains capped at original start, task package matches, valid re-upload works, repeat review refuses, no rewards minted.");
} finally { await mf.dispose(); }
