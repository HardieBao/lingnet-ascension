import assert from "node:assert/strict";

const baseUrl = new URL(process.env.LINGNET_TEST_URL ?? "http://127.0.0.1:8790");
const cookie = process.env.LINGNET_TEST_COOKIE;
const trialId = process.env.LINGNET_TEST_TRIAL;
assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname) && cookie && trialId, "Use only a local fixture session and trial");
async function api(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options, headers: { Cookie: `lingnet_session=${cookie}`, Origin: baseUrl.origin, ...options.headers },
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, body: await response.json() };
}
const before = await api("/api/me");
assert.equal(before.status, 200);
assert(before.body.cultivator.id.startsWith("fixture-"));
assert.deepEqual(before.body.balances, { token: 500, tokenLocked: 500, cultivation: 1000, merit: 50 });
const passed = await api(`/api/trials/${trialId}/finish`, { method: "POST" });
assert.equal(passed.status, 200);
assert.equal(passed.body.realm, "foundation");
const repeated = await Promise.all(Array.from({ length: 20 }, () => api(`/api/trials/${trialId}/finish`, { method: "POST" })));
assert(repeated.every((response) => response.status === 409));
assert.deepEqual((await api("/api/me")).body.balances, { token: 500, tokenLocked: 0, cultivation: 1000, merit: 50 });
const realm = await api("/api/realms");
assert.equal(realm.body.realm, "foundation");
assert.equal(realm.body.progress.formalResults, 4);
const history = await api("/api/trials");
assert.equal(history.body.trials.find((record) => record.id === trialId).outcome, "passed");
console.log("筑基结算验证通过：采用合成的按时合入证据，费用只扣一次，重复请求不能再次突破。");
