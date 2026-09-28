import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Confirmed seam: Runner's HTTP model boundary; only the external provider is simulated.
const relayToken = "synthetic-relay-token-not-an-upstream-credential";
const upstreamKey = "synthetic-upstream-secret-for-an-isolated-http-fixture";
const controlToken = "synthetic-owner-control-token-outside-the-model-fixture";
async function startGateway(baseUrl, tokenBudget, maxOutputTokens = 4, statePath, expiresAt = Number.MAX_SAFE_INTEGER) {
  const privateState = statePath ?? join(await mkdtemp(join(tmpdir(), "lingnet-budget-fixture-")), "budget.json");
  const child = spawn(process.execPath, [fileURLToPath(new URL("../public/budget-gateway.mjs", import.meta.url))], {
    env: { ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      LINGNET_MODEL_BASE_URL: baseUrl, LINGNET_MODEL_API_KEY: upstreamKey,
      LINGNET_MODEL: "gpt-5.6-sol", LINGNET_RELAY_TOKEN: relayToken,
      LINGNET_CONTROL_TOKEN: controlToken, LINGNET_BUDGET_STATE_PATH: privateState,
      LINGNET_TOKEN_BUDGET: String(tokenBudget), LINGNET_MAX_OUTPUT_TOKENS: String(maxOutputTokens), LINGNET_GATEWAY_PORT: "0",
      LINGNET_CLAIM_EXPIRES_AT: String(expiresAt) },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let stderr = "", timer;
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  try {
    const url = await Promise.race([
      once(lines, "line").then(([line]) => JSON.parse(line).url),
      once(child, "exit").then(([code]) => { throw new Error(`Gateway exited ${code}: ${stderr}`); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Gateway startup timed out")), 5000); }),
    ]);
    assert.equal(new URL(url).hostname, "127.0.0.1");
    return { url, async stop() {
      const stopped = await fetch(`${url}/control/stop`, { method: "POST", headers: { Authorization: `Bearer ${controlToken}` } }).catch(() => null);
      if (stopped) await stopped.text();
      if (stopped?.ok && child.exitCode === null && child.signalCode === null) {
        await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 1000))]);
      }
      if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, "exit"); }
      lines.close();
    } };
  } catch (error) {
    child.kill();
    lines.close();
    throw error;
  } finally { clearTimeout(timer); }
}
async function modelRequest(gateway, extra = {}) {
  return fetch(`${gateway.url}/v1/responses`, { method: "POST",
    headers: { Authorization: `Bearer ${relayToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-sol", input: "Synthetic input only", ...extra }),
  });
}

test("a claim expiring during input count cannot dispatch a paid generation", async () => {
  let countReady, releaseCount, generations = 0;
  const counted = new Promise((ready) => { countReady = ready; });
  const release = new Promise((done) => { releaseCount = done; });
  const provider = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/v1/responses/input_tokens") {
      countReady(); await release;
      response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 }));
    } else { generations++; response.end("{}"); }
  });
  await new Promise((ready) => provider.listen(0, "127.0.0.1", ready));
  let gateway;
  try {
    const expiresAt = Date.now() + 1500;
    gateway = await startGateway(`http://127.0.0.1:${provider.address().port}/v1`, 10, 4, undefined, expiresAt);
    const pending = modelRequest(gateway);
    await counted;
    await new Promise((done) => setTimeout(done, Math.max(0, expiresAt - Date.now()) + 20));
    releaseCount();
    const result = await pending;
    assert.equal(result.status, 409);
    assert.equal((await result.json()).error.code, "claim_expired");
    assert.equal(generations, 0);
  } finally {
    releaseCount();
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((done) => provider.close(done));
  }
});

test("gateway refuses overflowing input before requesting model generation", async () => {
  let generationRequests = 0, countRequests = 0;
  const provider = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/v1/responses/input_tokens") {
      countRequests++;
      response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 6 }));
    } else {
      generationRequests++;
      response.end(JSON.stringify({ error: "Generation must not be requested" }));
    }
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  let gateway;
  try {
    gateway = await startGateway(`http://127.0.0.1:${provider.address().port}/v1`, 5);
    const result = await modelRequest(gateway);
    assert.equal(result.status, 429);
    assert.equal(countRequests, 1);
    assert.equal(generationRequests, 0);
    assert(!(await result.text()).includes(upstreamKey));
  } finally {
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("an upstream key echoed in a successful body is quarantined, not returned to the model", async () => {
  const provider = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/v1/responses/input_tokens") {
      response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 })); return;
    }
    const body = JSON.stringify({ object: "response", model: "gpt-5.6-sol", status: "completed",
      output: [{ content: [{ type: "output_text", text: upstreamKey }] }],
      usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } });
    response.end(body.replaceAll("synthetic", "\\u0073ynthetic"));
  });
  await new Promise((ready) => provider.listen(0, "127.0.0.1", ready));
  let gateway;
  try {
    gateway = await startGateway(`http://127.0.0.1:${provider.address().port}/v1`, 10);
    const result = await modelRequest(gateway);
    assert.equal(result.status, 503);
    assert.equal((await result.text()).includes(upstreamKey), false);
    assert.equal((await modelRequest(gateway)).status, 503);
  } finally {
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((done) => provider.close(done));
  }
});

test("verified usage releases only unused reservation and total generation stays inside the task budget", async () => {
  const generations = [];
  const provider = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/v1/responses/input_tokens") {
      return response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 }));
    }
    let text = "";
    for await (const chunk of request) text += chunk;
    const input = JSON.parse(text);
    generations.push({ input, authorization: request.headers.authorization });
    const outputTokens = Math.min(3, input.max_output_tokens);
    response.end(JSON.stringify({ id: `resp_fixture_${generations.length}`, object: "response", model: "gpt-5.6-sol",
      status: "completed", output: [], usage: { input_tokens: 2, output_tokens: outputTokens, total_tokens: 2 + outputTokens } }));
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  let gateway;
  try {
    gateway = await startGateway(`http://127.0.0.1:${provider.address().port}/v1`, 10);
    const first = await modelRequest(gateway, { max_output_tokens: 999999, store: true });
    assert.equal(first.status, 200);
    const firstUsage = (await first.json()).usage;
    const second = await modelRequest(gateway);
    assert.equal(second.status, 200);
    const secondUsage = (await second.json()).usage;
    const exhausted = await modelRequest(gateway);
    assert.equal(exhausted.status, 429);
    await exhausted.text();
    assert.deepEqual(generations.map(({ input }) => input.max_output_tokens), [4, 3]);
    assert(generations.every(({ input, authorization }) => input.store === false && authorization === `Bearer ${upstreamKey}`));
    assert.equal(firstUsage.total_tokens + secondUsage.total_tokens, 10);
  } finally {
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("a broken generation retains unknown usage and automatic retries cannot spend again", async () => {
  let generations = 0, counts = 0;
  const provider = createServer((request, response) => {
    if (request.url === "/v1/responses/input_tokens") {
      counts++;
      response.setHeader("Content-Type", "application/json");
      return response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 }));
    }
    generations++;
    request.socket.destroy();
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  let gateway;
  try {
    gateway = await startGateway(`http://127.0.0.1:${provider.address().port}/v1`, 10);
    const broken = await modelRequest(gateway);
    assert.equal(broken.status, 503);
    assert(!(await broken.text()).includes(upstreamKey));
    const retry = await modelRequest(gateway);
    assert.equal(retry.status, 503);
    await retry.text();
    assert.equal(generations, 1, "Unknown first usage must not turn a retry into another charged inference");
    assert.equal(counts, 1);
  } finally {
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("SSE responses keep their protocol while only one terminal usage proof releases reserved tokens", async () => {
  const proof = { id: "resp_fixture_stream", object: "response", model: "gpt-5.6-sol", status: "completed", output: [],
    usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } };
  const stream = `event: response.output_text.delta\r\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "合成结果" })}\r\n\r\nevent: response.completed\r\ndata: ${JSON.stringify({ type: "response.completed", response: proof })}\r\n\r\n`;
  const provider = createServer((request, response) => {
    if (request.url === "/v1/responses/input_tokens") {
      response.setHeader("Content-Type", "application/json");
      return response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 }));
    }
    response.setHeader("Content-Type", "text/event-stream");
    const bytes = Buffer.from(stream);
    for (let offset = 0; offset < bytes.length; offset += 7) response.write(bytes.subarray(offset, offset + 7));
    response.end();
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  let gateway;
  try {
    gateway = await startGateway(`http://127.0.0.1:${provider.address().port}/v1`, 10);
    const response = await modelRequest(gateway, { stream: true });
    assert.equal(response.status, 200);
    assert(response.headers.get("content-type").startsWith("text/event-stream"));
    assert.equal(await response.text(), stream);
    const second = await modelRequest(gateway, { stream: true });
    assert.equal(second.status, 200);
    await second.text();
    assert.equal((await modelRequest(gateway, { stream: true })).status, 429);
  } finally {
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("hidden provider state, remote inputs and hosted paid tools cannot bypass input accounting", async () => {
  let requests = 0;
  const provider = createServer((request, response) => {
    requests++;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(request.url === "/v1/responses/input_tokens"
      ? { object: "response.input_tokens", input_tokens: 2 }
      : { id: "resp_fixture", object: "response", model: "gpt-5.6-sol", status: "completed", output: [],
        usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }));
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  let gateway;
  try {
    gateway = await startGateway(`http://127.0.0.1:${provider.address().port}/v1`, 10);
    for (const extra of [
      { previous_response_id: "resp_hidden_fixture" }, { conversation: "conv_hidden_fixture" },
      { prompt: { id: "pmpt_hidden_fixture" } }, { background: true },
      { tools: [{ type: "web_search" }] }, { tools: [{ type: "namespace", name: "nested", tools: [{ type: "web_search" }] }] },
      { tool_choice: { type: "web_search" } },
      { input: [{ type: "item_reference", id: "item_hidden_fixture" }] },
      { input: [{ role: "user", content: [{ type: "input_file", file_url: "https://fixture.invalid/private.pdf" }] }] },
    ]) {
      const result = await modelRequest(gateway, extra);
      assert.equal(result.status, 400, "Uncounted provider-side work must be refused before any provider request");
      await result.text();
    }
    assert.equal(requests, 0);
  } finally {
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("an already-waiting concurrent request cannot generate after another request loses its usage proof", async () => {
  let generations = 0, counts = 0, secondCount, generationSocket, announceSecond;
  const secondReached = new Promise((resolve) => { announceSecond = resolve; });
  const provider = createServer((request, response) => {
    if (request.url === "/v1/responses/input_tokens") {
      counts++;
      response.setHeader("Content-Type", "application/json");
      if (counts === 1) return response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 }));
      secondCount = response;
      announceSecond();
      if (generationSocket) generationSocket.destroy();
      return;
    }
    generations++;
    generationSocket = request.socket;
    if (secondCount) generationSocket.destroy();
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  let gateway, timer;
  try {
    gateway = await startGateway(`http://127.0.0.1:${provider.address().port}/v1`, 10);
    const first = modelRequest(gateway), second = modelRequest(gateway);
    await Promise.race([secondReached, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Second count did not reach its provider barrier")), 2000); })]);
    clearTimeout(timer);
    const broken = await first;
    assert.equal(broken.status, 503);
    await broken.text();
    secondCount.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 }));
    const pending = await second;
    assert.equal(pending.status, 503);
    await pending.text();
    assert.equal(generations, 1, "A queued count must recheck the stop state before a paid generation");
  } finally {
    clearTimeout(timer);
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("a caller's stricter output limit is never expanded by the gateway", async () => {
  let cap;
  const provider = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/v1/responses/input_tokens") return response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 }));
    let text = "";
    for await (const chunk of request) text += chunk;
    cap = JSON.parse(text).max_output_tokens;
    response.end(JSON.stringify({ id: "resp_fixture", object: "response", model: "gpt-5.6-sol", status: "completed", output: [],
      usage: { input_tokens: 2, output_tokens: cap, total_tokens: 2 + cap } }));
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  let gateway;
  try {
    gateway = await startGateway(`http://127.0.0.1:${provider.address().port}/v1`, 10);
    const response = await modelRequest(gateway, { max_output_tokens: 1 });
    assert.equal(response.status, 200);
    await response.json();
    assert.equal(cap, 1);
  } finally {
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("restarting the gateway never restores tokens already used by the same task", async () => {
  let generations = 0;
  const provider = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/v1/responses/input_tokens") return response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 }));
    generations++;
    response.end(JSON.stringify({ id: "resp_fixture", object: "response", model: "gpt-5.6-sol", status: "completed", output: [],
      usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }));
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const state = join(await mkdtemp(join(tmpdir(), "lingnet-budget-restart-")), "budget.json");
  let gateway;
  try {
    const base = `http://127.0.0.1:${provider.address().port}/v1`;
    gateway = await startGateway(base, 3, 4, state);
    const first = await modelRequest(gateway);
    assert.equal(first.status, 200);
    await first.json();
    await gateway.stop();
    gateway = await startGateway(base, 3, 4, state);
    const restarted = await modelRequest(gateway);
    assert.equal(restarted.status, 429, "The same task's budget must survive a gateway process restart");
    await restarted.text();
    assert.equal(generations, 1);
  } finally {
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("one budget file cannot fund two simultaneous gateway processes", async () => {
  const provider = createServer((_request, response) => response.end("No inference is needed for this ownership test"));
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const state = join(await mkdtemp(join(tmpdir(), "lingnet-budget-owner-")), "budget.json");
  let first, second;
  try {
    const base = `http://127.0.0.1:${provider.address().port}/v1`;
    first = await startGateway(base, 10, 4, state);
    await assert.rejects(async () => { second = await startGateway(base, 10, 4, state); }, /Gateway exited/,
      "The second owner must fail before it can create another spendable copy of the task quota");
  } finally {
    if (second) await second.stop();
    if (first) await first.stop();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("only the owner can read numeric budget status, with no provider key or private input", async () => {
  const provider = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(request.url === "/v1/responses/input_tokens"
      ? { object: "response.input_tokens", input_tokens: 2 }
      : { id: "resp_fixture", object: "response", model: "gpt-5.6-sol", status: "completed", output: [],
        usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } }));
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  let gateway;
  try {
    gateway = await startGateway(`http://127.0.0.1:${provider.address().port}/v1`, 10);
    const first = await modelRequest(gateway);
    assert.equal(first.status, 200);
    await first.json();
    const status = await fetch(`${gateway.url}/control/status`, { headers: { Authorization: `Bearer ${controlToken}` } });
    assert.equal(status.status, 200);
    const text = await status.text();
    assert.deepEqual(JSON.parse(text), { model: "gpt-5.6-sol", tokenBudget: 10, remaining: 5, knownSpent: 5, reserved: 0, halted: false });
    assert(!text.includes(upstreamKey) && !text.includes(relayToken) && !text.includes("Synthetic input"));
    assert.equal((await fetch(`${gateway.url}/control/status`, { headers: { Authorization: `Bearer ${relayToken}` } })).status, 401);
  } finally {
    if (gateway) await gateway.stop();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});
