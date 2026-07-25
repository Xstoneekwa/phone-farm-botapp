import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const metricSource = readFileSync(new URL("./profile-metric-contract.ts", import.meta.url), "utf8");
const snapshotSource = readFileSync(new URL("./stats-snapshot-contract.ts", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("./drawers/StatsDrawer.tsx", import.meta.url), "utf8");
const { formatSnapshotMetric, snapshotStatusSummary } = await import("./stats-snapshot-contract.ts");
const {
  followerDeltaDisplayLabel,
  followerDeltaDisplayTone,
  followerDeltaTooltip,
} = await import("./profile-metric-contract.ts");

test("+8 is a stale rolling 72h delta with exact dates, never live", () => {
  const delta = {
    value: 8,
    baselineValue: 20,
    currentValue: 28,
    baselineCapturedAt: "2026-07-15T00:00:00.000Z",
    currentCapturedAt: "2026-07-18T00:00:00.000Z",
    ageSeconds: 4 * 24 * 3600,
    windowCoverageHours: 72,
    status: "stale",
    source: "ig_account_social_profile_snapshots",
  };
  assert.equal(followerDeltaDisplayLabel(delta), "+8 · 3d · stale");
  assert.equal(followerDeltaDisplayTone(delta), "stale");
  assert.match(followerDeltaTooltip(delta), /Current 28/);
  assert.match(followerDeltaTooltip(delta), /Baseline 20/);
  assert.match(followerDeltaTooltip(delta), /Updated 4 days ago/);
  assert.match(followerDeltaTooltip(delta), /Status stale/);
  assert.doesNotMatch(metricSource, /gain du jour|live delta/i);
});

test("fresh, aging, insufficient and real zero deltas remain explicit", () => {
  assert.equal(followerDeltaDisplayLabel({ value: 6, status: "fresh", source: "canonical" }), "+6 · 3d");
  assert.equal(followerDeltaDisplayLabel({ value: -2, status: "aging", source: "canonical" }), "-2 · 3d · aging");
  assert.equal(followerDeltaDisplayLabel({ value: 0, status: "fresh", source: "canonical" }), "0 · 3d");
  assert.equal(followerDeltaDisplayLabel({ value: null, status: "insufficient_data", source: "canonical" }), "— · 3d");
});

test("unfollow tooltip separates verified count, cap, stock and coverage", () => {
  assert.match(metricSource, /eligible at last-run start/);
  assert.match(metricSource, /attempted in last run/);
  assert.match(metricSource, /verified in last run/);
  assert.match(metricSource, /eligible remaining/);
  assert.match(metricSource, /UI coverage/);
  assert.match(metricSource, /stop \$\{metrics\.lastRunStopReason\}/);
  assert.match(metricSource, /displayedCurrent/);
  assert.match(metricSource, /detailed last-run coverage unavailable/);
});

test("snapshot status covers available, stale and pending persisted metrics", () => {
  assert.match(snapshotSource, /Followers snapshots available/);
  assert.match(snapshotSource, /Followers snapshot stale/);
  assert.match(snapshotSource, /Followers snapshot pending/);
  assert.match(snapshotSource, /Followings snapshot pending/);
  assert.match(snapshotSource, /Posts snapshot pending/);
  assert.doesNotMatch(snapshotSource, /Followings unavailable/);
});

test("profile row keeps the compact numerator/denominator Unfollow display", () => {
  const view = readFileSync(new URL("./ProfilesView.tsx", import.meta.url), "utf8");
  assert.match(view, /counter-cap">\/\{max\}/);
  assert.doesNotMatch(view, /separateCap|cap \{max\}/);
});

test("snapshot metric formatter renders complete modern values and preserves real zeroes", () => {
  assert.deepEqual(
    [53, 57, 1].map(formatSnapshotMetric),
    ["53", "57", "1"],
  );
  assert.deepEqual(
    [31, 163, 0].map(formatSnapshotMetric),
    ["31", "163", "0"],
  );
  assert.deepEqual(
    [0, 0, 0].map(formatSnapshotMetric),
    ["0", "0", "0"],
  );
});

test("snapshot metric formatter renders missing and invalid values as an em dash", () => {
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, "0", {}]) {
    assert.equal(formatSnapshotMetric(value), "—");
  }
  assert.deepEqual(
    [38, null, null].map(formatSnapshotMetric),
    ["38", "—", "—"],
  );
  assert.deepEqual(
    [null, null, null].map(formatSnapshotMetric),
    ["—", "—", "—"],
  );
});

test("historical metric cells never render collection-state labels", () => {
  const cellSource = drawerSource.slice(
    drawerSource.indexOf("function SnapshotCell"),
    drawerSource.indexOf("function actionPillClass"),
  );
  assert.match(cellSource, /formatSnapshotMetric\(value\)/);
  assert.doesNotMatch(cellSource, /Unavailable|Pending|Not available|Unknown|N\/A/);
  assert.doesNotMatch(cellSource, /value\s*\|\|/);
});

test("pending summary follows the backend baseline status, not partial legacy rows", () => {
  const partialLegacy = {
    days: [{ followers_count: 38, followings_count: null, posts_count: null }],
  };
  assert.doesNotMatch(snapshotStatusSummary(partialLegacy), /pending/i);

  const baselinePending = {
    ...partialLegacy,
    source_status: {
      followers: { status: "available" },
      followings: { status: "no_data" },
      posts: { status: "no_data" },
    },
  };
  assert.match(snapshotStatusSummary(baselinePending), /Followings snapshot pending/);
  assert.match(snapshotStatusSummary(baselinePending), /Posts snapshot pending/);

  const modernBaseline = {
    ...partialLegacy,
    source_status: {
      followers: { status: "available" },
      followings: { status: "available" },
      posts: { status: "available" },
    },
  };
  assert.doesNotMatch(snapshotStatusSummary(modernBaseline), /pending/i);
});

test("opening Stats uses only the read-only statsHistory relay", () => {
  const effectSource = drawerSource.slice(
    drawerSource.indexOf("useEffect(() =>"),
    drawerSource.indexOf("function refresh()"),
  );
  assert.match(effectSource, /loadStatsHistory\(\)/);
  assert.match(drawerSource, /profiles\?\.statsHistory/);
  assert.doesNotMatch(effectSource, /onSave\(|insert|update|delete|refresh\(/i);
});
