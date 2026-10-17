import assert from "node:assert/strict";
import test from "node:test";
import { publishedVersionsResponse } from "../lib/published-versions-http.ts";

// Adopted public HTTP seam; synthetic GitHub only, no database or model calls.
test("public GET returns the observed release page without account fields or a write", async () => {
  const response = await publishedVersionsResponse(new Request("https://fixture.invalid/api/versions"), async (url) => {
    assert.equal(url, "https://api.github.com/repos/HardieBao/lingnet-ascension/releases?per_page=5&page=1");
    return Response.json([]);
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { state: "available", page: 1, nextPage: null, versions: [] });
});

test("invalid or repeated pagination and write methods fail before any upstream request", async () => {
  for (const path of ["?page=0", "?page=-1", "?page=1.5", "?page=1&page=2", "?page=", "?other=1"]) {
    let requested = false;
    const response = await publishedVersionsResponse(new Request(`https://fixture.invalid/api/versions${path}`), async () => {
      requested = true; return Response.json([]);
    });
    assert.equal(response.status, 400);
    assert.equal(requested, false);
  }
  let requested = false;
  const response = await publishedVersionsResponse(new Request("https://fixture.invalid/api/versions", { method: "POST" }), async () => {
    requested = true; return Response.json([]);
  });
  assert.equal(response.status, 405);
  assert.equal(requested, false);
});

test("valid pagination, unavailable upstream and HEAD retain HTTP meaning without private error payloads", async () => {
  const fetcher = async (url) => {
    assert.equal(url, "https://api.github.com/repos/HardieBao/lingnet-ascension/releases?per_page=5&page=2");
    return Response.json([]);
  };
  const response = await publishedVersionsResponse(new Request("https://fixture.invalid/api/versions?page=2"), fetcher);
  assert.equal((await response.json()).page, 2);
  const unavailable = await publishedVersionsResponse(new Request("https://fixture.invalid/api/versions"),
    async () => new Response("synthetic-private-upstream", { status: 429 }));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { state: "unavailable" });
  const head = await publishedVersionsResponse(new Request("https://fixture.invalid/api/versions?page=2", { method: "HEAD" }), fetcher);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
