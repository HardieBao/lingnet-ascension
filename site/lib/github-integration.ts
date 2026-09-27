import { artifactPathForMission } from "./verifier.ts";

const REPOSITORY_API = "https://api.github.com/repos/HardieBao/lingnet-ascension";
const MAX_ARTIFACT_BYTES = 131072;

export type IntegrationCheck = { passed: true } | { passed: false; reason: string };

export async function verifyMissionIntegration(
  missionId: string,
  commit: string,
  artifactSha256: string,
  fetcher: typeof fetch = fetch,
): Promise<IntegrationCheck> {
  const artifactPath = artifactPathForMission(missionId);
  if (!artifactPath) return { passed: false, reason: "提交或成果摘要格式无效" };
  return verifyFileIntegration(artifactPath, commit, artifactSha256, fetcher);
}

export async function verifyFileIntegration(
  artifactPath: string,
  commit: string,
  artifactSha256: string,
  fetcher: typeof fetch = fetch,
): Promise<IntegrationCheck> {
  if (!/^[a-zA-Z0-9_./-]+$/.test(artifactPath) || artifactPath.startsWith("/") ||
      artifactPath.split("/").includes("..") || !/^[a-f0-9]{40}$/i.test(commit) ||
      !/^[a-f0-9]{64}$/i.test(artifactSha256)) {
    return { passed: false, reason: "提交或成果摘要格式无效" };
  }
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "LingNet-Ascension" };
  const compare = await fetcher(`${REPOSITORY_API}/compare/${commit}...main?per_page=1`, { headers });
  if (!compare.ok) return { passed: false, reason: "无法确认提交是否已合入主分支" };
  const relationship = await compare.json() as { status?: string };
  if (relationship.status !== "ahead" && relationship.status !== "identical") {
    return { passed: false, reason: "该提交尚未进入 main 分支" };
  }

  const encodedPath = artifactPath.split("/").map(encodeURIComponent).join("/");
  const file = await fetcher(`${REPOSITORY_API}/contents/${encodedPath}?ref=${commit}`, {
    headers: { ...headers, Accept: "application/vnd.github.raw+json" },
  });
  if (!file.ok || !file.body) return { passed: false, reason: "合入提交中找不到任务成果文件" };
  const reader = file.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_ARTIFACT_BYTES) {
      await reader.cancel();
      return { passed: false, reason: "合入文件超过 128 KiB" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return actual === artifactSha256
    ? { passed: true }
    : { passed: false, reason: "合入文件与已审查成果的摘要不一致" };
}
