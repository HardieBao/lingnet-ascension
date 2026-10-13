import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Trusted copy of PR21's non-browser HTTP/D1 assertions. Never import its candidate test script.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "../site");
const { Miniflare, convertV4MiniflareOptions } = createRequire(join(site, "package.json"))("miniflare");
const server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-trusted-profile-"));
const secret = "synthetic-profile-session-secret-not-production", origin = "http://fixture.local";
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: "2026-09-27", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "synthetic-profile-privacy" }, bindings: { SESSION_SECRET: secret },
    outboundService: () => { throw new Error("Profile verification forbids external services"); },
  }] }));
function session(actor) {
  if (!actor) return {};
  const payload = Buffer.from(JSON.stringify({ sub: actor, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return { Cookie: `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}` };
}
async function api(actor, path, input, status = 200, extraHeaders = {}) {
  const response = await mf.dispatchFetch(`${origin}${path}`, { method: input === undefined ? "GET" : "POST",
    headers: { ...session(actor), Origin: origin, "Content-Type": "application/json", ...extraHeaders },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  assert.equal(response.status, status, `${path}: ${response.status} instead of ${status}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  for (const [id, providerId, name] of [["fixture-profile-owner", "8801", "合成修士甲"], ["fixture-profile-other", "8802", "合成修士乙"],
    ["fixture-profile-legacy", "8803", "旧账号".repeat(15)]]) {
    await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github',?,?,?,?)")
      .bind(id, providerId, `PRIVATE_HANDLE_${providerId}`, name, Date.now()).run();
  }
  for (const [resource, amount] of [["token", 1000], ["token_locked", 50], ["cultivation", 150], ["merit", 7]]) {
    await db.prepare("INSERT INTO ledger_events (id,cultivator_id,resource,delta,source_key,created_at) VALUES (?,'fixture-profile-owner',?,?,?,?)")
      .bind(`profile-funding-${resource}`, resource, amount, `profile-synthetic-funding-${resource}`, Date.now()).run();
  }
  const accountBefore = await (await mf.dispatchFetch(`${origin}/api/me`, { headers: session("fixture-profile-owner") })).json();
  await api(null, "/api/profile", undefined, 401);
  assert.deepEqual((await api("fixture-profile-owner", "/api/profile")).profile,
    { daohao: "合成修士甲", public: false, revision: 0, publicId: null });
  const saved = (await api("fixture-profile-owner", "/api/profile", { daohao: "  合成青云  ", public: false, revision: 0 })).profile;
  assert.equal(saved.daohao, "合成青云"); assert.equal(saved.public, false); assert.equal(saved.revision, 1);
  assert.match(saved.publicId, /^[0-9a-f-]{36}$/);
  assert.deepEqual((await api("fixture-profile-owner", "/api/profile")).profile, saved);
  assert.equal((await api("fixture-profile-other", "/api/profile")).profile.daohao, "合成修士乙");
  const published = (await api("fixture-profile-owner", "/api/profile", { daohao: saved.daohao, public: true, revision: saved.revision })).profile;
  assert.deepEqual(await api(null, `/api/profiles/${published.publicId}`), { profile: { daohao: "合成青云", realm: "mortal" } });
  const publicPage = await mf.dispatchFetch(`${origin}/cultivators/${published.publicId}`);
  assert.equal(publicPage.status, 200); assert.doesNotMatch(await publicPage.text(), /PRIVATE_HANDLE_|8801|token_locked|profile-funding/);
  const privateAgain = (await api("fixture-profile-owner", "/api/profile", { daohao: published.daohao, public: false, revision: published.revision })).profile;
  assert.equal(privateAgain.publicId, published.publicId); assert.equal(privateAgain.public, false);
  await api(null, `/api/profiles/${published.publicId}`, undefined, 404);
  await api("fixture-profile-owner", "/api/profile", { daohao: "旧页面不应重新公开", public: true, revision: published.revision }, 409);
  assert.deepEqual((await api("fixture-profile-owner", "/api/profile")).profile, privateAgain);
  await api(null, "/api/profile", { daohao: "匿名", public: true, revision: 0 }, 401);
  await api(null, "/api/profile", undefined, 401, { "oai-authenticated-user-id": "fixture-profile-owner" });
  await api("fixture-profile-owner", "/api/profile", { daohao: "跨站", public: true, revision: privateAgain.revision }, 403,
    { Origin: "https://foreign.example.invalid" });
  for (const input of [null, [], {}, { daohao: "", public: false, revision: 3 },
    { daohao: "x".repeat(33), public: false, revision: 3 }, { daohao: "含\u0000控制", public: false, revision: 3 },
    { daohao: "含\u202e双向控制", public: false, revision: 3 }, { daohao: "\ud800", public: false, revision: 3 },
    { daohao: "类型", public: "false", revision: 3 }, { daohao: "类型", public: false, revision: "3" },
    { daohao: "版本", public: false, revision: -1 }, { daohao: "版本", public: false, revision: Number.MAX_SAFE_INTEGER + 1 },
    { daohao: "越权", public: false, revision: 3, cultivatorId: "fixture-profile-other" }, { daohao: "x".repeat(5000), public: false, revision: 3 }]) {
    await api("fixture-profile-owner", "/api/profile", input, 400);
  }
  assert.deepEqual((await api("fixture-profile-owner", "/api/profile")).profile, privateAgain);
  assert.equal((await api("fixture-profile-other", "/api/profile")).profile.revision, 0);
  await api(null, "/api/profiles/not-an-id", undefined, 404);
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => mf.dispatchFetch(`${origin}/api/profile`, {
    method: "POST", headers: { ...session("fixture-profile-owner"), Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ daohao: "合成并发", public: false, revision: privateAgain.revision }),
  })));
  assert.equal(concurrent.filter((response) => response.status === 200).length, 1);
  assert.equal(concurrent.filter((response) => response.status === 409).length, 19);
  const finalProfile = (await api("fixture-profile-owner", "/api/profile")).profile;
  assert.equal(finalProfile.revision, privateAgain.revision + 1); assert.equal(finalProfile.public, false);
  assert.equal(finalProfile.publicId, privateAgain.publicId);
  await api(null, `/api/profiles/${finalProfile.publicId}`, undefined, 404);
  const dwelling = await mf.dispatchFetch(`${origin}/dwelling`, { headers: session("fixture-profile-owner") });
  assert.equal(dwelling.status, 200); const html = await dwelling.text();
  for (const text of ["我的洞府", "保存道号与隐私", "模型用量：未知"]) assert(html.includes(text));
  assert.doesNotMatch(await (await mf.dispatchFetch(`${origin}/dwelling`, { headers: session("fixture-profile-other") })).text(), /合成并发|profile-funding/);
  assert.match(await (await mf.dispatchFetch(`${origin}/dwelling`)).text(), /登录后进入洞府/);
  assert.deepEqual(await (await mf.dispatchFetch(`${origin}/api/me`, { headers: session("fixture-profile-owner") })).json(), accountBefore);
  console.log("TRUSTED_PROFILE_HTTP_D1=passed: synthetic identities, privacy/revocation/revision/20-way concurrency and resources unchanged.");
} finally { await mf.dispose(); }
