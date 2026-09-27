import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";

// Test-only instrumentation: actual built routes, native local D1 and R2, no network.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-submission-race-"));
const secret = "isolated-submission-race-secret-not-a-real-credential";
const good = readFileSync(join(site, "tests", "fixtures", "gov001-charter.md"), "utf8");
const bad = "# Incomplete synthetic fixture\n";
const goodEtag = createHash("md5").update(good).digest("hex");
const sourceModules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((left, right) => (left === "index.js" ? -1 : right === "index.js" ? 1 : left.localeCompare(right)))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const sourceHashes = sourceModules.map(({ path, contents }) => ({ path, sha256: createHash("sha256").update(contents).digest("hex") }));
const guard = "    AND EXISTS (SELECT 1 FROM submissions\n      WHERE id = ? AND claim_id = ? AND cultivator_id = ? AND state = 'awaiting_review')";
const results = [];

function cookie(actor) {
  const payload = Buffer.from(JSON.stringify({ sub: actor, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

async function runScenario(legacy) {
  const name = legacy ? "legacy-negative-control" : "current-guard";
  const actor = "fixture-upload-owner";
  const claim = "fixture-upload-claim";
  const events = [];
  let releaseGood, reportGoodReached;
  const held = new Promise((resolve) => { releaseGood = resolve; });
  const reached = new Promise((resolve) => { reportGoodReached = resolve; });
  let holding = true;
  const modules = sourceModules.map((module) => ({ ...module }));
  if (legacy) {
    const targets = modules.filter((module) => module.contents.includes(guard));
    assert.equal(targets.length, 1, "Cannot safely locate the exact built upload guard");
    const target = targets[0];
    const bindings = /\.prepare\(([A-Za-z_$][\w$]*)\)\.bind\(([A-Za-z_$][\w$]*)\.id,([A-Za-z_$][\w$]*)\.id,([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*),\2\.id,\3\.id\)/g;
    const matches = modules.flatMap((module) => [...module.contents.matchAll(bindings)].map((match) => ({ module, match })));
    assert.equal(matches.length, 1, "Cannot safely locate the matching six-argument review statement");
    target.contents = target.contents.replace(guard, "");
    const bindingModule = matches[0].module;
    bindingModule.contents = bindingModule.contents.replace(bindings,
      (_, statement, claimName, ownerName, now) => `.prepare(${statement}).bind(${claimName}.id,${ownerName}.id,${now})`);
  }
  const facade = {
    type: "ESModule", path: join(server, "submission-race-test-entry.mjs"),
    contents: `import application from './index.js';
      import {withEnv} from 'cloudflare:workers';
      export default { async fetch(request,env,ctx) {
        const bucket=new Proxy(env.BUCKET,{get(target,name) {
          if(name==='put') return async (...args)=>{
            const result=await target.put(...args);
            await env.OBSERVER.fetch('http://observer.test',{method:'POST',body:JSON.stringify({operation:'put',key:args[0],etag:result.etag})});
            return result;
          };
          if(name==='delete') return async (...args)=>{
            await target.delete(...args);
            await env.OBSERVER.fetch('http://observer.test',{method:'POST',body:JSON.stringify({operation:'delete',key:args[0]})});
          };
          const value=Reflect.get(target,name,target);
          return typeof value==='function'?value.bind(target):value;
        }});
        return withEnv({...env,BUCKET:bucket},()=>application.fetch(request,env,ctx));
      }};`,
  };
  const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
    d1Persist: join(temporary, name, "d1"), r2Persist: join(temporary, name, "r2"), workers: [{
      name: "application", rootPath: server, modules: [facade, ...modules],
      compatibilityDate: "2026-09-21", compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "isolated-submission-race" }, r2Buckets: ["BUCKET"],
      bindings: { SESSION_SECRET: secret },
      serviceBindings: { OBSERVER: async (request) => {
        const event = await request.json();
        events.push(event);
        if (holding && event.operation === "put" && event.etag === goodEtag) {
          reportGoodReached(event);
          await held;
        }
        return new Response("observed");
      } },
      outboundService: () => { throw new Error("Application external network is forbidden"); },
    }] }));
  let goodRequest, timeout;
  try {
    const db = await mf.getD1Database("DB");
    const bucket = await mf.getR2Bucket("BUCKET");
    for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
      for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) {
        await db.prepare(sql).run();
      }
    }
    const now = Date.now();
    await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?, 'github', '101', 'Fixture', 'Synthetic upload owner', ?)").bind(actor, now).run();
    await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,created_at) VALUES ('GOV-001','Fixture','Synthetic only','黄阶','Fixture','open',?,'GOVERNANCE.md','Synthetic',0,0,0,1,?)").bind("a".repeat(40), now).run();
    await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?, 'GOV-001', ?, 'running', ?, ?, ?, ?)")
      .bind(claim, actor, now, now, now + 3600_000, JSON.stringify({ deposit: 0, allowedPaths: "GOVERNANCE.md" })).run();
    for (let index = 1; index <= 4; index++) {
      const key = `submissions/${claim}/seed-${index}/GOVERNANCE.md`;
      await bucket.put(key, bad);
      await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,verdict,created_at) VALUES (?, ?, ?, ?, ?, 'needs_revision', '{}', ?)")
        .bind(`fixture-previous-${index}`, claim, actor, key, createHash("sha256").update(bad).digest("hex"), now + index).run();
    }
    async function upload(content) {
      const boundary = `fixture-${crypto.randomUUID()}`;
      const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="claimId"\r\n\r\n${claim}\r\n--${boundary}\r\nContent-Disposition: form-data; name="artifact"; filename="GOVERNANCE.md"\r\nContent-Type: text/markdown\r\n\r\n${content}\r\n--${boundary}--\r\n`);
      const response = await mf.dispatchFetch("http://fixture.local/api/submissions", {
        method: "POST", headers: { Origin: "http://fixture.local", Cookie: cookie(actor), "Content-Type": `multipart/form-data; boundary=${boundary}` }, body,
      });
      return { status: response.status, body: await response.json() };
    }
    goodRequest = upload(good);
    const goodCompletedBeforeBarrier = goodRequest.then(({ status }) => {
      throw new Error(`Good upload completed before the R2 barrier: ${status}`);
    });
    const goodStored = await Promise.race([reached, goodCompletedBeforeBarrier, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Good upload did not reach the real R2 barrier")), 15_000);
    })]);
    clearTimeout(timeout);
    assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE claim_id = ?").bind(claim).first("n"), 4);
    assert.equal((await bucket.get(goodStored.key)).etag, goodEtag, "Held upload must already exist in real R2");
    const fifth = await upload(bad);
    assert.equal(fifth.status, 201, JSON.stringify(fifth.body));
    assert.equal(fifth.body.submission.state, "needs_revision");
    assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE claim_id = ?").bind(claim).first("n"), 5);
    assert.equal(await db.prepare("SELECT state FROM claims WHERE id = ?").bind(claim).first("state"), "running");
    holding = false;
    releaseGood();
    const raced = await goodRequest;
    assert.equal(raced.status, 429, JSON.stringify(raced.body));
    const finalState = await db.prepare("SELECT state FROM claims WHERE id = ?").bind(claim).first("state");
    const awaiting = await db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE claim_id = ? AND state = 'awaiting_review'").bind(claim).first("n");
    assert.equal(awaiting, 0);
    assert.equal(finalState, legacy ? "review" : "running");
    if (legacy) assert.throws(() => assert.equal(finalState, "running"), assert.AssertionError,
      "Negative control must violate the current no-orphan-review invariant");
    assert.equal(await bucket.get(goodStored.key), null, "Losing upload must be deleted from actual R2");
    assert(events.some((event) => event.operation === "delete" && event.key === goodStored.key));
    const stored = await bucket.list({ prefix: `submissions/${claim}/` });
    assert.equal(stored.truncated, false);
    assert.equal(stored.objects.length, 5);
    assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM ledger_events").first("n"), 0);
    const release = await mf.dispatchFetch(`http://fixture.local/api/claims/${claim}/release`, {
      method: "POST", headers: { Origin: "http://fixture.local", Cookie: cookie(actor) },
    });
    assert.equal(release.status, legacy ? 409 : 200, await release.clone().text());
    assert.equal(await db.prepare("SELECT state FROM claims WHERE id = ?").bind(claim).first("state"), legacy ? "review" : "released");
    assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM ledger_events").first("n"), 0);
    const record = { scenario: name, badUploadStatus: fifth.status, racedGoodStatus: raced.status,
      submissions: 5, awaitingReview: awaiting, claimState: finalState, orphanReview: finalState === "review" && awaiting === 0,
      losingObjectDeleted: true, realStoredObjects: stored.objects.length, observedR2Events: events,
      releaseStatus: release.status, mintedLedgerEvents: 0 };
    results.push(record);
    console.log(JSON.stringify(record));
    writeFileSync(join(temporary, "results.json"), JSON.stringify({ sourceHashes, results }, null, 2));
  } finally {
    clearTimeout(timeout);
    holding = false;
    releaseGood();
    if (goodRequest) await goodRequest.catch(() => {});
    await mf.dispose();
  }
}

console.log(`Synthetic upload race evidence directory: ${temporary}`);
await runScenario(false);
await runScenario(true);
for (const { path, sha256 } of sourceHashes) assert.equal(createHash("sha256").update(readFileSync(path, "utf8")).digest("hex"), sha256);
console.log("Actual API + local D1/R2: current guard stays running, in-memory legacy control reproduces orphan review; no rewards or network.");
