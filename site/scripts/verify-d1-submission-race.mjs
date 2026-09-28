import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Response as FixtureResponse, convertV4MiniflareOptions } from "miniflare";

// Confirmed storage/API seam. Observe actual D1 batch metadata; no altered SQL or fake database.
const site = resolve(dirname(fileURLToPath(import.meta.url)), ".."), server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-d1-race-")), secret = "synthetic-d1-race-secret-not-a-real-credential";
let reached, release;
const atBatch = new Promise((done) => { reached = done; }), proceed = new Promise((done) => { release = done; });
const metadata = [];
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const entry = { type: "ESModule", path: join(server, "d1-race-entry.mjs"), contents: `
  import app from './index.js'; import {withEnv} from 'cloudflare:workers';
  export default { async fetch(request,env,ctx) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/submissions') return app.fetch(request,env,ctx);
    const DB = new Proxy(env.DB,{ get(target,name) {
      if (name==='batch') return async (statements)=>{
        await env.OBSERVER.fetch('http://observer.test/ready');
        const results=await target.batch(statements);
        await env.OBSERVER.fetch('http://observer.test/result',{method:'POST',body:JSON.stringify(results.map(r=>r.meta.changes))});
        return results;
      };
      const value=Reflect.get(target,name); return typeof value==='function'?value.bind(target):value;
    }});
    return withEnv({...env,DB},()=>app.fetch(request,env,ctx));
  }};` };
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0, d1Persist: join(temporary, "d1"),
  workers: [{ name: "application", rootPath: server, modules: [entry, ...modules],
    compatibilityDate: "2026-09-21", compatibilityFlags: ["nodejs_compat"], d1Databases: { DB: "d1-race" },
    bindings: { SESSION_SECRET: secret }, serviceBindings: { OBSERVER: async (request) => {
      if (new URL(request.url).pathname === "/ready") { reached(); await proceed; }
      else metadata.push(await request.json());
      return new FixtureResponse("ok");
    } }, outboundService: () => { throw new Error("D1 race test forbids external network"); },
  }] }));
const payload = Buffer.from(JSON.stringify({ sub: "owner", ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
const cookie = `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
async function api(path, body) {
  const response = await mf.dispatchFetch(`http://fixture.local${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { Cookie: cookie, Origin: "http://fixture.local", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert(response.ok, `${response.status}: ${await response.clone().text()}`); return response.json();
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES ('owner','github','711','Fixture','Synthetic',?)").bind(Date.now()).run();
  const claim = (await api("/api/claims", { missionId: "GOV-001" })).claim;
  await api(`/api/claims/${claim.id}/start`, {});
  const boundary = `fixture-${randomUUID()}`, content = readFileSync(join(site, "tests", "fixtures", "gov001-charter.md"), "utf8");
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="claimId"\r\n\r\n${claim.id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="artifact"; filename="GOVERNANCE.md"\r\nContent-Type: text/markdown\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  const pending = mf.dispatchFetch("http://fixture.local/api/submissions", { method: "POST",
    headers: { Cookie: cookie, Origin: "http://fixture.local", "Content-Type": `multipart/form-data; boundary=${boundary}` }, body });
  await atBatch;
  await api(`/api/claims/${claim.id}/release`, {});
  release();
  const uploaded = await pending;
  assert.equal(uploaded.status, 409);
  assert.deepEqual((await api("/api/submissions")).submissions, []);
  assert.equal((await api("/api/claims")).claims.find((entry) => entry.id === claim.id).state, "released");
  assert.equal(metadata.length, 1);
  assert(metadata[0].length >= 2 && metadata[0].every((changes) => changes === 0), "Actual D1 writes: rejected submission and its payload both write zero rows");
  console.log("Actual D1/API: release after validation but before atomic upload rejects; submission/payload/review writes are all zero. No R2 or orphan object.");
} finally { release(); await mf.dispose(); console.log(`Synthetic D1 race workspace retained: ${temporary}`); }
