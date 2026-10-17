import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { validateTaskPackage } from "./runner.mjs";
import { discardPreset, listPresets, savePreset } from "./runner-presets.mjs";
import { presetWorkbenchPage } from "./runner-preset-ui.mjs";

const presetPath = /^\/api\/presets\/([a-f0-9-]{36})(\/export)?$/i;
const maximumBodyBytes = 8192;

async function jsonBody(request) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "")) {
    throw Object.assign(new Error("请使用 JSON 配置，不接受其他文件格式。"), { status: 415 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBodyBytes) throw Object.assign(new Error("配置超过 8 KiB，未保存。"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("JSON 配置无效，未保存；请检查文件格式。"), { status: 400 }); }
}

function failure(error) {
  if ([400, 413, 415].includes(error.status)) return { status: error.status, error: error.message };
  if (error.message === "功法槽位已满，请装备玉简或明确删除旧预设" ||
      error.message === "功法正在处理或上次操作待核对") return { status: 409, error: error.message };
  return { status: 400, error: "操作结果未确认。请先刷新核对已有功法，再检查有效任务包、槽位和安全字段；不要删除异常锁后重试。" };
}

// The caller owns the local task/root. HTTP clients cannot change them or start a model.
export async function startPresetWorkbench(taskPackage, { root = process.cwd() } = {}) {
  const task = structuredClone(taskPackage);
  const payload = validateTaskPackage(task);
  if (payload.schemaVersion !== 4) throw new Error("功法管理需要有效的 v4 任务包");
  const options = { root: resolve(root) };
  await listPresets(task, options);
  const token = randomBytes(32).toString("hex");
  const cookieName = `lingnet_preset_${randomBytes(8).toString("hex")}`;
  let origin;
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    const reply = (status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); };
    const mutation = request.method === "POST" || request.method === "DELETE";
    if (request.headers.host !== new URL(origin).host ||
        (request.headers.origin && request.headers.origin !== origin) || (mutation && request.headers.origin !== origin) ||
        (request.headers["sec-fetch-site"] && !["same-origin", "none"].includes(request.headers["sec-fetch-site"]))) {
      reply(403, { error: "仅允许当前本机管理会话访问。" }); return;
    }
    if (request.method === "GET" && request.url === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Set-Cookie", `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict`);
      response.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${token}'; style-src 'nonce-${token}'; connect-src 'self'; img-src data:; frame-ancestors 'none'; form-action 'none'; base-uri 'none'`);
      response.end(presetWorkbenchPage(token)); return;
    }
    const nativeExport = request.method === "GET" && presetPath.exec(request.url)?.[2] &&
      (request.headers.cookie ?? "").split(";").some((part) => part.trim() === `${cookieName}=${token}`);
    if (request.headers["x-lingnet-workbench"] !== token && !nativeExport) { reply(403, { error: "仅允许当前本机管理会话访问。" }); return; }
    if (task.payload.claim.expiresAt <= Date.now()) { reply(409, { error: "任务包已到期，请重新下载有效任务包；原功法仍保留。" }); return; }
    try {
      validateTaskPackage(task);
      if (request.url === "/api/presets" && request.method === "GET") {
        reply(200, { context: { cultivatorId: payload.cultivatorId, claimId: payload.claim.id,
          expiresAt: payload.claim.expiresAt, slots: payload.equipment.presetSlots ?? 1 },
          presets: await listPresets(task, options) }); return;
      }
      if (request.url === "/api/presets" && request.method === "POST") {
        reply(201, await savePreset(task, await jsonBody(request), options)); return;
      }
      const path = presetPath.exec(request.url);
      if (path && path[2] && request.method === "GET") {
        const found = (await listPresets(task, options)).find((preset) => preset.id === path[1]);
        if (!found) { reply(404, { error: "功法不存在或属于另一位修士。" }); return; }
        const { name, reasoningEffort, maxOutputTokens, promptSupplement } = found;
        response.setHeader("Content-Disposition", 'attachment; filename="lingnet-preset.json"');
        reply(200, { name, reasoningEffort, maxOutputTokens, promptSupplement }); return;
      }
      if (path && !path[2] && request.method === "DELETE") {
        const confirmation = await jsonBody(request);
        if (!confirmation || Object.keys(confirmation).length !== 1 || confirmation.confirm !== path[1]) {
          reply(400, { error: "请明确确认要删除的功法编号；未删除任何记录。" }); return;
        }
        reply(200, await discardPreset(task, path[1], options)); return;
      }
      reply(404, { error: "管理操作不存在。" });
    } catch (error) { const result = failure(error); reply(result.status, { error: result.error }); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 32;
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, token, close: async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  } };
}
