import assert from "node:assert/strict";
import test from "node:test";
import { resolveFollowCapProjection, resolveWarmupPresentation } from "./follow-cap-projection.ts";

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

test("warmup presentation distinguishes progress, completion, disabled, and pending states", () => {
  for (const day of [1, 2, 3]) {
    assert.deepEqual(resolveWarmupPresentation({
      warmupEnabled: true,
      warmupApplied: true,
      warmupStatus: "active",
      warmupDay: day,
      packageStartedAt: "2026-07-01T00:00:00Z",
    }), {
      title: `Warmup — Day ${day}`,
      badge: "in progress",
      tone: "info",
    });
  }

  for (const day of [4, 44]) {
    assert.deepEqual(resolveWarmupPresentation({
      warmupEnabled: true,
      warmupApplied: true,
      warmupStatus: "warmed_up",
      warmupDay: day,
      packageStartedAt: "2026-06-03T16:15:45Z",
    }), {
      title: `Warmup completed — Day ${day}`,
      badge: "completed",
      tone: "success",
    });
  }

  assert.equal(resolveWarmupPresentation({
    warmupEnabled: false,
    warmupApplied: false,
    warmupStatus: "disabled",
    warmupDay: 0,
    packageStartedAt: "not_available",
  }).badge, "disabled");
  assert.equal(resolveWarmupPresentation({
    warmupEnabled: true,
    warmupApplied: false,
    warmupStatus: "pending_package_start",
    warmupDay: 0,
    packageStartedAt: "not_available",
  }).badge, "pending");
});
