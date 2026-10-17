import assert from "node:assert/strict";
import test from "node:test";
import { loadPublishedVersions } from "../lib/published-versions.ts";

// Adopted version-directory seam: public inspection with synthetic GitHub responses.
const api = "https://api.github.com/repos/HardieBao/lingnet-ascension";
const publishedAt = Date.now() - 86400000;
const release = { id: 101, tag_name: "main", draft: false, prerelease: false, immutable: true,
  published_at: new Date(publishedAt).toISOString() };

test("a verified empty published-release page stays empty instead of substituting tags or demo versions", async () => {
  const result = await loadPublishedVersions(1, async (url, options) => {
    assert.equal(url, `${api}/releases?per_page=5&page=1`);
    assert.equal(new Headers(options.headers).has("Authorization"), false);
    return Response.json([]);
  });
  assert.equal(result.state, "available");
  assert.equal(result.page, 1);
  assert.equal(result.nextPage, null);
  assert.deepEqual(result.versions, []);
});

test("public release metadata keeps prereleases separate and resolves the tag namespace, never a same-name branch", async () => {
  const result = await loadPublishedVersions(1, async (url) => {
    if (url === `${api}/releases?per_page=5&page=1`) return Response.json([
      { ...release, author: { login: "synthetic-author" }, body: "synthetic-private-description" },
      { ...release, id: 102, tag_name: "v0.2-preview", prerelease: true, immutable: false },
      { ...release, id: 103, tag_name: "draft", draft: true, published_at: null },
    ]);
    assert(url.startsWith(`${api}/git/ref/tags/`));
    const tag = decodeURIComponent(url.slice(`${api}/git/ref/tags/`.length));
    return Response.json({ ref: `refs/tags/${tag}`, object: { type: "commit", sha: "b".repeat(40) } });
  });
  assert.equal(result.state, "available");
  assert.deepEqual(result.versions, [
    { releaseId: 101, tag: "main", publishedAt, prerelease: false, immutable: true, commit: "b".repeat(40) },
    { releaseId: 102, tag: "v0.2-preview", publishedAt, prerelease: true, immutable: false, commit: "b".repeat(40) },
  ]);
  assert(!JSON.stringify(result).includes("synthetic"));
});

test("annotated tags are peeled to their commit without following upstream object URLs", async () => {
  const tag = "release/v0.3.0", firstTag = "a".repeat(40), nestedTag = "d".repeat(40), commit = "b".repeat(40);
  const result = await loadPublishedVersions(1, async (url) => {
    if (url === `${api}/releases?per_page=5&page=1`) return Response.json([{ ...release, tag_name: tag, immutable: undefined }]);
    if (url === `${api}/git/ref/tags/${encodeURIComponent(tag)}`) return Response.json({ ref: `refs/tags/${tag}`,
      object: { type: "tag", sha: firstTag, url: "https://foreign.invalid/private" } });
    if (url === `${api}/git/tags/${firstTag}`) return Response.json({ sha: firstTag,
      object: { type: "tag", sha: nestedTag, url: "https://foreign.invalid/private" } });
    assert.equal(url, `${api}/git/tags/${nestedTag}`);
    return Response.json({ sha: nestedTag, object: { type: "commit", sha: commit.toUpperCase() } });
  });
  assert.equal(result.state, "available");
  assert.equal(result.versions[0].commit, commit);
  assert.equal(result.versions[0].immutable, null);
});

test("release pagination retains only a verified next page for the same repository and page size", async () => {
  const result = await loadPublishedVersions(4, async (url) => {
    if (url === `${api}/releases?per_page=5&page=4`) return Response.json([release], {
      headers: { Link: `<${api}/releases?per_page=5&page=5>; rel="next", <${api}/releases?per_page=5&page=3>; rel="prev"` },
    });
    return Response.json({ ref: "refs/tags/main", object: { type: "commit", sha: "b".repeat(40) } });
  });
  assert.equal(result.state, "available");
  assert.equal(result.nextPage, 5);
});

test("unavailable, malformed, oversized or duplicate release records are not reported as an empty successful page", async () => {
  for (const response of [new Response("synthetic-private-upstream", { status: 429 }),
    new Response("synthetic-private-malformed"), new Response("x".repeat(131073)), Response.json({}),
    Response.json([release, release]), Response.json([{ ...release, published_at: "invalid" }]),
    Response.json([{ ...release, published_at: new Date(Date.now() + 86400000).toISOString() }])]) {
    const result = await loadPublishedVersions(1, async (url) => url.includes("/releases?") ? response :
      Response.json({ ref: "refs/tags/main", object: { type: "commit", sha: "b".repeat(40) } }));
    assert.deepEqual(result, { state: "unavailable" });
    assert(!JSON.stringify(result).includes("synthetic-private"));
  }
});

test("canonical owner and repository case does not hide the next release page", async () => {
  const result = await loadPublishedVersions(1, async () => Response.json([], {
    headers: { Link: "<https://api.github.com/repos/hardiebao/lingnet-ascension/releases?per_page=5&page=2>; rel=\"next\"" },
  }));
  assert.equal(result.state, "available");
  assert.equal(result.nextPage, 2);
});

test("invalid page requests and hostile next links cannot select another origin, repository or page size", async () => {
  for (const page of [0, -1, 1.5, NaN, Infinity, "1"]) {
    let requested = false;
    const result = await loadPublishedVersions(page, async () => { requested = true; return Response.json([]); });
    assert.deepEqual(result, { state: "unavailable" });
    assert.equal(requested, false);
  }
  for (const next of ["https://foreign.invalid/private?page=2&per_page=5", `${api}/issues?per_page=5&page=2`,
    `${api}/releases?per_page=100&page=2`, `${api}/releases?per_page=5&page=1`]) {
    const result = await loadPublishedVersions(1, async (url) => {
      assert.equal(url, `${api}/releases?per_page=5&page=1`);
      return Response.json([], { headers: { Link: `<${next}>; rel="next"` } });
    });
    assert.deepEqual(result, { state: "unavailable" });
  }
});

test("unresolvable, mismatched, cyclic or oversized tag evidence keeps the publication but never invents a commit", async () => {
  for (const mode of ["missing", "branch", "blob", "mismatched-tag", "cycle", "oversized"]) {
    let requests = 0;
    const result = await loadPublishedVersions(1, async (url) => {
      requests++;
      assert(url.startsWith(api));
      if (url.includes("/releases?")) return Response.json([release]);
      if (mode === "missing") return new Response("synthetic-private-error", { status: 404 });
      if (mode === "branch") return Response.json({ ref: "refs/heads/main", object: { type: "commit", sha: "b".repeat(40) } });
      if (mode === "blob") return Response.json({ ref: "refs/tags/main", object: { type: "blob", sha: "b".repeat(40) } });
      if (mode === "oversized") return new Response("x".repeat(32769));
      if (url.includes("/git/ref/")) return Response.json({ ref: "refs/tags/main", object: { type: "tag", sha: "a".repeat(40) } });
      return Response.json({ sha: mode === "mismatched-tag" ? "d".repeat(40) : "a".repeat(40), object: { type: "tag", sha: "a".repeat(40) } });
    });
    assert.equal(result.state, "available");
    assert.equal(result.versions.length, 1);
    assert.equal(result.versions[0].commit, null);
    assert(requests <= 6);
    assert(!JSON.stringify(result).includes("synthetic-private"));
  }
});

test("edge-compatible manual redirects are rejected without following or echoing the upstream response", async () => {
  const requests = [];
  const result = await loadPublishedVersions(1, async (url, options) => {
    requests.push({ url, redirect: options.redirect });
    return new Response("synthetic-private-redirect", { status: 302, headers: { Location: "https://foreign.invalid/private" } });
  });
  assert.deepEqual(requests, [{ url: `${api}/releases?per_page=5&page=1`, redirect: "manual" }]);
  assert.deepEqual(result, { state: "unavailable" });
});
