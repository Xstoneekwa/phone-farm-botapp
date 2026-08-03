import assert from "node:assert/strict";
import test from "node:test";
import { mergeGroupedProfiles, mergeProfilesLiveProjection } from "./profiles-live-merge.ts";

function profile(overrides = {}) {
  return {
    id: "account-1",
    status: "ready",
    eligibility: "can_start",
    eligibilityReason: "ready",
    eligibilityDetail: { status: "can_start", primary_block_reason: "", reason_label: "Ready" },
    counters: {
      follow: { current: 5, max: 80 }, unfollow: { current: 4, max: 80 }, like: { current: 3, max: 100 },
      comment: { current: 2, max: 0 }, dm: { current: 1, max: 2 },
    },
    ...overrides,
  };
}

test("idle becomes active and all displayed canonical counters remain stable", () => {
  const result = mergeProfilesLiveProjection([profile()], [{
    accountId: "account-1",
    activeRunRequestStatus: "claimed",
    runtimeIndicator: { state: "active", reason: "active_run" },
    countersToday: { follows: 6, likes: 3, dms: 1 },
    currentRunCounters: { follows: 6, unfollows: 4, likes: 3, comments: 2, dms: 1, stories: 0, interactionsTotal: 16 },
  }])[0];
  assert.equal(result.status, "running");
  assert.equal(result.counters.follow.current, 6);
  assert.equal(result.counters.unfollow.current, 4);
  assert.equal(result.counters.comment.current, 2);
});

test("active becomes idle and an old resolved dashboard blocker is cleared", () => {
  const result = mergeProfilesLiveProjection([profile({
    status: "running",
    eligibility: "blocked_now",
    eligibilityReason: "operator_review_required",
    eligibilityDetail: { status: "blocked_now", primary_block_reason: "operator_review_required", reason_label: "Review" },
  })], [{ accountId: "account-1", activeRunRequestStatus: null, activeRunStatus: null, runtimeIndicator: { state: "idle", reason: "completed" }, currentBlocker: null }])[0];
  assert.equal(result.status, "ready");
  assert.equal(result.eligibility, "can_start");
  assert.equal(result.eligibilityReason, "ready");
});

test("a real current blocking action remains visible after the run", () => {
  const result = mergeProfilesLiveProjection([profile()], [{
    accountId: "account-1",
    currentBlocker: { actionType: "operator_review_required", status: "pending", blockingCampaign: true },
  }])[0];
  assert.equal(result.eligibility, "blocked_now");
  assert.equal(result.eligibilityReason, "operator_review_required");
});

test("light polling refreshes rolling follower growth without a full Profiles refresh", () => {
  const followerDelta3d = {
    value: -2,
    currentFollowers: 12,
    previousFollowers: 14,
    from: "2026-07-10T12:00:00.000Z",
    to: "2026-07-13T12:00:00.000Z",
    source: "ig_account_follower_snapshots",
    freshness: "complete",
  };
  const result = mergeProfilesLiveProjection([profile({ followerDelta3d: { value: null } })], [{
    accountId: "account-1",
    followerDelta3d,
  }])[0];
  assert.deepEqual(result.followerDelta3d, followerDelta3d);
});

test("existing device groups receive scheduler activity and terminal updates from light polling", () => {
  const stale = profile({ status: "ready", activeRunRequestStatus: null });
  const group = {
    deviceId: "phone-1",
    deviceLabel: "Samsung A16-01",
    deviceSerial: "RFGL145VCKE",
    deviceSerialLabel: "RFGL…VCKE",
    deviceStatus: "online",
    phoneStatus: "idle",
    deviceView: { available: true, unavailableReason: null },
    summary: { total: 1, normal: 1, dual: 0, other: 0 },
    profiles: [stale],
  };
  const schedulerActive = profile({ status: "running", activeRunRequestStatus: "running", runtimeIndicator: { state: "active", reason: "active_run" } });
  const activeGroup = mergeGroupedProfiles([group], [schedulerActive])[0];
  assert.equal(activeGroup.profiles[0].status, "running");
  assert.equal(activeGroup.profiles[0].activeRunRequestStatus, "running");

  const terminal = profile({ status: "blocked", activeRunRequestStatus: null, activeRunStatus: null, runtimeIndicator: { state: "error", reason: "failed" } });
  const terminalGroup = mergeGroupedProfiles([activeGroup], [terminal])[0];
  assert.equal(terminalGroup.profiles[0].status, "blocked");
  assert.equal(terminalGroup.profiles[0].activeRunRequestStatus, null);
  assert.equal(terminalGroup.profiles[0].runtimeIndicator.state, "error");
});

test("stopping remains active in grouped profiles until the terminal patch arrives", () => {
  const group = {
    deviceId: "phone-1", deviceLabel: "Samsung A16-01", deviceSerial: "RFGL145VCKE", deviceSerialLabel: "RFGL…VCKE",
    deviceStatus: "online", phoneStatus: "active", deviceView: { available: true, unavailableReason: null },
    summary: { total: 1, normal: 1, dual: 0, other: 0 }, profiles: [profile()],
  };
  const stopping = profile({ status: "running", activeRunRequestStatus: "stopping", activeRunStatus: "stopping", runControlPhase: "stopping" });
  const projected = mergeGroupedProfiles([group], [stopping])[0].profiles[0];
  assert.equal(projected.status, "running");
  assert.equal(projected.runControlPhase, "stopping");
});

test("accepts only a strictly newer revision for the exact active run", () => {
  const currentRunCounters = { follows: 11, likes: 8, unfollows: 0, comments: 0, dms: 0, stories: 0, interactionsTotal: 19, runId: "run-1", revision: 16 };
  const newer = { ...currentRunCounters, follows: 12, interactionsTotal: 20, revision: 17 };
  const accepted = mergeProfilesLiveProjection([profile({ currentRunCounters })], [{ accountId: "account-1", activeRunId: "run-1", currentRunCounters: newer }])[0];
  assert.deepEqual(accepted.currentRunCounters, newer);

  for (const revision of [16, 15]) {
    const stale = { ...newer, follows: 99, revision };
    const ignored = mergeProfilesLiveProjection([profile({ currentRunCounters: newer })], [{ accountId: "account-1", activeRunId: "run-1", currentRunCounters: stale }])[0];
    assert.deepEqual(ignored.currentRunCounters, newer);
  }
});

test("rejects counters for a run other than the exact active run", () => {
  const currentRunCounters = { follows: 4, likes: 3, unfollows: 0, comments: 0, dms: 0, stories: 0, interactionsTotal: 7, runId: "run-current", revision: 4 };
  const wrongRun = { ...currentRunCounters, follows: 50, runId: "run-old", revision: 99 };
  const result = mergeProfilesLiveProjection([profile({ currentRunCounters })], [{ accountId: "account-1", activeRunId: "run-current", currentRunCounters: wrongRun }])[0];
  assert.deepEqual(result.currentRunCounters, currentRunCounters);
});

test("a new exact run resets revision and terminal final revision remains monotone", () => {
  const oldRun = { follows: 10, likes: 9, unfollows: 0, comments: 0, dms: 0, stories: 0, interactionsTotal: 19, runId: "run-old", revision: 21 };
  const newRun = { follows: 0, likes: 0, unfollows: 0, comments: 0, dms: 0, stories: 0, interactionsTotal: 0, runId: "run-new", revision: 0 };
  const reset = mergeProfilesLiveProjection([profile({ currentRunCounters: oldRun })], [{ accountId: "account-1", activeRunId: "run-new", currentRunCounters: newRun }])[0];
  assert.deepEqual(reset.currentRunCounters, newRun);

  const terminal = { ...newRun, follows: 10, likes: 9, interactionsTotal: 19, revision: 19 };
  const finalized = mergeProfilesLiveProjection([reset], [{ accountId: "account-1", runtimeIndicator: { state: "idle", reason: "completed", lastRunId: "run-new" }, currentRunCounters: terminal }])[0];
  assert.deepEqual(finalized.currentRunCounters, terminal);
});

test("reload accepts an initial versioned snapshot and never invents an optimistic increment", () => {
  const snapshot = { follows: 12, likes: 8, unfollows: 0, comments: 0, dms: 0, stories: 0, interactionsTotal: 20, runId: "run-1", revision: 17 };
  const loaded = mergeProfilesLiveProjection([profile({ currentRunCounters: undefined })], [{ accountId: "account-1", activeRunId: "run-1", currentRunCounters: snapshot }])[0];
  assert.deepEqual(loaded.currentRunCounters, snapshot);

  const unchanged = mergeProfilesLiveProjection([loaded], [{ accountId: "account-1", activeRunId: "run-1" }])[0];
  assert.deepEqual(unchanged.currentRunCounters, snapshot);
});

test("an unversioned payload cannot replace versioned state but legacy merges remain compatible", () => {
  const versioned = { follows: 12, likes: 8, unfollows: 0, comments: 0, dms: 0, stories: 0, interactionsTotal: 20, runId: "run-1", revision: 17 };
  const unversioned = { ...versioned, follows: 99 };
  delete unversioned.revision;
  const protectedResult = mergeProfilesLiveProjection([profile({ currentRunCounters: versioned })], [{ accountId: "account-1", activeRunId: "run-1", currentRunCounters: unversioned }])[0];
  assert.deepEqual(protectedResult.currentRunCounters, versioned);

  const legacy = mergeProfilesLiveProjection([profile({ currentRunCounters: undefined })], [{ accountId: "account-1", currentRunCounters: unversioned }])[0];
  assert.deepEqual(legacy.currentRunCounters, unversioned);
});
