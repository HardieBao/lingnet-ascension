import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactPathForMission, verifyMissionContent } from "../site/lib/verifier.ts";
import { parseRevalidationReport } from "../site/lib/revalidation-report.ts";

const CODE_PREFIXES = ["site/app/", "site/lib/", "site/db/", "site/public/"];
const BUILD_OUTPUT_DIRS = ["dist", ".vinext", ".next", ".wrangler", ".sites-runtime", "node_modules/.vite-temp"];

export function classifyChangedPaths(paths) {
  if (paths.length === 1 && /^revalidations\/[0-9a-f-]{36}\.json$/.test(paths[0])) return "revalidation-report";
  if (paths.length === 1 && paths[0] === "GOVERNANCE.md") return "charter";
  if (paths.length === 1 && paths[0] === "docs/WORLD_BRIEF.md") return "world-brief";
  if (paths.length === 1 && paths[0] === "docs/ARCHITECTURE_SPIKE.md") return "architecture-spike";
  if (paths.length === 1 && paths[0] === "docs/TOKEN_TERMS.md") return "token-terms";
  if (paths.length > 0 && paths.every((path) => CODE_PREFIXES.some((prefix) => path.startsWith(prefix)))) return "code-regression";
  return "unsupported";
}

function run(command, args, cwd, input) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (/(TOKEN|SECRET|PASSWORD|API_KEY)/i.test(name)) delete environment[name];
  }
  return execFileSync(command, args, { cwd, input, env: environment, stdio: input ? ["pipe", "inherit", "inherit"] : "inherit", maxBuffer: 8_000_000 });
}

export function verifyDocument(missionId, path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("成果必须是普通文件");
  const bytes = readFileSync(path);
  if (bytes.byteLength > 131072) throw new Error(`${missionId} 成果超过 128 KiB`);
  const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const verdict = verifyMissionContent(missionId, content);
  if (!verdict?.passed) throw new Error(`${missionId} 机器结构检查失败：` + (verdict?.checks.filter((check) => !check.passed).map((check) => check.name).join("、") ?? "无对应验证器"));
}

export function verifyCharter(path) { verifyDocument("GOV-001", path); }

export function buildCodeCheckArgs(trusted) {
  return [
    "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--user", "10001:10001",
    "--env", "HOME=/tmp", "--env", "npm_config_cache=/tmp/npm-cache",
    "--env", "LINGNET_CI_READONLY=1",
    "--env", "GIT_CONFIG_COUNT=1", "--env", "GIT_CONFIG_KEY_0=safe.directory",
    "--env", "GIT_CONFIG_VALUE_0=/work",
    "--mount", `type=bind,source=${trusted},target=/work,readonly`,
    "--tmpfs", "/tmp:rw,nosuid,nodev,mode=1777",
    ...BUILD_OUTPUT_DIRS.flatMap((directory) => ["--tmpfs", `/work/site/${directory}:rw,nosuid,nodev,mode=1777`]),
    "lingnet-trusted-ci", "sh", "-lc",
    "cd /work/site && npm test && npm run typecheck -- --incremental false && npm run lint && npm run build",
  ];
}

export function buildCodeTypegenArgs(trusted) {
  const args = buildCodeCheckArgs(trusted);
  args.splice(args.indexOf("lingnet-trusted-ci"), 0, "--mount",
    `type=bind,source=${join(trusted, "site", "next-env.d.ts")},target=/work/site/next-env.d.ts`);
  args[args.length - 1] = "cd /work/site && node node_modules/vinext/dist/cli.js typegen";
  return args;
}

export function prepareCodeCheck(trusted) {
  for (const directory of BUILD_OUTPUT_DIRS) mkdirSync(join(trusted, "site", directory), { recursive: true });
  const declaration = join(trusted, "site", "next-env.d.ts");
  if (!existsSync(declaration)) writeFileSync(declaration, "", { flag: "wx" });
  const stat = lstatSync(declaration);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("生成类型声明必须是普通文件");
  const mode = stat.mode & 0o777;
  chmodSync(declaration, 0o666);
  try { run("docker", buildCodeTypegenArgs(trusted), trusted); }
  finally { chmodSync(declaration, mode); }
}

export function verifyPullRequest(trustedPath, candidatePath, baseSha) {
  if (!/^[a-f0-9]{40}$/i.test(baseSha)) throw new Error("缺少可信基线 SHA");
  const trusted = resolve(trustedPath);
  const candidate = resolve(candidatePath);
  const names = execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", baseSha, "HEAD"], { cwd: candidate, maxBuffer: 8_000_000 });
  const paths = names.toString("utf8").split("\0").filter(Boolean);
  const scope = classifyChangedPaths(paths);
  if (scope === "unsupported") throw new Error("改动没有对应的可信验证器，不能自动判定通过：" + paths.join("、"));
  if (scope === "revalidation-report") {
    const path = join(candidate, paths[0]);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw new Error("复验报告类型或大小无效");
    const report = parseRevalidationReport(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path))));
    if (!report || paths[0] !== `revalidations/${report.submissionId}.json`) throw new Error("复验报告契约无效");
    console.log("报告结构路由通过；还必须通过专用复验流程与独立采纳，普通 CI 绿色不产生复验资格。");
    return;
  }
  if (scope === "charter" || scope === "world-brief" || scope === "architecture-spike" || scope === "token-terms") {
    const missionId = scope === "charter" ? "GOV-001" : scope === "world-brief" ? "GOV-002" : scope === "architecture-spike" ? "GOV-003" : "GOV-004T";
    verifyDocument(missionId, join(candidate, artifactPathForMission(missionId)));
    console.log(`${missionId} 结构检查通过；仍需维护者独立复核与合入核验。`);
    return;
  }

  const patch = execFileSync("git", ["diff", "--no-renames", "--binary", baseSha, "HEAD", "--", ...CODE_PREFIXES], { cwd: candidate, maxBuffer: 8_000_000 });
  run("git", ["apply", "--index", "-"], trusted, patch);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const site = join(trusted, "site");
  run(npm, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], site);
  run("docker", ["build", "--file", join(trusted, "ci", "Dockerfile"), "--tag", "lingnet-trusted-ci", join(trusted, "ci")], trusted);
  prepareCodeCheck(trusted);
  run("docker", buildCodeCheckArgs(trusted), trusted);
  console.log("主分支验证器上的回归检查通过；这不是任务专属验收或正式成果确认。");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    verifyPullRequest(process.argv[2], process.argv[3], process.argv[4]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
