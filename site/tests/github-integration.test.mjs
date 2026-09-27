import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyMissionIntegration } from "../lib/github-integration.ts";

const commit = "a".repeat(40);
const content = "已签署的章程\n";
const digest = createHash("sha256").update(content).digest("hex");

test("integration requires an ancestor of main with byte-identical artifact", async () => {
  const requests = [];
  const fetcher = async (url) => {
    requests.push(url);
    return requests.length === 1
      ? Response.json({ status: "ahead" })
      : new Response(content);
  };
  assert.deepEqual(await verifyMissionIntegration("GOV-001", commit, digest, fetcher), { passed: true });
  assert.match(requests[0], /compare\/a{40}\.\.\.main/);
  assert.match(requests[1], /contents\/GOVERNANCE\.md\?ref=a{40}/);
});

test("unmerged and altered artifacts never pass", async () => {
  const unmerged = async () => Response.json({ status: "diverged" });
  assert.deepEqual(await verifyMissionIntegration("GOV-001", commit, digest, unmerged), {
    passed: false, reason: "该提交尚未进入 main 分支",
  });
  let calls = 0;
  const changed = async () => ++calls === 1 ? Response.json({ status: "identical" }) : new Response("其他内容");
  assert.deepEqual(await verifyMissionIntegration("GOV-001", commit, digest, changed), {
    passed: false, reason: "合入文件与已审查成果的摘要不一致",
  });
});

test("oversized GitHub content is rejected before hashing", async () => {
  let calls = 0;
  const fetcher = async () => ++calls === 1
    ? Response.json({ status: "ahead" })
    : new Response(new Uint8Array(131073));
  assert.deepEqual(await verifyMissionIntegration("GOV-001", commit, digest, fetcher), {
    passed: false, reason: "合入文件超过 128 KiB",
  });
});

test("GOV-002 integration checks the distinct nested artifact", async () => {
  const requests = [];
  const fetcher = async (url) => {
    requests.push(url);
    return requests.length === 1 ? Response.json({ status: "ahead" }) : new Response(content);
  };
  assert.deepEqual(await verifyMissionIntegration("GOV-002", commit, digest, fetcher), { passed: true });
  assert.match(requests[1], /contents\/docs\/WORLD_BRIEF\.md\?ref=a{40}/);
  assert.equal((await verifyMissionIntegration("GOV-005", commit, digest, fetcher)).passed, false);
});

test("GOV-003 integration checks the architecture report, not another task file", async () => {
  const requests = [];
  const fetcher = async (url) => {
    requests.push(url);
    return requests.length === 1 ? Response.json({ status: "ahead" }) : new Response(content);
  };
  assert.deepEqual(await verifyMissionIntegration("GOV-003", commit, digest, fetcher), { passed: true });
  assert.match(requests[1], /contents\/docs\/ARCHITECTURE_SPIKE\.md\?ref=a{40}/);
});

test("GOV-004T integration checks its own nested artifact", async () => {
  const requests = [];
  const fetcher = async (url) => {
    requests.push(url);
    return requests.length === 1 ? Response.json({ status: "ahead" }) : new Response(content);
  };
  assert.deepEqual(await verifyMissionIntegration("GOV-004T", commit, digest, fetcher), { passed: true });
  assert.match(requests[1], /contents\/docs\/TOKEN_TERMS\.md\?ref=a{40}/);
});
