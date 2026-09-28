import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Response as FixtureResponse, convertV4MiniflareOptions } from "miniflare";

// Agreed seam: built production authentication → public APIs → actual isolated D1.
const site = resolve(dirname(fileURLToPath(import.meta.url)), ".."), server = join(site, "dist", "server");
const configPath = join(site, "wrangler.production.jsonc");
const config = JSON.parse(readFileSync(existsSync(configPath) ? configPath : join(server, "wrangler.json"), "utf8"));
const temporary = mkdtempSync(join(tmpdir(), "lingnet-deployment-auth-"));
const origin = "https://lingnet-ascension.1301385382gjts.workers.dev";
const secret = "synthetic-deployment-session-secret-not-a-real-key";
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
let verifier, githubId = 919;
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    d1Databases: { DB: config.d1_databases[0].database_id },
    bindings: { ...config.vars, PREVIEW_ONLY_GITHUB_ID: "919", SESSION_SECRET: secret, GITHUB_CLIENT_SECRET: "synthetic-client-secret" },
    outboundService: async (request) => {
      if (request.url === "https://github.com/login/oauth/access_token") {
        const body = await request.json();
        assert.equal(body.client_id, "Ov23linkkfUCMUFtjgYJ");
        assert.equal(body.client_secret, "synthetic-client-secret");
        assert.equal(body.code, "synthetic-valid-code");
        assert.equal(body.code_verifier, verifier);
        assert.equal(body.redirect_uri, `${origin}/api/auth/github/callback`);
        return FixtureResponse.json({ access_token: "synthetic-github-token" });
      }
      if (request.url === "https://api.github.com/user" && request.headers.get("authorization") === "Bearer synthetic-github-token") {
        return FixtureResponse.json({ id: githubId, login: `Synthetic${githubId}`, name: "Synthetic cultivator" });
      }
      throw new Error("Deployment verification forbids real external services");
    },
  }] }));
const request = (path, options = {}) => mf.dispatchFetch(`${origin}${path}`, { redirect: "manual", ...options });
const cookies = (response) => response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  assert.equal((await request("/api/me", { headers: { "oai-authenticated-user-id": "forged" } })).status, 401);
  assert.equal(config.vars.PREVIEW_ONLY_GITHUB_ID, "134252261", "Preview configuration must restrict the real owner by numeric GitHub identity");
  const start = await request("/api/auth/github");
  assert.equal(start.status, 302, "Production configuration must enable the real GitHub redirect");
  const authorize = new URL(start.headers.get("location"));
  assert.equal(authorize.origin, "https://github.com");
  assert.equal(authorize.searchParams.get("client_id"), "Ov23linkkfUCMUFtjgYJ");
  assert.equal(authorize.searchParams.get("redirect_uri"), `${origin}/api/auth/github/callback`);
  assert.equal(authorize.searchParams.get("scope"), "read:user");
  const stateCookies = cookies(start), cookieHeader = stateCookies.join("; ");
  verifier = stateCookies.find((cookie) => cookie.startsWith("lingnet_oauth_verifier=")).split("=")[1];
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorize.searchParams.get("code_challenge"), createHash("sha256").update(verifier).digest("base64url"));
  assert(start.headers.getSetCookie().every((cookie) => cookie.includes("HttpOnly") && cookie.includes("Secure") && cookie.includes("SameSite=Lax")));
  assert.equal((await request("/api/auth/github/callback?state=wrong&code=synthetic-valid-code", { headers: { Cookie: cookieHeader } })).status, 400);
  githubId = 920;
  assert.equal((await request(`/api/auth/github/callback?state=${authorize.searchParams.get("state")}&code=synthetic-valid-code`, { headers: { Cookie: cookieHeader } })).status, 403);
  assert.equal(await db.prepare("SELECT id FROM cultivators WHERE id='github:920'").first(), null);
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES ('github:920','github','920','Synthetic920','Synthetic',?)").bind(Date.now()).run();
  const oldPayload = Buffer.from(JSON.stringify({ sub: "github:920", ver: 0, exp: Math.floor(Date.now()/1000) + 3600 })).toString("base64url");
  const oldSession = `lingnet_session=${oldPayload}.${createHmac("sha256",secret).update(oldPayload).digest("base64url")}`;
  assert.equal((await request("/api/me", { headers: { Cookie: oldSession } })).status, 401);
  assert.equal((await request("/api/claims", { method: "POST", headers: { Cookie: oldSession, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ missionId: "GOV-001" }) })).status, 401);
  githubId = 919;
  const callback = await request(`/api/auth/github/callback?state=${authorize.searchParams.get("state")}&code=synthetic-valid-code`, { headers: { Cookie: cookieHeader } });
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), origin);
  const session = cookies(callback).find((cookie) => cookie.startsWith("lingnet_session="));
  assert(session);
  const me = await request("/api/me", { headers: { Cookie: session } });
  assert.equal(me.status, 200);
  const account = await me.json();
  assert.equal(account.cultivator.id, "github:919");
  assert.equal(account.cultivator.handle, "Synthetic919");
  assert.deepEqual(account.balances, { token: 0, tokenLocked: 0, cultivation: 0, merit: 0 });
  assert.equal((await request("/api/auth/logout", { method: "POST", headers: { Cookie: session, Origin: "https://foreign.example.invalid" } })).status, 403);
  assert.equal((await request("/api/me", { headers: { Cookie: session } })).status, 200);
  assert.equal((await request("/api/auth/logout", { method: "POST", headers: { Cookie: session, Origin: origin } })).status, 303);
  assert.equal((await request("/api/me", { headers: { Cookie: session } })).status, 401);
  console.log("Production configuration + actual built APIs/D1: preview denies other GitHub accounts before insert and rejects their valid old sessions/mutations; owner login, state/PKCE, zero balance, CSRF logout and revocation passed. Synthetic identities only.");
} finally {
  await mf.dispose();
  console.log(`Synthetic deployment workspace retained: ${temporary}`);
}
