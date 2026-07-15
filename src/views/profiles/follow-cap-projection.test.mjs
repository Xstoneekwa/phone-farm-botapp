import assert from "node:assert/strict";
import test from "node:test";
import { resolveFollowCapProjection } from "./follow-cap-projection.ts";

test("Day 1 warmup limits both daily and session execution", () => {
  assert.deepEqual(resolveFollowCapProjection({
    packageDayCap: 120,
    packageSessionCap: 120,
    manualDayCap: 120,
    manualSessionCap: 120,
    warmupApplied: true,
    warmupDayCap: 10,
  }), {
    effectiveDayCap: 10,
    effectiveSessionCap: 10,
    capSource: "warmup",
    limitingReason: "limited_by_warmup",
  });
});

test("a lower admin override remains visible as the limiting source", () => {
  assert.equal(resolveFollowCapProjection({
    packageDayCap: 120,
    packageSessionCap: 120,
    manualDayCap: 15,
    manualSessionCap: 15,
    warmupApplied: true,
    warmupDayCap: 20,
  }).capSource, "manual");
});

test("package remains the source when warmup is complete or disabled", () => {
  for (const warmupApplied of [true, false]) {
    const result = resolveFollowCapProjection({
      packageDayCap: 80,
      packageSessionCap: 80,
      manualDayCap: 120,
      manualSessionCap: 120,
      warmupApplied,
      warmupDayCap: warmupApplied ? 80 : null,
    });
    assert.equal(result.effectiveDayCap, 80);
    assert.equal(result.effectiveSessionCap, 80);
    assert.equal(result.capSource, "package");
  }
});
