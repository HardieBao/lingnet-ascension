import assert from "node:assert/strict";

const baseUrl = new URL(process.env.LINGNET_TEST_URL ?? "http://127.0.0.1:8790");
const owner = process.env.LINGNET_TEST_COOKIE;
const maintainer = process.env.LINGNET_TEST_MAINTAINER_COOKIE;
assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname) && owner && maintainer, "Use only local fixture sessions");
async function api(cookie, path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options, headers: { Cookie: `lingnet_session=${cookie}`, Origin: baseUrl.origin, ...options.headers },
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, body: response.headers.get("content-type")?.includes("application/json") ? await response.json() : null };
}
assert((await api(owner, "/api/me")).body.cultivator.id.startsWith("fixture-"));
assert((await api(maintainer, "/api/me")).body.cultivator.id.startsWith("fixture-"));
const before = await api(owner, "/api/me");
assert.equal(before.body.balances.tokenLocked, 500);
const trial = (await api(owner, "/api/trials")).body.trials.find((record) => record.state === "active");
assert(trial);
const options = { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reason: "隔离环境平台故障演练，记录故障依据并退还完整冻结费用，不是实际生产事件。" }) };
assert.equal((await api(owner, `/api/trials/${trial.id}/abort`, options)).status, 403);
assert.equal((await api(maintainer, `/api/trials/${trial.id}/abort`, options)).status, 200);
assert.equal((await api(maintainer, `/api/trials/${trial.id}/abort`, options)).status, 409);
assert.deepEqual((await api(owner, "/api/me")).body.balances, { token: 1000, tokenLocked: 0, cultivation: 1000, merit: 50 });
assert.equal((await api(owner, "/api/trials")).body.trials.find((record) => record.id === trial.id).outcome, "platform_failure");
console.log("平台故障中止验证通过：仅维护者可执行，全额退款，重复请求不重复退款。");
