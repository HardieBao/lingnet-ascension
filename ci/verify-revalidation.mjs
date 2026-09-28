import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRevalidationReport } from "../site/lib/revalidation-report.ts";
import { buildCodeCheckArgs, prepareCodeCheck, verifyDocument } from "./verify-pr.mjs";

function run(command, args, cwd, capture = false) {
  const environment = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };
  for (const name of Object.keys(environment)) if (/(TOKEN|SECRET|PASSWORD|API_KEY)/i.test(name)) delete environment[name];
  return execFileSync(command, args, { cwd, env: environment, encoding: capture ? "utf8" : undefined,
    stdio: capture ? "pipe" : "inherit", maxBuffer: 8_000_000, timeout: 15 * 60_000,
    shell: process.platform === "win32" && command === "npm.cmd" });
}

export function verifyRevalidationPullRequest(trustedPath, candidatePath, baseSha, reporterGitHubId) {
  if (!/^[a-f0-9]{40}$/i.test(baseSha)) throw new Error("缺少可信验证器基线");
  const trusted = resolve(trustedPath), candidate = resolve(candidatePath);
  const paths = run("git", ["diff", "--no-renames", "--name-only", "-z", baseSha, "HEAD"], candidate, true).split("\0").filter(Boolean);
  if (paths.length !== 1 || !/^revalidations\/[0-9a-f-]{36}\.json$/.test(paths[0])) throw new Error("复验 PR 只能添加或修改一份指定 JSON 报告");
  const reportPath = join(candidate, paths[0]);
  const stat = lstatSync(reportPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384 || realpathSync(reportPath) !== resolve(reportPath)) throw new Error("复验报告类型、路径或大小无效");
  const report = parseRevalidationReport(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(reportPath))));
  if (!report || paths[0] !== `revalidations/${report.submissionId}.json` ||
      report.validatorBaseCommit !== baseSha.toLowerCase() || report.reporterGitHubId !== reporterGitHubId) throw new Error("报告与验证器基线、提交编号或复验人不一致");
  run("git", ["merge-base", "--is-ancestor", report.integratedCommit, baseSha], trusted);
  const temporary = mkdtempSync(join(tmpdir(), "lingnet-revalidation-"));
  try {
    const target = join(temporary, "target");
    run("git", ["-c", "core.autocrlf=false", "clone", "--quiet", "--no-hardlinks", "--no-checkout", trusted, target], temporary);
    run("git", ["-c", "core.autocrlf=false", "-c", "core.hooksPath=" + join(temporary, "no-hooks"), "checkout", "--quiet", "--detach", report.integratedCommit], target);
    const artifactPath = join(target, report.artifactPath);
    const artifactStat = lstatSync(artifactPath);
    if (!artifactStat.isFile() || artifactStat.isSymbolicLink() || artifactStat.size > 131072 || realpathSync(artifactPath) !== resolve(artifactPath)) throw new Error("原成果路径或类型无效");
    if (createHash("sha256").update(readFileSync(artifactPath)).digest("hex") !== report.artifactSha256) throw new Error("原成果摘要与报告不一致");
    if (report.kind === "document") {
      try { verifyDocument(report.missionId, artifactPath); return "passed"; }
      catch { return "failed"; }
    }
    const site = join(target, "site");
    run(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], site);
    run("docker", ["build", "--file", join(trusted, "ci", "Dockerfile"), "--tag", "lingnet-trusted-ci", join(trusted, "ci")], trusted);
    prepareCodeCheck(target);
    try { run("docker", buildCodeCheckArgs(target), target); return "passed"; }
    catch (error) { if (Number.isInteger(error.status) && error.status > 0 && error.status < 125) return "failed"; throw error; }
  } finally {
    const target = realpathSync(temporary);
    if (!target.startsWith(realpathSync(tmpdir()) + sep) || !basename(target).startsWith("lingnet-revalidation-")) throw new Error("临时复验路径超出范围，保留文件");
    rmSync(target, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const outcome = verifyRevalidationPullRequest(process.argv[2], process.argv[3], process.argv[4], process.argv[5]);
    console.log(`revalidation_result=${outcome}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `revalidation_result=${outcome}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
