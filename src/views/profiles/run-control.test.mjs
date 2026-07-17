import assert from "node:assert/strict";
import test from "node:test";
import { displayCounterMetrics, displayRunCounters, isStopEnabled, resolveDeviceRuntimeStatus, runtimeIndicatorState, shouldPollProfilesLiveCounters, startDisabledReason } from "./run-control.ts";

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
      follow: { current: 5, max: 80 },
      unfollow: { current: 0, max: 100 },
      like: { current: 3, max: 100 },
      comment: { current: 0, max: 0 },
      dm: { current: 0, max: 1 },
    },
    interactionsToday: 8,
    ...overrides,
  };
}

test("Stop stays enabled while an active run request is queued or running", () => {
  assert.equal(isStopEnabled(profile({ activeRunRequestStatus: "queued" })), true);
  assert.equal(isStopEnabled(profile({ activeRunRequestStatus: "claimed" })), true);
  assert.equal(isStopEnabled(profile({ activeRunRequestStatus: "stopping" })), true);
  assert.match(startDisabledReason(profile({ runControlPhase: "cleanup_in_progress" })), /Cleanup in progress/);
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
  assert.equal(runtimeIndicatorState(profile({ runtimeIndicator: { state: "idle", lastRunExitCode: 1, lastRunStatus: "failed" } })), "error");
});

test("Live profile counters poll for schedule-session runtime projection", () => {
  assert.equal(shouldPollProfilesLiveCounters(profile({ runtimeIndicator: { state: "active", reason: "active_run" } })), true);
  assert.equal(shouldPollProfilesLiveCounters(profile({ currentRunStatus: "running", eligibility: "blocked_now", eligibilityReason: "already_running" })), true);
});

test("Displayed counters switch to current run counters while runtime is active", () => {
  const idle = displayRunCounters(profile());
  assert.deepEqual(idle, { mode: "today", follow: 5, unfollow: 0, like: 3, dm: 0, total: 8 });

  const active = displayRunCounters(profile({
    activeRunRequestStatus: "queued",
    currentRunCounters: {
      follows: 1,
      unfollows: 2,
      likes: 1,
      comments: 0,
      dms: 0,
      stories: 0,
      interactionsTotal: 2,
    },
  }));
  assert.deepEqual(active, { mode: "run", follow: 1, unfollow: 2, like: 1, dm: 0, total: 2 });
});

test("Counter metrics mark only the asynchronously projected live producers", () => {
  const active = displayCounterMetrics(profile({
    activeRunStatus: "running",
    liveSupportedKinds: ["follow", "unfollow", "like", "dm"],
    currentRunCounters: {
      follows: 1,
      unfollows: 2,
      likes: 1,
      comments: 0,
      dms: 0,
      stories: 0,
      interactionsTotal: 2,
    },
  }));

  assert.deepEqual(active, [
    { key: "follow", current: 1, max: 80, label: "F", live: true },
    { key: "unfollow", current: 2, max: 100, label: "UF", live: true },
    { key: "like", current: 1, max: 100, label: "L", live: true },
    { key: "comment", current: 0, max: 0, label: "C", live: false },
    { key: "dm", current: 0, max: 1, label: "DM", live: true },
  ]);
});

test("Counter metrics return daily totals outside active runs", () => {
  const idle = displayCounterMetrics(profile());

  assert.deepEqual(idle, [
    { key: "follow", current: 5, max: 80, label: "F", live: false },
    { key: "unfollow", current: 0, max: 100, label: "UF", live: false },
    { key: "like", current: 3, max: 100, label: "L", live: false },
    { key: "comment", current: 0, max: 0, label: "C", live: false },
    { key: "dm", current: 0, max: 1, label: "DM", live: false },
  ]);
});
