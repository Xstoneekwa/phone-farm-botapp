import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { followerDeltaTooltip, unfollowMetricTooltip } from "./profile-metric-contract.ts";
import { snapshotStatusSummary } from "./stats-snapshot-contract.ts";

test("+8 is described as a stale rolling 72h delta with exact dates", () => {
  const title = followerDeltaTooltip({
    window: "rolling_72h", periodHours: 72, value: 8,
    currentFollowers: 108, previousFollowers: 100,
    from: "2026-07-17T00:30:00.000Z", to: "2026-07-20T00:30:00.000Z",
    deltaFrom: "2026-07-17T00:30:00.000Z", deltaTo: "2026-07-20T00:30:00.000Z",
    latestSnapshotAt: "2026-07-20T00:30:00.000Z", baselineSnapshotAt: "2026-07-17T00:30:00.000Z",
    source: "ig_account_follower_snapshots", windowCoverage: "complete", dataFreshness: "stale", staleAfterHours: 36,
  });
  assert.equal(title, "+8 · Rolling 72 h · 17 Jul → 20 Jul · Snapshot stale");
  assert.doesNotMatch(title, /live|today/i);
});

test("unfollow tooltip separates verified count, cap, and eligible stock", () => {
  const title = unfollowMetricTooltip({
    unfollowDoneToday: 11, unfollowDailyCap: 120, unfollowEffectiveLimit: 120,
    lastRunEligibleAtStart: 51, lastRunAttempted: 11, lastRunVerified: 11,
    lastRunRemainingEligible: 40, lastRunCoverageStatus: "partial",
    lastRunStopReason: "ui_coverage_budget_exhausted", metricsAsOf: "2026-07-20T17:03:33.000Z",
    source: "ig_runs.performance_summary",
  });
  assert.match(title, /51 eligible at last-run start/);
  assert.match(title, /40 eligible remaining/);
  assert.doesNotMatch(title, /11\/120|11\/51/);
});

test("snapshot status covers Available, Stale, No data, and Unavailable", () => {
  assert.equal(snapshotStatusSummary({ source_status: { followers: { status: "available" }, followings: { status: "available" } } }), "Followers snapshots available · Followings snapshots available");
  assert.equal(snapshotStatusSummary({ source_status: { followers: { status: "stale" }, followings: { status: "unavailable" } } }), "Followers snapshot stale · Followings unavailable");
  assert.equal(snapshotStatusSummary({ source_status: { followers: { status: "no_data" }, followings: { status: "no_data" } } }), "Followers snapshot pending · Followings snapshot pending");
});

test("BotApp mapping preserves null follower delta and renders no misleading Unfollow denominator", () => {
  const main = readFileSync(new URL("../../../electron/main.cjs", import.meta.url), "utf8");
  const view = readFileSync(new URL("./ProfilesView.tsx", import.meta.url), "utf8");
  const stats = readFileSync(new URL("./drawers/StatsDrawer.tsx", import.meta.url), "utf8");
  assert.match(main, /account\.followerDelta3d\.value === null[\s\S]*return null/);
  assert.match(view, /separateCap=\{metric\.key === "unfollow"\}/);
  assert.doesNotMatch(stats, /<ActionPill kind="unfollow"/);
});
