import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Agreed seam: real platform scheduled event, observed only through existing APIs.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-scheduled-trials-"));
const secret = "isolated-scheduled-trials-secret-not-a-real-credential";
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), r2Persist: join(temporary, "r2"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: "2026-09-21", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "isolated-scheduled-trials" }, r2Buckets: ["BUCKET"], bindings: { SESSION_SECRET: secret },
    outboundService: () => { throw new Error("Scheduled trial verification forbids external network"); },
  }] }));
function cookie(actor) {
  const payload = Buffer.from(JSON.stringify({ sub: actor, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
async function api(actor, path) {
  const response = await mf.dispatchFetch(`http://fixture.local${path}`, { headers: { Cookie: cookie(actor) } });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  const now = Date.now(), actor = "fixture-scheduled-expired", base = "a".repeat(40);
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,realm,created_at) VALUES (?, 'github','101','Fixture','Synthetic scheduled account','qi',?)").bind(actor, now).run();
  await db.prepare("INSERT INTO ledger_events VALUES (?,?,'token',1000,?,?)").bind(`${actor}:initial`, actor, `${actor}:initial`, now).run();
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at,contract_ready) VALUES (?,'Fixture','Synthetic only','黄阶','Fixture','open',?,'fixture.md','Synthetic',0,0,0,?,1)").bind(actor, base, now).run();
  await db.prepare("INSERT INTO realm_trial_contracts VALUES (?,'foundation',60000)").bind(actor).run();
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,?,?,'running',?,?,?,?)")
    .bind(`${actor}:claim`, actor, actor, now - 61_000, now - 61_000, now + 3600_000, JSON.stringify({ deposit: 0, baseCommit: base })).run();
  await db.prepare("INSERT INTO realm_trials (id,claim_id,cultivator_id,from_realm,target_realm,fee,base_commit,started_at,expires_at) VALUES (?,?,?,'qi','foundation',500,?,?,?)")
    .bind(actor, `${actor}:claim`, actor, base, now - 61_000, now - 1000).run();
  const before = (await api(actor, "/api/me")).balances;
  assert.equal(before.token, 500);
  assert.equal(before.tokenLocked, 500);
  const worker = await mf.getWorker("application");
  const scheduled = await worker.scheduled({ cron: "fixture-local-only" });
  assert.equal(scheduled.outcome, "ok", JSON.stringify(scheduled));
  const after = (await api(actor, "/api/me")).balances;
  assert.equal(after.token, 1000, "Expired trial must refund without visiting a settlement page");
  assert.equal(after.tokenLocked, 0);
  console.log("Platform scheduled event → account API: expired synthetic trial fully unlocked without a page visit.");
  for (const [index, id] of ["fixture-fault-first", "fixture-unaffected-last"].entries()) {
    await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,realm,created_at) VALUES (?, 'github',?,'Fixture','Synthetic fault isolation','qi',?)").bind(id, String(200 + index), now).run();
    await db.prepare("INSERT INTO ledger_events VALUES (?,?,'token',1000,?,?)").bind(`${id}:initial`, id, `${id}:initial`, now).run();
    await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at,contract_ready) VALUES (?,'Fixture','Synthetic only','黄阶','Fixture','open',?,'fixture.md','Synthetic',0,0,0,?,1)").bind(id, base, now).run();
    await db.prepare("INSERT INTO realm_trial_contracts VALUES (?,'foundation',60000)").bind(id).run();
    await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,?,?,'running',?,?,?,?)")
      .bind(`${id}:claim`, id, id, now - 61_000, now - 61_000, now + 3600_000, JSON.stringify({ deposit: 0, baseCommit: base })).run();
    await db.prepare("INSERT INTO realm_trials (id,claim_id,cultivator_id,from_realm,target_realm,fee,base_commit,started_at,expires_at) VALUES (?,?,?,'qi','foundation',500,?,?,?)")
      .bind(id, `${id}:claim`, id, base, now - 61_000, now - 1000).run();
  }
  await db.prepare("CREATE TRIGGER fixture_scheduled_fault BEFORE UPDATE ON realm_trials WHEN OLD.cultivator_id='fixture-fault-first' BEGIN SELECT RAISE(ABORT, 'synthetic account transaction failure'); END").run();
  const failedTick = await worker.scheduled({ cron: "fixture-local-only" });
  assert.equal(failedTick.outcome, "exception", "The overall job must surface a failed account");
  const unaffected = (await api("fixture-unaffected-last", "/api/me")).balances;
  assert.equal(unaffected.token, 1000, "One failed account must not stop another account's refund");
  assert.equal(unaffected.tokenLocked, 0);
  const failed = (await api("fixture-fault-first", "/api/me")).balances;
  assert.equal(failed.token, 500);
  assert.equal(failed.tokenLocked, 500, "Failed account transaction must retain its original freeze");
  console.log("Scheduled job surfaces an account failure while another account settles; failed account rolls back.");
  await db.prepare("DROP TRIGGER fixture_scheduled_fault").run();
  const retries = await Promise.all(Array.from({ length: 20 }, () => worker.scheduled({ cron: "fixture-local-only" })));
  assert(retries.every((result) => result.outcome === "ok"));
  for (const id of [actor, "fixture-fault-first", "fixture-unaffected-last"]) {
    const current = (await api(id, "/api/me")).balances;
    assert.equal(current.token, 1000);
    assert.equal(current.tokenLocked, 0);
    assert.equal((await api(id, "/api/realms")).realm, "qi");
    const ledger = await mf.dispatchFetch("http://fixture.local/ledger", { headers: { Cookie: cookie(id) } });
    assert.equal(ledger.status, 200);
    assert((await ledger.text()).includes(`trial:${id}:expired:refund`), "Public ledger must show the scheduled refund source");
  }
  console.log("20 concurrent/retried platform ticks refund once; ledger and realm interfaces preserve history and qi.");
  const delayed = "fixture-delayed-success", reviewer = "fixture-independent-reviewer";
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,realm,created_at) VALUES (?, 'github','301','Fixture','Synthetic delayed success','qi',?), (?, 'github','302','Fixture','Synthetic reviewer','qi',?)").bind(delayed, now, reviewer, now).run();
  await db.prepare("INSERT INTO ledger_events VALUES (?,?,'token',1000,?,?), (?,?,'cultivation',1000,?,?), (?,?,'merit',50,?,?)")
    .bind(`${delayed}:t`, delayed, `${delayed}:t`, now, `${delayed}:c`, delayed, `${delayed}:c`, now, `${delayed}:m`, delayed, `${delayed}:m`, now).run();
  for (let index = 0; index < 3; index++) {
    const mission = `${delayed}:prior:${index}`;
    await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at) VALUES (?,'Fixture','Synthetic prior result','黄阶','Fixture','done',?,'fixture.md','Synthetic',0,0,0,?)").bind(mission, base, now).run();
    await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot) VALUES (?,?,?,'completed',1,2,'{}')").bind(mission, mission, delayed).run();
    await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at) VALUES (?,?,?,'fixture.md',?,'accepted',?,?,2,1)").bind(mission, mission, delayed, "b".repeat(64), reviewer, base).run();
  }
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at,contract_ready) VALUES (?,'Fixture','Synthetic trial','黄阶','Fixture','open',?,'fixture.md','Synthetic',0,0,0,?,1)").bind(delayed, base, now).run();
  await db.prepare("INSERT INTO realm_trial_contracts VALUES (?,'foundation',60000)").bind(delayed).run();
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,?,?,'running',?,?,?,?)")
    .bind(`${delayed}:claim`, delayed, delayed, now - 61_000, now - 61_000, now + 3600_000, JSON.stringify({ deposit: 0, baseCommit: base })).run();
  await db.prepare("INSERT INTO realm_trials (id,claim_id,cultivator_id,from_realm,target_realm,fee,base_commit,started_at,expires_at) VALUES (?,?,?,'qi','foundation',500,?,?,?)")
    .bind(delayed, `${delayed}:claim`, delayed, base, now - 61_000, now - 1000).run();
  await db.prepare("UPDATE claims SET state='completed' WHERE id=?").bind(`${delayed}:claim`).run();
  await db.prepare("UPDATE missions SET state='done' WHERE id=?").bind(delayed).run();
  await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at) VALUES (?,?,?,'fixture.md',?,'accepted',?,?,?,?)")
    .bind(`${delayed}:result`, `${delayed}:claim`, delayed, "b".repeat(64), reviewer, base, now - 30_000, now - 30_000).run();
  assert.equal((await worker.scheduled({ cron: "fixture-local-only" })).outcome, "ok");
  const successBalances = (await api(delayed, "/api/me")).balances;
  assert.equal(successBalances.token, 500, "Late scheduler must charge an on-time formal result, not refund it");
  assert.equal(successBalances.tokenLocked, 0);
  assert.equal((await api(delayed, "/api/realms")).realm, "foundation");
  const history = await api(delayed, "/api/trials");
  assert.equal(history.trials[0].state, "passed");
  console.log("Delayed scheduled event preserves an on-time independent formal result and settles its original fee once.");
  const future = "fixture-still-running", futureStart = Date.now();
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,realm,created_at) VALUES (?, 'github','401','Fixture','Synthetic unexpired trial','qi',?)").bind(future, now).run();
  await db.prepare("INSERT INTO ledger_events VALUES (?,?,'token',1000,?,?)").bind(`${future}:initial`, future, `${future}:initial`, now).run();
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at,contract_ready) VALUES (?,'Fixture','Synthetic only','黄阶','Fixture','open',?,'fixture.md','Synthetic',0,0,0,?,1)").bind(future, base, now).run();
  await db.prepare("INSERT INTO realm_trial_contracts VALUES (?,'foundation',60000)").bind(future).run();
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,?,?,'running',?,?,?,?)")
    .bind(`${future}:claim`, future, future, futureStart, futureStart, futureStart + 3600_000, JSON.stringify({ deposit: 0, baseCommit: base })).run();
  await db.prepare("INSERT INTO realm_trials (id,claim_id,cultivator_id,from_realm,target_realm,fee,base_commit,started_at,expires_at) VALUES (?,?,?,'qi','foundation',500,?,?,?)")
    .bind(future, `${future}:claim`, future, base, futureStart, futureStart + 60000).run();
  assert.equal((await worker.scheduled({ cron: "fixture-local-only" })).outcome, "ok");
  const frozen = (await api(future, "/api/me")).balances;
  assert.equal(frozen.token, 500);
  assert.equal(frozen.tokenLocked, 500);
  const activeTrial = (await api(future, "/api/trials")).trials[0];
  assert.equal(activeTrial.state, "active");
  assert.equal(activeTrial.started_at, futureStart);
  assert.equal(activeTrial.expires_at, futureStart + 60000);
  console.log("Unexpired trial keeps its original freeze, start, expiry and active state after a platform tick.");
} finally { await mf.dispose(); }
