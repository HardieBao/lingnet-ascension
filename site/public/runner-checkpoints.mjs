import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { assertOnlyAllowedChanges, validateTaskPackage } from "./runner.mjs";

const execute = promisify(execFile), uuid = /^[a-f0-9-]{36}$/i, retention = 24 * 3600_000;
const digest = (value) => createHash("sha256").update(value).digest("hex");
export function safeContent(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/\b(?:sk-(?:proj-|svcacct-)?[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})\b/.test(text) ||
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(text) ||
      [process.env.OPENAI_API_KEY, process.env.LINGNET_MODEL_API_KEY].some((key) => key?.length >= 8 && text.includes(key))) {
    throw new Error("检查点疑似含凭据，不会保存或恢复");
  }
  const credentials = /\b(?:[A-Z_]*(?:API_KEY|ACCESS_TOKEN|PASSWORD|SECRET)|apiKey|api_key|accessToken|access_token|password|secret)\b\s*["']?\s*[:=]\s*["']?([a-zA-Z0-9+/_=-]{8,})\b/g;
  if ([...text.matchAll(credentials)].some((match) => !/^(?:YOUR_[A-Z0-9_]+|REPLACE_ME|REDACTED|CHANGE_ME|CHANGEME)$/i.test(match[1]))) {
    throw new Error("检查点疑似含私人配置，不会保存或恢复");
  }
}
function identity(payload) {
  return digest(JSON.stringify({ claimId: payload.claim.id, cultivatorId: payload.cultivatorId,
    repository: payload.repository, missionId: payload.mission.id, artifactPath: payload.mission.artifactPath, model: payload.model }));
}
function summary(record) {
  return { id: record.id, claimId: record.claimId, createdAt: record.createdAt, retainUntil: record.retainUntil,
    heartExtended: record.heartExtended ?? false, context: { mode: record.context.mode, harness: record.context.harness,
      model: record.context.model, status: record.context.status } };
}
async function plainFile(path, limit) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error("检查点文件无效");
}
async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${randomUUID()}`, handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path);
  if (process.platform !== "win32") {
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
}
async function git(workspace, args) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) if (/(API_KEY|ACCESS_TOKEN|SECRET|PASSWORD)/i.test(name)) delete environment[name];
  const { stdout } = await execute("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args],
    { cwd: workspace, env: environment, windowsHide: true, timeout: 30_000, maxBuffer: 1_000_000 });
  return stdout;
}
async function artifactFile(workspace, path, create = false) {
  let current = resolve(workspace);
  for (const name of path.split("/").slice(0, -1)) {
    current = join(current, name);
    if (create) await mkdir(current).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("交付物目录不允许链接");
  }
  return join(current, path.split("/").at(-1));
}
async function store(taskPackage, options, action, allowExpired = false) {
  const now = options.now ?? Date.now();
  const payload = validateTaskPackage(taskPackage, allowExpired ? Math.min(now, taskPackage.payload?.claim?.expiresAt - 1) : now);
  if (payload.schemaVersion !== 4) throw new Error("检查点需要重新下载 v4 任务包");
  let directory = resolve(options.root ?? process.cwd());
  for (const name of [".lingnet", "checkpoints", digest(payload.cultivatorId)]) {
    directory = join(directory, name);
    await mkdir(directory, { mode: 0o700 }).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("检查点目录不允许链接");
  }
  const lockPath = join(directory, ".lock");
  const lock = await open(lockPath, "wx", 0o600).catch(() => { throw new Error("检查点正在处理或上次操作待核对，拒绝并发恢复"); });
  try { return await action({ payload, directory, now }); }
  finally { await lock.close(); await unlink(lockPath); }
}
async function records(directory, now) {
  const result = [];
  for (const name of await readdir(directory)) {
    if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;
    const path = join(directory, name);
    await plainFile(path, 196608);
    let record;
    try { record = JSON.parse(await readFile(path, "utf8")); }
    catch { throw new Error("检查点格式无效，不回显原始记录"); }
    const bytes = Buffer.from(record.artifact?.base64 ?? "", "base64");
    if (record.version !== 1 || record.id !== name.slice(0, -5) || !uuid.test(record.claimId) ||
        !/^[a-f0-9]{64}$/.test(record.identity) || record.context?.mode !== "artifact-reconstruction" ||
        record.context.harness !== "codex-cli" || record.context.model !== "gpt-5.6-sol" ||
        !["model-failed", "model-completed"].includes(record.context.status) ||
        !Number.isSafeInteger(record.createdAt) || !Number.isSafeInteger(record.retainUntil) ||
        record.retainUntil <= record.createdAt || record.retainUntil - record.createdAt > 2 * retention ||
        bytes.length === 0 || bytes.length > 131072 || bytes.toString("base64") !== record.artifact.base64 ||
        digest(bytes) !== record.artifact.sha256) throw new Error("检查点摘要或元数据无效，停止操作");
    safeContent(bytes);
    if (record.retainUntil <= now) await unlink(path); // Only this validated, UUID-named cache copy, never the source workspace.
    else result.push(record);
  }
  return result;
}

export async function saveCheckpoint(taskPackage, workspace, options = {}) {
  const status = options.status ?? "model-failed";
  if (!["model-failed", "model-completed"].includes(status)) throw new Error("检查点运行状态无效");
  return store(taskPackage, options, async ({ payload, directory, now }) => {
    if ((await git(workspace, ["rev-parse", "HEAD"])).trim() !== payload.repository.baseCommit) throw new Error("检查点基线不匹配");
    assertOnlyAllowedChanges(await git(workspace, ["status", "--porcelain", "--untracked-files=all"]), payload.mission.artifactPath);
    const path = await artifactFile(workspace, payload.mission.artifactPath);
    await plainFile(path, 131072);
    const content = await readFile(path);
    if (content.length === 0) throw new Error("检查点产物为空");
    safeContent(content);
    if ((await records(directory, now)).length >= payload.equipment.checkpointSlots) throw new Error("检查点槽位已满，请先明确丢弃旧检查点或装备储物袋");
    let heartExtended = false;
    const heartPath = join(directory, `${payload.claim.id}.heart`);
    if (payload.equipment.heartTalisman && status === "model-failed") {
      try {
        const heart = await open(heartPath, "wx", 0o600);
        try { await heart.writeFile(JSON.stringify({ claimId: payload.claim.id, usedAt: now })); await heart.sync(); }
        finally { await heart.close(); }
        heartExtended = true;
      } catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    const record = { version: 1, id: randomUUID(), claimId: payload.claim.id, identity: identity(payload), createdAt: now,
      retainUntil: now + retention * (heartExtended ? 2 : 1), heartExtended,
      context: { mode: "artifact-reconstruction", harness: "codex-cli", model: payload.model.id, status },
      artifact: { path: payload.mission.artifactPath, sha256: digest(content), base64: content.toString("base64") } };
    try { await atomicJson(join(directory, `${record.id}.json`), record); }
    catch (error) { if (heartExtended) await unlink(heartPath); throw error; }
    return summary(record);
  });
}
export async function listCheckpoints(taskPackage, options = {}) {
  return store(taskPackage, options, async ({ directory, now }) => (await records(directory, now)).map(summary), true);
}
export async function discardCheckpoint(taskPackage, id, options = {}) {
  if (!uuid.test(id)) throw new Error("检查点编号无效");
  return store(taskPackage, options, async ({ payload, directory, now }) => {
    const record = (await records(directory, now)).find((record) => record.id === id);
    if (!record) throw new Error("检查点不存在或已过期");
    if (record.identity !== identity(payload)) throw new Error("检查点不属于此认领或固定基线");
    await unlink(join(directory, `${id}.json`));
    return { discarded: true };
  }, true);
}
export async function restoreCheckpoint(taskPackage, id, workspace, options = {}) {
  if (!uuid.test(id)) throw new Error("检查点编号无效");
  return store(taskPackage, options, async ({ payload, directory, now }) => {
    if (await lstat(join(directory, `${id}.used`)).catch(() => null)) throw new Error("检查点已恢复或上次恢复待核对，不允许重复使用");
    const record = (await records(directory, now)).find((record) => record.id === id);
    if (!record) throw new Error("检查点不存在或已过期");
    if (record.identity !== identity(payload)) throw new Error("检查点不属于此认领或固定基线");
    if ((await git(workspace, ["rev-parse", "HEAD"])).trim() !== payload.repository.baseCommit ||
        (await git(workspace, ["status", "--porcelain", "--untracked-files=all"])).trim()) {
      throw new Error("恢复目标必须是固定基线的干净工作区，不会覆盖已有改动");
    }
    const path = await artifactFile(workspace, payload.mission.artifactPath, true);
    const exists = await lstat(path).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (exists) await plainFile(path, 131072);
    const used = await open(join(directory, `${id}.used`), "wx", 0o600);
    try { await used.writeFile(JSON.stringify({ ...summary(record), restoredAt: now })); await used.sync(); }
    finally { await used.close(); }
    await writeFile(path, Buffer.from(record.artifact.base64, "base64"));
    await unlink(join(directory, `${id}.json`));
    return summary(record);
  });
}
