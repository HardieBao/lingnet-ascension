import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

const baseUrl = new URL(process.env.LINGNET_TEST_URL ?? "http://127.0.0.1:8790");
const cookie = process.env.LINGNET_TEST_COOKIE;
assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname) && cookie, "Use only a local fixture session");
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
assert.deepEqual(before.body.balances, { token: 1000, tokenLocked: 0, cultivation: 1000, merit: 50 });
const old = (await api("/api/trials")).body.trials.find((record) => record.outcome === "withdrawn");
assert(old);
assert.equal((await api(`/api/claims/${old.claim_id}/release`, { method: "POST" })).status, 200);
const claimed = await api("/api/claims", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ missionId: "fixture-foundation-mission-2" }) });
assert.equal(claimed.status, 201);
assert.equal((await api(`/api/claims/${claimed.body.claim.id}/start`, { method: "POST" })).status, 200);
const started = await api("/api/trials", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ claimId: claimed.body.claim.id }) });
assert.equal(started.status, 201);
const trial = started.body.trial;
assert.equal(trial.expires_at - trial.started_at, 60000, "Fixture contract must expire in one minute");
assert.equal((await api("/api/me")).body.balances.tokenLocked, 500);
console.log("已开始一分钟的隔离渡劫，等待真实时钟到期，不修改服务端时间或历史。");
await setTimeout(Math.max(0, trial.expires_at - Date.now() + 1000));
const refreshed = await Promise.all(Array.from({ length: 20 }, () => api("/api/trials")));
assert(refreshed.every((response) => response.status === 200));
assert(refreshed.every((response) => response.body.trials.find((record) => record.id === trial.id).outcome === "expired"));
assert.deepEqual((await api("/api/me")).body.balances, before.body.balances);
assert.equal((await api("/api/realms")).body.realm, "qi");
console.log("渡劫真实到期与重复结算验证通过：全部退款，历史保留，不突破境界。");
