import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { inspectCurrentRollback, inspectStableVersions } from "../lib/stable-versions.ts";

// Existing agreed seam: version/rollback inspection with synthetic GitHub responses.
const main = "c".repeat(40);
const artifact = "fixed public artifact\n";
const digest = createHash("sha256").update(artifact).digest("hex");

test("rollback inspection resolves a large commit using SHA media without reading its diff", async () => {
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/commits/main")) {
      return new Headers(options.headers).get("Accept") === "application/vnd.github.sha"
        ? new Response(main)
        : Response.json({ sha: main, files: [{ patch: "x".repeat(40000) }] });
    }
    assert.equal(path, "/repos/HardieBao/lingnet-ascension/contents/GOVERNANCE.md");
    assert.equal(new URL(url).searchParams.get("ref"), main);
    return new Response(artifact);
  };
  assert.deepEqual(await inspectCurrentRollback({ artifactPath: "GOVERNANCE.md", artifactSha256: digest }, fetcher), {
    rolledBack: false, mainCommit: main,
  });
});

test("stable versions resolve tag and current-main SHA while retaining immutable releases and byte proofs", async () => {
  const original = "a".repeat(40), first = "b".repeat(40), second = main;
  const publishedAt = Date.now() - 8 * 86400000;
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    if (/\/releases\/tags\/v[12]$/.test(path)) {
      const one = path.endsWith("v1");
      return Response.json({ id: one ? 101 : 102, tag_name: one ? "v1" : "v2", draft: false,
        prerelease: false, immutable: true, published_at: new Date(publishedAt + (one ? 0 : 7 * 86400000)).toISOString() });
    }
    if (/\/commits\/(?:v[12]|main)$/.test(path)) {
      const sha = path.endsWith("v1") ? first : second;
      return new Headers(options.headers).get("Accept") === "application/vnd.github.sha"
        ? new Response(sha + "\n")
        : Response.json({ sha, files: [{ patch: "x".repeat(40000) }] });
    }
    if (path.includes("/compare/")) return Response.json({ status: "ahead" });
    assert.equal(path, "/repos/HardieBao/lingnet-ascension/contents/GOVERNANCE.md");
    return new Response(artifact);
  };
  const result = await inspectStableVersions({ firstTag: "v1", secondTag: "v2", integratedCommit: original,
    integratedAt: publishedAt - 1000, artifactPath: "GOVERNANCE.md", artifactSha256: digest,
    minimumVersionGapMs: 604800000 }, fetcher);
  assert.equal(result.passed, true);
  assert.equal(result.proof.first.commit, first);
  assert.equal(result.proof.second.commit, second);
});

test("commit evidence rejects invalid SHA, oversized bodies and unavailable responses without exposing payloads", async () => {
  for (const response of [new Response("g".repeat(40)), new Response(main + "x".repeat(25)),
    new Response("synthetic-private-upstream-message", { status: 500 }), new Response(null)]) {
    await assert.rejects(inspectCurrentRollback({ artifactPath: "GOVERNANCE.md", artifactSha256: digest },
      async () => response), (error) => {
      assert.match(error.message, /GitHub commit evidence/);
      assert(!error.message.includes("synthetic-private-upstream-message"));
      return true;
    });
  }
});

test("commit evidence accepts a split uppercase SHA with a final newline", async () => {
  const fetcher = async (url) => {
    if (new URL(url).pathname.endsWith("/commits/main")) {
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode(main.slice(0, 20).toUpperCase()));
        controller.enqueue(new TextEncoder().encode(main.slice(20).toUpperCase() + "\n"));
        controller.close();
      } }));
    }
    return new Response(artifact);
  };
  assert.deepEqual(await inspectCurrentRollback({ artifactPath: "GOVERNANCE.md", artifactSha256: digest }, fetcher), {
    rolledBack: false, mainCommit: main,
  });
});

test("SHA resolution does not make a non-immutable release eligible", async () => {
  const publication = Date.now() - 8 * 86400000;
  const result = await inspectStableVersions({ firstTag: "v1", secondTag: "v2", integratedCommit: "a".repeat(40),
    integratedAt: 1, artifactPath: "GOVERNANCE.md", artifactSha256: digest, minimumVersionGapMs: 604800000 },
    async (url) => {
      const path = new URL(url).pathname, one = path.endsWith("v1");
      if (path.includes("/releases/")) return Response.json({ id: one ? 101 : 102, tag_name: one ? "v1" : "v2",
        draft: false, prerelease: false, immutable: !one,
        published_at: new Date(publication + (one ? 0 : 7 * 86400000)).toISOString() });
      if (path.includes("/commits/")) return new Response(one ? "b".repeat(40) : main);
      if (path.includes("/compare/")) return Response.json({ status: "ahead" });
      return new Response(artifact);
    });
  assert.equal(result.passed, false);
});

test("current-main file changes still report a rollback after SHA resolution", async () => {
  const result = await inspectCurrentRollback({ artifactPath: "GOVERNANCE.md", artifactSha256: digest },
    async (url) => new Response(new URL(url).pathname.endsWith("/commits/main") ? main : "changed artifact\n"));
  assert.deepEqual(result, { rolledBack: true, mainCommit: main });
});

test("version lineage and artifact integration request comparison metadata without the file-diff page", async () => {
  const publication = Date.now() - 8 * 86400000;
  const fetcher = async (url) => {
    const target = new URL(url), one = target.pathname.endsWith("v1");
    if (target.pathname.includes("/releases/")) return Response.json({ id: one ? 101 : 102,
      tag_name: one ? "v1" : "v2", draft: false, prerelease: false, immutable: true,
      published_at: new Date(publication + (one ? 0 : 7 * 86400000)).toISOString() });
    if (target.pathname.includes("/commits/")) return new Response(one ? "b".repeat(40) : main);
    if (target.pathname.includes("/compare/")) {
      assert.equal(target.searchParams.get("page"), "2", "Relationship checks must not download the first page's complete file diff");
      assert.equal(target.searchParams.get("per_page"), "1");
      return Response.json({ status: "ahead" });
    }
    return new Response(artifact);
  };
  const result = await inspectStableVersions({ firstTag: "v1", secondTag: "v2", integratedCommit: "a".repeat(40),
    integratedAt: publication - 1000, artifactPath: "GOVERNANCE.md", artifactSha256: digest,
    minimumVersionGapMs: 604800000 }, fetcher);
  assert.equal(result.passed, true);
});
