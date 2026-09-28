import assert from "node:assert/strict";

const baseUrl = new URL(process.env.LINGNET_TEST_URL ?? "http://127.0.0.1:8790");
const cookie = process.env.LINGNET_TEST_COOKIE;
assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname) && cookie, "Use only a local fixture session");
async function api(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options, headers: { Cookie: `lingnet_session=${cookie}`, Origin: baseUrl.origin, ...options.headers },
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, body: response.headers.get("content-type")?.includes("application/json") ? await response.json() : null };
}
const before = await api("/api/me");
assert.equal(before.status, 200);
assert(before.body.cultivator.id.startsWith("fixture-"));
assert.deepEqual(before.body.balances, { token: 500, tokenLocked: 500, cultivation: 1000, merit: 50 });
const history = await api("/api/trials");
assert.equal(history.status, 200);
const trial = history.body.trials.find((record) => record.state === "active");
assert(trial, "First run the start regression on this fresh fixture");
const withdrawals = await Promise.all(Array.from({ length: 20 }, () => api(`/api/trials/${trial.id}/withdraw`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "隔离测试主动退出，要求退还全部游戏 Token，不是真实社区成果。" }),
})));
assert.equal(withdrawals.filter((result) => result.status === 200).length, 1, "Only one withdrawal can settle");
assert.equal(withdrawals.filter((result) => result.status === 409).length, 19);
const after = await api("/api/me");
assert.deepEqual(after.body.balances, { token: 1000, tokenLocked: 0, cultivation: 1000, merit: 50 });
const closed = await api("/api/trials");
assert.equal(closed.body.trials.find((record) => record.id === trial.id).outcome, "withdrawn");
console.log("渡劫并发退出验证通过：只结算一次，全部解冻，失败历史保留。");
