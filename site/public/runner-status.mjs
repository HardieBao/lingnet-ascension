import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateTaskPackage } from "./runner.mjs";
import { progressDirectoryParts, progressIdentity, RUNNER_PHASES } from "./runner-progress.mjs";

async function existingDirectory(root, parts) {
  let path = resolve(root);
  for (const part of [null, ...parts]) {
    if (part) path = join(path, part);
    const stat = await lstat(path).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (!stat) return null;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("状态目录无效");
  }
  return path;
}

async function readJson(root, parts, limit) {
  const directory = await existingDirectory(root, parts.slice(0, -1));
  if (!directory) return null;
  const path = join(directory, parts.at(-1));
  const before = await lstat(path).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit) throw new Error("状态文件无效");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > limit) throw new Error("状态文件已改变");
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    const after = await handle.stat();
    if (size > limit || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error("状态读取不完整");
    return { value: JSON.parse(buffer.subarray(0, size).toString("utf8")), modifiedAt: stat.mtimeMs };
  } finally { await handle.close(); }
}

async function checkpointMetadata(payload, root, now) {
  const owner = createHash("sha256").update(payload.cultivatorId).digest("hex");
  const parts = [".lingnet", "checkpoints", owner], directory = await existingDirectory(root, parts);
  if (!directory) return { status: "unknown", source: "unknown", slots: payload.equipment.checkpointSlots, entries: [] };
  const names = await readdir(directory);
  if (names.length > 128) throw new Error("检查点状态需人工核对");
  const identity = createHash("sha256").update(JSON.stringify({ claimId: payload.claim.id, cultivatorId: payload.cultivatorId,
    repository: payload.repository, missionId: payload.mission.id, artifactPath: payload.mission.artifactPath, model: payload.model })).digest("hex");
  const entries = [];
  for (const name of names) {
    if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;
    const file = await readJson(root, [...parts, name], 196608);
    if (!file) throw new Error("检查点状态已改变");
    const record = file.value;
    if (record.version !== 1 || record.id !== name.slice(0, -5) || !/^[a-f0-9-]{36}$/i.test(record.claimId) ||
        !/^[a-f0-9]{64}$/.test(record.identity) || record.claimId === payload.claim.id && record.identity !== identity ||
        !Number.isSafeInteger(record.createdAt) || record.createdAt < 0 || !Number.isSafeInteger(record.retainUntil) ||
        record.retainUntil <= record.createdAt || record.retainUntil - record.createdAt > 48 * 3600000 ||
        record.context?.mode !== "artifact-reconstruction" || record.context.harness !== "codex-cli" ||
        record.context.model !== payload.model.id || !["model-failed", "model-completed"].includes(record.context.status)) throw new Error("检查点元数据无效");
    const marker = await lstat(join(directory, `${record.id}.used`)).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (marker && (!marker.isFile() || marker.isSymbolicLink() || marker.size > 16384)) throw new Error("恢复标记无效");
    entries.push({ id: record.id, claimId: record.claimId, createdAt: record.createdAt, retainUntil: record.retainUntil,
      forCurrentClaim: record.claimId === payload.claim.id, expired: record.retainUntil <= now, restoreMarker: !!marker,
      context: { mode: record.context.mode, status: record.context.status, model: record.context.model } });
  }
  entries.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  return { status: "observed", source: "local-metadata-only", slots: payload.equipment.checkpointSlots, entries };
}

async function progressMetadata(payload, root, now) {
  const parts = progressDirectoryParts(payload), directory = await existingDirectory(root, parts);
  if (!directory) return { status: "unknown", entries: [] };
  const names = (await readdir(directory)).filter((name) => /^[a-f0-9-]{36}\.json$/i.test(name));
  if (names.length > 128) throw new Error("运行记录过多，请在本机核对");
  const identity = progressIdentity(payload), entries = [];
  for (const name of names) {
    const file = await readJson(root, [...parts, name], 8192), record = file?.value;
    if (!record || record.version !== 1 || record.id !== name.slice(0, -5) || record.identity !== identity ||
        !RUNNER_PHASES.includes(record.phase) || !Number.isSafeInteger(record.startedAt) || record.startedAt < 0 ||
        !Number.isSafeInteger(record.updatedAt) || record.updatedAt < record.startedAt || record.updatedAt > now + 5000 ||
        (record.finishedAt !== null && (!Number.isSafeInteger(record.finishedAt) || record.finishedAt < record.startedAt || record.finishedAt > record.updatedAt)) ||
        (["ready", "failed"].includes(record.phase) !== (record.finishedAt !== null))) throw new Error("运行进度无效");
    entries.push({ id: record.id, phase: record.phase, startedAt: record.startedAt, updatedAt: record.updatedAt,
      finishedAt: record.finishedAt, heartbeat: record.finishedAt !== null ? "ended" : now - record.updatedAt > 10000 ? "stale" : "recent" });
  }
  entries.sort((a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id));
  return { status: "observed", source: "local-runner-heartbeat", total: entries.length, entries: entries.slice(0, 5) };
}

// Local observations only: never prove a live platform lease, model fee or community result.
export async function readRunnerStatus(taskPackage, { root = process.cwd(), now = Date.now() } = {}) {
  const payload = validateTaskPackage(taskPackage, Math.min(now, taskPackage.payload?.claim?.expiresAt - 1));
  if (payload.schemaVersion !== 4) throw new Error("闭关状态需要有效的 v4 任务包");
  const budget = { status: "unknown", source: "unknown", tokenBudget: payload.model.tokenBudget,
    maxOutputTokens: payload.model.maxOutputTokens, knownSpent: null, remaining: null,
    reserved: null, halted: null, nearLimit: null, modifiedAt: null };
  try {
    const file = await readJson(root, [".lingnet", "budgets", payload.claim.id, "budget.json"], 16384);
    if (file) {
      const record = file.value;
      if (record.version !== 1 || record.model !== payload.model.id || record.tokenBudget !== payload.model.tokenBudget ||
          !Number.isSafeInteger(record.remaining) || record.remaining < 0 ||
          !Number.isSafeInteger(record.knownSpent) || record.knownSpent < 0 ||
          record.knownSpent + record.remaining > record.tokenBudget || typeof record.halted !== "boolean") throw new Error("预算记录无效");
      Object.assign(budget, { status: "observed", source: "local-capped-gateway-snapshot", knownSpent: record.knownSpent,
        remaining: record.remaining, reserved: record.tokenBudget - record.knownSpent - record.remaining,
        halted: record.halted, nearLimit: record.tokenBudget - record.remaining >= record.tokenBudget * 0.9,
        modifiedAt: file.modifiedAt });
    }
  } catch { budget.status = "unavailable"; }
  let checkpoints;
  try { checkpoints = await checkpointMetadata(payload, root, now); }
  catch { checkpoints = { status: "unavailable", source: "unknown", slots: payload.equipment.checkpointSlots, entries: [] }; }
  let progress;
  try { progress = await progressMetadata(payload, root, now); }
  catch { progress = { status: "unavailable", entries: [] }; }
  return { observedAt: now, claim: { id: payload.claim.id, missionId: payload.mission.id,
    expiresAt: payload.claim.expiresAt, packageState: now < payload.claim.expiresAt ? "current" : "expired" },
    budget,
    checkpoints, progress };
}
