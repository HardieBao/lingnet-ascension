import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { loadPublishedVersion } from "../lib/published-versions.ts";
import { verifyPublishedResult, publishedResultsQuery } from "../lib/published-results.ts";

const bytes = "synthetic fixed version artifact\r\n", sha = createHash("sha256").update(bytes).digest("hex");
const version = { releaseId: 12, tag: "main", immutable: true, prerelease: false, commit: "b".repeat(40), publishedAt: 1000 };
const input = { integratedCommit: "a".repeat(40), artifactSha256: sha, artifactPath: "GOVERNANCE.md" };
test("fixed release proof checks ancestry and exact bytes, not main or a namesake branch", async () => {
  const requests = [];
  const proof = await verifyPublishedResult(version, input, async (url, options) => {
    requests.push([url, options.redirect]);
    return url.includes("/compare/") ? Response.json({ status: "ahead" }) : new Response(bytes);
  });
  assert.equal(proof, "verified"); assert.equal(requests.length, 2);
  assert(requests.every(([, redirect]) => redirect === "manual"));
  assert.match(requests[0][0], new RegExp(`${input.integratedCommit}\\.\\.\\.${version.commit}\\?per_page=1&page=2$`));
  assert(requests[1][0].endsWith(`?ref=${version.commit}`));
});
test("mutable/pre-release and unverified commits cannot acquire a fixed proof", async () => {
  let calls = 0; const fetcher = async () => { calls++; throw new Error("must not call"); };
  for (const change of [{ immutable: false }, { immutable: null }, { prerelease: true }]) {
    assert.equal(await verifyPublishedResult({ ...version, ...change }, input, fetcher), "unfrozen");
  }
  assert.equal(await verifyPublishedResult({ ...version, commit: null }, input, fetcher), "unavailable");
  assert.equal(await verifyPublishedResult(version, { ...input, artifactPath: "../secret" }, fetcher), "unavailable");
  assert.equal(calls, 0);
});
test("changed bytes, nonancestor, bad metadata, redirect, oversized and offline remain distinct from proof", async () => {
  for (const status of ["behind", "diverged"]) assert.equal(await verifyPublishedResult(version, input, async () => Response.json({ status })), "not-in-version");
  assert.equal(await verifyPublishedResult(version, input, async (url) => url.includes("/compare/") ? Response.json({ status: "identical" }) : new Response(bytes.replace("\r\n", "\n"))), "changed");
  for (const response of [() => Response.json({ status: "unknown" }), () => new Response("x".repeat(32769)),
    () => new Response(null, { status: 302, headers: { Location: "https://foreign.invalid" } }), () => { throw new Error("offline"); }]) {
    assert.equal(await verifyPublishedResult(version, input, async () => response()), "unavailable");
  }
});
test("single release resolution binds exact numeric ID and tag namespace", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    return url.includes("/releases/") ? Response.json({ id: 12, tag_name: "main", draft: false, prerelease: false, immutable: true, published_at: "2020-01-01T00:00:00Z" })
      : Response.json({ ref: "refs/tags/main", object: { type: "commit", sha: version.commit } });
  };
  assert.equal((await loadPublishedVersion(12, fetcher)).commit, version.commit);
  assert(calls[1].endsWith("/git/ref/tags/main"));
  assert.equal(await loadPublishedVersion(13, fetcher), null);
  assert.equal(await loadPublishedVersion(0, fetcher), null);
});
test("catalogue query rejects duplicate, owner selector and invalid pagination", () => {
  assert.deepEqual(publishedResultsQuery(new URLSearchParams("release=12&page=2")), { releaseId: 12, page: 2 });
  for (const query of ["", "release=0", "release=12&release=13", "release=12&owner=x", "release=12&page=1&page=2", "release=12&page=100001"]) assert.equal(publishedResultsQuery(new URLSearchParams(query)), null);
});
