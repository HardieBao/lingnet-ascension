import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// Trusted proposal-owned checks. All identities, OAuth and GitHub responses are synthetic.
if (!process.argv[2]) throw new Error("Expected the isolated candidate site directory");
const site = resolve(process.argv[2]);
const require = createRequire(join(site, "package.json"));
const { Miniflare, Response: FixtureResponse, convertV4MiniflareOptions } = require("miniflare");
const config = JSON.parse(readFileSync(join(site, "wrangler.production.jsonc"), "utf8"));
const server = join(site, "dist/server"), origin = config.vars.PUBLIC_ORIGIN;
const charter = readFileSync(new URL("../site/tests/fixtures/gov001-charter.md", import.meta.url), "utf8");
const commit = "a".repeat(40), secret = "synthetic-full-platform-session-not-a-real-key";
const temporary = mkdtempSync(join(tmpdir(), "lingnet-trusted-platform-"));
const modules = readdirSync(server, { recursive: true }).filter(path => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map(path => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
let userId = 1001, verifier;
const options = { cf: false, host: "127.0.0.1", port: 0, d1Persist: join(temporary, "d1"),
  workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    d1Databases: { DB: config.d1_databases[0].database_id },
    bindings: { PUBLIC_ORIGIN: origin, GITHUB_CLIENT_ID: config.vars.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: "synthetic-client-secret", SESSION_SECRET: secret, MAINTAINER_GITHUB_ID: "1001" },
    outboundService: async request => {
      if (request.url === "https://github.com/login/oauth/access_token") {
        assert.equal((await request.json()).code_verifier, verifier);
        return FixtureResponse.json({ access_token: "synthetic-oauth-token" });
      }
      if (request.url === "https://api.github.com/user") {
        return FixtureResponse.json({ id: userId, login: `Synthetic${userId}`, name: "Synthetic test actor" });
      }
      const url = new URL(request.url), prefix = "/repos/HardieBao/lingnet-ascension";
      if (url.origin === "https://api.github.com" &&
          url.pathname === `${prefix}/compare/${commit}...refs%2Fheads%2Fmain` &&
          url.search === "?per_page=1&page=2") return FixtureResponse.json({ status: "identical" });
      if (url.origin === "https://api.github.com" && url.pathname === `${prefix}/contents/GOVERNANCE.md` &&
          url.search === `?ref=${commit}`) return new FixtureResponse(charter);
      throw new Error("Trusted platform check forbids real external services");
    },
  }] };
const mf = new Miniflare(convertV4MiniflareOptions(options));
const request = async (path, cookie, body) => {
  const multipart = body instanceof FormData ? new Request(`${origin}${path}`, { method: "POST", body }) : null;
  return mf.dispatchFetch(`${origin}${path}`, {
    redirect: "manual", method: body === undefined ? "GET" : "POST",
    headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": multipart?.headers.get("content-type") ?? "application/json" }) },
    ...(body === undefined ? {} : { body: multipart ? await multipart.arrayBuffer() : JSON.stringify(body) }),
  });
};
const cookies = response => response.headers.getSetCookie().map(value => value.split(";")[0]);
async function login(id) {
  userId = id;
  const start = await request("/api/auth/github");
  assert.equal(start.status, 302);
  const oauthCookies = cookies(start);
  verifier = oauthCookies.find(value => value.startsWith("lingnet_oauth_verifier=")).split("=")[1];
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const result = await request(`/api/auth/github/callback?state=${state}&code=synthetic-code`, oauthCookies.join("; "));
  assert.equal(result.status, 302);
  const session = cookies(result).find(value => value.startsWith("lingnet_session="));
  assert(session);
  return session;
}
async function balances(cookie) {
  const result = await request("/api/me", cookie);
  assert.equal(result.status, 200);
  return (await result.json()).balances;
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter(name => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter(sql => sql.trim())) {
      await db.prepare(sql).run();
    }
  }
  assert.equal((await request("/api/me")).status, 401);
  const author = await login(1001);
  assert.deepEqual(await balances(author), { token: 0, tokenLocked: 0, cultivation: 0, merit: 0 });
  const claimResponse = await request("/api/claims", author, { missionId: "GOV-001" });
  assert.equal(claimResponse.status, 201);
  const claim = (await claimResponse.json()).claim;
  assert.equal((await request(`/api/claims/${claim.id}/start`, author, {})).status, 200);
  const manifest = await request(`/api/claims/${claim.id}/manifest`, author);
  assert.equal(manifest.status, 200);
  const task = (await manifest.json()).payload;
  assert.equal(task.model.id, "gpt-5.6-sol");
  assert.equal(task.model.tokenBudget, 30000);
  assert.equal(task.model.maxOutputTokens, 2048);
  const form = new FormData();
  form.set("claimId", claim.id);
  form.set("artifact", new File([charter], "GOVERNANCE.md", { type: "text/markdown" }));
  const upload = await request("/api/submissions", author, form);
  assert.equal(upload.status, 201);
  const submission = (await upload.json()).submission;
  assert.equal(submission.state, "awaiting_review");
  assert.equal((await request(`/api/reviews/${submission.id}`, author,
    { decision: "accept", reason: "Synthetic self-review must be rejected" })).status, 403);
  options.workers[0].bindings.MAINTAINER_GITHUB_ID = "1002";
  await mf.setOptions(convertV4MiniflareOptions(options));
  const reviewer = await login(1002);
  assert.equal((await request(`/api/integrations/${submission.id}`, reviewer, { commit })).status, 409);
  assert.equal((await request(`/api/reviews/${submission.id}`, reviewer,
    { decision: "accept", reason: "Synthetic independent review; not a genuine human approval" })).status, 200);
  assert.deepEqual(await balances(author), { token: 50, tokenLocked: 0, cultivation: 100, merit: 5 });
  assert.equal((await request(`/api/reviews/${submission.id}`, reviewer,
    { decision: "accept", reason: "Synthetic duplicate must not mint more" })).status, 409);
  assert.equal((await request(`/api/integrations/${submission.id}`, reviewer, { commit })).status, 200);
  assert.equal((await request(`/api/integrations/${submission.id}`, reviewer, { commit })).status, 409);
  assert.deepEqual(await balances(author), { token: 80, tokenLocked: 0, cultivation: 100, merit: 5 });
  const own = await request("/api/my-results", author);
  assert.equal(own.status, 200);
  assert.equal((await own.json()).results.length, 1);
  const other = await request("/api/my-results", reviewer);
  assert.equal(other.status, 200);
  assert.equal((await other.json()).results.length, 0, "PRIVATE_RESULTS_OWNER_SCOPE");
  Object.assign(options.workers[0].bindings, { DEPLOYMENT_STAGE: "beta", PREVIEW_ONLY_GITHUB_ID: "1001",
    BETA_INVITE_SHA256: createHash("sha256").update("a".repeat(64)).digest("hex"), RECOVERY_APPROVER_GITHUB_ID: "1001",
    MAINTAINER_GITHUB_ID: "1001", FINANCE_APPROVER_GITHUB_ID: "1001" });
  await mf.setOptions(convertV4MiniflareOptions(options));
  assert.equal((await request("/api/me", reviewer)).status, 401);
  assert.equal((await request(`/api/reviews/${submission.id}`, author,
    { decision: "accept", reason: "Synthetic Beta must deny all reward reviews" })).status, 403);
  assert.equal((await request("/api/token-adjustments", author)).status, 403);
  assert.equal((await request(`/api/claims/${claim.id}/manifest`, author)).status, 503);
  assert.equal((await request("/api/stable-settlements/synthetic/release-hold", author,
    { reason: "Synthetic Beta must deny separately configured recovery reviewers" })).status, 403);
  const { runIsolatedModel } = await import(pathToFileURL(join(site, "public/runner-sandbox.mjs")).href);
  const previous = process.env.LINGNET_PROVIDER_LIMITS_VERIFIED;
  delete process.env.LINGNET_PROVIDER_LIMITS_VERIFIED;
  try { await assert.rejects(runIsolatedModel({}, "synthetic-no-model-workspace", "Synthetic"), /代理限额契约尚未核验/); }
  finally {
    if (previous === undefined) delete process.env.LINGNET_PROVIDER_LIMITS_VERIFIED;
    else process.env.LINGNET_PROVIDER_LIMITS_VERIFIED = previous;
  }
  console.log("TRUSTED_PLATFORM_RUNTIME=passed; synthetic OAuth/claim/upload/review/integration/rewards/privacy/Beta guards; no real model or human approval");
} finally { await mf.dispose(); }
