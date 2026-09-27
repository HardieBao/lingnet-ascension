import { verifyFileIntegration, type IntegrationCheck } from "./github-integration.ts";

const REPOSITORY = "HardieBao/lingnet-ascension";
const API = `https://api.github.com/repos/${REPOSITORY}`;
const shaPattern = /^[a-f0-9]{40}$/i;

export type CodeReviewSource = {
  kind: "github-pr";
  number: number;
  headSha: string;
  filePath: string;
  fileSha256: string;
};

export async function verifyCodeIntegration(
  source: CodeReviewSource,
  githubUserId: string,
  commit: string,
  fetcher: typeof fetch = fetch,
): Promise<IntegrationCheck> {
  if (source.kind !== "github-pr" || !Number.isSafeInteger(source.number) || source.number < 1 ||
      !shaPattern.test(source.headSha) || !shaPattern.test(commit) ||
      !/^[1-9]\d*$/.test(githubUserId) || !/^[a-f0-9]{64}$/i.test(source.fileSha256)) {
    return { passed: false, reason: "代码成果的 PR 证据无效" };
  }
  const response = await fetcher(`${API}/pulls/${source.number}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "LingNet-Ascension", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) return { passed: false, reason: "无法确认代码 PR 的合入状态" };
  const pr = await response.json() as {
    state?: string; merged_at?: string | null; merge_commit_sha?: string;
    user?: { id?: number }; head?: { sha?: string };
    base?: { ref?: string; repo?: { full_name?: string } };
  };
  if (pr.state !== "closed" || !pr.merged_at || pr.merge_commit_sha !== commit ||
      pr.user?.id !== Number(githubUserId) || pr.head?.sha !== source.headSha ||
      pr.base?.ref !== "main" || pr.base.repo?.full_name !== REPOSITORY) {
    return { passed: false, reason: "PR 未按已复核的提交合入 main" };
  }
  return verifyFileIntegration(source.filePath, commit, source.fileSha256, fetcher);
}
