import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const RUNNER_PHASES = ["preparing", "restoring", "model", "validating", "exporting", "preflight", "ready", "failed"];

export function progressIdentity(payload) {
  return createHash("sha256").update(JSON.stringify({ claimId: payload.claim.id, cultivatorId: payload.cultivatorId,
    repository: payload.repository, missionId: payload.mission.id, artifactPath: payload.mission.artifactPath, model: payload.model })).digest("hex");
}

export function progressDirectoryParts(payload) {
  if (typeof payload.cultivatorId !== "string" || !/^[a-zA-Z0-9_:.-]{1,160}$/.test(payload.cultivatorId) ||
      !/^[a-f0-9-]{36}$/i.test(payload.claim?.id)) throw new Error("运行进度身份无效");
  return [".lingnet", "progress", createHash("sha256").update(payload.cultivatorId).digest("hex"), payload.claim.id];
}

// One file per attempt avoids concurrent attempts replacing each other's observations.
export async function startRunnerProgress(payload, { root = process.cwd() } = {}) {
  let directory = resolve(root);
  for (const part of [null, ...progressDirectoryParts(payload)]) {
    if (part) {
      directory = join(directory, part);
      await mkdir(directory, { mode: 0o700 }).catch((error) => { if (error.code !== "EEXIST") throw error; });
    }
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("运行进度目录无效");
  }
  const now = Date.now(), record = { version: 1, id: randomUUID(), identity: progressIdentity(payload),
    phase: "preparing", startedAt: now, updatedAt: now, finishedAt: null };
  const path = join(directory, `${record.id}.json`);
  await writeFile(path, JSON.stringify(record), { flag: "wx", mode: 0o600 });
  let pending = Promise.resolve(), closed = false, warned = false;
  const publish = () => {
    const snapshot = JSON.stringify({ ...record, updatedAt: Date.now() });
    const next = pending.catch(() => {}).then(async () => {
      const temporary = join(directory, `${record.id}.${randomUUID()}.tmp`);
      await writeFile(temporary, snapshot, { flag: "wx", mode: 0o600 });
      await rename(temporary, path);
    });
    pending = next;
    return next;
  };
  const timer = setInterval(() => {
    publish().catch(() => {
      if (!warned) console.warn("本机进度更新失败，请以终端结果为准。");
      warned = true;
    });
  }, 2000);
  timer.unref();
  return {
    id: record.id,
    async phase(phase) {
      if (closed || !RUNNER_PHASES.includes(phase) || ["ready", "failed"].includes(phase)) throw new Error("运行进度阶段无效");
      record.phase = phase;
      await publish();
    },
    async finish(phase) {
      if (closed) return;
      if (!["ready", "failed"].includes(phase)) throw new Error("运行进度终态无效");
      closed = true;
      clearInterval(timer);
      record.phase = phase;
      record.finishedAt = Date.now();
      await publish();
    },
  };
}
