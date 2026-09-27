import assert from "node:assert/strict";

const baseUrl = new URL(process.env.LINGNET_TEST_URL ?? "http://127.0.0.1:5175");
const missionId = process.env.LINGNET_TEST_MISSION ?? "GOV-002";
const session = process.env.LINGNET_TEST_COOKIE;

assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname), "Only a local server may be tested");
assert(session, "Set LINGNET_TEST_COOKIE to a local test session value");

const headers = { Cookie: `lingnet_session=${session}`, Origin: baseUrl.origin };

async function api(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(60_000),
  });
  return { status: response.status, body: await response.json() };
}

const account = await api("/api/me");
assert.equal(account.status, 200, "Test session must be signed in");
const initial = account.body.balances;
const missions = await api("/api/missions");
assert.equal(missions.status, 200);
const mission = missions.body.missions.find((item) => item.id === missionId);
assert(mission?.state === "open" && mission.deposit > 0, "Mission must be open with a nonzero deposit");
assert(initial.token >= mission.deposit, "Test account needs enough Token for the deposit");
const priorClaims = await api("/api/claims");
assert.equal(priorClaims.status, 200);
assert(!priorClaims.body.claims.some((claim) => ["claimed", "running", "submitted", "review", "approved"].includes(claim.state)),
  "Test account must have no active claims");

const attempts = await Promise.all(Array.from({ length: 100 }, async () => {
  try {
    return await api("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missionId }),
    });
  } catch (error) {
    return { status: "network-error", body: { error: String(error) } };
  }
}));

const winners = attempts.filter((attempt) => attempt.status === 201).map((attempt) => attempt.body.claim?.id).filter(Boolean);
const counts = Object.fromEntries([...new Set(attempts.map((attempt) => attempt.status))]
  .map((status) => [status, attempts.filter((attempt) => attempt.status === status).length]));
const failures = [];

try {
  assert.deepEqual(counts, { 201: 1, 409: 99 });
  const claimed = await api("/api/me");
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.balances.token, initial.token - mission.deposit);
  assert.equal(claimed.body.balances.tokenLocked, initial.tokenLocked + mission.deposit);
  const claims = await api("/api/claims");
  assert.equal(claims.status, 200);
  assert.deepEqual(claims.body.claims.filter((claim) => claim.mission_id === missionId && claim.state === "claimed")
    .map((claim) => claim.id), winners);
} catch (error) {
  failures.push(error);
} finally {
  for (const id of winners) {
    try {
      const released = await api(`/api/claims/${encodeURIComponent(id)}/release`, { method: "POST" });
      assert.equal(released.status, 200, `Could not release test claim ${id}`);
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    const restored = await api("/api/me");
    assert.equal(restored.status, 200);
    assert.equal(restored.body.balances.token, initial.token);
    assert.equal(restored.body.balances.tokenLocked, initial.tokenLocked);
  } catch (error) {
    failures.push(error);
  }
}

console.log(JSON.stringify({ missionId, attempts: attempts.length, statuses: counts,
  deposit: mission.deposit, balanceRestored: failures.length === 0 }));
if (failures.length) throw new AggregateError(failures, "Concurrent claim verification failed");
