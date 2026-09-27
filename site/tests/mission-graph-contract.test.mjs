import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const artifact = new URL("../lib/mission-graph.ts", import.meta.url);

function assertCycle(edges, cycle) {
  assert(Array.isArray(cycle) && cycle.length >= 2, "must return a cycle path");
  assert.equal(cycle[0], cycle.at(-1), "cycle must close");
  assert.equal(new Set(cycle.slice(0, -1)).size, cycle.length - 1, "cycle must not repeat interior nodes");
  const knownEdges = new Set(edges.map(({ missionId, prerequisiteId }) => `${missionId}\0${prerequisiteId}`));
  for (let index = 0; index < cycle.length - 1; index++) {
    assert(knownEdges.has(`${cycle[index]}\0${cycle[index + 1]}`), "each cycle step must be a declared dependency");
  }
}

test("PLAT-003C rejects real dependency cycles without mutating input", {
  skip: !existsSync(artifact) && "Task remains locked until its single-file contribution is merged",
}, async () => {
  const { findDependencyCycle } = await import(artifact.href);
  assert.equal(typeof findDependencyCycle, "function");
  assert.equal(findDependencyCycle([]), null);
  assert.equal(findDependencyCycle([
    { missionId: "A", prerequisiteId: "B" },
    { missionId: "B", prerequisiteId: "C" },
  ]), null);
  assert.equal(findDependencyCycle([
    { missionId: "A", prerequisiteId: "B" },
    { missionId: "A", prerequisiteId: "C" },
    { missionId: "B", prerequisiteId: "D" },
    { missionId: "C", prerequisiteId: "D" },
  ]), null);

  const self = Object.freeze([Object.freeze({ missionId: "A", prerequisiteId: "A" })]);
  assertCycle(self, findDependencyCycle(self));
  const disconnected = Object.freeze([
    Object.freeze({ missionId: "A", prerequisiteId: "B" }),
    Object.freeze({ missionId: "X", prerequisiteId: "Y" }),
    Object.freeze({ missionId: "Y", prerequisiteId: "X" }),
  ]);
  assertCycle(disconnected, findDependencyCycle(disconnected));
});
