import { readRunnerStatus } from "./runner-status.mjs";
import { constants } from "node:fs";
import { lstat, open, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export async function buildUsageReport(taskPackage, options = {}) {
  const status = await readRunnerStatus(taskPackage, options), payload = taskPackage.payload;
  const { status: budgetStatus, knownSpent, remaining, reserved, halted } = status.budget;
  return { schemaVersion: 1, source: "local-runner-observation", claimId: payload.claim.id,
    cultivatorId: payload.cultivatorId, missionId: payload.mission.id, baseCommit: payload.repository.baseCommit,
    model: { id: payload.model.id, tokenBudget: payload.model.tokenBudget, maxOutputTokens: payload.model.maxOutputTokens },
    observedAt: status.observedAt, budget: { status: budgetStatus, knownSpent, remaining, reserved, halted } };
}

export async function exportUsageReport(taskPath, target, { root = process.cwd(), now = Date.now() } = {}) {
  if (typeof target !== "string" || target !== basename(target) || !/^[\p{L}\p{N}_. -]{1,100}\.json$/u.test(target)) throw new Error("报告须保存在原Runner目录中，文件名须以.json结尾");
  const path = resolve(root, taskPath), before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > 131072) throw new Error("任务包文件无效");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); let task;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size > 131072) throw new Error("任务包文件已改变");
    const bytes = Buffer.alloc(131073); let size = 0;
    while (size < bytes.length) { const next = await handle.read(bytes, size, bytes.length - size, size); if (!next.bytesRead) break; size += next.bytesRead; }
    const after = await handle.stat();
    if (size > 131072 || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) throw new Error("任务包读取不完整");
    task = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  } catch { throw new Error("任务包文件无效，请重新下载"); }
  finally { await handle.close(); }
  const report = await buildUsageReport(task, { root, now });
  await writeFile(join(resolve(root), target), JSON.stringify(report) + "\n", { flag: "wx", mode: 0o600 });
  return { file: target, usageStatus: report.budget.status };
}
