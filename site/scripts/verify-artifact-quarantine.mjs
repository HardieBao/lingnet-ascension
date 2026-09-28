import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Agreed seam: upload → quarantine, independent review and claim release.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-artifact-quarantine-"));
const secret = "isolated-quarantine-secret-not-a-real-credential";
const actor = "fixture-quarantine-owner", reviewer = "fixture-quarantine-reviewer";
const fakeCredential = `sk-${"0".repeat(48)}`; // Synthetic shape only; never contact a provider.
const good = readFileSync(join(site, "tests", "fixtures", "gov001-charter.md"), "utf8");
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), r2Persist: join(temporary, "r2"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: "2026-09-21", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "isolated-artifact-quarantine" }, r2Buckets: ["BUCKET"],
    bindings: { SESSION_SECRET: secret, MAINTAINER_GITHUB_ID: "302" },
    outboundService: () => { throw new Error("Quarantine verification forbids external network"); },
  }] }));
function cookie(id) {
  const payload = Buffer.from(JSON.stringify({ sub: id, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
async function api(id, path, input) {
  return mf.dispatchFetch(`http://fixture.local${path}`, { method: input ? "POST" : "GET",
    headers: { Cookie: cookie(id), Origin: "http://fixture.local", "Content-Type": "application/json" },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
}
async function upload(content, claimId = "fixture-quarantine-claim") {
  const boundary = `fixture-${crypto.randomUUID()}`;
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="claimId"\r\n\r\n${claimId}\r\n--${boundary}\r\nContent-Disposition: form-data; name="artifact"; filename="GOVERNANCE.md"\r\nContent-Type: text/markdown\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  return mf.dispatchFetch("http://fixture.local/api/submissions", { method: "POST",
    headers: { Cookie: cookie(actor), Origin: "http://fixture.local", "Content-Type": `multipart/form-data; boundary=${boundary}` }, body,
  });
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  const now = Date.now();
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github','301','Fixture','Synthetic owner',?), (?,'github','302','Fixture','Synthetic reviewer',?)").bind(actor, now, reviewer, now).run();
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,created_at) VALUES ('GOV-001','Fixture','Synthetic only','黄阶','Fixture','open',?,'GOVERNANCE.md','Synthetic',10,1,1,1,?)").bind("a".repeat(40), now).run();
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES ('fixture-quarantine-claim','GOV-001',?,'running',?,?,?,?)")
    .bind(actor, now, now, now + 3600_000, JSON.stringify({ deposit: 0, token: 10, cultivation: 1, merit: 1, allowedPaths: "GOVERNANCE.md" })).run();
  const response = await upload(`${good}\n${fakeCredential}\n`);
  assert.equal(response.status, 201);
  const text = await response.text(), result = JSON.parse(text).submission;
  assert.equal(result.state, "frozen", "Structurally valid content with a credential shape must be quarantined instead of approved for review");
  assert.equal(result.verdict.passed, false);
  assert(!text.includes(fakeCredential), "Quarantine response must not echo the submitted credential");
  assert.equal((await (await api(actor, "/api/claims")).json()).claims[0].state, "frozen");
  assert.equal((await api(actor, "/api/claims/fixture-quarantine-claim/release", {})).status, 409);
  assert.equal((await api(actor, "/api/claims/fixture-quarantine-claim/heartbeat", {})).status, 409);
  assert.equal((await api(actor, "/api/claims/fixture-quarantine-claim/manifest")).status, 409);
  assert.equal((await api(reviewer, `/api/reviews/${result.id}`, { decision: "accept", reason: "Synthetic attempt to approve quarantined content" })).status, 409);
  assert.equal((await api(reviewer, `/api/reviews/${result.id}`, { decision: "revise", reason: `Synthetic credential must not enter review history: ${fakeCredential}` })).status, 400);
  const artifact = await api(actor, `/api/submissions/${result.id}/artifact`);
  assert.notEqual(artifact.status, 200, "Quarantined raw content must not be downloadable");
  assert(!(await artifact.text()).includes(fakeCredential));
  assert.equal((await api(reviewer, "/api/claims", { missionId: "GOV-001" })).status, 409);
  assert.equal((await upload(good)).status, 409, "A frozen claim must not automatically reopen for another upload");
  const history = await api(actor, "/api/submissions");
  assert(!(await history.text()).includes(fakeCredential));
  const balances = (await (await api(actor, "/api/me")).json()).balances;
  assert.equal(balances.token, 0);
  assert.equal(balances.tokenLocked, 0);
  assert.equal(balances.cultivation, 0);
  assert.equal(balances.merit, 0);
  console.log("Synthetic credential upload → frozen result, claim and mission; no raw download, automatic reopen, approval or rewards.");
  assert.equal((await api(actor, `/api/reviews/${result.id}`, { decision: "revise", reason: "Synthetic owner cannot clear own quarantine" })).status, 403);
  const cleared = await api(reviewer, `/api/reviews/${result.id}`, { decision: "revise", reason: "Synthetic independent reviewer permits a new sanitized upload" });
  assert.equal(cleared.status, 200, "An independent maintainer must be able to explicitly return a frozen claim for sanitized revision within its lease");
  assert.equal((await cleared.json()).state, "needs_revision");
  assert.equal((await api(reviewer, `/api/reviews/${result.id}`, { decision: "revise", reason: "Synthetic repeated quarantine decision" })).status, 409);
  const resumed = (await (await api(actor, "/api/claims")).json()).claims[0];
  assert.equal(resumed.state, "running");
  assert.equal(resumed.started_at, now);
  assert.equal(resumed.expires_at, now + 2 * 3600_000);
  assert.notEqual((await api(actor, `/api/submissions/${result.id}/artifact`)).status, 200, "Clearing quarantine must not recover the discarded sensitive original");
  const sanitized = await upload(good);
  assert.equal(sanitized.status, 201, await sanitized.clone().text());
  const replacement = (await sanitized.json()).submission;
  assert.equal(replacement.state, "awaiting_review");
  const cleanArtifact = await api(actor, `/api/submissions/${replacement.id}/artifact`);
  assert.equal(cleanArtifact.status, 200);
  assert.equal(await cleanArtifact.text(), good);
  assert.equal((await api(reviewer, `/api/reviews/${replacement.id}`, { decision: "reject", reason: "Synthetic sanitized test result rejected without rewards" })).status, 200);
  console.log("Only an explicit independent review resumes the original capped lease; a newly scanned clean upload is required, original remains unavailable.");
  const expiredClaim = "fixture-expired-frozen-claim", expiredResult = "fixture-expired-frozen-result";
  await db.prepare("UPDATE missions SET state='frozen' WHERE id='GOV-001'").run();
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,'GOV-001',?,'frozen',?,?,?,?)")
    .bind(expiredClaim, actor, now - 24 * 3600_000, now - 24 * 3600_000, now - 22 * 3600_000,
      JSON.stringify({ deposit: 50, token: 10, cultivation: 1, merit: 1 })).run();
  await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,verdict,created_at) VALUES (?,?,?,'discarded-sensitive-original',?,'frozen',?,?)")
    .bind(expiredResult, expiredClaim, actor, "b".repeat(64), JSON.stringify({ passed: false, quarantined: true, checks: [] }), now - 23 * 3600_000).run();
  for (const [resource, delta, source] of [["token", 100, "fixture-initial"], ["token", -50, `${expiredClaim}:deposit:hold`], ["token_locked", 50, `${expiredClaim}:deposit:locked`]]) {
    await db.prepare("INSERT INTO ledger_events VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), actor, resource, delta, source, now).run();
  }
  const frozenClaims = (await (await api(actor, "/api/claims")).json()).claims;
  assert.equal(frozenClaims.find(({ id }) => id === expiredClaim).state, "frozen", "Ordinary expiry must not silently reopen a quarantine");
  const frozenAudit = await api(reviewer, "/economy");
  assert.equal(frozenAudit.status, 200);
  assert((await frozenAudit.text()).includes("当前扫描未发现上述异常"), "Held quarantine deposits must remain part of expected escrow in the public economic audit");
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,created_at) VALUES ('SLOT-FIXTURE','Fixture','Synthetic only','黄阶','Fixture','open',?,'GOVERNANCE.md','Synthetic',0,0,0,1,?)").bind("a".repeat(40), now).run();
  assert.equal((await api(actor, "/api/claims", { missionId: "SLOT-FIXTURE" })).status, 409, "Pending quarantine must retain its claim seat until an independent decision");
  assert.equal((await api(reviewer, `/api/reviews/${expiredResult}`, { decision: "revise", reason: "Synthetic expired quarantine cannot resume" })).status, 409);
  const decisions = await Promise.all(Array.from({ length: 20 }, () => api(reviewer, `/api/reviews/${expiredResult}`, { decision: "reject", reason: "Synthetic independent rejection releases original deposit" })));
  assert.equal(decisions.filter(({ status }) => status === 200).length, 1);
  assert(decisions.every(({ status }) => status === 200 || status === 409));
  const refunded = (await (await api(actor, "/api/me")).json()).balances;
  assert.equal(refunded.token, 100);
  assert.equal(refunded.tokenLocked, 0);
  assert.equal(refunded.cultivation, 0);
  assert.equal(refunded.merit, 0);
  assert.equal((await (await api(actor, "/api/claims")).json()).claims.find(({ id }) => id === expiredClaim).state, "rejected");
  const audit = (await (await api(actor, "/api/submissions")).json()).submissions.find(({ id }) => id === expiredResult);
  assert.equal(audit.state, "rejected");
  assert.equal(audit.review_reason, "Synthetic independent rejection releases original deposit");
  console.log("Expired quarantine never resumes automatically; 20 concurrent independent rejections refund the original deposit exactly once and preserve review history.");
  const privateClaim = "fixture-private-config-claim";
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,'GOV-001',?,'running',?,?,?,?)")
    .bind(privateClaim, actor, now, now, now + 3600_000, JSON.stringify({ deposit: 0, token: 10, cultivation: 1, merit: 1, allowedPaths: "GOVERNANCE.md" })).run();
  const privateConfig = await upload(`${good}\nOPENAI_API_KEY="${"not-a-provider-key-".repeat(3)}"\n`, privateClaim);
  assert.equal(privateConfig.status, 201);
  const privateResult = (await privateConfig.json()).submission;
  assert.equal(privateResult.state, "frozen", "A literal credential in private configuration must freeze even without a known provider prefix");
  assert.equal((await api(reviewer, `/api/reviews/${privateResult.id}`, { decision: "reject", reason: "Synthetic private configuration discarded" })).status, 200);
  console.log("Private configuration credential literals are quarantined without storing their value.");
} finally { await mf.dispose(); }
