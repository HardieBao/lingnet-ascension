import { verifyFileIntegration } from "./github-integration.ts";

const API = "https://api.github.com/repos/HardieBao/lingnet-ascension";
const HEADERS = { Accept: "application/vnd.github+json", "User-Agent": "LingNet-Ascension" };
const TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SHA = /^[a-f0-9]{40}$/i;

export type StableVersion = { releaseId: number; tag: string; commit: string; publishedAt: number };
export type StableVersionProof = { first: StableVersion; second: StableVersion };
type Result = { passed: true; proof: StableVersionProof } | { passed: false; reason: string };

async function boundedJson(url: string, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  const response = await fetcher(url, { headers: HEADERS });
  if (!response.ok || !response.body) throw new Error("GitHub evidence unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) { await reader.cancel(); throw new Error("GitHub evidence too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid GitHub evidence");
  return value as Record<string, unknown>;
}

async function release(tag: string, fetcher: typeof fetch): Promise<StableVersion | null> {
  const published = await boundedJson(`${API}/releases/tags/${encodeURIComponent(tag)}`, fetcher);
  const publishedAt = typeof published.published_at === "string" ? Date.parse(published.published_at) : NaN;
  if (published.tag_name !== tag || published.draft !== false || published.prerelease !== false || published.immutable !== true ||
      !Number.isSafeInteger(published.id) || (published.id as number) < 1 || !Number.isFinite(publishedAt)) return null;
  const commit = await boundedJson(`${API}/commits/${encodeURIComponent(tag)}`, fetcher);
  if (typeof commit.sha !== "string" || !SHA.test(commit.sha)) return null;
  return { releaseId: published.id as number, tag, commit: commit.sha.toLowerCase(), publishedAt };
}

async function isDescendant(earlier: string, later: string, fetcher: typeof fetch): Promise<boolean> {
  const comparison = await boundedJson(`${API}/compare/${earlier}...${later}`, fetcher);
  return comparison.status === "ahead" || comparison.status === "identical";
}

export async function inspectStableVersions(input: {
  firstTag: string; secondTag: string; integratedCommit: string; integratedAt: number;
  artifactPath: string; artifactSha256: string; minimumVersionGapMs: number;
}, fetcher: typeof fetch = fetch): Promise<Result> {
  if (!TAG.test(input.firstTag) || !TAG.test(input.secondTag) || input.firstTag === input.secondTag ||
      !SHA.test(input.integratedCommit) || !/^[a-f0-9]{64}$/i.test(input.artifactSha256) ||
      input.minimumVersionGapMs !== 604800000) return { passed: false, reason: "版本或成果契约无效" };
  const first = await release(input.firstTag, fetcher);
  const second = await release(input.secondTag, fetcher);
  const now = Date.now();
  if (!first || !second || first.releaseId === second.releaseId || first.commit === second.commit ||
      first.publishedAt < input.integratedAt || second.publishedAt > now ||
      second.publishedAt - first.publishedAt < input.minimumVersionGapMs) {
    return { passed: false, reason: "需要两个相隔至少七天的正式公开版本" };
  }
  if (!await isDescendant(input.integratedCommit, first.commit, fetcher) ||
      !await isDescendant(first.commit, second.commit, fetcher)) {
    return { passed: false, reason: "公开版本没有按正式成果顺序演进" };
  }
  for (const version of [first, second]) {
    const check = await verifyFileIntegration(input.artifactPath, version.commit, input.artifactSha256, fetcher);
    if (!check.passed) return { passed: false, reason: "公开版本中的成果摘要不一致或已回滚" };
  }
  const current = await boundedJson(`${API}/commits/main`, fetcher);
  if (typeof current.sha !== "string" || !SHA.test(current.sha)) throw new Error("Current main commit unavailable");
  const currentCheck = await verifyFileIntegration(input.artifactPath, current.sha, input.artifactSha256, fetcher);
  if (!currentCheck.passed) return { passed: false, reason: "当前主分支成果已变化或回滚" };
  return { passed: true, proof: { first, second } };
}

export async function inspectCurrentRollback(input: {
  artifactPath: string; artifactSha256: string;
}, fetcher: typeof fetch = fetch): Promise<{ rolledBack: boolean; mainCommit: string }> {
  if (!/^[a-f0-9]{64}$/i.test(input.artifactSha256) ||
      !/^[A-Za-z0-9_./-]+$/.test(input.artifactPath) || input.artifactPath.startsWith("/") ||
      input.artifactPath.split("/").includes("..")) throw new Error("Invalid settlement evidence");
  const current = await boundedJson(`${API}/commits/main`, fetcher);
  if (typeof current.sha !== "string" || !SHA.test(current.sha)) throw new Error("Current main commit unavailable");
  const mainCommit = current.sha.toLowerCase();
  const path = input.artifactPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetcher(`${API}/contents/${path}?ref=${mainCommit}`, {
    headers: { ...HEADERS, Accept: "application/vnd.github.raw+json" },
  });
  if (response.status === 404) return { rolledBack: true, mainCommit };
  if (!response.ok || !response.body) throw new Error("Current main artifact unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 131072) { await reader.cancel(); return { rolledBack: true, mainCommit }; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const digest = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { rolledBack: digest !== input.artifactSha256.toLowerCase(), mainCommit };
}
