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
    configuredDayCap: 120,
    configuredSessionCap: 120,
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
      title: "Warmup completed — Day 4+",
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
    warmupStatus: "pending_activity_history",
    warmupDay: 0,
    packageStartedAt: "not_available",
  }).badge, "pending");
});

test("configured account session cap remains distinct from the effective warmup cap", () => {
  const result = resolveFollowCapProjection({
    packageDayCap: 80,
    packageSessionCap: 80,
    manualDayCap: 120,
    manualSessionCap: 50,
    warmupApplied: true,
    warmupDayCap: 40,
  });

  assert.equal(result.configuredSessionCap, 50);
  assert.equal(result.effectiveSessionCap, 40);
  assert.equal(result.configuredDayCap, 120);
  assert.equal(result.effectiveDayCap, 40);
});

test("multi-package maxima and lower configured values remain generic", () => {
  for (const [packageCode, packageCap] of [
    ["growth", 80],
    ["pro", 120],
    ["premium", 120],
    ["internal_test", 20],
  ]) {
    const configured = Math.min(50, packageCap);
    const result = resolveFollowCapProjection({
      packageDayCap: packageCap,
      packageSessionCap: packageCap,
      manualDayCap: configured,
      manualSessionCap: configured,
      warmupApplied: true,
      warmupDayCap: 10,
    });
    assert.equal(result.configuredDayCap, configured, packageCode);
    assert.equal(result.configuredSessionCap, configured, packageCode);
    assert.equal(result.effectiveDayCap, Math.min(configured, 10), packageCode);
    assert.equal(result.effectiveSessionCap, Math.min(configured, 10), packageCode);
  }
});
