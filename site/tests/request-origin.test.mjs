import assert from "node:assert/strict";
import test from "node:test";
import { rejectForeignMutation } from "../lib/request-origin.ts";

const url = "https://lingnet.example/api/claims";

test("same-origin browser writes are accepted", () => {
  assert.equal(rejectForeignMutation(new Request(url, {
    method: "POST", headers: { Origin: "https://lingnet.example" },
  })), null);
});

test("foreign, null, missing and downgraded origins are rejected", () => {
  for (const origin of ["https://evil.example", "https://sub.lingnet.example", "null", "http://lingnet.example", undefined]) {
    const headers = origin === undefined ? {} : { Origin: origin };
    const response = rejectForeignMutation(new Request(url, { method: "POST", headers }));
    assert.equal(response?.status, 403, String(origin));
  }
});

test("forwarded host headers cannot override the request origin", () => {
  const response = rejectForeignMutation(new Request(url, {
    method: "POST",
    headers: { Origin: "https://evil.example", "X-Forwarded-Host": "evil.example" },
  }));
  assert.equal(response?.status, 403);
});
