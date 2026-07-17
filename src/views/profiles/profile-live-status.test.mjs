import assert from "node:assert/strict";
import test from "node:test";
import { socialBadge } from "./profile-growth-badge.ts";
import { displayRunCounters, runtimeIndicatorState } from "./run-control.ts";

function profile(overrides = {}) {
  return {
    id: "account-1",
    status: "ready",
    loginStatus: "connected",
    eligibility: "can_start",
    eligibilityReason: "ready",
    eligibilityDetail: { status: "can_start", primary_block_reason: "", reason_label: "Ready", reason_description: "Ready" },
    runtimeLock: "none",
    counters: { follow: { current: 10, max: 120 }, unfollow: { current: 0, max: 120 }, like: { current: 10, max: 100 }, comment: { current: 0, max: 0 }, dm: { current: 0, max: 2 } },
    ...overrides,
  };
}

test("active request wins over a stale historical badge", () => {
  const active = profile({
    status: "running",
    activeRunRequestStatus: "claimed",
    eligibility: "blocked_now",
    eligibilityReason: "social_blocked_reason_required",
  });
  assert.deepEqual(socialBadge(active), { label: "active", tone: "success" });
  assert.equal(runtimeIndicatorState(active), "active");
});

test("active runtime wins over stale login state", () => {
  assert.deepEqual(
    socialBadge(profile({ loginStatus: "ready", activeRunStatus: "running" })),
    { label: "active", tone: "success" },
  );
});

test("unknown non-blocking state never invents social blocked fallback", () => {
  assert.deepEqual(
    socialBadge(profile({ eligibility: "blocked_now", eligibilityReason: "unknown_projection" })),
    { label: "growth status unavailable", tone: "info" },
  );
});

test("real current blocker remains visible when there is no active runtime", () => {
  assert.deepEqual(
    socialBadge(profile({ eligibility: "blocked_now", eligibilityReason: "blocking_dashboard_action" })),
    { label: "social review required", tone: "warning" },
  );
});

test("structured Welcome failures expose operator review instead of unavailable", () => {
  assert.deepEqual(
    socialBadge(profile({ eligibility: "blocked_now", eligibilityReason: "recovered_snapshot_rejected" })),
    { label: "operator review required", tone: "warning" },
  );
});

test("unstructured worker failure remains an explicit business blocker", () => {
  assert.deepEqual(
    socialBadge(profile({ eligibility: "blocked_now", eligibilityReason: "worker_exit_nonzero" })),
    { label: "growth blocked: worker failure", tone: "warning" },
  );
});

test("terminal idle preserves canonical counters instead of returning to zero", () => {
  const terminal = profile({ currentRunCounters: { follows: 0, likes: 0, dms: 0, interactionsTotal: 0 } });
  assert.deepEqual(displayRunCounters(terminal), { mode: "today", follow: 10, unfollow: 0, like: 10, dm: 0, total: 0 });
});
