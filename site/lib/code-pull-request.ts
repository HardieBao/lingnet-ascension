const REPOSITORY = "HardieBao/lingnet-ascension";
const API = `https://api.github.com/repos/${REPOSITORY}`;
const MAX_SOURCE_BYTES = 131072;
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "LingNet-Ascension",
  "X-GitHub-Api-Version": "2022-11-28",
};

type SourceCheck = { passed: false; reason: string; quarantine?: { fileSha256: string; issues: string[] } } | {
  passed: true;
  number: number;
  url: string;
  headSha: string;
  filePath: string;
  fileSha256: string;
  ciRunId: number;
  ciRunAttempt: number;
  testMergeSha: string;
};

const shaPattern = /^[a-f0-9]{40}$/i;

export async function inspectCodePullRequest(
  number: number,
  githubUserId: string,
  baseCommit: string,
  filePath: string,
  fetcher: typeof fetch = fetch,
): Promise<SourceCheck> {
  if (!Number.isSafeInteger(number) || number < 1 || !/^[1-9]\d*$/.test(githubUserId) ||
      !shaPattern.test(baseCommit) || !/^site\/(?:app|lib|db|public)\/[a-zA-Z0-9_./-]+$/.test(filePath) ||
      filePath.split("/").includes("..")) {
    return { passed: false, reason: "代码任务或 PR 参数无效" };
  }

  const pull = await fetcher(`${API}/pulls/${number}`, { headers });
  if (!pull.ok) return { passed: false, reason: "无法读取目标仓库的 PR" };
  const pr = await pull.json() as {
    state?: string; draft?: boolean; changed_files?: number; mergeable?: boolean;
    merge_commit_sha?: string; user?: { id?: number };
    base?: { ref?: string; repo?: { full_name?: string } };
    head?: { sha?: string; repo?: { full_name?: string } };
  };
  const headSha = pr.head?.sha;
  const mergeSha = pr.merge_commit_sha;
  const sourceRepo = pr.head?.repo?.full_name;
  if (pr.state !== "open" || pr.draft || pr.user?.id !== Number(githubUserId) ||
      pr.base?.ref !== "main" || pr.base.repo?.full_name !== REPOSITORY ||
      pr.changed_files !== 1 || pr.mergeable !== true || !mergeSha || !shaPattern.test(mergeSha) ||
      !headSha || !shaPattern.test(headSha) ||
      !sourceRepo || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(sourceRepo)) {
    return { passed: false, reason: "PR 作者、目标分支或单文件范围不符合任务" };
  }

  const comparisonUrl = `${API}/compare/${baseCommit}...${headSha}`;
  const comparison = await fetcher(`${comparisonUrl}?per_page=1`, { headers });
  if (!comparison.ok) return { passed: false, reason: "无法核对任务固定基线" };
  const ancestry = await comparison.json() as {
    url?: string; status?: string; base_commit?: { sha?: string }; merge_base_commit?: { sha?: string };
    files?: Array<{ filename?: string; status?: string; sha?: string }>;
  };
  if (ancestry.url !== comparisonUrl || ancestry.status !== "ahead" ||
      ancestry.base_commit?.sha !== baseCommit || ancestry.merge_base_commit?.sha !== baseCommit) {
    return { passed: false, reason: "PR 提交不基于认领时锁定的基线" };
  }

  const files = ancestry.files;
  if (!Array.isArray(files) || files.length !== 1 || files[0].filename !== filePath ||
      !["added", "modified"].includes(files[0].status ?? "") || !files[0].sha || !shaPattern.test(files[0].sha)) {
    return { passed: false, reason: "PR 修改了任务允许范围以外的文件" };
  }

  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const source = await fetcher(`https://api.github.com/repos/${sourceRepo}/contents/${encodedPath}?ref=${headSha}`, {
    headers: { ...headers, Accept: "application/vnd.github.object+json" },
  });
  if (!source.ok) return { passed: false, reason: "无法读取 PR 提交中的任务文件" };
  const file = await source.json() as {
    type?: string; encoding?: string; content?: string; size?: number; sha?: string;
    target?: string; submodule_git_url?: string;
  };
  const size = file.size;
  if (file.type !== "file" || file.target || file.submodule_git_url || file.encoding !== "base64" ||
      typeof file.content !== "string" || typeof size !== "number" || !Number.isSafeInteger(size) ||
      size < 1 || size > MAX_SOURCE_BYTES || file.sha !== files[0].sha) {
    return { passed: false, reason: "PR 文件类型、大小或版本无效" };
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const binary = atob(file.content.replace(/\s/g, ""));
    bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  } catch {
    return { passed: false, reason: "PR 文件编码无效" };
  }
  if (bytes.byteLength !== size) return { passed: false, reason: "PR 文件长度不一致" };
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  const fileSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let content: string;
  try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return { passed: false, reason: "PR 代码文件必须使用 UTF-8 编码" }; }
  const issues = artifactSafetyIssues(content);
  if (issues.length) return { passed: false, reason: "PR 文件包含疑似敏感凭据，需要独立复核", quarantine: { fileSha256, issues } };

  const checks = await fetcher(`${API}/actions/workflows/trusted-baseline.yml/runs?event=pull_request&head_sha=${headSha}&per_page=30`, { headers });
  if (!checks.ok) return { passed: false, reason: "无法核对可信 CI 结果" };
  const runs = await checks.json() as { workflow_runs?: Array<{
    id?: number; name?: string; path?: string; event?: string; head_sha?: string;
    status?: string; conclusion?: string; run_attempt?: number;
  }> };
  const latest = runs.workflow_runs?.filter((run) =>
    run.head_sha === headSha && run.event === "pull_request" &&
    run.name === "Trusted baseline gate" &&
    run.path?.split("@")[0] === ".github/workflows/trusted-baseline.yml")
    .sort((first, second) => (second.id ?? 0) - (first.id ?? 0))[0];
  if (!latest || !Number.isSafeInteger(latest.id) || latest.status !== "completed" || latest.conclusion !== "success" ||
      !Number.isSafeInteger(latest.run_attempt) || latest.run_attempt! < 1) {
    return { passed: false, reason: "当前 PR 的可信 CI 尚未通过" };
  }
  const jobsResponse = await fetcher(`${API}/actions/runs/${latest.id}/attempts/${latest.run_attempt}/jobs?per_page=100`, { headers });
  if (!jobsResponse.ok) return { passed: false, reason: "无法核对可信 CI 的本次验证记录" };
  const jobs = await jobsResponse.json() as { jobs?: Array<{
    name?: string; head_sha?: string; status?: string; conclusion?: string; run_attempt?: number;
    steps?: Array<{ name?: string; status?: string; conclusion?: string }>;
  }> };
  const marker = `Verified ${headSha} on merge ${mergeSha}`;
  const verified = jobs.jobs?.find((job) => job.name === "pull-request" && job.head_sha === headSha &&
    job.run_attempt === latest.run_attempt && job.status === "completed" && job.conclusion === "success" &&
    job.steps?.some((step) => step.name === marker && step.status === "completed" && step.conclusion === "success"));
  if (!verified) return { passed: false, reason: "可信 CI 没有验证当前头提交与测试合并版本，请重新运行当前版本检查" };
  return {
    passed: true,
    number,
    url: `https://github.com/${REPOSITORY}/pull/${number}`,
    headSha,
    filePath,
    fileSha256,
    ciRunId: latest.id!,
    ciRunAttempt: latest.run_attempt!,
    testMergeSha: mergeSha,
  };
}
import { artifactSafetyIssues } from "./artifact-safety.ts";
