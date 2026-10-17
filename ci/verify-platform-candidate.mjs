import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCodeCheckArgs, buildCodeTypegenArgs } from "./verify-pr.mjs";

// Separate review proposal: does not modify the required pull-request verifier or task acceptance.
const SOURCE = ["site/app/", "site/lib/", "site/db/", "site/public/"];
const MIGRATION_BLOBS = {
  "site/drizzle/0017_cultivator_profiles.sql": "5fe907c6f9ade4793c7a33e3706c1e82e095e6a0",
  "site/drizzle/0018_community.sql": "e1feaca9a1851595d47af67b2781b2d06718910a",
  "site/drizzle/0019_model_usage.sql": "1d4c9c91567d9e1234643665dc5316a97ee0280a",
  "site/drizzle/meta/0017_snapshot.json": "c47d3a96343dc19207fb3ae30a4b90adbd269e30",
  "site/drizzle/meta/0018_snapshot.json": "50848e48219d6fed8cbbb7914538699715f5218b",
  "site/drizzle/meta/0019_snapshot.json": "afe1231f493b7bc694f943ecabb4e21cac7e3520",
  "site/drizzle/meta/_journal.json": "f3923ccd7577621b2e661cddc9e1f9236912e914",
};
export function platformCandidateScope(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 512) return "unsupported";
  return paths.every((path) => {
    if (typeof path !== "string" || /[\\\0\r\n]/.test(path) || path.split("/").some((part) => !part || part.startsWith("."))) return false;
    if (SOURCE.some((prefix) => path.startsWith(prefix))) return /\.(?:ts|tsx|js|mjs|css|svg|txt|md|json)$/.test(path);
    return /^site\/tests\/(?:[A-Za-z0-9_-]+\.test\.mjs|fixtures\/[A-Za-z0-9_./-]+\.(?:mjs|sql|md|json))$/.test(path) ||
      /^site\/scripts\/(?:(?:verify|manual)-[A-Za-z0-9_-]+\.mjs|serve-game-demo\.mjs|fixtures\/[A-Za-z0-9_-]+\.mjs)$/.test(path) ||
      Object.hasOwn(MIGRATION_BLOBS, path);
  }) ? "platform-candidate" : "unsupported";
}

function git(path, args, input) {
  return execFileSync("git", args, { cwd: path, input, maxBuffer: 16 * 1024 * 1024 });
}
function run(command, args, cwd) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) if (/(TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)/i.test(name)) delete environment[name];
  execFileSync(command, args, { cwd, env: environment, stdio: "inherit" });
}

export function verifyPlatformCandidate(trustedPath, candidatePath, baseSha, headSha) {
  if (![baseSha, headSha].every((sha) => typeof sha === "string" && /^[a-f0-9]{40}$/i.test(sha))) throw new Error("需固定完整基线和候选提交");
  const trusted = resolve(trustedPath), candidate = resolve(candidatePath);
  if (trusted === candidate) throw new Error("可信基线和候选须使用两个自有隔离副本");
  if (git(trusted, ["rev-parse", "HEAD"]).toString().trim() !== baseSha || git(candidate, ["rev-parse", "HEAD"]).toString().trim() !== headSha) throw new Error("审阅提交已变化");
  if (git(trusted, ["status", "--porcelain"]).toString().trim() || git(candidate, ["status", "--porcelain"]).toString().trim()) throw new Error("审阅副本须无未记录文件或改动");
  git(candidate, ["merge-base", "--is-ancestor", baseSha, headSha]);
  const paths = git(candidate, ["diff", "--no-renames", "--name-only", "-z", baseSha, headSha]).toString().split("\0").filter(Boolean);
  if (platformCandidateScope(paths) !== "platform-candidate") throw new Error("平台候选包含受保护规则或未支持路径");
  for (const path of paths) {
    const entry = git(candidate, ["ls-tree", headSha, "--", path]).toString();
    if (!entry || !/^100(?:644|755) blob /.test(entry)) throw new Error("平台候选不允许删除、链接或特殊文件");
    if (Object.hasOwn(MIGRATION_BLOBS, path) && entry.trim().split(/\s+/)[2] !== MIGRATION_BLOBS[path]) {
      throw new Error("迁移内容不匹配固定审阅版本：" + path);
    }
    const stat = lstatSync(join(candidate, path));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) throw new Error("平台候选文件类型或大小无效");
  }
  if (process.platform !== "linux") throw new Error("完整平台隔离审计需在Linux CI运行；当前环境未执行安装或容器");
  const patch = git(candidate, ["diff", "--no-renames", "--binary", baseSha, headSha, "--", "site"]);
  git(trusted, ["apply", "--index", "-"], patch);
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], join(trusted, "site"));
  const image = `lingnet-platform-ci-${baseSha.slice(0, 12)}-${headSha.slice(0, 12)}`;
  run("docker", ["build", "--file", join(trusted, "ci", "Dockerfile"), "--tag", image, join(trusted, "ci")], trusted);
  const limits = ["--cpus", "2", "--memory", "3g", "--pids-limit", "512"];
  for (const directory of ["dist", ".vinext", ".next", ".wrangler", ".sites-runtime", "node_modules/.vite-temp"]) {
    mkdirSync(join(trusted, "site", directory), { recursive: true });
  }
  const declaration = join(trusted, "site", "next-env.d.ts");
  if (!existsSync(declaration)) writeFileSync(declaration, "", { flag: "wx" });
  const declarationStat = lstatSync(declaration);
  if (!declarationStat.isFile() || declarationStat.isSymbolicLink()) throw new Error("生成类型声明必须是普通文件");
  const mode = declarationStat.mode & 0o777;
  const typeArgs = buildCodeTypegenArgs(trusted).map(value => value === "lingnet-trusted-ci" ? image : value);
  typeArgs.splice(typeArgs.indexOf(image), 0, ...limits);
  chmodSync(declaration, 0o666);
  try { run("docker", typeArgs, trusted); }
  finally { chmodSync(declaration, mode); }
  const args = buildCodeCheckArgs(trusted).map(value => value === "lingnet-trusted-ci" ? image : value);
  args.splice(args.indexOf(image), 0, ...limits);
  const policy = dirname(fileURLToPath(import.meta.url));
  args.splice(args.indexOf(image), 0,
    "--mount", `type=bind,source=${policy},target=/policy/ci,readonly`,
    "--mount", `type=bind,source=${resolve(policy, "../site/tests/fixtures")},target=/policy/site/tests/fixtures,readonly`);
  args[args.length - 1] += " && node /policy/ci/check-full-platform.mjs /work/site";
  run("docker", args, trusted);
  console.log(`PROPOSED_PLATFORM_AUDIT=passed base=${baseSha} head=${headSha} releaseApproved=false; independent approval and existing required checks still apply`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { verifyPlatformCandidate(process.argv[2], process.argv[3], process.argv[4], process.argv[5]); }
  catch (error) { console.error(error instanceof Error ? error.message : "平台候选核对失败"); process.exitCode = 1; }
}
