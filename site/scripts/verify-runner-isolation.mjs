import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Confirmed seam: actual isolated execution → model HTTP boundary, no live model.
const run = promisify(execFile), site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "lingnet-runner-isolation-"));
const workspace = join(temporary, "workspace"), state = join(temporary, "private-state");
const suffix = randomUUID(), network = `lingnet-fixture-${suffix}`;
const gateway = `${network}-gateway`, model = `${network}-model`;
const relay = "synthetic-isolation-model-relay-token-no-upstream-access";
const control = "synthetic-isolation-owner-control-not-given-to-model";
const image = "lingnet-runner:codex-0.156.1";
const nativeCli = process.argv[2] === "--native-cli";
const owned = new Set();
async function docker(args) {
  const { stdout } = await run("docker", args, { windowsHide: true, maxBuffer: 2_000_000 });
  return stdout.trim();
}
try {
  await mkdir(join(workspace, ".git"), { recursive: true });
  await mkdir(state);
  await writeFile(join(workspace, ".git", "config"), "[core]\n");
  await writeFile(join(state, "private-owner.txt"), "SYNTHETIC PRIVATE OWNER DATA");
  await copyFile(join(site, "scripts", "fixtures", "runner-isolation-probe.mjs"), join(workspace, "probe.mjs"));
  await docker(["network", "create", "--internal", "--label", `lingnet.fixture=${suffix}`, network]);
  const networkInfo = JSON.parse(await docker(["network", "inspect", network]));
  assert.equal(networkInfo[0].Internal, true);
  await docker(["create", "--name", gateway, "--label", `lingnet.fixture=${suffix}`, "--network", "bridge",
    "--publish", "127.0.0.1::8787", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "1000:1000",
    "--tmpfs", "/tmp:rw,nosuid,nodev,mode=1777", "--memory", "512m", "--pids-limit", "64",
    "--mount", `type=bind,source=${join(site, "public", "budget-gateway.mjs")},target=/gateway/budget-gateway.mjs,readonly`,
    "--mount", `type=bind,source=${join(site, "scripts", "fixtures", "budget-provider.mjs")},target=/gateway/provider.mjs,readonly`,
    "--mount", `type=bind,source=${state},target=/state`,
    "--env", "LINGNET_MODEL_BASE_URL=http://127.0.0.1:8800/v1", "--env", "LINGNET_MODEL_API_KEY=synthetic-upstream-key-only-in-trusted-gateway",
    "--env", "LINGNET_MODEL=gpt-5.6-sol", "--env", `LINGNET_RELAY_TOKEN=${relay}`, "--env", `LINGNET_CONTROL_TOKEN=${control}`,
    "--env", "LINGNET_TOKEN_BUDGET=10", "--env", "LINGNET_MAX_OUTPUT_TOKENS=4", "--env", "LINGNET_BUDGET_STATE_PATH=/state/budget.json",
    "--env", "LINGNET_GATEWAY_HOST=0.0.0.0", image, "node", "/gateway/provider.mjs"]);
  owned.add(gateway);
  await docker(["network", "connect", "--alias", "gateway", network, gateway]);
  await docker(["start", gateway]);
  const inspection = JSON.parse(await docker(["inspect", gateway]))[0];
  const port = inspection.NetworkSettings.Ports["8787/tcp"][0].HostPort;
  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const response = await fetch(`${url}/control/status`, { headers: { Authorization: `Bearer ${control}` }, signal: AbortSignal.timeout(500) }).catch(() => null);
    if (response) { await response.text(); ready = response.ok; }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) console.error(await docker(["logs", gateway]));
  assert(ready, "Trusted gateway must be reachable from its isolated container network");
  await docker(["create", "--name", model, "--label", `lingnet.fixture=${suffix}`, "--network", network,
    "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "1000:1000", "--memory", "512m", "--pids-limit", "64",
    "--tmpfs", "/tmp:rw,nosuid,nodev,mode=1777", "--env", `LINGNET_RELAY_TOKEN=${relay}`,
    "--tmpfs", "/home/node/.codex:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=0700",
    "--mount", `type=bind,source=${workspace},target=/workspace`,
    "--mount", `type=bind,source=${join(workspace, ".git")},target=/workspace/.git,readonly`, image,
    ...(nativeCli ? ["codex", "exec", "--skip-git-repo-check", "--ephemeral", "--json", "--ignore-user-config",
      "--dangerously-bypass-approvals-and-sandbox", "--model", "gpt-5.6-sol", "-c", 'model_provider="lingnet"',
      "-c", 'model_providers.lingnet.name="Isolated fixture"', "-c", 'model_providers.lingnet.base_url="http://gateway:8787/v1"',
      "-c", 'model_providers.lingnet.env_key="LINGNET_RELAY_TOKEN"', "-c", 'model_providers.lingnet.wire_api="responses"',
      "-c", "model_providers.lingnet.request_max_retries=0", "-c", "model_providers.lingnet.stream_max_retries=0",
      "-c", 'web_search="disabled"', "--output-last-message", "/workspace/final.txt",
      "Return a synthetic final reply; do not call any tools."] : ["node", "/workspace/probe.mjs"])]);
  owned.add(model);
  const profile = JSON.parse(await docker(["inspect", model]))[0];
  assert.equal(profile.HostConfig.ReadonlyRootfs, true);
  assert.equal(profile.HostConfig.Privileged, false);
  assert(profile.HostConfig.CapDrop.includes("ALL"));
  assert(profile.HostConfig.SecurityOpt.some((value) => value.startsWith("no-new-privileges")));
  assert.equal(profile.Mounts.find(({ Destination }) => Destination === "/workspace/.git").RW, false);
  let output;
  try { output = await docker(["start", "--attach", model]); }
  catch (error) { console.error(await docker(["logs", gateway])); throw error; }
  if (nativeCli) {
    const events = output.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const final = await readFile(join(workspace, "final.txt"), "utf8").catch(() => "");
    assert.equal(final.trim(), "Synthetic isolated CLI result");
    assert(events.some((event) => event.type === "turn.completed"));
    assert(events.some((event) => event.type === "item.completed" && event.item?.text === "Synthetic isolated CLI result"));
  } else {
    assert.deepEqual(JSON.parse(output), { gitReadOnly: true, outsideBlocked: true, modelStatus: 200,
      usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 }, noUpstreamKey: true, noOwnerControl: true,
      noPrivateState: true, noDockerSocket: true });
  }
  const budget = await fetch(`${url}/control/status`, { headers: { Authorization: `Bearer ${control}` } });
  assert.equal((await budget.json()).knownSpent, 3);
  const stopped = await fetch(`${url}/control/stop`, { method: "POST", headers: { Authorization: `Bearer ${control}` } });
  assert.equal(stopped.status, 200); await stopped.text();
  console.log(nativeCli ? "Actual isolated Codex CLI completes through the capped gateway using only synthetic provider responses; no live model." :
    "Actual Docker: isolated model reaches the capped gateway, not its secrets/state/socket; git metadata is read-only and external TCP is blocked. Synthetic data only.");
} finally {
  for (const name of owned) {
    const records = JSON.parse(await docker(["inspect", name]));
    assert.equal(records[0].Config.Labels["lingnet.fixture"], suffix);
    await docker(["rm", "--force", name]);
  }
  const records = JSON.parse(await docker(["network", "inspect", network]).catch(() => "[]"));
  if (records.length) {
    assert.equal(records[0].Labels["lingnet.fixture"], suffix);
    await docker(["network", "rm", network]);
  }
  console.log(`Synthetic isolation workspace retained: ${temporary}`);
}
