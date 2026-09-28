import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";
import { ECONOMY_AUDIT_SQL, economyAuditProblems } from "../lib/economy-audit.ts";

// Actual built API routes/D1; all accounts, prior formal results and adoptions are synthetic.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-core-http-"));
const secret = "isolated-core-http-fixture-secret-not-a-real-credential";
const base = "a".repeat(40), digest = "b".repeat(64);
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((left, right) => (left === "index.js" ? -1 : right === "index.js" ? 1 : left.localeCompare(right)))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const binding = { DB: "isolated-core-http" };
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), r2Persist: join(temporary, "r2"), workers: [
    { name: "fixture-entry", modules: true, d1Databases: binding, serviceBindings: { APP: "application" },
      compatibilityDate: "2026-09-21", script: `export default { async fetch(request, env) {
        const path = new URL(request.url).pathname;
        if (path === '/fixture/query') return Response.json(await env.DB.prepare(await request.text()).all());
        if (path !== '/fixture/setup') return env.APP.fetch(request);
        for (const sql of await request.json()) await env.DB.prepare(sql).run();
        return Response.json({seeded:true});
      } }`, outboundService: () => new Response("No network", { status: 403 }) },
    { name: "application", rootPath: server, modules, compatibilityDate: "2026-09-21", compatibilityFlags: ["nodejs_compat"],
      d1Databases: binding, r2Buckets: ["BUCKET"], bindings: { SESSION_SECRET: secret, MAINTAINER_GITHUB_ID: "903" },
      outboundService: () => { throw new Error("Core trial regression must not use external services"); } },
  ] }));

function actor(suffix) { return `fixture-core-${suffix}`; }
function cookie(id) {
  const payload = Buffer.from(JSON.stringify({ sub: id, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
async function api(id, path, body, extraHeaders = {}) {
  const response = await mf.dispatchFetch(`http://fixture.local${path}`, {
    method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Origin: "http://fixture.local", "Content-Type": "application/json", ...(id ? { Cookie: cookie(id) } : {}), ...extraHeaders },
  });
  return { status: response.status, cache: response.headers.get("Cache-Control"), body: await response.json() };
}
async function seed(statements) {
  const response = await mf.dispatchFetch("http://fixture.local/fixture/setup", { method: "POST", body: JSON.stringify(statements) });
  assert.equal(response.status, 200, await response.text());
}
async function start(suffix, claimId = `${actor(suffix)}:claim`) {
  const result = await api(actor(suffix), "/api/trials", { claimId });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.trial;
}
async function balances(suffix) { return (await api(actor(suffix), "/api/me")).body.balances; }
async function formal(suffix, trial) {
  const id = actor(suffix);
  await seed([
    `UPDATE claims SET state='completed' WHERE id='${trial.claim_id}'`,
    `UPDATE missions SET state='done' WHERE id='${id}:mission'`,
    `INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at)
      VALUES ('${id}:trial-result','${trial.claim_id}','${id}','fixture.md','${digest}','accepted','fixture-maintainer','${base}',${trial.started_at + 1},${trial.started_at + 1})`,
  ]);
}
const suffixes = ["ready", "no-token", "no-cultivation", "no-merit", "no-formal", "no-replay", "wrong-realm", "withdraw", "fault", "expired", "revoked", "foundation"];
try {
  console.log("Starting actual built trial API with isolated synthetic D1; external network denied.");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    await seed(readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim()));
  }
  await seed([
    "INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES ('fixture-replay-author','github','902','Fixture','Synthetic',1),('fixture-maintainer','github','903','Fixture','Synthetic',1)",
    `INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at)
      VALUES ('REPLAY','Synthetic replay target','Not a community result','黄阶','Fixture','done','${base}','fixture.md','Synthetic',0,0,0,1)`,
    "INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot) VALUES ('REPLAY-C','REPLAY','fixture-replay-author','completed',1,2,'{}')",
    `INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at)
      VALUES ('REPLAY-S','REPLAY-C','fixture-replay-author','fixture.md','${digest}','accepted','fixture-maintainer','${base}',2,1)`,
  ]);
  for (let index = 0; index < 10; index++) await seed([
    `INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at)
      VALUES ('FORMAL-${index}','Synthetic prior result','Not a community result','黄阶','Fixture','done','${base}','fixture.md','Synthetic',0,0,0,1)`,
  ]);
  for (const [index, suffix] of suffixes.entries()) {
    const id = actor(suffix), now = Date.now();
    await seed([
      `INSERT INTO cultivators (id,provider,provider_id,handle,display_name,realm,created_at) VALUES
        ('${id}','github','${1000 + index}','Fixture','Synthetic','${["wrong-realm", "foundation"].includes(suffix) ? "qi" : "foundation"}',1)`,
      `INSERT INTO ledger_events VALUES ('${id}:t','${id}','token',${suffix === "no-token" ? 1999 : 3000},'${id}:seed:t',1),
        ('${id}:c','${id}','cultivation',${suffix === "no-cultivation" ? 4999 : 5000},'${id}:seed:c',1),
        ('${id}:m','${id}','merit',${suffix === "no-merit" ? 199 : 200},'${id}:seed:m',1)`,
      `INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at,contract_ready)
        VALUES ('${id}:mission','Synthetic trial','Not a real trial contract','地阶','Fixture','open','${base}','fixture.md','Synthetic',0,0,0,1,1)`,
      `INSERT INTO realm_trial_contracts VALUES ('${id}:mission','${suffix === "foundation" ? "foundation" : "core"}',60000)`,
      `INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot)
        VALUES ('${id}:claim','${id}:mission','${id}','running',${now},${now},${now + 7200000},'{"deposit":0,"token":0,"cultivation":0,"merit":0,"baseCommit":"${base}","allowedPaths":"fixture.md"}')`,
    ]);
    for (let number = 0; number < (suffix === "no-formal" ? 9 : 10); number++) await seed([
      `INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot)
        VALUES ('${id}:C${number}','FORMAL-${number}','${id}','completed',1,2,'{}')`,
      `INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at)
        VALUES ('${id}:S${number}','${id}:C${number}','${id}','fixture.md','${digest}','accepted','fixture-maintainer','${base}',2,1)`,
    ]);
    if (suffix !== "no-replay") await seed([
      `INSERT INTO result_revalidations VALUES ('${id}:R','REPLAY-S','${id}',7,'${base}',${2000 + index},1,'${base}','${base}','${digest}','passed','完整合成复验观察，只验证采纳资格与渡劫，不代表真实 CI 或社区成果。',20)`,
      `INSERT INTO result_revalidation_decisions VALUES ('${id}:R','accept','fixture-maintainer','独立核对合成记录',30)`,
    ]);
  }
  assert.equal((await api(null, "/api/trials")).status, 401);
  const available = await api(actor("ready"), "/api/trials");
  assert.equal(available.status, 200);
  assert.equal(available.cache, "private, no-store");
  assert.equal(available.body.realm, "foundation");
  assert.equal(available.body.entry.eligible, true);
  assert.equal(available.body.next.eligible, false);
  assert.deepEqual(available.body.next.missing, ["专属渡劫尚未通过"]);
  assert.deepEqual(available.body.offers, [{ claim_id: `${actor("ready")}:claim`, mission_id: `${actor("ready")}:mission`,
    title: "Synthetic trial", target_realm: "core", duration_ms: 60000, fee: 2000 }]);
  assert.equal(available.body.progress.independentReviews, 1);
  assert.equal((await api("fixture-maintainer", "/api/trials")).body.offers.length, 0);
  assert.equal((await api(actor("ready"), "/api/trials", { claimId: `${actor("ready")}:claim` }, { Origin: "https://foreign.invalid" })).status, 403);
  for (const suffix of ["no-token", "no-cultivation", "no-merit", "no-formal", "no-replay", "wrong-realm"]) {
    const before = await balances(suffix);
    assert.equal((await api(actor(suffix), "/api/trials", { claimId: `${actor(suffix)}:claim` })).status, 409);
    assert.deepEqual(await balances(suffix), before);
    const blocked = await api(actor(suffix), "/api/trials");
    assert.equal(blocked.body.trials.length, 0);
    assert.equal(blocked.body.entry.eligible, suffix === "wrong-realm");
    assert.equal(blocked.body.entry.target, suffix === "wrong-realm" ? "foundation" : "core");
    assert.equal(blocked.body.offers.length, suffix === "wrong-realm" ? 0 : 1);
    assert.deepEqual(await balances(suffix), before);
  }
  assert.equal((await api(actor("no-replay"), "/api/trials", { claimId: `${actor("ready")}:claim` })).status, 409);
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => api(actor("ready"), "/api/trials", { claimId: `${actor("ready")}:claim` })));
  assert.equal(concurrent.filter((value) => value.status === 201).length, 1);
  assert.equal(concurrent.filter((value) => value.status === 409).length, 19);
  const trial = concurrent.find((value) => value.status === 201).body.trial;
  assert.equal(trial.target_realm, "core");
  assert.equal(trial.fee, 2000);
  assert.deepEqual(await balances("ready"), { token: 1000, tokenLocked: 2000, cultivation: 5000, merit: 200 });
  const active = await api(actor("ready"), "/api/trials");
  assert.equal(active.body.offers.length, 0);
  assert.equal(active.body.trials.length, 1);
  assert.equal(active.body.trials[0].id, trial.id);
  assert.equal(active.body.trials[0].state, "active");
  assert.equal((await api(actor("ready"), `/api/trials/${trial.id}/finish`, {})).status, 409);
  assert.equal((await api(actor("fault"), `/api/trials/${trial.id}/finish`, {})).status, 409);
  await formal("ready", trial);
  const finished = await api(actor("ready"), `/api/trials/${trial.id}/finish`, {});
  assert.equal(finished.status, 200, JSON.stringify(finished.body));
  assert.equal(finished.body.realm, "core");
  const repeats = await Promise.all(Array.from({ length: 20 }, () => api(actor("ready"), `/api/trials/${trial.id}/finish`, {})));
  assert(repeats.every((value) => value.status === 409));
  assert.deepEqual(await balances("ready"), { token: 1000, tokenLocked: 0, cultivation: 5000, merit: 200 });
  assert.equal((await api(actor("ready"), "/api/realms")).body.realm, "core");
  const completed = await api(actor("ready"), "/api/trials");
  assert.equal(completed.body.entry, null);
  assert.equal(completed.body.offers.length, 0);
  assert.equal(completed.body.trials[0].outcome, "passed");
  console.log("Core API gates, 20 concurrent starts and one-time 2000 settlement passed; response identifies core.");

  const withdrawal = await start("withdraw");
  const withdrawals = await Promise.all(Array.from({ length: 20 }, () => api(actor("withdraw"), `/api/trials/${withdrawal.id}/withdraw`, { reason: "合成退出场景，要求全额解冻游戏 Token。" })));
  assert.equal(withdrawals.filter((value) => value.status === 200).length, 1);
  assert.equal(withdrawals.filter((value) => value.status === 409).length, 19);
  assert.equal((await balances("withdraw")).token, 3000);
  const withdrawn = await api(actor("withdraw"), "/api/trials");
  assert.equal(withdrawn.body.offers.length, 0);
  assert.equal(withdrawn.body.trials[0].outcome, "withdrawn");
  assert.equal((await api(actor("withdraw"), `/api/claims/${withdrawal.claim_id}/release`, {})).status, 200);
  const claimed = await api(actor("withdraw"), "/api/claims", { missionId: `${actor("withdraw")}:mission` });
  assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
  assert.equal((await api(actor("withdraw"), `/api/claims/${claimed.body.claim.id}/start`, {})).status, 200);
  assert.equal((await api(actor("withdraw"), "/api/trials")).body.offers[0].claim_id, claimed.body.claim.id);
  await seed([`INSERT INTO ledger_events VALUES ('retry-lower','${actor("withdraw")}','cultivation',-1,'fixture:retry-lower',40)`]);
  assert.equal((await api(actor("withdraw"), "/api/trials", { claimId: claimed.body.claim.id })).status, 409);
  assert.equal((await balances("withdraw")).tokenLocked, 0);
  await seed([`INSERT INTO ledger_events VALUES ('retry-restore','${actor("withdraw")}','cultivation',1,'fixture:retry-restore',41)`]);
  const retried = await start("withdraw", claimed.body.claim.id);
  assert.equal((await api(actor("withdraw"), `/api/trials/${retried.id}/withdraw`, { reason: "合成重试结束，验证再次满足资格后冻结且全额退款。" })).status, 200);

  const fault = await start("fault");
  const reason = { reason: "合成平台故障演练，独立维护者记录原因并全额解冻费用，不是实际事件。" };
  assert.equal((await api(actor("fault"), `/api/trials/${fault.id}/abort`, reason)).status, 403);
  assert.equal((await api("fixture-maintainer", `/api/trials/${fault.id}/abort`, reason)).status, 200);
  assert.equal((await api("fixture-maintainer", `/api/trials/${fault.id}/abort`, reason)).status, 409);
  assert.equal((await balances("fault")).token, 3000);
  const revoked = await start("revoked");
  await formal("revoked", revoked);
  await seed(["UPDATE missions SET state='open' WHERE id='REPLAY'"]);
  assert.equal((await api(actor("revoked"), `/api/trials/${revoked.id}/finish`, {})).status, 409);
  assert.equal((await api(actor("revoked"), `/api/trials/${revoked.id}/withdraw`, { reason: "复验资格失效后退出，未成功则全额退款。" })).status, 200);
  await seed(["UPDATE missions SET state='done' WHERE id='REPLAY'"]);

  const foundation = await start("foundation");
  assert.equal(foundation.fee, 500);
  await formal("foundation", foundation);
  const foundationFinish = await api(actor("foundation"), `/api/trials/${foundation.id}/finish`, {});
  assert.equal(foundationFinish.status, 200);
  assert.equal(foundationFinish.body.realm, "foundation");
  assert.equal((await balances("foundation")).token, 2500);
  console.log("Withdraw/retry eligibility, independent platform abort, revoked replay and foundation regression passed.");

  const expired = await start("expired");
  console.log("Waiting for the real one-minute core deadline, without editing the clock or trial history.");
  await setTimeout(Math.max(0, expired.expires_at - Date.now() + 1000));
  const refreshed = await Promise.all(Array.from({ length: 20 }, () => api(actor("expired"), "/api/trials")));
  assert(refreshed.every((value) => value.status === 200 && value.body.trials.find((record) => record.id === expired.id).outcome === "expired"));
  assert.deepEqual(await balances("expired"), { token: 3000, tokenLocked: 0, cultivation: 5000, merit: 200 });
  assert.equal((await api(actor("expired"), "/api/realms")).body.realm, "foundation");
  const audit = await mf.dispatchFetch("http://fixture.local/fixture/query", { method: "POST", body: ECONOMY_AUDIT_SQL });
  const rows = (await audit.json()).results;
  assert.equal(economyAuditProblems(rows).length, 0);
  assert(rows.every((row) => row.locked_balance === 0));
  console.log(`Core real-clock expiry and duplicate refund passed; ${rows.length} synthetic accounts reconcile without differences.`);
  console.log("No real PR, human adoption, model call or community result is claimed.");
} finally {
  await mf.dispose();
  const target = realpathSync(temporary);
  assert(target.startsWith(realpathSync(tmpdir()) + sep) && basename(target).startsWith("lingnet-core-http-"));
  rmSync(target, { recursive: true, force: true });
}
