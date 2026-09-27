import { verifyFileIntegration } from "./github-integration.ts";
import { parseRevalidationReport, type RevalidationReport } from "./revalidation-report.ts";

const REPOSITORY = "HardieBao/lingnet-ascension";
const API = `https://api.github.com/repos/${REPOSITORY}`;
const headers = { Accept: "application/vnd.github+json", "User-Agent": "LingNet-Ascension", "X-GitHub-Api-Version": "2026-03-10" };
type Target = Pick<RevalidationReport, "submissionId" | "missionId" | "artifactPath" | "integratedCommit" | "artifactSha256">;
type Check = { passed: false; reason: string } | { passed: true; report: RevalidationReport;
  headSha: string; runId: number; runAttempt: number; outcome: "passed" | "failed" };

async function json(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(15_000) });
  return response.ok ? response.json() : null;
}

export async function inspectRevalidationPullRequest(
  number: number, runId: number, githubUserId: string, expected: Target, fetcher: typeof fetch = fetch,
): Promise<Check> {
  if (!Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(runId) || runId < 1 || !/^[1-9]\d*$/.test(githubUserId)) {
    return { passed: false, reason: "复验 PR、运行编号或身份无效" };
  }
  const pull = await json(`${API}/pulls/${number}`, fetcher) as {
    state?: string; draft?: boolean; mergeable?: boolean; changed_files?: number; merge_commit_sha?: string; user?: { id?: number };
    base?: { ref?: string; sha?: string; repo?: { full_name?: string } }; head?: { sha?: string; repo?: { full_name?: string } };
  } | null;
  const headSha = pull?.head?.sha, baseSha = pull?.base?.sha, sourceRepo = pull?.head?.repo?.full_name;
  if (!pull || pull.state !== "open" || pull.draft || pull.mergeable !== true || pull.changed_files !== 1 ||
      String(pull.user?.id) !== githubUserId || pull.base?.ref !== "main" || pull.base.repo?.full_name !== REPOSITORY ||
      !headSha || !/^[a-f0-9]{40}$/i.test(headSha) || !baseSha || !/^[a-f0-9]{40}$/i.test(baseSha) ||
      !sourceRepo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(sourceRepo)) return { passed: false, reason: "复验 PR 身份、状态或目标分支不符合契约" };
  const path = `revalidations/${expected.submissionId}.json`;
  const comparisonUrl = `${API}/compare/${baseSha}...${headSha}`;
  const comparison = await json(`${comparisonUrl}?per_page=1`, fetcher) as {
    url?: string; status?: string; base_commit?: { sha?: string }; merge_base_commit?: { sha?: string };
    files?: Array<{ filename?: string; status?: string; sha?: string }>;
  } | null;
  if (comparison?.url !== comparisonUrl || comparison.status !== "ahead" ||
      comparison.base_commit?.sha !== baseSha || comparison.merge_base_commit?.sha !== baseSha) {
    return { passed: false, reason: "复验报告不基于本次固定验证器基线" };
  }
  const files = comparison.files;
  if (!Array.isArray(files) || files.length !== 1 || files[0].filename !== path || !["added", "modified"].includes(files[0].status ?? "") || !files[0].sha) {
    return { passed: false, reason: "复验 PR 修改了报告之外的文件" };
  }
  const file = await json(`https://api.github.com/repos/${sourceRepo}/contents/${path}?ref=${headSha}`, fetcher) as {
    type?: string; encoding?: string; content?: string; size?: number; sha?: string; target?: string; submodule_git_url?: string;
  } | null;
  if (!file || file.type !== "file" || file.target || file.submodule_git_url || file.encoding !== "base64" ||
      !Number.isSafeInteger(file.size) || (file.size as number) < 1 || (file.size as number) > 16384 ||
      typeof file.content !== "string" || file.content.length > 24000 || file.sha !== files[0].sha) return { passed: false, reason: "复验报告类型、大小或版本无效" };
  let report: RevalidationReport | null;
  try {
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, "")), (character) => character.charCodeAt(0));
    if (bytes.length !== file.size) return { passed: false, reason: "复验报告长度不一致" };
    report = parseRevalidationReport(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch { return { passed: false, reason: "复验报告编码或结构无效" }; }
  if (!report || report.submissionId !== expected.submissionId || report.missionId !== expected.missionId ||
      report.artifactPath !== expected.artifactPath || report.integratedCommit !== expected.integratedCommit.toLowerCase() ||
      report.artifactSha256 !== expected.artifactSha256.toLowerCase() || report.validatorBaseCommit !== baseSha.toLowerCase() ||
      report.reporterGitHubId !== githubUserId) return { passed: false, reason: "报告未绑定本次正式成果、摘要、验证器基线与复验人" };
  const run = await json(`${API}/actions/runs/${runId}`, fetcher) as {
    id?: number; name?: string; path?: string; event?: string; status?: string; conclusion?: string; head_sha?: string;
    actor?: { id?: number }; run_attempt?: number; display_title?: string;
  } | null;
  if (!run || run.id !== runId || run.name !== "LingNet independent revalidation" ||
      run.path?.split("@")[0] !== ".github/workflows/revalidation.yml" || run.event !== "pull_request" ||
      run.status !== "completed" || run.conclusion !== "success" || String(run.actor?.id) !== githubUserId ||
      run.display_title !== `LingNet revalidation #${number}` || typeof run.head_sha !== "string" || !/^[a-f0-9]{40}$/i.test(run.head_sha) ||
      ![headSha, pull.merge_commit_sha].includes(run.head_sha) ||
      !Number.isSafeInteger(run.run_attempt) || (run.run_attempt as number) < 1) return { passed: false, reason: "缺少当前报告的专用可信复验运行" };
  const jobs = await json(`${API}/actions/runs/${runId}/jobs?filter=latest&per_page=100`, fetcher) as {
    jobs?: Array<{ name?: string; status?: string; conclusion?: string; run_attempt?: number;
      steps?: Array<{ name?: string; status?: string; conclusion?: string }> }>;
  } | null;
  const job = jobs?.jobs?.find((item) => item.name === "Revalidate integrated result" && item.run_attempt === run.run_attempt &&
    item.status === "completed" && item.conclusion === "success");
  const completed = job?.steps?.filter((step) => ["Replay passed", "Replay failed"].includes(step.name ?? "") &&
    step.status === "completed" && step.conclusion === "success") ?? [];
  if (completed.length !== 1) return { passed: false, reason: "运行缺少唯一的可信复跑结果，普通 CI 不算复验" };
  const integration = await verifyFileIntegration(report.artifactPath, report.integratedCommit, report.artifactSha256, fetcher);
  if (!integration.passed) return integration;
  return { passed: true, report, headSha, runId, runAttempt: run.run_attempt as number,
    outcome: completed[0].name === "Replay passed" ? "passed" : "failed" };
}
