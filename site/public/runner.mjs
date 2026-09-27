#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_URL = "https://github.com/HardieBao/lingnet-ascension.git";
const BASE_COMMIT = /^[a-f0-9]{40}$/i;
const MISSION_ID = /^[A-Z][A-Z0-9_-]{0,63}$/;
const MAX_ARTIFACT_BYTES = 131072;
const ARTIFACT_PATHS = new Map([
  ["GOV-001", "GOVERNANCE.md"],
  ["GOV-002", "docs/WORLD_BRIEF.md"],
  ["GOV-003", "docs/ARCHITECTURE_SPIKE.md"],
  ["GOV-004T", "docs/TOKEN_TERMS.md"],
]);

function isCodeArtifactPath(value) {
  return typeof value === "string" &&
    /^site\/(?:app|lib|db|public)\/[a-zA-Z0-9_./-]+\.(?:ts|tsx|js|mjs)$/.test(value) &&
    !value.split("/").some((segment) => segment === "." || segment === "..");
}

export function validateTaskPackage(taskPackage, now = Date.now()) {
  if (!taskPackage || typeof taskPackage !== "object" || !taskPackage.payload || typeof taskPackage.sha256 !== "string") {
    throw new Error("任务包格式无效");
  }
  const digest = createHash("sha256").update(JSON.stringify(taskPackage.payload)).digest("hex");
  if (digest !== taskPackage.sha256) throw new Error("任务包摘要不匹配，请重新下载");
  const { claim, repository, mission, model, equipment, schemaVersion } = taskPackage.payload;
  const documentPath = ARTIFACT_PATHS.get(mission?.id);
  const budgetSupported = schemaVersion === 2 ? model?.tokenBudget === null : [3, 4].includes(schemaVersion) &&
    model?.id === "gpt-5.6-sol" && model.tokenBudget === 30000 && model.maxOutputTokens === 2048 && model.budgetAccounting === "input+output";
  if (!budgetSupported || !claim || !repository || !mission || !model || !equipment ||
      typeof claim.id !== "string" || !/^[a-f0-9-]{36}$/i.test(claim.id) ||
      !Number.isSafeInteger(claim.expiresAt) || claim.expiresAt <= now ||
      repository.url !== REPOSITORY_URL || !BASE_COMMIT.test(repository.baseCommit) ||
      typeof mission.id !== "string" || !MISSION_ID.test(mission.id) ||
      !(documentPath ? mission.artifactPath === documentPath : isCodeArtifactPath(mission.artifactPath)) ||
      !Array.isArray(mission.allowedPaths) || mission.allowedPaths.length !== 1 ||
      mission.allowedPaths[0] !== mission.artifactPath ||
      typeof mission.title !== "string" || typeof mission.description !== "string" ||
      typeof mission.acceptance !== "string" || model.harness !== "codex-cli" ||
      typeof equipment.localPreflight !== "boolean") {
    throw new Error("任务包字段或运行范围不受当前 Runner 支持");
  }
  if (schemaVersion === 4 && (typeof taskPackage.payload.cultivatorId !== "string" ||
      !/^[a-zA-Z0-9_:.-]{1,160}$/.test(taskPackage.payload.cultivatorId) ||
      ![1, 2].includes(equipment.checkpointSlots) || typeof equipment.heartTalisman !== "boolean" ||
      ![1, 2].includes(equipment.presetSlots ?? 1))) {
    throw new Error("任务包字段或运行范围不受当前 Runner 支持");
  }
  return taskPackage.payload;
}

export function assertOnlyAllowedChanges(statusText, artifactPath = "GOVERNANCE.md") {
  const lines = statusText.split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1 || lines[0].slice(3) !== artifactPath || !/^(\?\?| M|M ) /.test(lines[0])) {
    throw new Error("模型修改了任务范围之外的文件，成果已留在临时工作区供检查");
  }
}

export function requireUsageConsent(payload, acknowledged) {
  if (![3, 4].includes(payload.schemaVersion)) throw new Error("本任务未设模型 Token 硬预算，旧版任务包只能离线预检；请释放后重新认领。");
  if (!acknowledged) throw new Error("模型费用由你承担；确认后追加 --ack-model-costs。总额度 30,000，单次输出最多 2,048；这不是现金价格上限。");
}

function normalizedCliUsage(usage) {
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || usage.input_tokens < 0 ||
      !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0 ||
      (usage.cached_input_tokens != null && (!Number.isSafeInteger(usage.cached_input_tokens) ||
        usage.cached_input_tokens < 0 || usage.cached_input_tokens > usage.input_tokens))) return null;
  return { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
    cached_input_tokens: usage.cached_input_tokens ?? null };
}

export function reportedCliUsage(output) {
  const completed = output.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { const event = JSON.parse(line); return event?.type === "turn.completed" ? [event] : []; }
    catch { return []; }
  });
  return completed.length === 1 ? normalizedCliUsage(completed[0].usage) : null;
}

export async function beginRunRecord(taskPackage, root = process.cwd(), profile = null) {
  const payload = validateTaskPackage(taskPackage);
  if (profile && (!/^[a-f0-9-]{36}$/i.test(profile.id) || !["none", "low", "medium", "high", "xhigh", "max"].includes(profile.reasoningEffort) ||
      !Number.isSafeInteger(profile.maxOutputTokens) || profile.maxOutputTokens < 1 || profile.maxOutputTokens > payload.model.maxOutputTokens)) {
    throw new Error("执行功法记录无效");
  }
  let directory = resolve(root);
  for (const name of [".lingnet", "runs"]) {
    directory = join(directory, name);
    await mkdir(directory, { mode: 0o700 }).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("运行记录目录无效，模型不会启动");
  }
  const record = { version: 1, id: randomUUID(), claimId: payload.claim.id, missionId: payload.mission.id,
    taskPackageSha256: taskPackage.sha256, baseCommit: payload.repository.baseCommit,
    harness: "codex-cli", model: payload.model.id ?? null, tokenBudget: payload.model.tokenBudget,
    maxOutputTokens: payload.model.maxOutputTokens ?? null, startedAt: Date.now() };
  if (profile) Object.assign(record, { presetId: profile.id, reasoningEffort: profile.reasoningEffort, requestOutputLimit: profile.maxOutputTokens });
  directory = join(directory, record.id);
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, "started.json"), JSON.stringify({ ...record, status: "model-running" }), { flag: "wx", mode: 0o600 });
  return Object.freeze({ directory, record: Object.freeze(record) });
}

export async function finishRunRecord(run, status, reportedUsage = null, budget = null) {
  if (!["model-completed", "model-failed"].includes(status)) throw new Error("运行终态无效");
  const usage = normalizedCliUsage(reportedUsage);
  const finished = { ...run.record, status, finishedAt: Date.now(), usage,
    usageSource: usage ? "codex-cli-reported" : "unknown", usageCoverage: usage ? "reported-turn-only" : "unknown",
    budget, budgetSource: budget ? "local-capped-gateway" : "unknown" };
  await writeFile(join(run.directory, "finished.json"), JSON.stringify(finished), { flag: "wx", mode: 0o600 });
  return finished;
}

export function preflightMissionContent(missionId, content) {
  let checks;
  if (missionId === "GOV-001") checks = [
    { name: "文件长度", passed: content.trim().length >= 300 && content.length <= 131072, detail: "章程正文应为 300 至 131072 个字符。" },
    { name: "产品边界", passed: /产品边界|项目边界/.test(content), detail: "说明灵网纪元首赛季的工作范围。" },
    { name: "三账本", passed: /Token/.test(content) && /修为/.test(content) && /功德/.test(content), detail: "分别定义 Token、修为和功德。" },
    { name: "治理责任", passed: /负责人|维护者/.test(content) && /复核|评审/.test(content), detail: "列出负责人和独立复核安排。" },
    { name: "停止条件", passed: /停止条件|暂停条件/.test(content), detail: "列出项目或赛季应暂停的情况。" },
    { name: "变更与签署", passed: /变更流程|决策记录/.test(content) && /签署|确认人/.test(content), detail: "说明变更流程并留下签署信息。" },
  ];
  else if (missionId === "GOV-002") checks = [
    { name: "文件长度", passed: content.trim().length >= 400 && content.length <= 12000, detail: "体验简报应为 400 至 12000 个字符。" },
    { name: "世界词汇", passed: ["万象天网", "修士", "本命法器", "宗门", "渡劫"].every((term) => content.includes(term)), detail: "解释主要修仙概念。" },
    { name: "真实任务映射", passed: /认领/.test(content) && /提交/.test(content) && /复核/.test(content) && /正式成果/.test(content), detail: "将修仙概念映射到任务状态。" },
    { name: "算力与游戏经济", passed: /算力/.test(content) && /游戏\s*Token/i.test(content) && /不可提现/.test(content) && /实际费用|真实费用|模型费用/.test(content), detail: "区分真实模型费用和不可提现的游戏 Token。" },
    { name: "体验语气", passed: /核心循环/.test(content) && /页面语气/.test(content) && /正例/.test(content) && /反例/.test(content), detail: "提供核心循环与页面语气的正反例。" },
    { name: "敏感表达", passed: /敏感表达/.test(content) && /清单/.test(content), detail: "列出应避免的表达。" },
    { name: "五人理解测试", passed: /(?:5|五)\s*名/.test(content) && /测试者/.test(content) && /反馈|结果/.test(content), detail: "记录五名测试者的理解结果，供维护者核实。" },
  ];
  else if (missionId === "GOV-003") {
    const score = content.match(/技术评分\s*[:：]\s*(\d{1,3})(?!\d)/);
    checks = [
      { name: "文件长度", passed: content.trim().length >= 800 && content.length <= 20000, detail: "尖峰报告应为 800 至 20000 个字符。" },
      { name: "基线与环境", passed: /固定基线/.test(content) && /\b[a-f0-9]{40}\b/i.test(content) && /执行环境/.test(content) && /执行时间/.test(content), detail: "记录完整基线提交、执行环境和时间。" },
      { name: "纵向流程", passed: ["认领", "Runner", "上传", "审判", "复核", "合入", "账本"].every((term) => content.includes(term)), detail: "逐步记录真实任务的完整流程。" },
      { name: "回归命令", passed: ["npm test", "npm run typecheck", "npm run lint", "npm run build"].every((term) => content.includes(term)), detail: "列出四项回归命令及其结果。" },
      { name: "可复核证据", passed: /证据/.test(content) && /命令输出/.test(content) && /CI/.test(content), detail: "给出可由维护者核对的命令输出与 CI 证据。" },
      { name: "架构图", passed: /架构图/.test(content) && /```mermaid/.test(content) && ["Runner", "D1", "R2", "GitHub"].every((term) => content.includes(term)), detail: "用架构图说明运行与数据边界。" },
      { name: "技术评分", passed: /方案\s*A/.test(content) && /方案\s*B/.test(content) && /权衡/.test(content) && !!score && Number(score[1]) >= 75 && Number(score[1]) <= 100, detail: "比较至少两种方案，所选方案评分为 75 至 100。" },
      { name: "ADR 与局限", passed: ["ADR", "选择", "风险", "回滚", "未验证"].every((term) => content.includes(term)), detail: "记录决策、风险、回滚与未验证事项。" },
      { name: "凭据边界", passed: ["密钥", "本机", "隔离", "模型 Token"].every((term) => content.includes(term)), detail: "说明凭据留在本机且模型用量不等于游戏 Token。" },
    ];
  }
  else if (missionId === "GOV-004T") checks = [
    { name: "文件长度", passed: content.trim().length >= 400 && content.length <= 12000, detail: "条款草案应为 400 至 12000 个字符。" },
    { name: "游戏与算力分离", passed: /游戏\s*Token/i.test(content) && /模型\s*Token|算力\s*Token/i.test(content) && /模型费用|实际费用|真实费用/.test(content), detail: "分别说明游戏 Token 与真实模型用量。" },
    { name: "非金融边界", passed: ["不可充值", "不可提现", "不可交易", "不可转赠"].every((term) => content.includes(term)) && /不等于现金|不是现金/.test(content), detail: "列出充值、提现、交易、转赠与现金边界。" },
    { name: "费用责任", passed: /用户/.test(content) && /自行承担|自己承担/.test(content) && /模型费用|实际费用/.test(content), detail: "说明真实模型费用由用户承担。" },
    { name: "游戏消费与退款", passed: /装备/.test(content) && /押金/.test(content) && /退款|退还/.test(content), detail: "解释装备消费、任务押金与退款。" },
    { name: "贡献公平", passed: /功德/.test(content) && /验收|审判/.test(content) && /不能购买|不得购买|不可购买/.test(content), detail: "说明付费不能购买验收通过或功德。" },
    { name: "承诺与治理", passed: /无收益承诺|不承诺收益/.test(content) && /争议|申诉/.test(content) && /变更/.test(content), detail: "说明收益承诺、争议处理和条款变更。" },
  ];
  else throw new Error("当前 Runner 不支持此任务的本地预检");
  return { passed: checks.every((check) => check.passed), checks };
}

async function preflightFile(payload, artifactPath) {
  const stat = await lstat(artifactPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > MAX_ARTIFACT_BYTES) {
    throw new Error("成果不是有效的 Markdown 文件，或超过 128 KiB");
  }
  const verdict = preflightMissionContent(payload.mission.id, await readFile(artifactPath, "utf8"));
  for (const check of verdict.checks) console.log(`${check.passed ? "通过" : "未通过"} · ${check.name}：${check.detail}`);
  console.log("本地预检只帮助提前修订，服务端审判和维护者复核仍独立进行。");
  return verdict.passed;
}

export async function runPreflight(taskPackagePath, artifactPath) {
  const taskPackage = JSON.parse(await readFile(taskPackagePath, "utf8"));
  const payload = validateTaskPackage(taskPackage);
  if (isCodeArtifactPath(payload.mission.artifactPath)) {
    throw new Error("代码任务的完整验证由 GitHub 可信 CI 执行；请提交 PR 并等待检查通过");
  }
  if (!await preflightFile(payload, artifactPath)) throw new Error("本地预检未通过，请修改成果后重试");
}

function commandAvailable(invocation) {
  if (!invocation) return false;
  const result = spawnSync(invocation.command, [...invocation.args, "--version"], {
    encoding: "utf8", windowsHide: true,
  });
  return result.status === 0;
}

export function doctor() {
  const checks = [
    { name: "Node.js", passed: Number(process.versions.node.split(".")[0]) >= 22, fix: "安装 Node.js 22 或更新版本" },
    { name: "Git", passed: commandAvailable({ command: "git", args: [] }), fix: "安装 Git 并加入 PATH" },
    { name: "Docker 隔离镜像", passed: spawnSync("docker", ["image", "inspect", "lingnet-runner:codex-0.156.1"], { stdio: "ignore", windowsHide: true }).status === 0,
      fix: "启动 Docker，并运行 docker build -f runner.Dockerfile -t lingnet-runner:codex-0.156.1 ." },
  ];
  for (const check of checks) console.log(`${check.passed ? "通过" : "失败"} · ${check.name}${check.passed ? "" : `：${check.fix}`}`);
  console.log("提示 · 模型密钥只供本机可信网关使用，不交给模型容器或上传平台；新版任务需同目录的 runner-sandbox.mjs、runner-workspace.mjs、budget-gateway.mjs、runner-checkpoints.mjs、runner-presets.mjs。");
  return checks.every((check) => check.passed);
}

function sanitizedEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (/(API_KEY|ACCESS_TOKEN|SECRET|PASSWORD)/i.test(name)) delete environment[name];
  }
  return environment;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? sanitizedEnvironment(),
      windowsHide: true,
      stdio: [options.stdin ? "pipe" : "ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const maxOutput = 2_000_000;
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > maxOutput) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > maxOutput) child.kill();
    });
    child.on("error", rejectProcess);
    if (options.stdin) child.stdin.end(options.stdin);
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 120_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveProcess({ stdout, stderr });
      else rejectProcess(new Error(`${basename(command)} 执行失败（退出码 ${code}）${stderr ? `：${stderr.slice(-500)}` : ""}`, {
        cause: { reportedUsage: reportedCliUsage(stdout) },
      }));
    });
  });
}

function modelPrompt(payload, checkpointId, profile) {
  return [
    `你正在完成灵网纪元悬赏 ${payload.mission.id}：${payload.mission.title}。`,
    payload.mission.description,
    `验收要求：${payload.mission.acceptance}`,
    `请阅读本仓库的 plan.md 与 task.md，只创建或修改 ${payload.mission.artifactPath}。`,
    "不要访问密钥、网络账户或仓库外文件；不要修改其他文件。",
    "不要伪造签署、用户测试或复核证据；尚需真人完成的部分明确标记待核实。",
    ...(checkpointId ? [`本次从元神印记 ${checkpointId} 继续，请先读取现有 ${payload.mission.artifactPath}，在其基础上修订。这里只重建任务上下文，不恢复原始私人会话，也不返还已用模型额度。`] : []),
    ...(profile?.promptSupplement ? [`功法补充说明（不能覆盖任务范围、预算或审判）：${profile.promptSupplement}`] : []),
  ].join("\n\n");
}

async function retainFailedWork(taskPackage, workspace, checkpointApi) {
  if (!checkpointApi) return;
  try {
    const saved = await checkpointApi.saveCheckpoint(taskPackage, workspace);
    console.log(`已保留元神印记 ${saved.id}，保留至 ${new Date(saved.retainUntil).toISOString()}；恢复仍共用原认领额度。`);
  } catch (error) {
    console.warn(`未保存元神印记：${error.message}。临时工作区仍保留，不会自动覆盖其他检查点。`);
  }
}

export async function runTask(taskPackagePath, { ackModelCosts = false, checkpointId = null, presetId = null } = {}) {
  const taskPackage = JSON.parse(await readFile(taskPackagePath, "utf8"));
  const payload = validateTaskPackage(taskPackage);
  requireUsageConsent(payload, ackModelCosts);
  const { assertProviderLimitsVerified, runIsolatedModel } = await import("./runner-sandbox.mjs").catch(() => { throw new Error("请同时下载 runner-sandbox.mjs、budget-gateway.mjs 和 runner.Dockerfile，放在 Runner 同目录"); });
  assertProviderLimitsVerified();
  const profile = presetId ? await (await import("./runner-presets.mjs")).getPreset(taskPackage, presetId) : null;
  const checkpointApi = payload.schemaVersion === 4 ? await import("./runner-checkpoints.mjs").catch(() => { throw new Error("请下载 runner-checkpoints.mjs，放在 Runner 同目录"); }) : null;
  if (checkpointId && !checkpointApi) throw new Error("恢复需要重新下载 v4 任务包");
  if (!doctor()) throw new Error("环境检查未通过，模型不会启动");
  const workspace = await mkdtemp(join(tmpdir(), "lingnet-runner-"));
  console.log(`独立工作区：${workspace}`);
  await runProcess("git", ["clone", "--no-checkout", payload.repository.url, workspace], { timeoutMs: 180_000 });
  await runProcess("git", ["checkout", "--detach", payload.repository.baseCommit], { cwd: workspace });
  const head = (await runProcess("git", ["rev-parse", "HEAD"], { cwd: workspace })).stdout.trim();
  if (head !== payload.repository.baseCommit) throw new Error("固定基线校验失败");
  if (checkpointId) {
    await checkpointApi.restoreCheckpoint(taskPackage, checkpointId, workspace);
    console.log("限定产物已恢复；模型将重新建立上下文，不恢复私人会话或增加额度。");
  }

  console.log("基线已校验，准备本机模型运行记录……");
  const run = await beginRunRecord(taskPackage, process.cwd(), profile);
  console.log(`本机运行记录：${run.directory}`);
  let result;
  try {
    result = await runIsolatedModel({ ...payload, ...(profile ? { executionProfile: profile } : {}) }, workspace, modelPrompt(payload, checkpointId, profile));
  } catch (error) {
    // Persist only validated numeric usage, never the process error or raw stream.
    await finishRunRecord(run, error.cause?.modelCompleted ? "model-completed" : "model-failed", error.cause?.reportedUsage ?? null, error.cause?.budget ?? null);
    if (!error.cause?.artifactRejected) await retainFailedWork(taskPackage, workspace, checkpointApi);
    throw error;
  }
  const usage = reportedCliUsage(result.stdout);
  await finishRunRecord(run, "model-completed", usage, result.budget);
  const status = (await runProcess("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: workspace })).stdout;
  assertOnlyAllowedChanges(status, payload.mission.artifactPath);
  const artifact = join(workspace, payload.mission.artifactPath);
  const stat = await lstat(artifact);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > MAX_ARTIFACT_BYTES) {
    throw new Error("成果不是有效的单文件交付物，或超过 128 KiB");
  }
  const output = resolve(process.cwd(), `${payload.mission.id}-${basename(payload.mission.artifactPath)}`);
  await copyFile(artifact, output, constants.COPYFILE_EXCL);
  console.log(`成果已保存：${output}`);
  if (usage) console.log(`本机模型报告用量：输入 ${usage.input_tokens}，输出 ${usage.output_tokens}；仅为已报告回合，不是费用账单或游戏 Token。`);
  else console.log("本机模型用量：未知；这不是游戏 Token。");
  if (payload.equipment.localPreflight) {
    console.log("演算阵盘已装备，正在执行本地预检……");
    if (!await preflightFile(payload, output)) {
      await retainFailedWork(taskPackage, workspace, checkpointApi);
      throw new Error("演算阵盘预检未通过；成果已保留，请修改后运行 preflight 命令");
    }
  }
  if (isCodeArtifactPath(payload.mission.artifactPath)) {
    console.log(`请把成果提交为目标仓库的单文件 PR（路径 ${payload.mission.artifactPath}），等待可信 CI 通过后在任务页面填写 PR 编号。Runner 不决定奖励。`);
  } else {
    console.log("请回到任务页面上传 Markdown。服务端会独立复验，Runner 不决定奖励。");
  }
  return output;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  // Run after module initialization so the checkpoint module can import the shared validators.
  setImmediate(async () => {
  try {
    const [, , action, taskPackagePath, option, consent] = process.argv;
    if (action === "doctor") process.exitCode = doctor() ? 0 : 1;
    else if (action === "run" && taskPackagePath && (!option || option === "--ack-model-costs") && process.argv.length <= 5) {
      await runTask(taskPackagePath, { ackModelCosts: option === "--ack-model-costs" });
    }
    else if (action === "run" && taskPackagePath && option === "--preset" && consent && process.argv[6] === "--ack-model-costs" && process.argv.length === 7) {
      await runTask(taskPackagePath, { ackModelCosts: true, presetId: consent });
    }
    else if (action === "resume" && taskPackagePath && option && consent === "--ack-model-costs" && process.argv.length === 6) {
      await runTask(taskPackagePath, { ackModelCosts: true, checkpointId: option });
    }
    else if (action === "resume" && taskPackagePath && option && consent === "--preset" && process.argv[6] && process.argv[7] === "--ack-model-costs" && process.argv.length === 8) {
      await runTask(taskPackagePath, { ackModelCosts: true, checkpointId: option, presetId: process.argv[6] });
    }
    else if (action === "presets" && taskPackagePath && process.argv.length === 4) {
      const { listPresets } = await import("./runner-presets.mjs");
      console.log(JSON.stringify(await listPresets(JSON.parse(await readFile(taskPackagePath, "utf8")))));
    }
    else if (action === "preset-save" && taskPackagePath && option && process.argv.length === 5) {
      const { savePreset } = await import("./runner-presets.mjs");
      let definition;
      try { definition = JSON.parse(await readFile(option, "utf8")); } catch { throw new Error("功法配置文件无效，不回显内容"); }
      console.log(JSON.stringify(await savePreset(JSON.parse(await readFile(taskPackagePath, "utf8")), definition)));
    }
    else if (action === "preset-discard" && taskPackagePath && option && process.argv.length === 5) {
      const { discardPreset } = await import("./runner-presets.mjs");
      console.log(JSON.stringify(await discardPreset(JSON.parse(await readFile(taskPackagePath, "utf8")), option)));
    }
    else if (action === "checkpoints" && taskPackagePath && process.argv.length === 4) {
      const { listCheckpoints } = await import("./runner-checkpoints.mjs");
      console.log(JSON.stringify(await listCheckpoints(JSON.parse(await readFile(taskPackagePath, "utf8")))));
    }
    else if (action === "checkpoint-save" && taskPackagePath && option && process.argv.length === 5) {
      const { saveCheckpoint } = await import("./runner-checkpoints.mjs");
      console.log(JSON.stringify(await saveCheckpoint(JSON.parse(await readFile(taskPackagePath, "utf8")), resolve(option), { status: "model-completed" })));
    }
    else if (action === "checkpoint-discard" && taskPackagePath && option && process.argv.length === 5) {
      const { discardCheckpoint } = await import("./runner-checkpoints.mjs");
      console.log(JSON.stringify(await discardCheckpoint(JSON.parse(await readFile(taskPackagePath, "utf8")), option)));
      console.log("已丢弃指定缓存副本，原工作区未删除。");
    }
    else if (action === "preflight" && taskPackagePath && option && process.argv.length === 5) {
      await runPreflight(taskPackagePath, option);
    }
    else {
      console.error("用法：doctor | run <任务包.json> [--preset <功法编号>] --ack-model-costs | resume <任务包.json> <检查点编号> [--preset <功法编号>] --ack-model-costs | checkpoints <任务包.json> | checkpoint-save <任务包.json> <工作区> | checkpoint-discard <任务包.json> <检查点编号> | presets <任务包.json> | preset-save <任务包.json> <配置.json> | preset-discard <任务包.json> <功法编号> | preflight <任务包.json> <成果.md>");
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
  });
}
