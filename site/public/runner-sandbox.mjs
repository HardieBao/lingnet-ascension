import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { reportedCliUsage } from "./runner.mjs";

const execute = promisify(execFile), image = "lingnet-runner:codex-0.156.1";
const gatewayScript = fileURLToPath(new URL("./budget-gateway.mjs", import.meta.url));
const workspaceScript = fileURLToPath(new URL("./runner-workspace.mjs", import.meta.url));
const runnerScript = fileURLToPath(new URL("./runner.mjs", import.meta.url));
async function docker(args) {
  const { stdout } = await execute("docker", args, { windowsHide: true, timeout: 30_000, maxBuffer: 2_000_000 });
  return stdout.trim();
}
async function plainFile(path, maximumBytes) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumBytes) throw new Error("本机私密配置路径无效");
}
function numericBudget(value, payload) {
  if (value?.model !== payload.model.id || value.tokenBudget !== payload.model.tokenBudget ||
      ![value.remaining, value.knownSpent, value.reserved].every((number) => Number.isSafeInteger(number) && number >= 0) ||
      value.remaining + value.knownSpent + value.reserved !== payload.model.tokenBudget || typeof value.halted !== "boolean") {
    throw new Error("预算回执无效");
  }
  return { model: value.model, tokenBudget: value.tokenBudget, remaining: value.remaining,
    knownSpent: value.knownSpent, reserved: value.reserved, halted: value.halted };
}
async function attachModel(name, args, prompt, timeoutMs) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("docker", ["exec", "--interactive", name, ...args], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", bytes = 0;
    const read = (chunk, capture) => {
      bytes += chunk.length;
      if (capture) stdout += chunk;
      if (bytes > 2_000_000) child.kill();
    };
    child.stdout.on("data", (chunk) => read(chunk, true));
    child.stderr.on("data", (chunk) => read(chunk, false));
    child.on("error", rejectRun);
    const timer = setTimeout(() => child.kill(), timeoutMs + 10_000);
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && bytes <= 2_000_000) resolveRun(stdout);
      else rejectRun(new Error("隔离模型未完成，额度不会自动重置；请核对本机运行记录。"));
    });
  });
}

export function assertProviderLimitsVerified() {
  if (process.env.LINGNET_PROVIDER_LIMITS_VERIFIED !== "1") {
    throw new Error("代理限额契约尚未核验，真实模型调用默认关闭；请先核实准确输入计数、输出上限和推理用量的约束，不能仅凭计数接口可用就打开。");
  }
}
export async function runIsolatedModel(payload, workspace, prompt, root = process.cwd()) {
  assertProviderLimitsVerified();
  const profile = payload.executionProfile;
  if (profile && (!["none", "low", "medium", "high", "xhigh", "max"].includes(profile.reasoningEffort) ||
      !Number.isSafeInteger(profile.maxOutputTokens) || profile.maxOutputTokens < 1 || profile.maxOutputTokens > payload.model.maxOutputTokens)) {
    throw new Error("执行功法不能覆盖允许档位或任务输出上限");
  }
  const baseUrl = process.env.LINGNET_MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL;
  const key = process.env.LINGNET_MODEL_API_KEY ?? process.env.OPENAI_API_KEY;
  const base = new URL(baseUrl);
  if (!key || [key, baseUrl].some((value) => /[\r\n\0]/.test(value)) || base.username || base.password || base.search || base.hash ||
      !(base.protocol === "https:" || base.protocol === "http:" && base.hostname === "127.0.0.1")) {
    throw new Error("请在本机私密环境配置模型地址与密钥；不要发到聊天或上传平台。");
  }
  await plainFile(gatewayScript, 131072);
  await plainFile(workspaceScript, 131072);
  await plainFile(runnerScript, 131072);
  let state = resolve(root);
  for (const name of [".lingnet", "budgets", payload.claim.id]) {
    state = join(state, name);
    await mkdir(state, { mode: 0o700 }).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(state);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("预算目录无效，模型不会启动");
  }
  const ownerLockPath = join(state, "runner.lock"), ownerLock = await open(ownerLockPath, "wx", 0o600);
  const suffix = randomUUID(), network = `lingnet-run-${suffix}`, gateway = `${network}-gateway`, model = `${network}-model`;
  const credentials = join(state, `credentials-${suffix}.env`), relay = randomBytes(32).toString("hex"), control = randomBytes(32).toString("hex");
  const owned = new Set(), label = `lingnet.run=${suffix}`;
  let url, budget = null, stdout, failure, artifactRejected = false, modelInitialized = false, credentialsWritten = false, networkCreated = false;
  const ownerRequest = (path, method = "GET") => fetch(`${url}/control/${path}`, { method,
    headers: { Authorization: `Bearer ${control}` }, signal: AbortSignal.timeout(2000) });
  async function removeOwned(name) {
    if (!owned.has(name)) return;
    const info = JSON.parse(await docker(["inspect", name]))[0];
    if (info.Config.Labels["lingnet.run"] !== suffix) throw new Error("隔离容器归属不符，停止清理");
    await docker(["rm", "--force", name]);
    owned.delete(name);
  }
  try {
    const identity = JSON.stringify({ claimId: payload.claim.id, missionId: payload.mission.id, repository: payload.repository, model: payload.model });
    const identityPath = join(state, "contract.json");
    try { await writeFile(identityPath, identity, { flag: "wx", mode: 0o600 }); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      await plainFile(identityPath, 4096);
      if (await readFile(identityPath, "utf8") !== identity) throw new Error("同一认领的预算契约发生变化，拒绝重置");
    }
    const timeoutMs = Math.min(30 * 60_000, payload.claim.expiresAt - Date.now());
    if (timeoutMs <= 0) throw new Error("认领已过期");
    await writeFile(credentials, [`LINGNET_MODEL_BASE_URL=${baseUrl}`, `LINGNET_MODEL_API_KEY=${key}`,
      `LINGNET_MODEL=${payload.model.id}`, `LINGNET_RELAY_TOKEN=${relay}`, `LINGNET_CONTROL_TOKEN=${control}`,
      `LINGNET_TOKEN_BUDGET=${payload.model.tokenBudget}`, `LINGNET_MAX_OUTPUT_TOKENS=${profile?.maxOutputTokens ?? payload.model.maxOutputTokens}`,
      `LINGNET_CLAIM_EXPIRES_AT=${payload.claim.expiresAt}`, "LINGNET_BUDGET_STATE_PATH=/state/budget.json", "LINGNET_GATEWAY_HOST=0.0.0.0"].join("\n"),
    { flag: "wx", mode: 0o600 });
    credentialsWritten = true;
    await docker(["network", "create", "--internal", "--label", label, network]);
    networkCreated = true;
    const protections = ["--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "1000:1000",
      "--memory", "512m", "--cpus", "1", "--pids-limit", "64", "--tmpfs", "/tmp:rw,nosuid,nodev,mode=1777"];
    await docker(["create", "--name", gateway, "--label", label, "--network", "bridge", "--publish", "127.0.0.1::8787", ...protections,
      "--env-file", credentials, "--mount", `type=bind,source=${gatewayScript},target=/gateway/budget-gateway.mjs,readonly`,
      "--mount", `type=bind,source=${state},target=/state`, image, "node", "/gateway/budget-gateway.mjs"]);
    owned.add(gateway);
    await docker(["network", "connect", "--alias", "gateway", network, gateway]);
    await docker(["start", gateway]);
    const gatewayInfo = JSON.parse(await docker(["inspect", gateway]))[0];
    url = `http://127.0.0.1:${gatewayInfo.NetworkSettings.Ports["8787/tcp"][0].HostPort}`;
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await ownerRequest("status").catch(() => null);
      if (response?.ok) { budget = numericBudget(await response.json(), payload); ready = true; break; }
      await response?.body?.cancel();
      if (gatewayInfo.State.Status === "exited") break;
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!ready) throw new Error("可信网关未启动；预算锁、私密配置或上次不确定用量需要核对。不会回退为直连模型。");
    if (budget.halted || budget.remaining === 0) throw new Error("本次认领额度已耗尽或待核对，不会重新发放额度");
    await docker(["create", "--name", model, "--label", label, "--network", network, ...protections,
      "--memory-swap", "512m", "--log-driver", "none",
      "--env", "GIT_CONFIG_COUNT=1", "--env", "GIT_CONFIG_KEY_0=safe.directory", "--env", "GIT_CONFIG_VALUE_0=/workspace",
      "--env", `LINGNET_RELAY_TOKEN=${relay}`, "--tmpfs", "/home/node/.codex:rw,nosuid,nodev,noexec,size=16m,uid=1000,gid=1000,mode=0700",
      "--tmpfs", "/workspace:rw,nosuid,nodev,noexec,size=64m,uid=1000,gid=1000,mode=0700",
      "--mount", `type=bind,source=${workspace},target=/baseline,readonly`,
      "--mount", `type=bind,source=${join(workspace, ".git")},target=/workspace/.git,readonly`,
      "--mount", `type=bind,source=${workspaceScript},target=/runner/runner-workspace.mjs,readonly`,
      "--mount", `type=bind,source=${runnerScript},target=/runner/runner.mjs,readonly`,
      image, "sleep", "infinity"]);
    owned.add(model);
    await docker(["start", model]);
    await docker(["exec", model, "node", "/runner/runner-workspace.mjs", "init"]);
    modelInitialized = true;
    stdout = await attachModel(model, ["timeout", "--signal=KILL", `${Math.ceil(timeoutMs / 1000)}s`, "codex", "exec", "--ephemeral", "--json", "--ignore-user-config",
      // The bypass is only INSIDE this externally isolated container, never on the host.
      "--dangerously-bypass-approvals-and-sandbox", "--model", payload.model.id, "-c", 'model_provider="lingnet"',
      ...(profile ? ["-c", `model_reasoning_effort=${JSON.stringify(profile.reasoningEffort)}`] : []),
      "-c", 'model_providers.lingnet.name="Lingnet capped gateway"', "-c", 'model_providers.lingnet.base_url="http://gateway:8787/v1"',
      "-c", 'model_providers.lingnet.env_key="LINGNET_RELAY_TOKEN"', "-c", 'model_providers.lingnet.wire_api="responses"',
      "-c", "model_providers.lingnet.request_max_retries=0", "-c", "model_providers.lingnet.stream_max_retries=0", "-c", 'web_search="disabled"', "-"], prompt, timeoutMs);
  } catch (error) { failure = error; }
  finally {
    if (modelInitialized) {
      try {
        await docker(["network", "disconnect", network, model]);
        const artifact = JSON.parse(await docker(["exec", model, "node", "/runner/runner-workspace.mjs", "export", payload.mission.artifactPath, payload.repository.baseCommit]));
        const bytes = Buffer.from(artifact.base64 ?? "", "base64");
        if (artifact.path !== payload.mission.artifactPath || bytes.length < 1 || bytes.length > 131072 ||
            bytes.toString("base64") !== artifact.base64 || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw new Error("隔离成果回执无效");
        let parent = workspace;
        for (const name of payload.mission.artifactPath.split("/").slice(0, -1)) {
          parent = join(parent, name);
          await mkdir(parent).catch((error) => { if (error.code !== "EEXIST") throw error; });
          const stat = await lstat(parent);
          if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("本机成果目录不允许链接");
        }
        const path = join(parent, payload.mission.artifactPath.split("/").at(-1));
        const existing = await lstat(path).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
        if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error("本机成果不能覆盖链接或目录");
        await writeFile(path, bytes);
      } catch { artifactRejected = true; failure ??= new Error("隔离成果未通过检查或无法导出，不保存检查点，也不补模型额度。"); }
    }
    // Stop model first, then capture and durably close the gateway before deleting only owned containers.
    try {
      await removeOwned(model);
      if (url) {
        const response = await ownerRequest("status");
        if (!response.ok) throw new Error("预算回执暂不可用");
        budget = numericBudget(await response.json(), payload);
        const stopped = await ownerRequest("stop", "POST");
        if (!stopped.ok) throw new Error("预算未能持久化，保留锁供核对");
        await stopped.text();
        if (await docker(["wait", gateway]) !== "0") throw new Error("网关未正常关闭，保留预算锁");
      }
    } catch { failure ??= new Error("隔离运行结束但预算未能确认，请人工核对；额度不会自动重置。"); }
    try {
      await removeOwned(gateway);
      if (networkCreated) {
        const info = JSON.parse(await docker(["network", "inspect", network]))[0];
        if (info.Labels["lingnet.run"] !== suffix) throw new Error("隔离网络归属不符");
        await docker(["network", "rm", network]);
      }
      if (credentialsWritten) await unlink(credentials);
      await ownerLock.close();
      await unlink(ownerLockPath);
    } catch { failure ??= new Error("本次隔离资源未完全回收，请检查带本次运行标签的资源；未执行广泛清理。"); }
  }
  if (failure) throw new Error(failure instanceof Error && !failure.message.includes(key) ? failure.message : "隔离运行失败，凭据不会输出。",
    { cause: { budget, artifactRejected, modelCompleted: stdout !== undefined, reportedUsage: stdout === undefined ? null : reportedCliUsage(stdout) } });
  return { stdout, budget };
}
