import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";

// Agreed public submission seam; only external GitHub responses are simulated.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-code-quarantine-"));
const secret = "isolated-code-quarantine-secret-not-a-real-credential";
const actor = "fixture-code-owner", reviewer = "fixture-code-reviewer", claim = "fixture-code-claim";
const apiRoot = "https://api.github.com/repos/HardieBao/lingnet-ascension";
const base = "a".repeat(40), merge = "c".repeat(40);
let head = "b".repeat(40), blob = "d".repeat(40);
const path = "site/lib/fixture.ts", fakeCredential = `sk-${"0".repeat(48)}`;
let content = `export const fixture = "${fakeCredential}";\n`;
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), r2Persist: join(temporary, "r2"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: "2026-09-21", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "isolated-code-quarantine" }, r2Buckets: ["BUCKET"],
    bindings: { SESSION_SECRET: secret, MAINTAINER_GITHUB_ID: "302" },
    outboundService: async (request) => {
      const url = request.url;
      if (url === `${apiRoot}/pulls/7`) return Response.json({ state: "open", draft: false, changed_files: 1,
        mergeable: true, merge_commit_sha: merge, user: { id: 301 },
        base: { ref: "main", repo: { full_name: "HardieBao/lingnet-ascension" } },
        head: { sha: head, repo: { full_name: "Fixture/lingnet-ascension" } } });
      if (url === `${apiRoot}/compare/${base}...${head}?per_page=1`) return Response.json({
        url: `${apiRoot}/compare/${base}...${head}`, status: "ahead", base_commit: { sha: base },
        merge_base_commit: { sha: base }, files: [{ filename: path, status: "added", sha: blob }] });
      if (url === `https://api.github.com/repos/Fixture/lingnet-ascension/contents/${path}?ref=${head}`) return Response.json({
        type: "file", encoding: "base64", content: Buffer.from(content).toString("base64"), size: Buffer.byteLength(content), sha: blob });
      if (url === `${apiRoot}/actions/workflows/trusted-baseline.yml/runs?event=pull_request&head_sha=${head}&per_page=30`) return Response.json({
        workflow_runs: [{ id: 1, name: "Trusted baseline gate", path: ".github/workflows/trusted-baseline.yml",
          event: "pull_request", head_sha: head, status: "completed", conclusion: "success", run_attempt: 1 }] });
      if (url === `${apiRoot}/actions/runs/1/attempts/1/jobs?per_page=100`) return Response.json({ jobs: [{
        name: "pull-request", head_sha: head, status: "completed", conclusion: "success", run_attempt: 1,
        steps: [{ name: `Verified ${head} on merge ${merge}`, status: "completed", conclusion: "success" }] }] });
      throw new Error("Unexpected external request in isolated code quarantine verification");
    },
  }] }));
function cookie(id) {
  const payload = Buffer.from(JSON.stringify({ sub: id, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
async function api(id, route, input) {
  return mf.dispatchFetch(`http://fixture.local${route}`, { method: input ? "POST" : "GET",
    headers: { Cookie: cookie(id), Origin: "http://fixture.local", "Content-Type": "application/json" },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  const now = Date.now();
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github','301','Fixture','Synthetic owner',?), (?,'github','302','Fixture','Synthetic reviewer',?)").bind(actor, now, reviewer, now).run();
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,created_at) VALUES ('CODE-FIXTURE','Fixture','Synthetic only','黄阶','Fixture','open',?,?,'Synthetic',10,1,1,1,?)").bind(base, path, now).run();
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,'CODE-FIXTURE',?,'running',?,?,?,?)")
    .bind(claim, actor, now, now, now + 3600_000, JSON.stringify({ deposit: 0, token: 10, cultivation: 1, merit: 1, allowedPaths: path, baseCommit: base })).run();
  const submitted = await api(actor, "/api/code-submissions", { claimId: claim, pullNumber: 7 });
  assert.equal(submitted.status, 201, await submitted.clone().text());
  const text = await submitted.text(), result = JSON.parse(text).submission;
  assert.equal(result.state, "frozen", "A green external CI must not bypass credential quarantine in code submissions");
  assert.equal(result.verdict.source?.url, "https://github.com/HardieBao/lingnet-ascension/pull/7", "Quarantine must retain a safe PR reference for independent source review");
  assert(!text.includes(fakeCredential));
  assert.equal((await (await api(actor, "/api/claims")).json()).claims[0].state, "frozen");
  assert.equal((await api(reviewer, `/api/reviews/${result.id}`, { decision: "accept", reason: "Synthetic green CI cannot approve a credential" })).status, 409);
  assert.notEqual((await api(actor, `/api/submissions/${result.id}/artifact`)).status, 200);
  assert.equal((await api(actor, "/api/code-submissions", { claimId: claim, pullNumber: 7 })).status, 409);
  console.log("Code submission API with simulated green GitHub CI still quarantines a credential shape, without raw content or rewards.");
  assert.equal((await api(reviewer, `/api/reviews/${result.id}`, { decision: "revise", reason: "Synthetic independent reviewer permits a sanitized code revision" })).status, 200);
  content = "export const fixture = 1;\n// OPENAI_API_KEY=YOUR_API_KEY\nconst secret = process.env.OPENAI_API_KEY;\n";
  head = "e".repeat(40);
  blob = "f".repeat(40);
  const clean = await api(actor, "/api/code-submissions", { claimId: claim, pullNumber: 7 });
  assert.equal(clean.status, 201, await clean.clone().text());
  const replacement = (await clean.json()).submission;
  assert.equal(replacement.state, "awaiting_review", "Placeholders and environment references must not be mistaken for credential literals");
  const evidence = await api(actor, `/api/submissions/${replacement.id}/artifact`);
  assert.equal(evidence.status, 200);
  const record = await evidence.json();
  assert.equal(record.headSha, head);
  assert.equal(record.ciRunId, 1);
  const balances = (await (await api(actor, "/api/me")).json()).balances;
  assert.equal(balances.token, 0);
  assert.equal(balances.cultivation, 0);
  assert.equal(balances.merit, 0);
  console.log("Sanitized code at a new fixed head follows the ordinary exact-CI review path; placeholders and environment references are accepted, no rewards minted.");
} finally { await mf.dispose(); }
