import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Confirmed seam: claim → start → downloaded contract; synthetic local accounts only.
const site = resolve(dirname(fileURLToPath(import.meta.url)), ".."), server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-model-contract-"));
const secret = "synthetic-budget-contract-session-not-a-real-credential";
let browserServer;
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), r2Persist: join(temporary, "r2"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: "2026-09-21", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "synthetic-model-contract" }, r2Buckets: ["BUCKET"], bindings: { SESSION_SECRET: secret },
    outboundService: () => { throw new Error("Budget contract test forbids external network"); },
  }] }));
async function api(actor, path, input) {
  const payload = Buffer.from(JSON.stringify({ sub: actor, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const response = await mf.dispatchFetch(`http://fixture.local${path}`, { method: input === undefined ? "GET" : "POST",
    headers: { Cookie: `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`,
      Origin: "http://fixture.local", "Content-Type": "application/json" },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  assert(response.ok, `${response.status}: ${await response.clone().text()}`);
  return response.json();
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  const now = Date.now(), legacyId = "12345678-1234-1234-1234-123456789abc";
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES ('new-owner','github','501','Fixture','Synthetic',?), ('old-owner','github','502','Fixture','Synthetic',?)").bind(now, now).run();
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,created_at) VALUES ('GOV-002','Old fixture','Synthetic','玄阶','Fixture','open',?,'docs/WORLD_BRIEF.md','Original acceptance',10,1,1,1,?)").bind("a".repeat(40), now).run();
  const legacy = JSON.stringify({ token: 10, officialToken: 0, cultivation: 1, merit: 1, deposit: 0,
    baseCommit: "a".repeat(40), title: "Old fixture", description: "Synthetic", acceptance: "Original acceptance",
    allowedPaths: "docs/WORLD_BRIEF.md", budgetTokens: null });
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,'GOV-002','old-owner','running',?,?,?,?)").bind(legacyId, now, now, now + 3600_000, legacy).run();
  const oldPackage = await api("old-owner", `/api/claims/${legacyId}/manifest`);
  assert.equal(oldPackage.payload.schemaVersion, 2);
  assert.deepEqual(oldPackage.payload.model, { harness: "codex-cli", tokenBudget: null });
  const claimed = (await api("new-owner", "/api/claims", { missionId: "GOV-001" })).claim;
  await api("new-owner", `/api/claims/${claimed.id}/start`, {});
  const task = await api("new-owner", `/api/claims/${claimed.id}/manifest`);
  assert.equal(task.payload.schemaVersion, 4, "New claims must receive the adopted bounded and checkpoint contract");
  assert.deepEqual(task.payload.model, { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000,
    maxOutputTokens: 2048, budgetAccounting: "input+output" });
  assert.equal(task.sha256, createHash("sha256").update(JSON.stringify(task.payload)).digest("hex"));
  // Fixture mutation simulates later mission edits; assertions remain on the public interface.
  await db.prepare("UPDATE missions SET budget_tokens=999999,title='Edited after claim' WHERE id='GOV-001'").run();
  assert.deepEqual(await api("new-owner", `/api/claims/${claimed.id}/manifest`), task);
  assert.deepEqual(await api("old-owner", `/api/claims/${legacyId}/manifest`), oldPackage);
  assert.equal((await api("new-owner", "/api/me")).balances.token, 0, "Model allowance is not game currency");
  console.log("Actual local API: new claim locks 30,000 total / 2,048 output; mission edits cannot refill it; legacy snapshot remains unchanged; no game currency minted.");
  await api("new-owner", `/api/claims/${claimed.id}/release`, {});
  // Synthetic concurrency setup, never production rewards; observe all results through the API.
  await db.prepare("UPDATE missions SET deposit=7 WHERE id='GOV-001'").run();
  await db.prepare("INSERT INTO ledger_events (id,cultivator_id,resource,delta,source_key,created_at) VALUES ('fixture-funding','new-owner','token',100,'fixture:funding',?)").bind(Date.now()).run();
  const concurrentSession = Buffer.from(JSON.stringify({ sub: "new-owner", ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const attempts = await Promise.all(Array.from({ length: 100 }, () => mf.dispatchFetch("http://fixture.local/api/claims", {
    method: "POST", headers: { Cookie: `lingnet_session=${concurrentSession}.${createHmac("sha256", secret).update(concurrentSession).digest("base64url")}`,
      Origin: "http://fixture.local", "Content-Type": "application/json" }, body: JSON.stringify({ missionId: "GOV-001" }),
  })));
  assert.equal(attempts.filter((response) => response.status === 201).length, 1);
  assert.equal(attempts.filter((response) => response.status === 409).length, 99);
  const winner = (await attempts.find((response) => response.status === 201).json()).claim;
  for (const response of attempts.filter((response) => response.status !== 201)) await response.text();
  const held = (await api("new-owner", "/api/me")).balances;
  assert.equal(held.token, 93);
  assert.equal(held.tokenLocked, 7);
  await api("new-owner", `/api/claims/${winner.id}/start`, {});
  assert.equal((await api("new-owner", `/api/claims/${winner.id}/manifest`)).payload.model.tokenBudget, 30000);
  await api("new-owner", `/api/claims/${winner.id}/release`, {});
  const refunded = (await api("new-owner", "/api/me")).balances;
  assert.equal(refunded.token, 100);
  assert.equal(refunded.tokenLocked, 0);
  console.log("Actual local API: 100 concurrent claims issue one budget and freeze one 7-Token deposit; 99 reject; release refunds once.");
  if (process.argv[2] === "--browser") {
    await db.prepare("UPDATE missions SET budget_tokens=30000 WHERE id='GOV-001'").run();
    const browserClaim = (await api("new-owner", "/api/claims", { missionId: "GOV-001" })).claim;
    await api("new-owner", `/api/claims/${browserClaim.id}/start`, {});
    const session = Buffer.from(JSON.stringify({ sub: "new-owner", ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    // Test-only HTTP bridge: serve built public assets, send dynamic requests to the real Worker.
    browserServer = createServer(async (request, response) => {
      try {
        const path = new URL(request.url, "http://fixture.local").pathname;
        const file = join(site, "dist", "client", path.slice(1));
        if (/^\/(?:assets\/[\w.-]+|_next\/static\/(?:css|chunks)\/[\w.-]+|runner(?:-sandbox|-checkpoints|-presets)?\.mjs|budget-gateway\.mjs|runner\.Dockerfile|favicon\.svg)$/.test(path) && existsSync(file)) {
          response.setHeader("Content-Type", path.endsWith(".css") ? "text/css" : /\.(?:m?js)$/.test(path) ? "text/javascript" : path.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream");
          response.end(readFileSync(file)); return;
        }
        const result = await mf.dispatchFetch(`http://fixture.local${request.url}`, { headers: request.headers });
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
      } catch { response.writeHead(500); response.end("Synthetic UI bridge failed"); }
    });
    await new Promise((ready) => browserServer.listen(0, "127.0.0.1", ready));
    console.log(JSON.stringify({ browserFixture: `http://127.0.0.1:${browserServer.address().port}`,
      syntheticCookie: `${session}.${createHmac("sha256", secret).update(session).digest("base64url")}` }));
    console.log("Synthetic UI fixture ready; send q on stdin to stop. No production data or model calls.");
    await new Promise((done) => process.stdin.once("data", done));
    process.stdin.pause();
  }
} finally {
  if (browserServer) { browserServer.closeAllConnections(); await new Promise((done) => browserServer.close(done)); }
  await mf.dispose();
  console.log(`Synthetic contract workspace retained: ${temporary}`);
}
