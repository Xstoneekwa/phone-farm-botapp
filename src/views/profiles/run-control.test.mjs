import assert from "node:assert/strict";
import test from "node:test";
import { displayRunCounters, isStopEnabled, resolveDeviceRuntimeStatus, runtimeIndicatorState, shouldPollProfilesLiveCounters } from "./run-control.ts";

function profile(overrides = {}) {
  return {
    id: "account-1",
    username: "growth_with_bmb",
    status: "ready",
    eligibility: "can_start",
    eligibilityReason: "ready",
    eligibilityDetail: {
      status: "can_start",
      primary_block_reason: "",
      reason_label: "Ready",
      reason_description: "Ready",
    },
    runtimeLock: "none",
    counters: {
      follow: { current: 5, max: 12 },
      unfollow: { current: 0, max: 100 },
      like: { current: 3, max: 150 },
      comment: { current: 0, max: 0 },
      dm: { current: 0, max: 0 },
    },
    interactionsToday: 8,
    ...overrides,
  };
}

test("Stop stays enabled while an active run request is queued or running", () => {
  assert.equal(isStopEnabled(profile({ activeRunRequestStatus: "queued" })), true);
  assert.equal(isStopEnabled(profile({ activeRunRequestStatus: "claimed" })), true);
  assert.equal(isStopEnabled(profile({ activeRunRequestStatus: "running" })), true);
  assert.equal(isStopEnabled(profile({ activeRunStatus: "running" })), true);
  assert.equal(isStopEnabled(profile({ status: "running" })), true);
  assert.equal(isStopEnabled(profile({ eligibility: "blocked_now", eligibilityReason: "already_running" })), true);
});

test("Stop remains disabled when no active run is projected", () => {
  assert.equal(isStopEnabled(profile()), false);
  assert.equal(shouldPollProfilesLiveCounters(profile()), false);
});

test("Live profile counters poll while runtime is active", () => {
  assert.equal(shouldPollProfilesLiveCounters(profile({ activeRunStatus: "running" })), true);
  assert.equal(shouldPollProfilesLiveCounters(profile({ runtimeLock: "device_level_lock" })), true);
});

test("Device status is active when any profile has an active runtime state", () => {
  assert.equal(resolveDeviceRuntimeStatus([profile(), profile({ activeRunRequestStatus: "queued" })], "inactive"), "active");
  assert.equal(resolveDeviceRuntimeStatus([profile(), profile({ activeRunStatus: "running" })], "inactive"), "active");
  assert.equal(resolveDeviceRuntimeStatus([profile(), profile()], "inactive"), "inactive");
});

test("Runtime indicator maps active, abnormal, and normal idle states", () => {
  assert.equal(runtimeIndicatorState(profile({ activeRunRequestStatus: "claimed" })), "active");
  assert.equal(runtimeIndicatorState(profile({ runtimeIndicator: { state: "error", reason: "partial_safe_stopped" } })), "error");
  assert.equal(runtimeIndicatorState(profile({ runtimeIndicator: { state: "idle", reason: "last_run_normal" } })), "idle");
});

test("Displayed counters switch to current run counters while runtime is active", () => {
  const idle = displayRunCounters(profile());
  assert.deepEqual(idle, { mode: "today", follow: 5, like: 3, total: 8 });

  const active = displayRunCounters(profile({
    activeRunRequestStatus: "queued",
    currentRunCounters: {
      follows: 1,
      unfollows: 0,
      likes: 1,
      comments: 0,
      dms: 0,
      stories: 0,
      interactionsTotal: 2,
    },
  }));
  assert.deepEqual(active, { mode: "run", follow: 1, like: 1, total: 2 });
});
