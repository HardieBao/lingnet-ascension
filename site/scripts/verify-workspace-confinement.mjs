import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Confirmed seam: actual Docker workspace capacity/export; no provider or host-fill experiment.
const execute = promisify(execFile), site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "lingnet-workspace-confinement-")), baseline = join(temporary, "baseline");
const suffix = randomUUID(), model = `lingnet-workspace-fixture-${suffix}`;
const docker = async (args) => (await execute("docker", args, { windowsHide: true, timeout: 30_000, maxBuffer: 1_000_000 })).stdout.trim();
const node = (code) => docker(["exec", model, "node", "--input-type=module", "-e", code]);
let created = false;
try {
  await mkdir(baseline);
  await writeFile(join(baseline, "GOVERNANCE.md"), "Synthetic baseline");
  await writeFile(join(baseline, ".gitignore"), "*.ignored\n");
  const git = async (args) => (await execute("git", args, { cwd: baseline, windowsHide: true, encoding: "utf8" })).stdout.trim();
  await git(["init", "--initial-branch=main"]); await git(["add", "GOVERNANCE.md", ".gitignore"]);
  await git(["-c", "user.name=Synthetic", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Synthetic baseline"]);
  const commit = await git(["rev-parse", "HEAD"]);
  await docker(["create", "--name", model, "--label", `lingnet.fixture=${suffix}`, "--network", "none", "--read-only",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "1000:1000", "--memory", "512m", "--memory-swap", "512m",
    "--pids-limit", "64", "--log-driver", "none", "--tmpfs", "/tmp:rw,nosuid,nodev,mode=1777",
    "--tmpfs", "/workspace:rw,nosuid,nodev,noexec,size=64m,uid=1000,gid=1000,mode=0700",
    "--mount", `type=bind,source=${baseline},target=/baseline,readonly`,
    "--mount", `type=bind,source=${join(baseline, ".git")},target=/workspace/.git,readonly`,
    "--mount", `type=bind,source=${join(site, "public", "runner-workspace.mjs")},target=/runner/runner-workspace.mjs,readonly`,
    "--mount", `type=bind,source=${join(site, "public", "runner.mjs")},target=/runner/runner.mjs,readonly`,
    "lingnet-runner:codex-0.156.1", "sleep", "infinity"]);
  created = true;
  const profile = JSON.parse(await docker(["inspect", model]))[0];
  assert.equal(profile.HostConfig.LogConfig.Type, "none");
  assert.match(profile.HostConfig.Tmpfs["/workspace"], /size=64m/);
  assert.equal(profile.HostConfig.MemorySwap, profile.HostConfig.Memory);
  assert(profile.Mounts.every((mount) => !mount.RW));
  await docker(["start", model]);
  await docker(["exec", model, "node", "/runner/runner-workspace.mjs", "init"]);
  const result = JSON.parse(await node(`import { writeFileSync, unlinkSync } from 'node:fs';
    let baselineReadOnly=false, gitReadOnly=false, full=false;
    try { writeFileSync('/baseline/GOVERNANCE.md','Attempt'); } catch { baselineReadOnly=true; }
    try { writeFileSync('/workspace/.git/config','Attempt'); } catch { gitReadOnly=true; }
    try { writeFileSync('/workspace/filler',Buffer.alloc(68*1024*1024)); } catch(error) { full=error.code==='ENOSPC'; }
    unlinkSync('/workspace/filler');
    writeFileSync('/workspace/GOVERNANCE.md','Synthetic valid artifact');
    console.log(JSON.stringify({baselineReadOnly,gitReadOnly,full}));`));
  assert.deepEqual(result, { baselineReadOnly: true, gitReadOnly: true, full: true });
  const exported = async () => JSON.parse(await docker(["exec", model, "node", "/runner/runner-workspace.mjs", "export", "GOVERNANCE.md", commit]));
  try { assert.equal(Buffer.from((await exported()).base64, "base64").toString(), "Synthetic valid artifact"); }
  catch (error) {
    // Isolated synthetic diagnostic, never read real configuration or provider state.
    console.error(await node(`console.log(JSON.stringify({pid1:await (await import('node:fs/promises')).readFile('/proc/1/cmdline','utf8')}));
      const helper=await import('/runner/runner-workspace.mjs');
      try { await helper.exportArtifact('/workspace','GOVERNANCE.md','${commit}'); } catch(error) { console.log(error.message); }`));
    throw error;
  }
  await node("import { writeFileSync } from 'node:fs'; writeFileSync('/workspace/extra.md','Out of scope');");
  await assert.rejects(exported());
  await node("import { unlinkSync, writeFileSync } from 'node:fs'; unlinkSync('/workspace/extra.md'); writeFileSync('/workspace/GOVERNANCE.md',Buffer.alloc(131072,65));");
  assert.equal(Buffer.from((await exported()).base64, "base64").length, 131072);
  for (const bytes of [0, 131073]) {
    await node(`import { writeFileSync } from 'node:fs'; writeFileSync('/workspace/GOVERNANCE.md',Buffer.alloc(${bytes},65));`);
    await assert.rejects(exported());
  }
  await node("import { writeFileSync, linkSync } from 'node:fs'; writeFileSync('/workspace/GOVERNANCE.md','Synthetic'); linkSync('/workspace/GOVERNANCE.md','/workspace/link.ignored');");
  await assert.rejects(exported());
  await node("import { unlinkSync, symlinkSync } from 'node:fs'; unlinkSync('/workspace/link.ignored'); unlinkSync('/workspace/GOVERNANCE.md'); symlinkSync('/baseline/GOVERNANCE.md','/workspace/GOVERNANCE.md');");
  await assert.rejects(exported());
  await node("import { unlinkSync, writeFileSync } from 'node:fs'; unlinkSync('/workspace/GOVERNANCE.md'); writeFileSync('/workspace/GOVERNANCE.md','Synthetic partial');");
  const writer = Number(await node("import { spawn } from 'node:child_process'; const child=spawn('node',['-e',`require('node:fs').writeFileSync('/proc/self/comm','mask) Z live'); setInterval(()=>require('node:fs').writeFileSync('/workspace/GOVERNANCE.md','Synthetic partial'),10)`],{stdio:'ignore',detached:true}); child.unref(); console.log(child.pid);"));
  assert(Number.isSafeInteger(writer) && writer > 1);
  assert.equal(await node(`import { readFile } from 'node:fs/promises'; let comm=''; for(let i=0;i<20;i++){comm=await readFile('/proc/${writer}/comm','utf8'); if(comm.trim()==='mask) Z live')break; await new Promise(done=>setTimeout(done,25));} console.log(comm.trim());`), "mask) Z live");
  assert.equal(Buffer.from((await exported()).base64, "base64").toString(), "Synthetic partial");
  const peer = await node(`import { readFile } from 'node:fs/promises'; console.log(await readFile('/proc/${writer}/stat','utf8').catch(()=>'gone'));`);
  assert(peer === "gone" || peer.slice(peer.lastIndexOf(") ") + 2).startsWith("Z "), `Background process after export: ${JSON.stringify(peer)}`);
  assert.equal(await readFile(join(baseline, "GOVERNANCE.md"), "utf8"), "Synthetic baseline");
  console.log("Actual Docker: 64MiB tmpfs reaches ENOSPC without host writes; baseline/git readonly; valid artifact exports, extra file rejected, logging and swap disabled. Synthetic only.");
} finally {
  if (created) {
    const profile = JSON.parse(await docker(["inspect", model]))[0];
    assert.equal(profile.Config.Labels["lingnet.fixture"], suffix);
    await docker(["rm", "--force", model]);
  }
  console.log(`Synthetic confinement workspace retained: ${temporary}`);
}
