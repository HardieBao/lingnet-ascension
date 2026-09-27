import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { cp, lstat, open, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assertOnlyAllowedChanges } from "./runner.mjs";

const execute = promisify(execFile), maximumBytes = 131072;
export async function initializeWorkspace(baseline, workspace) {
  for (const name of await readdir(baseline)) {
    if (name !== ".git") await cp(join(baseline, name), join(workspace, name),
      { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: true, force: false });
  }
}
export async function exportArtifact(workspace, artifactPath, baseCommit) {
  if (typeof artifactPath !== "string" || !/^[a-zA-Z0-9_./-]+$/.test(artifactPath) ||
      artifactPath.split("/").some((name) => !name || name === "." || name === "..") ||
      !/^[a-f0-9]{40}$/i.test(baseCommit)) throw new Error("隔离成果路径无效");
  const git = async (args) => (await execute("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", `safe.directory=${workspace}`, ...args],
    { cwd: workspace, windowsHide: true, timeout: 30_000, maxBuffer: 1_000_000 })).stdout;
  if ((await git(["rev-parse", "HEAD"])).trim() !== baseCommit) throw new Error("隔离工作区基线不匹配");
  assertOnlyAllowedChanges(await git(["status", "--porcelain", "--untracked-files=all"]), artifactPath);
  let path = workspace;
  for (const name of artifactPath.split("/").slice(0, -1)) {
    path = join(path, name);
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("隔离成果目录不允许链接");
  }
  path = join(path, artifactPath.split("/").at(-1));
  const entry = await lstat(path);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("隔离成果必须为普通文件");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > maximumBytes) throw new Error("隔离成果超过128KiB或不是独立普通文件");
    const buffer = Buffer.alloc(maximumBytes + 1);
    let count = 0, read;
    do {
      read = (await handle.read(buffer, count, buffer.length - count, count)).bytesRead;
      count += read;
    } while (read && count < buffer.length);
    const after = await handle.stat();
    if (count !== before.size || count > maximumBytes || before.ino !== after.ino ||
        before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error("隔离成果读取期间发生变化");
    const bytes = buffer.subarray(0, count);
    return { path: artifactPath, base64: bytes.toString("base64"), sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally { await handle.close(); }
}
async function quiesceModel() {
  // Never purge host processes: only the dedicated Docker keeper has this PID 1.
  if ((await readFile("/proc/1/cmdline", "utf8")) !== "sleep\0infinity\0") throw new Error("隔离进程归属不符");
  for (let attempt = 0; attempt < 5; attempt++) {
    let live = 0;
    for (const name of await readdir("/proc")) {
      const pid = Number(name);
      if (!/^\d+$/.test(name) || pid === 1 || pid === process.pid) continue;
      const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch((error) => { if (error.code !== "ENOENT") throw error; return ""; });
      if (!stat || stat.slice(stat.lastIndexOf(") ") + 2).startsWith("Z ")) continue;
      live++;
      try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    if (!live) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("模型后台进程未停止，拒绝导出");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "init") await initializeWorkspace("/baseline", "/workspace");
    else if (process.argv[2] === "export") {
      await quiesceModel();
      console.log(JSON.stringify(await exportArtifact("/workspace", process.argv[3], process.argv[4])));
    } else throw new Error("隔离工作区命令无效");
  } catch { console.error("隔离工作区初始化或成果检查失败，未导出原始内容。"); process.exitCode = 1; }
}
