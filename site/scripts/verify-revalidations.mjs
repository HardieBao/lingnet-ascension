import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";

// Runs actual built API routes and D1. Only GitHub responses and account data are synthetic.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-revalidation-http-"));
const secret = "isolated-revalidation-http-fixture-secret-not-a-real-credential";
const submission = "11111111-1111-4111-8111-111111111111";
const original = "a".repeat(40), base = "b".repeat(40), head = "c".repeat(40), merge = "d".repeat(40);
const artifact = "fixed integrated fixture";
const digest = createHash("sha256").update(artifact).digest("hex");
const repository = "HardieBao/lingnet-ascension";
let runId = 99, runAttempt = 1, reportHead = head, outcome = "passed";
let workflow = ".github/workflows/revalidation.yml";
let reportDigest = digest;
const safeFindings = "合成 HTTP 复验报告，验证身份、来源与采纳事务，不是实际 CI 或真实社区成果。";
let reportFindings = safeFindings;
let outboundCalls = 0;
const reportPath = `revalidations/${submission}.json`;
const browserMode = process.argv.includes("--browser");
let browserServer;
async function github(request) {
  outboundCalls++;
  const url = new URL(request.url);
  assert.equal(url.hostname, "api.github.com", "Never contact a real external service");
  const path = url.pathname;
  if (path === `/repos/${repository}/pulls/7`) return Response.json({
    state: "open", draft: false, mergeable: true, changed_files: 1, user: { id: 202 }, merge_commit_sha: merge,
    base: { ref: "main", sha: base, repo: { full_name: repository } },
    head: { sha: reportHead, repo: { full_name: "Fixture/lingnet-ascension" } },
  });
  if (path === `/repos/${repository}/compare/${base}...${reportHead}`) return Response.json({
    url: `https://api.github.com/repos/${repository}/compare/${base}...${reportHead}`,
    status: "ahead", base_commit: { sha: base }, merge_base_commit: { sha: base },
    files: [{ filename: reportPath, status: "added", sha: "fixture-blob" }],
  });
  if (path === `/repos/Fixture/lingnet-ascension/contents/${reportPath}`) {
    const bytes = Buffer.from(JSON.stringify({ version: 1, submissionId: submission, missionId: "GOV-001",
      artifactPath: "GOVERNANCE.md", integratedCommit: original, artifactSha256: reportDigest,
      validatorBaseCommit: base, reporterGitHubId: "202",
      findings: reportFindings }));
    return Response.json({ type: "file", encoding: "base64", size: bytes.length, sha: "fixture-blob", content: bytes.toString("base64") });
  }
  if (path === `/repos/${repository}/actions/runs/${runId}`) return Response.json({
    id: runId, name: "LingNet independent revalidation", path: workflow, event: "pull_request",
    status: "completed", conclusion: "success", head_sha: reportHead, actor: { id: 202 },
    run_attempt: runAttempt, display_title: "LingNet revalidation #7",
  });
  if (path === `/repos/${repository}/actions/runs/${runId}/jobs`) return Response.json({ jobs: [{
    name: "Revalidate integrated result", status: "completed", conclusion: "success", run_attempt: runAttempt,
    steps: ["passed", "failed"].map((value) => ({ name: `Replay ${value}`, status: "completed", conclusion: value === outcome ? "success" : "skipped" })),
  }] });
  if (path === `/repos/${repository}/compare/${original}...main`) return Response.json({ status: "ahead" });
  if (path === `/repos/${repository}/contents/GOVERNANCE.md` && url.searchParams.get("ref") === original) return new Response(artifact);
  throw new Error(`Unexpected synthetic GitHub route: ${path}`);
}

const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((left, right) => (left === "index.js" ? -1 : right === "index.js" ? 1 : left.localeCompare(right)))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const binding = { DB: "isolated-revalidation-http" };
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), r2Persist: join(temporary, "r2"), workers: [
    { name: "fixture-entry", modules: true, d1Databases: binding, serviceBindings: { APP: "application" },
      compatibilityDate: "2026-09-21", script: `export default { async fetch(request, env) {
        if (new URL(request.url).pathname !== '/fixture/setup') return env.APP.fetch(request);
        for (const sql of await request.json()) await env.DB.prepare(sql).run();
        return Response.json({seeded:true});
      } }`, outboundService: () => new Response("No network", { status: 403 }) },
    { name: "application", rootPath: server, modules, compatibilityDate: "2026-09-21",
      compatibilityFlags: ["nodejs_compat"], d1Databases: binding, r2Buckets: ["BUCKET"],
      bindings: { SESSION_SECRET: secret, MAINTAINER_GITHUB_ID: "303" }, outboundService: github },
  ] }));

function cookie(id) {
  const payload = Buffer.from(JSON.stringify({ sub: id, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
async function api(actor, path, body, extraHeaders = {}) {
  const response = await mf.dispatchFetch(`http://fixture.local${path}`, {
    method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Origin: "http://fixture.local", "Content-Type": "application/json", ...(actor ? { Cookie: cookie(actor) } : {}), ...extraHeaders },
  });
  return { status: response.status, body: await response.json(), cache: response.headers.get("Cache-Control") };
}
async function seed(statements) {
  const response = await mf.dispatchFetch("http://fixture.local/fixture/setup", { method: "POST", body: JSON.stringify(statements) });
  assert.equal(response.status, 200, await response.text());
}
async function page(actor, path) {
  const response = await mf.dispatchFetch(`http://fixture.local${path}`, {
    headers: actor ? { Cookie: cookie(actor) } : {},
  });
  const html = await response.text();
  assert.equal(response.status, 200, html.slice(0, 500));
  return html;
}
const request = { submissionId: submission, pullNumber: 7, runId: 99 };
const decision = { decision: "accept", reason: "维护者独立核对合成报告，验证采纳事务而非真实贡献" };
try {
  console.log("Starting isolated built Worker and D1; outbound network replaced by fixtures.");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    await seed(readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim()));
  }
  await seed([
    `INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES
      ('fixture-author','github','101','Fixture','Fixture',1),('fixture-reporter','github','202','Fixture','Fixture',1),
      ('fixture-adopter','github','303','Fixture','Fixture',1),('fixture-outsider','github','404','Fixture','Fixture',1)`,
    `INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at)
      VALUES ('GOV-001','Fixture','Synthetic','黄阶','Fixture','done','${original}','GOVERNANCE.md','Synthetic',0,0,0,1)`,
    `INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot)
      VALUES ('fixture-claim','GOV-001','fixture-author','completed',1,1000,'{"allowedPaths":"GOVERNANCE.md"}')`,
    `INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at)
      VALUES ('${submission}','fixture-claim','fixture-author','fixture.md','${digest}','accepted','fixture-adopter','${original}',10,2)`,
  ]);
  if (browserMode) {
    const client = join(site, "dist", "client");
    const assets = new Set(readdirSync(client, { recursive: true }).map((path) => path.replaceAll("\\", "/")));
    let origin;
    browserServer = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, origin);
        if (url.pathname === "/fixture/sign-in") {
          const actor = url.searchParams.get("actor");
          if (!["author", "reporter", "adopter", "outsider"].includes(actor)) {
            response.writeHead(400); response.end("Choose a synthetic actor"); return;
          }
          response.writeHead(303, { Location: actor === "adopter" ? "/review" : "/revalidations",
            "Set-Cookie": `${cookie(`fixture-${actor}`)}; Path=/; HttpOnly; SameSite=Lax` });
          response.end(); return;
        }
        const asset = url.pathname.slice(1);
        if (assets.has(asset) && /\.(?:js|css|svg)$/.test(asset)) {
          response.setHeader("Content-Type", { ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml" }[extname(asset)]);
          response.end(readFileSync(join(client, asset))); return;
        }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const result = await mf.dispatchFetch(origin + request.url, { method: request.method, headers: request.headers,
          ...(["GET", "HEAD"].includes(request.method) ? {} : { body: Buffer.concat(chunks) }) });
        response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()));
      } catch { response.writeHead(500); response.end("Synthetic fixture request failed"); }
    });
    await new Promise((done) => browserServer.listen(0, "127.0.0.1", done));
    origin = `http://127.0.0.1:${browserServer.address().port}`;
    console.log(`LOCAL_REVALIDATION_UI=${origin}`);
    console.log("Use /fixture/sign-in?actor=reporter|adopter|author|outsider. PR 7 / run 99 are synthetic. Send stop to close.");
    await new Promise((done) => { process.stdin.once("data", done); process.once("SIGINT", done); process.once("SIGTERM", done); });
  } else {
  assert.match(await page(null, "/revalidations"), /请先使用 GitHub 登录/);
  const available = await page("fixture-reporter", "/revalidations");
  assert.match(available, /核验并提交报告/);
  assert.match(available, /revalidations\/11111111-1111-4111-8111-111111111111\.json/);
  assert.doesNotMatch(await page("fixture-author", "/revalidations"), /核验并提交报告/,
    "Original authors must not see a self-revalidation form");
  assert.equal((await api(null, "/api/revalidations")).status, 401);
  assert.equal((await api("fixture-reporter", "/api/revalidations", request, { Origin: "https://foreign.invalid" })).status, 403);
  const before = outboundCalls;
  assert.equal((await api("fixture-author", "/api/revalidations", request)).status, 403);
  assert.equal(outboundCalls, before, "Self replay is denied before external evidence lookup");
  assert.equal((await api("fixture-reporter", "/api/revalidations", { ...request, submissionId: "invalid" })).status, 400);
  workflow = ".github/workflows/trusted-baseline.yml";
  assert.equal((await api("fixture-reporter", "/api/revalidations", request)).status, 409);
  workflow = ".github/workflows/revalidation.yml";
  reportDigest = "f".repeat(64);
  assert.equal((await api("fixture-reporter", "/api/revalidations", request)).status, 409);
  reportDigest = digest;
  reportFindings = "合成报告中的访问凭据 sk-" + "x".repeat(24);
  const unsafeReport = await api("fixture-reporter", "/api/revalidations", request);
  assert.equal(unsafeReport.status, 409, "Credential-shaped findings must not enter the report ledger");
  assert(!JSON.stringify(unsafeReport.body).includes(reportFindings), "Refusals do not echo findings");
  assert.equal((await api("fixture-reporter", "/api/revalidations")).body.revalidations.length, 0);
  reportFindings = safeFindings;
  const created = await api("fixture-reporter", "/api/revalidations", request);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.revalidation.id;
  assert.doesNotMatch(await page("fixture-reporter", "/revalidations"), /核验并提交报告/,
    "A pending record removes the target from the new-report form");
  assert.doesNotMatch(await page("fixture-outsider", "/revalidations"), new RegExp(id), "Report history is private to its reporter");
  assert.match(await page("fixture-adopter", "/review"), /采纳复验报告/);
  assert.doesNotMatch(await page("fixture-outsider", "/review"), /采纳复验报告/);
  assert.equal((await api("fixture-adopter", `/api/revalidations/${id}/decision`, {
    decision: "accept", reason: "合成凭据检查 " + "sk-" + "x".repeat(24),
  })).status, 400, "Review reasons must not persist credential-shaped content");
  assert.equal((await api("fixture-reporter", "/api/realms")).body.progress.independentReviews, 0);
  assert.equal((await api("fixture-reporter", "/api/revalidations", request)).status, 409);
  const ownerList = await api("fixture-reporter", "/api/revalidations");
  assert.equal(ownerList.body.revalidations.length, 1);
  assert.equal(ownerList.cache, "private, no-store");
  assert.equal((await api("fixture-outsider", "/api/revalidations")).body.revalidations.length, 0);
  assert.equal((await api("fixture-adopter", "/api/revalidations")).body.revalidations.length, 1);
  assert.equal((await api("fixture-reporter", `/api/revalidations/${id}/decision`, decision)).status, 403);
  assert.equal((await api("fixture-outsider", `/api/revalidations/${id}/decision`, decision)).status, 403);
  await seed([
    "UPDATE claims SET cultivator_id='fixture-adopter' WHERE id='fixture-claim'",
    `UPDATE submissions SET cultivator_id='fixture-adopter',reviewer_id='fixture-outsider' WHERE id='${submission}'`,
  ]);
  const authorReview = await page("fixture-adopter", "/review");
  assert.match(authorReview, /需要其他独立维护者处理这份报告/);
  assert.doesNotMatch(authorReview, /采纳复验报告/);
  const beforeAuthorDecision = outboundCalls;
  assert.equal((await api("fixture-adopter", `/api/revalidations/${id}/decision`, decision)).status, 403);
  assert.equal(outboundCalls, beforeAuthorDecision, "Original author is denied even when configured as maintainer");
  await seed([
    "UPDATE claims SET cultivator_id='fixture-author' WHERE id='fixture-claim'",
    `UPDATE submissions SET cultivator_id='fixture-author',reviewer_id='fixture-adopter' WHERE id='${submission}'`,
  ]);
  reportFindings = "合成报告中的私人配置 PASSWORD=synthetic_private_password";
  assert.equal((await api("fixture-adopter", `/api/revalidations/${id}/decision`, decision)).status, 409,
    "A changed public report containing credentials cannot be adopted");
  assert.equal((await api("fixture-reporter", "/api/revalidations")).body.revalidations[0].decision, null);
  reportFindings = safeFindings;
  runAttempt = 2;
  assert.equal((await api("fixture-adopter", `/api/revalidations/${id}/decision`, decision)).status, 409);
  assert.equal((await api("fixture-reporter", "/api/realms")).body.progress.independentReviews, 0);
  runAttempt = 1;
  reportHead = "e".repeat(40);
  assert.equal((await api("fixture-adopter", `/api/revalidations/${id}/decision`, decision)).status, 409);
  reportHead = head;
  assert.equal((await api("fixture-adopter", `/api/revalidations/${id}/decision`, {
    decision: "reject", reason: "合成驳回演练，保留原证据并要求新的运行记录" })).status, 200);
  const rejectedPage = await page("fixture-reporter", "/revalidations");
  assert.match(rejectedPage, /已驳回/);
  assert.match(rejectedPage, /核验并提交报告/);
  assert.equal((await api("fixture-reporter", "/api/realms")).body.progress.independentReviews, 0);
  assert.equal((await api("fixture-reporter", "/api/revalidations", request)).status, 409, "A rejected run cannot be reused");
  runId = 100;
  outcome = "failed";
  const retryRequest = { ...request, runId };
  const retry = await api("fixture-reporter", "/api/revalidations", retryRequest);
  assert.equal(retry.status, 201);
  assert.equal(retry.body.revalidation.outcome, "failed", "A valid failure replay is evidence, not an automatic rejection");
  const retryId = retry.body.revalidation.id;
  const accepted = await Promise.all(Array.from({ length: 20 }, () => api("fixture-adopter", `/api/revalidations/${retryId}/decision`, decision)));
  assert.equal(accepted.filter((result) => result.status === 200).length, 1);
  assert.equal(accepted.filter((result) => result.status === 409).length, 19);
  assert.equal((await api("fixture-reporter", "/api/realms")).body.progress.independentReviews, 1);
  assert.equal((await api("fixture-reporter", "/api/me")).body.balances.token, 0);
  assert.equal((await api("fixture-reporter", "/api/revalidations", retryRequest)).status, 409);
  const finalList = (await api("fixture-reporter", "/api/revalidations")).body.revalidations;
  assert.equal(finalList.length, 2);
  assert.equal(finalList.find((item) => item.id === id).decision, "reject");
  assert.equal(finalList.find((item) => item.id === retryId).decision, "accept");
  const acceptedPage = await page("fixture-reporter", "/revalidations");
  assert.match(acceptedPage, /已采纳/);
  assert.match(acceptedPage, /原成果复跑失败/);
  assert.doesNotMatch(acceptedPage, /核验并提交报告/);
  await seed([`UPDATE submissions SET artifact_sha256='${"f".repeat(64)}' WHERE id='${submission}'`]);
  assert.equal((await api("fixture-reporter", "/api/realms")).body.progress.independentReviews, 0,
    "Changed original evidence no longer grants a current qualification");
  console.log("Built API → D1 → realm qualification verified: one adopted record, zero minted Token; 20 decisions settle once.");
  console.log("Synthetic sessions/GitHub evidence only; this is not a real PR, human adoption or community result.");
  }
} finally {
  process.stdin.pause();
  if (browserServer) { browserServer.closeAllConnections(); await new Promise((done) => browserServer.close(done)); }
  await mf.dispose();
  const target = realpathSync(temporary);
  assert(target.startsWith(realpathSync(tmpdir()) + sep) && basename(target).startsWith("lingnet-revalidation-http-"));
  rmSync(target, { recursive: true, force: true });
}
