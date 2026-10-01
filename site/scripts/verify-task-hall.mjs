import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Agreed public seams: built task hall, claim API and account API. SQL is setup only.
// All actors and tasks are synthetic; no private configuration or external service.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-task-hall-"));
const secret = "synthetic-task-hall-session-not-production";
const owner = "fixture-hall-owner", visitor = "fixture-hall-visitor";
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: "2026-09-27", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "synthetic-task-hall" }, bindings: { SESSION_SECRET: secret },
    outboundService: () => { throw new Error("Task hall verification forbids external services"); },
  }] }));
function request(actor, path, input) {
  const payload = Buffer.from(JSON.stringify({ sub: actor, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return mf.dispatchFetch(`http://fixture.local${path}`, {
    method: input ? "POST" : "GET", headers: {
      ...(actor ? { Cookie: `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}` } : {}),
      Origin: "http://fixture.local", "Content-Type": "application/json",
    }, ...(input ? { body: JSON.stringify(input) } : {}),
  });
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  const now = Date.now();
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github','901','SyntheticOwner','合成冻结修士，不计真实贡献',?), (?,'github','902','SyntheticVisitor','合成访客',?)")
    .bind(owner, now, visitor, now).run();
  for (const [id, title] of [["HALL-FROZEN", "合成冻结任务"], ["HALL-OPEN", "合成开放任务"]]) {
    await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,budget_tokens,created_at) VALUES (?,?,'Synthetic only','黄阶','合成任务线','open',?,'fixture.md','Synthetic only',0,0,0,1,10000,?)")
      .bind(id, title, "a".repeat(40), now).run();
  }
  for (const [id, title, rank, branch, budget, ready, state] of [
    ["HALL-OTHER-Q", "不匹配标题", "黄阶", "合成任务线", 10000, 1, "open"],
    ["HALL-OTHER-RANK", "合成不同品阶", "玄阶", "合成任务线", 10000, 1, "open"],
    ["HALL-OTHER-BRANCH", "合成不同任务线", "黄阶", "另一合成线", 10000, 1, "open"],
    ["HALL-OTHER-BUDGET", "合成较高预算", "黄阶", "合成任务线", 10001, 1, "open"],
    ["HALL-UNKNOWN", "合成旧成果无预算记录", "黄阶", "合成任务线", null, 1, "done"],
    ["HALL-UNPUBLISHED", "合成未发布契约", "黄阶", "合成任务线", 10000, 0, "open"],
  ]) {
    await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,budget_tokens,created_at) VALUES (?,?,'Synthetic only',?,?,?,?,'fixture.md','Synthetic only',0,0,0,?,?,?)")
      .bind(id, title, rank, branch, state, "a".repeat(40), ready, budget, now).run();
  }
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot) VALUES ('fixture-hall-frozen','HALL-FROZEN',?,'frozen',?,?,?)")
    .bind(owner, now, now - 1000, JSON.stringify({ deposit: 0, token: 0, cultivation: 0, merit: 0 })).run();
  const before = await (await request(owner, "/api/me")).json();
  assert.equal((await request(visitor, "/api/claims", { missionId: "HALL-FROZEN" })).status, 409);
  assert.equal((await request(owner, "/api/claims", { missionId: "HALL-OPEN" })).status, 409);
  for (const actor of [owner, visitor, null]) {
    const response = await request(actor, "/?mission=HALL-FROZEN");
    assert.equal(response.status, 200);
    const html = await response.text();
    const table = html.match(/<table\b[\s\S]*?<\/table>/)?.[0] ?? "";
    assert.match(table, /冻结待复核/, "Frozen occupancy must be visible to the owner, another actor and anonymous visitors");
    assert.match(html, /冻结期间仍占用认领席位/, "Frozen tasks must explain why they cannot be claimed or restarted");
    assert.doesNotMatch(html, /<button\b[^>]*>(?:认领悬赏|开始闭关|释放任务)<\/button>/);
    if (actor === owner) assert.match(html, /认领席位<\/dt><dd>1<!-- -->\/<!-- -->1/);
  }
  const claims = await (await request(owner, "/api/claims")).json();
  assert.equal(claims.claims.find((claim) => claim.id === "fixture-hall-frozen").state, "frozen");
  const after = await (await request(owner, "/api/me")).json();
  assert.deepEqual(after.balances, before.balances, "Presentation and rejected claims must not spend, refund or reward tokens");
  console.log("Frozen task hall: owner/visitor/anonymous presentation agrees with the claim gate; expired frozen record remains locked and balances unchanged.");
  const filterQuery = new URLSearchParams({ q: "合成", rank: "黄阶", branch: "合成任务线", status: "available", budget: "10000" });
  const filtered = await request(visitor, `/?${filterQuery}`);
  assert.equal(filtered.status, 200);
  const filteredHtml = await filtered.text();
  const filteredTable = filteredHtml.match(/<table\b[\s\S]*?<\/table>/)?.[0] ?? "";
  assert.match(filteredTable, /HALL-OPEN/);
  assert.doesNotMatch(filteredTable, /HALL-FROZEN|GOV-001|HALL-OTHER|HALL-UNKNOWN|HALL-UNPUBLISHED/, "Each of the five filters has its own contrasting task");
  const resultLink = filteredTable.match(/href="([^"]*mission=HALL-OPEN[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
  assert.ok(resultLink, "Filtered task has a detail link");
  const detailQuery = new URL(resultLink, "http://fixture.local").searchParams;
  for (const [key, value] of filterQuery) assert.equal(detailQuery.get(key), value, "Selecting a task must preserve every filter");
  console.log("Five task hall filters combine and remain in the selected task URL.");
  const fullSeat = await (await request(owner, "/?mission=HALL-OPEN")).text();
  assert.match(fullSeat, /请从「我的在途悬赏」查看占用记录/, "A frozen full seat must point to its original record rather than suggest an impossible release");
  for (const query of ["q=no-such-task&mission=HALL-OPEN", "budget=0", "budget=-1", "budget=1e4", "budget=9007199254740992", "rank=not-a-rank", "status=constructor", "q=one&q=two"]) {
    const response = await request(visitor, `/?${query}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /没有匹配的悬赏/);
    assert.doesNotMatch(html, /<button\b[^>]*>(?:认领悬赏|开始闭关|释放任务)<\/button>/);
    if (!query.startsWith("q=no-such") && query !== "budget=0") assert.match(html, /筛选条件无效/);
  }
  const oldBudget = await (await request(visitor, "/?branch=" + encodeURIComponent("合成任务线") + "&budget=10000")).text();
  assert.doesNotMatch(oldBudget.match(/<table\b[\s\S]*?<\/table>/)?.[0] ?? "", /HALL-UNKNOWN/, "Missing budget must not be treated as zero");
  const unpublished = await (await request(visitor, "/?q=HALL-UNPUBLISHED")).text();
  assert.match(unpublished, /待发布/);
  assert.match(unpublished, /任务包与独立验收器尚未就绪/);
  assert.doesNotMatch(unpublished, /<button\b[^>]*>认领悬赏<\/button>/);
  assert.equal((await request(visitor, "/api/claims", { missionId: "HALL-UNPUBLISHED" })).status, 409);
  for (const suffix of ["start", "release", "manifest"]) {
    assert.equal((await request(owner, `/api/claims/fixture-hall-frozen/${suffix}`, suffix === "manifest" ? null : {})).status, 409);
  }
  assert.deepEqual((await (await request(owner, "/api/me")).json()).balances, before.balances);
  console.log("Empty/invalid filters have no hidden claim controls; unknown budgets and unpublished contracts remain unavailable; frozen start/release/manifest refuse without economic changes.");
  if (process.argv.includes("--serve")) {
    const client = join(site, "dist", "client");
    const assets = new Set(readdirSync(client, { recursive: true }).map((path) => path.replaceAll("\\", "/")));
    let origin;
    const http = createServer(async (incoming, outgoing) => {
      try {
        const url = new URL(incoming.url, origin);
        if (url.pathname === "/fixture/sign-in" && ["owner", "visitor"].includes(url.searchParams.get("actor"))) {
          const actor = url.searchParams.get("actor") === "owner" ? owner : visitor;
          const payload = Buffer.from(JSON.stringify({ sub: actor, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
          outgoing.writeHead(303, { Location: "/?mission=HALL-FROZEN", "Set-Cookie": `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}; Path=/; HttpOnly; SameSite=Lax` });
          outgoing.end(); return;
        }
        const asset = url.pathname.slice(1);
        if (assets.has(asset) && /\.(?:js|css|svg)$/.test(asset)) {
          outgoing.setHeader("Content-Type", { ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml" }[extname(asset)]);
          outgoing.end(readFileSync(join(client, asset))); return;
        }
        const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
        const response = await mf.dispatchFetch(origin + incoming.url, { method: incoming.method, headers: incoming.headers,
          ...(["GET", "HEAD"].includes(incoming.method) ? {} : { body: Buffer.concat(chunks) }) });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch { outgoing.writeHead(500); outgoing.end("Synthetic task hall request failed."); }
    });
    await new Promise((done) => http.listen(0, "127.0.0.1", done));
    origin = `http://127.0.0.1:${http.address().port}`;
    console.log(`LOCAL_SYNTHETIC_TASK_HALL=${origin}`);
    console.log("Only synthetic actors/tasks. Use /fixture/sign-in?actor=owner|visitor. Input stop to close this fixture; no real model or production access.");
    await new Promise((done) => {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (input) => { if (input.trim() === "stop") done(); });
      process.once("SIGINT", done); process.once("SIGTERM", done);
    });
    process.stdin.pause();
    await new Promise((done) => http.close(done));
  }
} finally { await mf.dispose(); }
