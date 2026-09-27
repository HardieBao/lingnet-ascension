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
const history = await api("/api/trials");
const trial = history.body.trials.find((record) => record.state === "active");
assert(trial && trial.target_realm === "foundation");
const result = await api(`/api/trials/${trial.id}/finish`, { method: "POST" });
assert.equal(result.status, 409, "An active trial with no integrated formal result cannot advance");
const after = await api("/api/me");
assert.deepEqual(after.body.balances, before.body.balances, "Failed finish cannot consume the fee or unlock it");
assert.equal((await api("/api/realms")).body.realm, "qi");
console.log("渡劫禁止捷径验证通过：缺少本次正式成果不能扣费突破。");
