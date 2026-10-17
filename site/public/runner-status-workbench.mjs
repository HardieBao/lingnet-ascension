import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { readRunnerStatus } from "./runner-status.mjs";
import { runnerStatusPage } from "./runner-status-ui.mjs";

// A local owner session, pinned to one task/root. No mutation or model endpoints.
export async function startRunnerStatusWorkbench(taskPackage, { root = process.cwd() } = {}) {
  const task = structuredClone(taskPackage), options = { root: resolve(root) };
  await readRunnerStatus(task, options);
  const token = randomBytes(32).toString("hex");
  let origin;
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    const reply = (status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); };
    if (request.headers.host !== new URL(origin).host ||
        request.headers.origin && request.headers.origin !== origin ||
        request.headers["sec-fetch-site"] && !["same-origin", "none"].includes(request.headers["sec-fetch-site"])) {
      reply(403, { error: "只允许当前本机状态会话访问。" }); return;
    }
    if (request.method !== "GET") { reply(405, { error: "闭关状态页只读，不支持执行操作。" }); return; }
    if (request.url === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${token}'; style-src 'nonce-${token}'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'`);
      response.end(runnerStatusPage(token)); return;
    }
    if (request.headers["x-lingnet-status"] !== token) { reply(403, { error: "本机状态会话无效，请从启动终端重新打开页面。" }); return; }
    if (request.url !== "/api/status") { reply(404, { error: "状态入口不存在。" }); return; }
    try { reply(200, await readRunnerStatus(task, options)); }
    catch { reply(503, { error: "本机状态暂不可用，请核对任务包；没有启动或恢复模型。" }); }
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
