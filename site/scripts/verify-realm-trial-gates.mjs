import assert from "node:assert/strict";

const baseUrl = new URL(process.env.LINGNET_TEST_URL ?? "http://127.0.0.1:8790");
const sessions = JSON.parse(process.env.LINGNET_TEST_SESSIONS ?? "null");
assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname) && sessions, "Use only isolated local fixture sessions");
for (const suffix of ["no-token", "no-cultivation", "no-merit", "no-results", "mortal", "ordinary", "submitted"]) {
  const id = `fixture-trial-${suffix}`;
  assert(typeof sessions[id] === "string");
  async function api(path, options = {}) {
    const response = await fetch(new URL(path, baseUrl), {
      ...options, headers: { Cookie: `lingnet_session=${sessions[id]}`, Origin: baseUrl.origin, ...options.headers },
      signal: AbortSignal.timeout(30_000),
    });
    return { status: response.status, body: await response.json() };
  }
  const before = await api("/api/me");
  assert.equal(before.status, 200);
  assert.equal(before.body.cultivator.id, id);
  const result = await api("/api/trials", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claimId: `${id}:claim` }) });
  assert.equal(result.status, 409, `${suffix} must be rejected before freezing`);
  assert.deepEqual((await api("/api/me")).body.balances, before.body.balances);
  assert.equal((await api("/api/trials")).body.trials.length, 0);
  console.log(`公开接口门槛验证通过：${suffix} 未冻结或铸造 Token。`);
}
