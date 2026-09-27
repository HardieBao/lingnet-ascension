import assert from "node:assert/strict";
import test from "node:test";
import { runIsolatedModel } from "../public/runner-sandbox.mjs";

test("an unverified provider cannot initialize model execution or spend tokens", async () => {
  const previous = process.env.LINGNET_PROVIDER_LIMITS_VERIFIED;
  delete process.env.LINGNET_PROVIDER_LIMITS_VERIFIED;
  try {
    await assert.rejects(runIsolatedModel({}, "nonexistent-fixture-workspace", "Synthetic"), /代理限额契约尚未核验/);
  } finally {
    if (previous === undefined) delete process.env.LINGNET_PROVIDER_LIMITS_VERIFIED;
    else process.env.LINGNET_PROVIDER_LIMITS_VERIFIED = previous;
  }
});
