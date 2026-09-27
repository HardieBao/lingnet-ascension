import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { artifactPathForMission, matchesArtifactUploadName, verifyGov001, verifyGov002, verifyGov003, verifyGov004T, verifyMissionContent } from "../lib/verifier.ts";

const validCharter = await readFile(new URL("./fixtures/gov001-charter.md", import.meta.url), "utf8");
const validWorldBrief = await readFile(new URL("./fixtures/gov002-world-brief.md", import.meta.url), "utf8");
const validArchitectureSpike = await readFile(new URL("./fixtures/gov003-architecture-spike.md", import.meta.url), "utf8");
const validTokenTerms = await readFile(new URL("./fixtures/gov004t-token-terms.md", import.meta.url), "utf8");

test("GOV-001 accepts a complete charter for human review", () => {
  const result = verifyGov001(validCharter);
  assert.equal(result.passed, true);
  assert.ok(result.checks.every((check) => check.passed));
});

test("GOV-001 rejects a short document with no stop conditions", () => {
  const result = verifyGov001("# 产品章程\nToken、修为、功德。");
  assert.equal(result.passed, false);
  assert.ok(result.checks.some((check) => check.name === "停止条件" && !check.passed));
  assert.ok(result.checks.some((check) => check.name === "文件长度" && !check.passed));
});

test("GOV-001 requires all three resources and a signature", () => {
  const incomplete = validCharter.replaceAll("功德", "信誉").replaceAll("签署", "记录");
  const result = verifyGov001(incomplete);
  assert.equal(result.passed, false);
  assert.ok(result.checks.some((check) => check.name === "三账本" && !check.passed));
  assert.ok(result.checks.some((check) => check.name === "变更与签署" && !check.passed));
});

test("GOV-002 has its own artifact path and structural verifier", () => {
  assert.equal(artifactPathForMission("GOV-002"), "docs/WORLD_BRIEF.md");
  assert.equal(verifyGov002(validWorldBrief).passed, true);
  assert.equal(verifyMissionContent("GOV-002", validWorldBrief)?.passed, true);
});

test("GOV-002 rejects missing economic distinction and five-person evidence", () => {
  const incomplete = validWorldBrief.replaceAll("游戏 Token", "积分").replaceAll("5 名", "若干").replaceAll("五名", "若干");
  const verdict = verifyGov002(incomplete);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.checks.some((check) => check.name === "算力与游戏经济" && !check.passed));
  assert.ok(verdict.checks.some((check) => check.name === "五人理解测试" && !check.passed));
  assert.equal(verifyMissionContent("UNKNOWN", validWorldBrief), null);
});

test("GOV-003 requires a distinct architecture report for independent review", () => {
  assert.equal(artifactPathForMission("GOV-003"), "docs/ARCHITECTURE_SPIKE.md");
  assert.equal(verifyGov003(validArchitectureSpike).passed, true);
  assert.equal(verifyMissionContent("GOV-003", validArchitectureSpike)?.passed, true);
  const lowScore = verifyGov003(validArchitectureSpike.replace("技术评分：82", "技术评分：74"));
  assert.equal(lowScore.passed, false);
  assert.ok(lowScore.checks.some((check) => check.name === "技术评分" && !check.passed));
  const noEvidence = verifyGov003(validArchitectureSpike.replaceAll("CI", "自动化"));
  assert.ok(noEvidence.checks.some((check) => check.name === "可复核证据" && !check.passed));
});

test("GOV-004T accepts a distinct Token terms draft for human review", () => {
  assert.equal(artifactPathForMission("GOV-004T"), "docs/TOKEN_TERMS.md");
  assert.equal(verifyGov004T(validTokenTerms).passed, true);
  assert.equal(verifyMissionContent("GOV-004T", validTokenTerms)?.passed, true);
});

test("GOV-004T rejects missing nonfinancial or model-cost boundaries", () => {
  const incomplete = validTokenTerms.replaceAll("不可提现", "可提现").replaceAll("用户自行承担", "平台承担");
  const verdict = verifyGov004T(incomplete);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.checks.some((check) => check.name === "非金融边界" && !check.passed));
  assert.ok(verdict.checks.some((check) => check.name === "费用责任" && !check.passed));
});

test("uploads accept the Runner filename or the repository filename, never another task's file", () => {
  assert.equal(matchesArtifactUploadName("GOV-001", "GOV-001-GOVERNANCE.md"), true);
  assert.equal(matchesArtifactUploadName("GOV-001", "GOVERNANCE.md"), true);
  assert.equal(matchesArtifactUploadName("GOV-002", "GOV-002-WORLD_BRIEF.md"), true);
  assert.equal(matchesArtifactUploadName("GOV-002", "WORLD_BRIEF.md"), true);
  assert.equal(matchesArtifactUploadName("GOV-003", "GOV-003-ARCHITECTURE_SPIKE.md"), true);
  assert.equal(matchesArtifactUploadName("GOV-003", "ARCHITECTURE_SPIKE.md"), true);
  assert.equal(matchesArtifactUploadName("GOV-004T", "GOV-004T-TOKEN_TERMS.md"), true);
  assert.equal(matchesArtifactUploadName("GOV-004T", "TOKEN_TERMS.md"), true);
  assert.equal(matchesArtifactUploadName("GOV-002", "GOVERNANCE.md"), false);
  assert.equal(matchesArtifactUploadName("GOV-003", "GOV-003-WORLD_BRIEF.md"), false);
});
