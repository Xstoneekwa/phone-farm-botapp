import assert from "node:assert/strict";
import test from "node:test";
import { isStopEnabled, shouldPollProfilesLiveCounters } from "./run-control.ts";

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
    ...overrides,
  };
}

test("Stop stays enabled while an active run request is queued or running", () => {
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
