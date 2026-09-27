import assert from "node:assert/strict";

const baseUrl = new URL(process.env.LINGNET_TEST_URL ?? "http://127.0.0.1:5175");
const session = process.env.LINGNET_TEST_COOKIE;
const itemIds = ["storage-bag", "heart-talisman"];

assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname), "Only a local server may be tested");
assert(session, "Set LINGNET_TEST_COOKIE to a fresh local fixture session");

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
assert.equal(account.status, 200);
assert(account.body.cultivator.id.startsWith("fixture-"), "Only a fixture account may be used");
const before = await api("/api/equipment");
assert.equal(before.status, 200);
const prices = itemIds.map((id) => before.body.items.find((item) => item.id === id)?.price);
assert(prices.every((price) => Number.isSafeInteger(price) && price > 0));
assert(prices.every((price) => before.body.tokenBalance >= price));
assert(before.body.tokenBalance < prices[0] + prices[1], "Balance must cover either item, but not both");
assert(itemIds.every((id) => !before.body.inventory.some((item) => item.item_id === id)),
  "Fixture must not own either item");

const attempts = await Promise.all(Array.from({ length: 100 }, async (_, index) => {
  try {
    return await api("/api/equipment/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: itemIds[index % itemIds.length] }),
    });
  } catch (error) {
    return { status: "network-error", body: { error: String(error) } };
  }
}));
const successes = attempts.filter((attempt) => attempt.status === 201);
const counts = Object.fromEntries([...new Set(attempts.map((attempt) => attempt.status))]
  .map((status) => [status, attempts.filter((attempt) => attempt.status === status).length]));
const after = await api("/api/equipment");
const balance = await api("/api/me");

console.log(JSON.stringify({ attempts: attempts.length, statuses: counts,
  purchased: successes.map((attempt) => attempt.body.itemId), tokenBalance: after.body.tokenBalance }));
assert.deepEqual(counts, { 201: 1, 409: 99 });
assert.equal(after.status, 200);
assert.equal(balance.status, 200);
const purchased = successes[0].body.itemId;
assert(itemIds.includes(purchased));
assert.equal(after.body.inventory.filter((item) => itemIds.includes(item.item_id)).length, 1);
assert(after.body.inventory.some((item) => item.item_id === purchased));
assert.equal(after.body.tokenBalance, before.body.tokenBalance - successes[0].body.pricePaid);
assert.equal(balance.body.balances.token, after.body.tokenBalance);
