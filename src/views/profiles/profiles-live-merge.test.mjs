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

test("an older UTC-day payload cannot overwrite a newer SAST projection", () => {
  const current = profile({
    counters: {
      follow: { current: 14, max: 20 }, unfollow: { current: 0, max: 120 }, like: { current: 6, max: 100 },
      comment: { current: 0, max: 0 }, dm: { current: 0, max: 2 },
    },
    interactionsToday: 20,
    counterProjection: {
      businessDate: "2026-07-28",
      businessTimezone: "Africa/Johannesburg",
      computedAt: "2026-07-27T22:50:00.000Z",
      source: "canonical_persisted_actions_sast_v1",
    },
  });
  const result = mergeProfilesLiveProjection([current], [{
    accountId: "account-1",
    countersToday: { follows: 24, likes: 15 },
    interactionsToday: 39,
    counterProjection: {
      businessDate: "2026-07-27",
      businessTimezone: "Africa/Johannesburg",
      computedAt: "2026-07-27T23:00:00.000Z",
      source: "canonical_persisted_actions_sast_v1",
    },
  }])[0];
  assert.equal(result.counters.follow.current, 14);
  assert.equal(result.counters.like.current, 6);
  assert.equal(result.interactionsToday, 20);
  assert.equal(result.counterProjection.businessDate, "2026-07-28");
});

test("same SAST day accepts only an authoritative projection computed later", () => {
  const current = profile({
    counterProjection: {
      businessDate: "2026-07-28",
      businessTimezone: "Africa/Johannesburg",
      computedAt: "2026-07-27T23:00:00.000Z",
      source: "canonical_persisted_actions_sast_v1",
    },
  });
  const stale = mergeProfilesLiveProjection([current], [{
    accountId: "account-1",
    countersToday: { follows: 99 },
    counterProjection: {
      businessDate: "2026-07-28",
      businessTimezone: "Africa/Johannesburg",
      computedAt: "2026-07-27T22:59:59.000Z",
      source: "canonical_persisted_actions_sast_v1",
    },
  }])[0];
  assert.equal(stale.counters.follow.current, 5);

  const fresh = mergeProfilesLiveProjection([current], [{
    accountId: "account-1",
    countersToday: { follows: 6 },
    counterProjection: {
      businessDate: "2026-07-28",
      businessTimezone: "Africa/Johannesburg",
      computedAt: "2026-07-27T23:00:01.000Z",
      source: "canonical_persisted_actions_sast_v1",
    },
  }])[0];
  assert.equal(fresh.counters.follow.current, 6);
});

test("a source without the canonical freshness contract cannot replace counters", () => {
  const current = profile({
    counterProjection: {
      businessDate: "2026-07-28",
      businessTimezone: "Africa/Johannesburg",
      computedAt: "2026-07-27T23:00:00.000Z",
      source: "canonical_persisted_actions_sast_v1",
    },
  });
  const result = mergeProfilesLiveProjection([current], [{
    accountId: "account-1",
    countersToday: { follows: 88 },
    counterProjection: {
      businessDate: "2026-07-28",
      businessTimezone: "Africa/Johannesburg",
      computedAt: "2026-07-27T23:00:02.000Z",
      source: "legacy_utc_projection",
    },
  }])[0];
  assert.equal(result.counters.follow.current, 5);
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
