import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

const MAX_BYTES = 1024 * 1024;
const REQUEST_FIELDS = new Set(["model", "input", "instructions", "tools", "tool_choice", "parallel_tool_calls",
  "reasoning", "text", "stream", "include", "metadata", "store", "max_output_tokens", "max_tool_calls",
  "prompt_cache_key", "prompt_cache_retention", "service_tier", "safety_identifier", "truncation", "user"]);
function localToolsOnly(tools) {
  return tools === undefined || Array.isArray(tools) && tools.every((tool) => tool &&
    (tool.type === "namespace" ? Array.isArray(tool.tools) && localToolsOnly(tool.tools) :
      ["function", "custom"].includes(tool.type) && (tool.allowed_callers === undefined ||
        Array.isArray(tool.allowed_callers) && tool.allowed_callers.every((caller) => caller === "direct"))));
}
function explicitTextInput(input) {
  if (typeof input === "string") return input.trim().length > 0;
  return Array.isArray(input) && input.length > 0 && input.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (item.type === "additional_tools") return item.role === "developer" && Array.isArray(item.tools) && localToolsOnly(item.tools);
    if (item.type === undefined || item.type === "message") {
      return ["user", "developer", "system", "assistant"].includes(item.role) &&
        (typeof item.content === "string" || Array.isArray(item.content) && item.content.every((part) =>
          part && ["input_text", "output_text"].includes(part.type) && typeof part.text === "string"));
    }
    if (item.type === "reasoning") return typeof item.encrypted_content === "string" && item.encrypted_content.length > 0;
    if (["function_call", "custom_tool_call"].includes(item.type)) return true;
    return ["function_call_output", "custom_tool_call_output"].includes(item.type) && typeof item.output === "string";
  });
}
function containsPrivateKey(value, key) {
  if (typeof value === "string") return value.includes(key);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([name, item]) => name.includes(key) || containsPrivateKey(item, key));
}
async function readBounded(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error("Payload limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function reply(response, status, code) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify({ error: { code, message: "受限模型请求未执行或未通过核验，请检查本机预算记录。" } }));
}
let budgetLock, budgetLockPath;
async function releaseBudgetLock() {
  if (!budgetLock) return;
  await budgetLock.close();
  budgetLock = undefined;
  await unlink(budgetLockPath);
}

try {
  const base = new URL(process.env.LINGNET_MODEL_BASE_URL);
  if (base.username || base.password || base.search || base.hash ||
      !(base.protocol === "https:" || base.protocol === "http:" && base.hostname === "127.0.0.1")) throw new Error("Provider URL");
  const key = process.env.LINGNET_MODEL_API_KEY, relay = process.env.LINGNET_RELAY_TOKEN;
  const model = process.env.LINGNET_MODEL;
  let remaining = Number(process.env.LINGNET_TOKEN_BUDGET);
  const maximumOutput = Number(process.env.LINGNET_MAX_OUTPUT_TOKENS);
  const expiresAt = Number(process.env.LINGNET_CLAIM_EXPIRES_AT ?? Number.MAX_SAFE_INTEGER);
  const control = process.env.LINGNET_CONTROL_TOKEN, statePath = process.env.LINGNET_BUDGET_STATE_PATH;
  const host = process.env.LINGNET_GATEWAY_HOST ?? "127.0.0.1";
  const tokenBudget = remaining;
  let halted = false, knownSpent = 0, pending = 0, closing = false, writeTail = Promise.resolve();
  if (!key || !relay || relay.length < 32 || !model || !Number.isSafeInteger(remaining) || remaining < 1 ||
      !Number.isSafeInteger(maximumOutput) || maximumOutput < 1 || !control || control.length < 32 ||
      !Number.isSafeInteger(expiresAt) || expiresAt < 1 ||
      !statePath || !isAbsolute(statePath) || !["127.0.0.1", "0.0.0.0"].includes(host)) throw new Error("Gateway settings");
  budgetLockPath = `${statePath}.lock`;
  budgetLock = await open(budgetLockPath, "wx", 0o600);
  const previousFile = await lstat(statePath).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (previousFile) {
    if (!previousFile.isFile() || previousFile.isSymbolicLink() || previousFile.size > 16384) throw new Error("Budget storage");
    const previous = JSON.parse(await readFile(statePath, "utf8"));
    if (previous.version !== 1 || previous.model !== model || previous.tokenBudget !== tokenBudget ||
        !Number.isSafeInteger(previous.remaining) || previous.remaining < 0 || previous.remaining > tokenBudget ||
        !Number.isSafeInteger(previous.knownSpent) || previous.knownSpent < 0 ||
        previous.knownSpent + previous.remaining > tokenBudget || typeof previous.halted !== "boolean") throw new Error("Budget identity");
    remaining = previous.remaining;
    knownSpent = previous.knownSpent;
    halted = previous.halted || tokenBudget - knownSpent - remaining > 0;
  }
  async function persistState() {
    const snapshot = JSON.stringify({ version: 1, model, tokenBudget, remaining, knownSpent, halted: halted || pending > 0 });
    writeTail = writeTail.then(async () => {
      const temporary = `${statePath}.tmp-${randomUUID()}`;
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(snapshot); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, statePath);
      if (process.platform !== "win32") {
        const directory = await open(dirname(statePath), "r");
        try { await directory.sync(); } finally { await directory.close(); }
      }
    });
    await writeTail;
  }
  await persistState();
  const endpoint = (path) => `${base.href.replace(/\/$/, "")}/${path}`;
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith("/control/") && request.headers.authorization !== `Bearer ${control}`) {
      return reply(response, 401, "owner_auth_required");
    }
    if (request.method === "GET" && request.url === "/control/status") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ model, tokenBudget, remaining, knownSpent,
        reserved: tokenBudget - knownSpent - remaining, halted: halted || pending > 0 }));
      return;
    }
    if (request.method === "POST" && request.url === "/control/stop" && request.headers.authorization === `Bearer ${control}`) {
      closing = true;
      try { await persistState(); }
      catch { return reply(response, 503, "budget_storage_unavailable"); }
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ stopping: true }));
      setImmediate(() => {
        server.closeAllConnections();
        server.close(async () => {
          await releaseBudgetLock().catch(() => { console.error("预算锁未能清理，后续启动需人工核对。"); });
          process.exit(0);
        });
      });
      return;
    }
    if (request.headers.authorization !== `Bearer ${relay}`) return reply(response, 401, "relay_auth_required");
    if (request.method !== "POST" || request.url !== "/v1/responses") return reply(response, 404, "unsupported_endpoint");
    if (Date.now() >= expiresAt) return reply(response, 409, "claim_expired");
    if (halted || closing) return reply(response, 503, "usage_verification_required");
    let reserved = false;
    try {
      const input = JSON.parse(await readBounded(request));
      delete input.client_metadata;
      if (input.model !== model) return reply(response, 400, "model_mismatch");
      const choice = input.tool_choice;
      const localChoice = choice === undefined || typeof choice === "string" && ["auto", "none", "required"].includes(choice) ||
        choice && (["function", "custom"].includes(choice.type) ||
          choice.type === "allowed_tools" && Array.isArray(choice.tools) && localToolsOnly(choice.tools));
      if (Object.keys(input).some((field) => !REQUEST_FIELDS.has(field)) ||
          !explicitTextInput(input.input) || !localToolsOnly(input.tools) || !localChoice ||
          input.max_output_tokens != null && (!Number.isSafeInteger(input.max_output_tokens) || input.max_output_tokens < 1)) {
        return reply(response, 400, "unsupported_request");
      }
      const count = await fetch(endpoint("responses/input_tokens"), {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: input.input, instructions: input.instructions, tools: input.tools,
          tool_choice: input.tool_choice, parallel_tool_calls: input.parallel_tool_calls, reasoning: input.reasoning, text: input.text }),
        signal: AbortSignal.timeout(30_000), redirect: "error",
      });
      if (!count.ok) return reply(response, 503, "input_count_unavailable");
      const estimate = JSON.parse(await readBounded(count.body));
      if (estimate.object !== "response.input_tokens" || !Number.isSafeInteger(estimate.input_tokens) || estimate.input_tokens < 0) {
        return reply(response, 503, "input_count_invalid");
      }
      if (halted || closing) return reply(response, 503, "usage_verification_required");
      if (Date.now() >= expiresAt) return reply(response, 409, "claim_expired");
      const outputLimit = Math.min(maximumOutput, remaining - estimate.input_tokens, input.max_output_tokens ?? maximumOutput);
      if (outputLimit < 1) return reply(response, 429, "token_budget_exhausted");
      remaining -= estimate.input_tokens + outputLimit;
      reserved = true;
      pending++;
      await persistState();
      if (Date.now() >= expiresAt || halted || closing) {
        // No generation was dispatched: this reservation is provably unused.
        remaining += estimate.input_tokens + outputLimit;
        pending--;
        reserved = false;
        await persistState();
        return reply(response, Date.now() >= expiresAt ? 409 : 503, Date.now() >= expiresAt ? "claim_expired" : "usage_verification_required");
      }
      const generated = await fetch(endpoint("responses"), {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, model, max_output_tokens: outputLimit, store: false }),
        signal: AbortSignal.timeout(120_000), redirect: "error",
      });
      if (!generated.ok) { halted = true; await persistState(); return reply(response, 502, "provider_request_failed"); }
      const body = await readBounded(generated.body);
      if (body.includes(key)) throw new Error("Private credential in provider output");
      let proof;
      if (input.stream === true) {
        if (!generated.headers.get("content-type")?.startsWith("text/event-stream")) throw new Error("Stream protocol");
        const terminal = [];
        const deltas = [];
        for (const block of body.split(/\r?\n\r?\n/)) {
          const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart()).join("\n");
          if (!data || data === "[DONE]") continue;
          const event = JSON.parse(data);
          if (containsPrivateKey(event, key)) throw new Error("Private credential in provider output");
          if (typeof event.delta === "string") deltas.push(event.delta);
          if (["error", "response.failed"].includes(event.type)) throw new Error("Stream failure");
          if (["response.completed", "response.incomplete"].includes(event.type)) terminal.push(event.response);
        }
        if (terminal.length !== 1) throw new Error("Terminal usage proof");
        if (deltas.join("").includes(key)) throw new Error("Private credential in provider deltas");
        proof = terminal[0];
      } else proof = JSON.parse(body);
      if (containsPrivateKey(proof, key)) throw new Error("Private credential in provider output");
      const usage = proof.usage;
      if (proof.object !== "response" || proof.model !== model || !["completed", "incomplete"].includes(proof.status) ||
          !usage || !Number.isSafeInteger(usage.input_tokens) || usage.input_tokens !== estimate.input_tokens ||
          !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0 || usage.output_tokens > outputLimit ||
          !Number.isSafeInteger(usage.total_tokens) || usage.total_tokens !== usage.input_tokens + usage.output_tokens) {
        halted = true;
        await persistState();
        return reply(response, 502, "provider_usage_invalid");
      }
      remaining += estimate.input_tokens + outputLimit - usage.total_tokens;
      knownSpent += usage.total_tokens;
      pending--;
      await persistState();
      response.writeHead(200, { "Content-Type": generated.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" });
      response.end(body);
    } catch {
      if (reserved) {
        halted = true;
        await persistState().catch(() => {});
      }
      reply(response, 503, "request_failed_closed");
    }
  });
  server.listen(Number(process.env.LINGNET_GATEWAY_PORT ?? 8787), host, () => {
    console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}` }));
  });
} catch {
  await releaseBudgetLock().catch(() => {});
  console.error("模型限额网关配置无效，未启动；凭据不会输出。");
  process.exitCode = 1;
}
