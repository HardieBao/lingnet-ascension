import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-stable-settlement-"));
const secret = "synthetic-stable-settlement-session-not-a-credential";
const original = "a".repeat(40), first = "b".repeat(40), second = "c".repeat(40);
const artifact = "fixed public fixture\n";
const digest = createHash("sha256").update(artifact).digest("hex");
const publication = Date.now() - 8 * 86400000;
let secondPublishedAt = publication + 7 * 86400000;
let secondContent = artifact;
let firstReleaseImmutable = true;
let mainCommit = second, mainContent = artifact;
let mainLineageStatus = "ahead";
let githubCalls = 0;
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((left, right) => (left === "index.js" ? -1 : right === "index.js" ? 1 : left.localeCompare(right)))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
function github(request) {
  githubCalls++;
  const url = new URL(request.url);
  assert.equal(url.hostname, "api.github.com", "No real external service is contacted");
  const root = "/repos/HardieBao/lingnet-ascension";
  if (url.pathname === `${root}/releases/tags/v1` || url.pathname === `${root}/releases/tags/v2`) {
    const one = url.pathname.endsWith("v1");
    return Response.json({ id: one ? 101 : 102, tag_name: one ? "v1" : "v2", draft: false, prerelease: false,
      immutable: one ? firstReleaseImmutable : true,
      published_at: new Date(one ? publication : secondPublishedAt).toISOString() });
  }
  if (url.pathname === `${root}/commits/v1` || url.pathname === `${root}/commits/v2`) {
    assert.equal(request.headers.get("Accept"), "application/vnd.github.sha");
    return new Response(url.pathname.endsWith("v1") ? first : second);
  }
  if (url.pathname === `${root}/commits/main`) {
    assert.equal(request.headers.get("Accept"), "application/vnd.github.sha");
    return new Response(mainCommit);
  }
  if (url.pathname.startsWith(`${root}/compare/`)) {
    const comparison = url.pathname.slice(`${root}/compare/`.length);
    if (comparison === `${second}...${"d".repeat(40)}`) return Response.json({ status: mainLineageStatus });
    if ([`${original}...${first}`, `${first}...${second}`, `${first}...main`, `${second}...main`, `${second}...${second}`,
      `${"d".repeat(40)}...main`].includes(comparison)) {
      return Response.json({ status: "ahead" });
    }
  }
  if (url.pathname === `${root}/contents/GOVERNANCE.md`) {
    const ref = url.searchParams.get("ref");
    return new Response(ref === second ? secondContent : ref === mainCommit ? mainContent : artifact);
  }
  throw new Error(`Unexpected synthetic GitHub route: ${url.pathname}`);
}
const binding = { DB: "isolated-stable-settlement" };
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), workers: [
    { name: "fixture-entry", modules: true, d1Databases: binding, serviceBindings: { APP: "application" },
      compatibilityDate: "2026-09-21", script: `export default { async fetch(request, env) {
        if (new URL(request.url).pathname !== '/fixture/setup') return env.APP.fetch(request);
        for (const sql of await request.json()) await env.DB.prepare(sql).run();
        return Response.json({seeded:true});
      } }`, outboundService: () => new Response("No network", { status: 403 }) },
    { name: "application", rootPath: server, modules, compatibilityDate: "2026-09-21",
      compatibilityFlags: ["nodejs_compat"], d1Databases: binding,
      bindings: { SESSION_SECRET: secret, MAINTAINER_GITHUB_ID: "303", RECOVERY_APPROVER_GITHUB_ID: "404",
        ENABLE_STABLE_SETTLEMENTS: "true" }, outboundService: github },
  ] }));
function cookie(id) {
  const payload = Buffer.from(JSON.stringify({ sub: id, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
async function api(actor, path, body) {
  const response = await mf.dispatchFetch(`http://fixture.local${path}`, { method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body), headers: { Origin: "http://fixture.local",
      "Content-Type": "application/json", ...(actor ? { Cookie: cookie(actor) } : {}) } });
  const text = await response.text();
  return { status: response.status, body: response.headers.get("Content-Type")?.includes("application/json") ? JSON.parse(text) : text.slice(0, 100) };
}
async function seed(statements) {
  const response = await mf.dispatchFetch("http://fixture.local/fixture/setup", { method: "POST", body: JSON.stringify(statements) });
  assert.equal(response.status, 200, await response.text());
}
const request = { submissionId: "fixture-submission", firstTag: "v1", secondTag: "v2",
  reason: "独立核对两次公开版本中的同一成果摘要，确认仍有效且没有回滚" };
try {
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    await seed(readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim()));
  }
  await seed([
    "INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES ('author','github','101','Fixture','Fixture',1),('reviewer','github','303','Fixture','Fixture',1),('second-reviewer','github','404','Fixture','Fixture',1)",
    `INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at) VALUES ('GOV-001','Fixture','Synthetic','黄阶','Fixture','done','${original}','GOVERNANCE.md','Synthetic',50,100,5,1)`,
    `INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot) VALUES ('fixture-claim','GOV-001','author','completed',1,1000,'{"allowedPaths":"GOVERNANCE.md","stable":{"policyVersion":1,"token":10,"cultivation":20,"merit":1,"minimumVersionGapMs":604800000}}')`,
    `INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at) VALUES ('fixture-submission','fixture-claim','author','fixture.md','${digest}','accepted','reviewer','${original}',10,2)`,
  ]);
  assert.equal((await api(null, "/api/stable-settlements", request)).status, 403);
  const before = githubCalls;
  assert.equal((await api("author", "/api/stable-settlements", request)).status, 403);
  assert.equal(githubCalls, before, "Author cannot settle their own reward");
  secondPublishedAt = publication + 6 * 86400000;
  assert.equal((await api("reviewer", "/api/stable-settlements", request)).status, 409, "Six days is too short");
  assert.equal((await api("author", "/api/me")).body.balances.token, 0);
  secondPublishedAt = publication + 7 * 86400000;
  secondContent = "rolled back\n";
  assert.equal((await api("reviewer", "/api/stable-settlements", request)).status, 409, "Changed artifact cannot be rewarded");
  secondContent = artifact;
  firstReleaseImmutable = false;
  assert.equal((await api("reviewer", "/api/stable-settlements", request)).status, 409,
    "A mutable release cannot prove the published tag still points to the same commit");
  firstReleaseImmutable = true;
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => api("reviewer", "/api/stable-settlements", request)));
  assert.equal(concurrent.filter((result) => result.status === 201).length, 1, JSON.stringify(concurrent));
  assert.equal(concurrent.filter((result) => result.status === 409).length, 7);
  const settlementId = concurrent.find((result) => result.status === 201).body.id;
  assert.deepEqual((await api("author", "/api/me")).body.balances, { token: 10, tokenLocked: 0, cultivation: 20, merit: 1 });
  assert.equal((await api("reviewer", "/api/stable-settlements", request)).status, 409, "Cannot settle twice");
  await seed([
    `INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at) VALUES ('LEGACY','Fixture','Synthetic','黄阶','Fixture','done','${original}','GOVERNANCE.md','Synthetic',50,100,5,1)`,
    `INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot) VALUES ('old-claim','LEGACY','author','completed',1,1000,'{"allowedPaths":"GOVERNANCE.md"}')`,
    `INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at) VALUES ('old-submission','old-claim','author','fixture-old.md','${digest}','accepted','reviewer','${original}',10,2)`,
  ]);
  assert.equal((await api("reviewer", "/api/stable-settlements", { ...request, submissionId: "old-submission" })).status, 409,
    "Legacy claim without a stable snapshot cannot receive rewards");
  await seed([
    "INSERT INTO ledger_events (id,cultivator_id,resource,delta,source_key,created_at) VALUES ('fixture-token','author','token',190,'fixture:prior',3),('fixture-cultivation','author','cultivation',100,'fixture:prior',3),('fixture-merit','author','merit',5,'fixture:prior',3)",
  ]);
  assert.equal((await api("author", "/api/equipment/purchase", { itemId: "storage-bag" })).status, 201,
    "The already-awarded Token can be spent before rollback");
  await seed(["INSERT INTO ledger_events (id,cultivator_id,resource,delta,source_key,created_at) VALUES ('fixture-used-cultivation','author','cultivation',-120,'fixture:used',4),('fixture-used-merit','author','merit',-6,'fixture:used',4)"]);
  assert.equal((await api("author", "/api/me")).body.balances.token, 0);
  const revoke = { reason: "当前 main 已移除原成果，独立确认公开版本之后的回滚与奖励追回" };
  assert.equal((await api("reviewer", `/api/stable-settlements/${settlementId}/revoke`, revoke)).status, 409,
    "Unchanged current artifact is not a rollback");
  mainCommit = "d".repeat(40);
  mainLineageStatus = "diverged";
  mainContent = artifact;
  assert.equal((await api("reviewer", `/api/stable-settlements/${settlementId}/revoke`, revoke)).status, 409,
    "A rewritten main containing the same artifact cannot justify revocation");
  mainContent = "rolled back after public release\n";
  assert.equal((await api("author", `/api/stable-settlements/${settlementId}/revoke`, revoke)).status, 403);
  const revoked = await api("reviewer", `/api/stable-settlements/${settlementId}/revoke`, revoke);
  assert.equal(revoked.status, 201, JSON.stringify(revoked.body));
  assert.deepEqual(revoked.body.debt, { token: 10, cultivation: 20, merit: 1 });
  assert.deepEqual((await api("author", "/api/me")).body.balances, { token: 0, tokenLocked: 0, cultivation: 0, merit: 0 });
  assert.deepEqual((await api("author", "/api/me")).body.recovery,
    { hold: true, debt: { token: 10, cultivation: 20, merit: 1 } });
  const ledgerPage = await mf.dispatchFetch("http://fixture.local/ledger", { headers: { Cookie: cookie("author") } });
  assert.equal(ledgerPage.status, 200);
  const ledgerHtml = await ledgerPage.text();
  assert(ledgerHtml.includes("奖励回滚，账户暂时冻结") && ledgerHtml.includes("待抵扣：游戏 Token"),
    "The author sees the hold and debt on the actual ledger page");
  assert.equal((await api("reviewer", `/api/stable-settlements/${settlementId}/revoke`, revoke)).status, 409,
    "Revocation is append-only and settles once");
  await seed(["INSERT INTO ledger_events (id,cultivator_id,resource,delta,source_key,created_at) VALUES ('fixture-future-token','author','token',310,'fixture:future',4),('fixture-future-cultivation','author','cultivation',120,'fixture:future',4),('fixture-future-merit','author','merit',6,'fixture:future',4)"]);
  assert.equal((await api("author", "/api/me")).body.balances.token, 300,
    "Future credit first repays the 10 Token debt");
  assert.deepEqual((await api("author", "/api/me")).body.recovery,
    { hold: true, debt: { token: 0, cultivation: 0, merit: 0 } });
  assert.notEqual((await api("author", "/api/equipment/purchase", { itemId: "heart-talisman" })).status, 201);
  assert.equal((await api("author", "/api/realms/advance", { target: "qi" })).status, 409,
    "Open recovery hold blocks advancement despite sufficient cultivation and merit");
  const review = { reason: "第二独立审批人核对原结算、回滚证据和全部欠账冲抵记录，同意解除保护冻结" };
  assert.equal((await api("reviewer", `/api/stable-settlements/${settlementId}/release-hold`, review)).status, 403);
  assert.equal((await api("second-reviewer", `/api/stable-settlements/${settlementId}/release-hold`, review)).status, 200);
  assert.deepEqual((await api("author", "/api/me")).body.recovery,
    { hold: false, debt: { token: 0, cultivation: 0, merit: 0 } });
  assert.equal((await api("author", "/api/equipment/purchase", { itemId: "heart-talisman" })).status, 201,
    "Independent release restores spending only after debt was repaid");
  assert.equal((await api("author", "/api/realms/advance", { target: "qi" })).status, 200);
  console.log("Built Worker API/D1: public-release settlement, rollback debt, spending hold and independent release; synthetic only.");
} finally {
  await mf.dispose();
  const target = realpathSync(temporary);
  assert(target.startsWith(realpathSync(tmpdir()) + sep) && basename(target).startsWith("lingnet-stable-settlement-"));
  rmSync(target, { recursive: true, force: true });
}
