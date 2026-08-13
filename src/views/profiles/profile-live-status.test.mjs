import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalConnectBadge, socialBadge } from "./profile-growth-badge.ts";
import { displayRunCounters, runtimeIndicatorState } from "./run-control.ts";

const electronMain = readFileSync(new URL("../../../electron/main.cjs", import.meta.url), "utf8");

function profile(overrides = {}) {
  return {
    id: "account-1",
    status: "ready",
    loginStatus: "connected",
    readiness: "ready",
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
    socialBadge(profile({ readiness: "blocked", eligibility: "blocked_now", eligibilityReason: "unknown_projection" })),
    { label: "growth status unavailable", tone: "info" },
  );
});

test("paused manual review wins over Growth readiness", () => {
  assert.deepEqual(
    socialBadge(profile({ accountRuntimeStatus: "paused_manual_review" })),
    { label: "operator review required", tone: "warning" },
  );
});

test("first overview projection preserves the canonical runtime pause field", () => {
  assert.match(
    electronMain,
    /accountRuntimeStatus:\s*account\?\.accountRuntimeStatus\s*\|\|\s*account\?\.account_runtime_status\s*\|\|\s*null/,
  );
  assert.deepEqual(
    socialBadge(profile({ accountRuntimeStatus: "paused_manual_review", readiness: "ready" })),
    { label: "operator review required", tone: "warning" },
  );
});

test("known operator review wins when readiness projection is missing", () => {
  assert.deepEqual(
    socialBadge(profile({ readiness: "blocked", eligibility: "blocked_now", eligibilityReason: "operator_review_required" })),
    { label: "operator review required", tone: "warning" },
  );
});

test("real current blocker remains visible when there is no active runtime", () => {
  assert.deepEqual(
    socialBadge(profile({ readiness: "blocked", eligibility: "blocked_now", eligibilityReason: "blocking_dashboard_action" })),
    { label: "operator review required", tone: "warning" },
  );
});

test("structured Welcome failures expose operator review instead of unavailable", () => {
  assert.deepEqual(
    socialBadge(profile({ readiness: "blocked", eligibility: "blocked_now", eligibilityReason: "recovered_snapshot_rejected" })),
    { label: "operator review required", tone: "warning" },
  );
});

test("unstructured worker failure remains an explicit business blocker", () => {
  assert.deepEqual(
    socialBadge(profile({ readiness: "blocked", eligibility: "blocked_now", eligibilityReason: "worker_exit_nonzero" })),
    { label: "growth blocked: worker failure", tone: "warning" },
  );
});

test("terminal idle preserves canonical counters instead of returning to zero", () => {
  const terminal = profile({ currentRunCounters: { follows: 0, likes: 0, dms: 0, interactionsTotal: 0 } });
  assert.deepEqual(displayRunCounters(terminal), { mode: "today", follow: 10, like: 10, dm: 0, total: 0 });
});

test("READY_TO_CONNECT_ONLY_WHEN_CANONICAL_LOGIN_REQUIRES_CONNECTION", () => {
  assert.deepEqual(
    canonicalConnectBadge(profile({
      credentialStatus: "active",
      autoLoginRequirement: { enabled: true },
      loginStatus: "connected",
    })),
    { label: "connected", tone: "success" },
  );
  assert.deepEqual(
    canonicalConnectBadge(profile({
      credentialStatus: "active",
      autoLoginRequirement: { enabled: true },
      loginStatus: "logged_out",
      readiness: "needs_login",
    })),
    { label: "ready to connect", tone: "info" },
  );
});

test("social collection state never becomes login truth", () => {
  for (const dataFreshness of ["failed", "stale", "unavailable"]) {
    const connected = profile({
      followerDelta3d: { dataFreshness, windowCoverage: "insufficient_data" },
    });
    assert.deepEqual(canonicalConnectBadge(connected), { label: "connected", tone: "success" });
    assert.deepEqual(socialBadge(connected), { label: "growth ready", tone: "success" });
  }
});

test("login-required badge is canonical and is not labelled as social", () => {
  const disconnected = profile({ loginStatus: "logged_out", readiness: "needs_login" });
  assert.deepEqual(socialBadge(disconnected), { label: "login required", tone: "warning" });
});
