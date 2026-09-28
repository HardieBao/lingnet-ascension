import assert from "node:assert/strict";

const baseUrl = new URL(process.env.LINGNET_TEST_URL ?? "http://127.0.0.1:8790");
const cookie = process.env.LINGNET_TEST_COOKIE;
const claimId = process.env.LINGNET_TEST_CLAIM;
assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname), "Only a local server may be tested");
assert(cookie && claimId?.startsWith("fixture-"), "Use a fresh local fixture session and claim");

async function api(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers: { Cookie: `lingnet_session=${cookie}`, Origin: baseUrl.origin, ...options.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const body = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
  return { status: response.status, body };
}

const before = await api("/api/me");
assert.equal(before.status, 200);
assert(before.body.cultivator.id.startsWith("fixture-"), "Only a fixture account may be used");
assert.deepEqual(before.body.balances, { token: 1000, tokenLocked: 0, cultivation: 1000, merit: 50 });
const started = await api("/api/trials", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId }),
});
assert.equal(started.status, 201, "Eligible cultivator can start the designated foundation trial");
assert.equal(started.body.trial.target_realm, "foundation");
assert.equal(started.body.trial.fee, 500);
assert.equal(started.body.trial.claim_id, claimId);
const repeated = await Promise.all(Array.from({ length: 20 }, () => api("/api/trials", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId }),
})));
assert(repeated.every((response) => response.status === 409), "Repeated starts cannot freeze another fee");
const after = await api("/api/me");
assert.deepEqual(after.body.balances, { token: 500, tokenLocked: 500, cultivation: 1000, merit: 50 });
const history = await api("/api/trials");
assert.equal(history.status, 200);
assert.equal(history.body.trials.length, 1);
assert.equal(history.body.trials[0].id, started.body.trial.id);
assert.equal(history.body.trials[0].outcome, null);
console.log("渡劫开始与重复请求验证通过：只冻结一次，不消耗修为或功德。");
