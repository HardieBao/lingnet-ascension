import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import test from "node:test";
import { startPresetWorkbench } from "../public/runner-preset-workbench.mjs";
import { getPreset, listPresets, savePreset } from "../public/runner-presets.mjs";

const definition = { name: "合成功法", reasoningEffort: "low", maxOutputTokens: 256, promptSupplement: "只作最小修改。" };
function task(owner = "synthetic-owner", slots = 1) {
  const payload = { schemaVersion: 4, cultivatorId: owner, claim: { id: randomUUID(), expiresAt: Date.now() + 3600000 },
    repository: { url: "https://github.com/HardieBao/lingnet-ascension.git", baseCommit: "a".repeat(40) },
    mission: { id: "GOV-001", title: "Synthetic", description: "Synthetic", acceptance: "Synthetic", allowedPaths: ["GOVERNANCE.md"], artifactPath: "GOVERNANCE.md" },
    model: { harness: "codex-cli", id: "gpt-5.6-sol", tokenBudget: 30000, maxOutputTokens: 2048, budgetAccounting: "input+output" },
    equipment: { localPreflight: false, checkpointSlots: 1, heartTalisman: false, presetSlots: slots }, gameReward: { token: 0, cultivation: 0, merit: 0 } };
  return { payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}
async function fixture(t, packageValue = task()) {
  const root = await mkdtemp(join(tmpdir(), "lingnet-preset-workbench-"));
  const server = await startPresetWorkbench(packageValue, { root });
  t.after(async () => {
    await server.close();
    const directory = await realpath(root);
    assert(directory.startsWith(await realpath(tmpdir()) + sep) && basename(directory).startsWith("lingnet-preset-workbench-"));
    await rm(directory, { recursive: true, force: true });
  });
  const headers = { "X-Lingnet-Workbench": server.token, Origin: server.origin, "Content-Type": "application/json" };
  const request = (path = "/api/presets", body, method = "POST") => fetch(server.origin + path, {
    method: body === undefined ? "GET" : method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { root, server, headers, request, packageValue };
}

test("workbench imports into Runner's shared slots and exports only safe definitions", async (t) => {
  const { request, root, packageValue } = await fixture(t);
  const created = await request("/api/presets", definition);
  assert.equal(created.status, 201);
  const preset = await created.json();
  assert.equal((await getPreset(packageValue, preset.id, { root })).maxOutputTokens, 256);
  assert.equal((await request("/api/presets", definition)).status, 409);
  const exported = await request(`/api/presets/${preset.id}/export`);
  assert.equal(exported.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await exported.json(), definition);
  const state = await (await request()).json();
  assert.equal(state.context.slots, 1);
  assert.equal(state.presets.length, 1);
  assert.equal(packageValue.payload.model.tokenBudget, 30000);
});

test("untrusted browsers, rebinding hosts and unconfirmed deletion cannot access local presets", async (t) => {
  const { request, server, headers, root, packageValue } = await fixture(t);
  const preset = await (await request("/api/presets", definition)).json();
  for (const changed of [{ "X-Lingnet-Workbench": "wrong" }, { Origin: "https://untrusted.invalid" },
    { Host: "untrusted.invalid" }, { "Sec-Fetch-Site": "cross-site" }]) {
    // Node fetch replaces a supplied Host header; raw HTTP proves the rebinding guard on wire.
    const status = await new Promise((done, reject) => {
      const outgoing = httpRequest(server.origin + "/api/presets", { headers: { ...headers, ...changed } }, (incoming) => {
        incoming.resume(); incoming.once("end", () => done(incoming.statusCode));
      });
      outgoing.once("error", reject); outgoing.end();
    });
    assert.equal(status, 403, JSON.stringify(changed));
  }
  assert.equal((await fetch(server.origin + "/api/presets")).status, 403);
  assert.equal((await fetch(server.origin + "/api/presets", { method: "POST", headers: { "X-Lingnet-Workbench": server.token }, body: JSON.stringify(definition) })).status, 403);
  assert.equal((await request(`/api/presets/${preset.id}`, {}, "DELETE")).status, 400);
  assert.equal((await listPresets(packageValue, { root })).length, 1);
});

test("unsafe, oversized and malformed imports do not echo secrets or persist records", async (t) => {
  const { request, server, headers, root, packageValue } = await fixture(t);
  const secret = "sk-" + "S".repeat(40);
  for (const changed of [{ promptSupplement: secret }, { apiKey: secret }, { command: "unsafe" }, { maxOutputTokens: 2049 }]) {
    const response = await request("/api/presets", { ...definition, ...changed });
    assert.equal(response.status, 400);
    assert(!(await response.text()).includes(secret));
  }
  assert.equal((await fetch(server.origin + "/api/presets", { method: "POST", headers, body: "broken" })).status, 400);
  assert.equal((await fetch(server.origin + "/api/presets", { method: "POST", headers, body: '"' + "x".repeat(8192) + '"' })).status, 413);
  assert.equal((await fetch(server.origin + "/api/presets", { method: "POST", headers: { ...headers, "Content-Type": "text/plain" }, body: "broken" })).status, 415);
  assert.deepEqual(await listPresets(packageValue, { root }), []);
});

test("exports retain inactive presets but never activate an unequipped extra slot", async (t) => {
  const packageValue = task("synthetic-owner", 1);
  const { request, root } = await fixture(t, packageValue);
  const equipped = task("synthetic-owner", 2);
  await savePreset(equipped, definition, { root });
  const extra = await savePreset(equipped, { ...definition, name: "合成第二功法" }, { root });
  const state = await (await request()).json();
  assert.equal(state.presets[1].available, false);
  assert.equal((await request(`/api/presets/${extra.id}/export`)).status, 200);
  await assert.rejects(getPreset(packageValue, extra.id, { root }), /槽位权限/);
});

test("deletion requires the exact ID, removes only its preset and keeps run history", async (t) => {
  const { request, root, packageValue } = await fixture(t);
  const preset = await (await request("/api/presets", definition)).json();
  const runs = join(root, ".lingnet", "runs");
  await mkdir(runs);
  await writeFile(join(runs, "synthetic-history.json"), "synthetic immutable history");
  assert.equal((await request(`/api/presets/${preset.id}`, { confirm: randomUUID() }, "DELETE")).status, 400);
  assert.equal((await request(`/api/presets/${preset.id}`, { confirm: preset.id }, "DELETE")).status, 200);
  assert.equal(await readFile(join(runs, "synthetic-history.json"), "utf8"), "synthetic immutable history");
  assert.deepEqual(await listPresets(packageValue, { root }), []);
  assert.equal((await request(`/api/presets/${preset.id}/export`)).status, 404);
});

test("expired workbench sessions cannot mutate presets or reopen the task budget", async (t) => {
  const { request, root, packageValue } = await fixture(t);
  const originalNow = Date.now();
  t.mock.method(Date, "now", () => originalNow + 7200000);
  const expired = await request("/api/presets", definition);
  assert.equal(expired.status, 409);
  assert.match((await expired.json()).error, /到期/);
  t.mock.restoreAll();
  assert.deepEqual(await listPresets(packageValue, { root }), []);
  assert.equal(packageValue.payload.model.tokenBudget, 30000);
});

test("damaged local records are retained and failures never echo their contents or paths", async (t) => {
  const { request, root, packageValue } = await fixture(t);
  const owner = createHash("sha256").update(packageValue.payload.cultivatorId).digest("hex");
  const file = join(root, ".lingnet", "presets", owner, `${randomUUID()}.json`);
  const damaged = "private synthetic record, do not echo " + "sk-" + "S".repeat(40);
  await writeFile(file, damaged);
  const response = await request();
  assert.equal(response.status, 400);
  const message = await response.text();
  assert.match(message, /结果未确认/);
  assert(!message.includes(damaged) && !message.includes(root));
  assert.equal(await readFile(file, "utf8"), damaged);
});

test("page bootstrap is non-cacheable, nonce-bound and inaccessible to untrusted browser origins", async (t) => {
  const { server } = await fixture(t);
  const page = await fetch(server.origin + "/");
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("Cache-Control"), "no-store");
  const html = await page.text();
  assert.match(html, /本机功法殿/);
  assert(html.includes(`<meta name="lingnet-workbench" content="${server.token}">`));
  assert(page.headers.get("Content-Security-Policy").includes(`script-src 'nonce-${server.token}'`));
  assert.doesNotThrow(() => new Script(html.match(/<script nonce="[a-f0-9]+">([\s\S]*?)<\/script>/)[1]));
  for (const headers of [{ Origin: "https://untrusted.invalid" }, { "Sec-Fetch-Site": "cross-site" }]) {
    const rejected = await fetch(server.origin + "/", { headers });
    assert.equal(rejected.status, 403);
    assert(!(await rejected.text()).includes(server.token));
  }
});

test("actual preset-ui CLI starts without model consent, stops normally and retains safe local presets", { timeout: 10000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "lingnet-preset-cli-"));
  const packageValue = task(), path = join(root, "task.json");
  await writeFile(path, JSON.stringify(packageValue));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../public/runner.mjs", import.meta.url)), "preset-ui", path], {
    cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
  const exit = new Promise((done) => child.once("exit", (code) => done(code)));
  t.after(async () => {
    if (child.exitCode === null) { child.stdin.end("stop\n"); await exit; }
    const directory = await realpath(root);
    assert(directory.startsWith(await realpath(tmpdir()) + sep) && basename(directory).startsWith("lingnet-preset-cli-"));
    await rm(directory, { recursive: true, force: true });
  });
  let output = "";
  const origin = await new Promise((done, reject) => {
    child.once("error", reject); child.once("exit", (code) => reject(new Error(`CLI stopped before opening: ${code}`)));
    child.stdout.on("data", (chunk) => { output += chunk.toString(); const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) done(match[0]); });
  });
  const html = await (await fetch(origin + "/")).text();
  const token = html.match(/name="lingnet-workbench" content="([a-f0-9]+)"/)[1];
  assert(!output.includes(token));
  const saved = await fetch(origin + "/api/presets", { method: "POST", headers: {
    Origin: origin, "Content-Type": "application/json", "X-Lingnet-Workbench": token,
  }, body: JSON.stringify(definition) });
  assert.equal(saved.status, 201);
  child.stdin.end("stop\n");
  assert.equal(await exit, 0);
  assert.equal((await listPresets(packageValue, { root })).length, 1);
  assert(!output.includes(definition.promptSupplement));
});

test("native export cookie only authorizes read-only same-origin downloads, never state access or writes", async (t) => {
  const { server, request } = await fixture(t);
  const preset = await (await request("/api/presets", definition)).json();
  const bootstrap = await fetch(server.origin + "/");
  const cookieHeader = bootstrap.headers.get("Set-Cookie");
  assert.match(cookieHeader, /HttpOnly; SameSite=Strict/);
  const cookie = cookieHeader.split(";")[0];
  const exported = await fetch(server.origin + `/api/presets/${preset.id}/export`, { headers: { Cookie: cookie, "Sec-Fetch-Site": "same-origin" } });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("Content-Disposition"), /attachment/);
  assert.deepEqual(await exported.json(), definition);
  assert.equal((await fetch(server.origin + "/api/presets", { headers: { Cookie: cookie } })).status, 403);
  assert.equal((await fetch(server.origin + "/api/presets", { method: "POST", headers: {
    Cookie: cookie, Origin: server.origin, "Content-Type": "application/json",
  }, body: JSON.stringify(definition) })).status, 403);
  assert.equal((await fetch(server.origin + `/api/presets/${preset.id}/export`, { headers: {
    Cookie: cookie, "Sec-Fetch-Site": "same-site", Origin: "http://127.0.0.1:1",
  } })).status, 403);
});
