import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Response as FixtureResponse, convertV4MiniflareOptions } from "miniflare";

// Confirmed seam: D1-only upload/read → independent review/integration → ledger. No R2 binding.
const site = resolve(dirname(fileURLToPath(import.meta.url)), ".."), server = join(site, "dist", "server");
const temporary = mkdtempSync(join(tmpdir(), "lingnet-d1-artifacts-"));
const secret = "synthetic-d1-artifact-secret-not-a-real-credential", commit = "a".repeat(40);
const content = "\uFEFF" + readFileSync(join(site, "tests", "fixtures", "gov001-charter.md"), "utf8");
const modules = readdirSync(server, { recursive: true }).filter((path) => /\.(?:m?js)$/.test(path))
  .sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b))
  .map((path) => ({ type: "ESModule", path: join(server, path), contents: readFileSync(join(server, path), "utf8") }));
const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
  d1Persist: join(temporary, "d1"), workers: [{ name: "application", rootPath: server, modules,
    compatibilityDate: "2026-09-21", compatibilityFlags: ["nodejs_compat"], d1Databases: { DB: "d1-artifacts" },
    bindings: { SESSION_SECRET: secret, MAINTAINER_GITHUB_ID: "712" }, outboundService: (request) => {
      if (request.url === `https://api.github.com/repos/HardieBao/lingnet-ascension/compare/${commit}...main?per_page=1`) return FixtureResponse.json({ status: "identical" });
      if (request.url === `https://api.github.com/repos/HardieBao/lingnet-ascension/contents/GOVERNANCE.md?ref=${commit}`) return new FixtureResponse(content);
      throw new Error("D1 artifact test forbids real external services");
    },
  }] }));
function cookie(actor) {
  const payload = Buffer.from(JSON.stringify({ sub: actor, ver: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `lingnet_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
async function api(actor, path, body) {
  return mf.dispatchFetch(`http://fixture.local${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { Cookie: cookie(actor), Origin: "http://fixture.local", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function okay(actor, path, body) {
  const response = await api(actor, path, body);
  assert(response.ok, `${response.status}: ${await response.clone().text()}`); return response.json();
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(site, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(join(site, "drizzle", file), "utf8").split("--> statement-breakpoint").filter((sql) => sql.trim())) await db.prepare(sql).run();
  }
  for (const [id, provider] of [["owner", "711"], ["reviewer", "712"], ["outsider", "713"]]) {
    await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github',?,'Fixture','Synthetic',?)").bind(id, provider, Date.now()).run();
  }
  const claim = (await okay("owner", "/api/claims", { missionId: "GOV-001" })).claim;
  await okay("owner", `/api/claims/${claim.id}/start`, {});
  const boundary = `fixture-${randomUUID()}`;
  const bytes = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="claimId"\r\n\r\n${claim.id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="artifact"; filename="GOVERNANCE.md"\r\nContent-Type: text/markdown\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  const uploaded = await mf.dispatchFetch("http://fixture.local/api/submissions", { method: "POST",
    headers: { Cookie: cookie("owner"), Origin: "http://fixture.local", "Content-Type": `multipart/form-data; boundary=${boundary}` }, body: bytes });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const submission = (await uploaded.json()).submission;
  assert.equal(submission.verdict.passed, true);
  assert.equal((await api("outsider", `/api/submissions/${submission.id}/artifact`)).status, 403);
  for (const actor of ["owner", "reviewer"]) {
    const artifact = await api(actor, `/api/submissions/${submission.id}/artifact`);
    assert.equal(artifact.status, 200);
    assert.deepEqual(Buffer.from(await artifact.arrayBuffer()), Buffer.from(content), "UTF-8 BOM and exact bytes must survive storage");
  }
  await okay("reviewer", `/api/reviews/${submission.id}`, { decision: "accept", reason: "Synthetic independent D1 review" });
  await okay("reviewer", `/api/integrations/${submission.id}`, { commit });
  assert.equal((await api("reviewer", `/api/integrations/${submission.id}`, { commit })).status, 409);
  const balances = (await okay("owner", "/api/me")).balances;
  assert.equal(balances.token, 80); assert.equal(balances.cultivation, 100); assert.equal(balances.merit, 5);
  console.log("D1-only actual APIs preserve exact UTF-8 bytes and permissions; independent review/integration rewards once. Synthetic accounts and GitHub only; no R2.");
} finally { await mf.dispose(); console.log(`Synthetic D1 workspace retained: ${temporary}`); }
