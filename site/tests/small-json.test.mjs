import assert from "node:assert/strict";
import test from "node:test";
import { readSmallJson } from "../lib/small-json.ts";

test("small JSON reader accepts a bounded object", async () => {
  const request = new Request("https://example.test", { method: "POST", body: JSON.stringify({ itemId: "storage-bag" }) });
  assert.deepEqual(await readSmallJson(request), { itemId: "storage-bag" });
});

test("small JSON reader rejects malformed and oversized bodies", async () => {
  const malformed = new Request("https://example.test", { method: "POST", body: "{" });
  const oversized = new Request("https://example.test", { method: "POST", body: "x".repeat(4097) });
  assert.equal(await readSmallJson(malformed), null);
  assert.equal(await readSmallJson(oversized), null);
});
