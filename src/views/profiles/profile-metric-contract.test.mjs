import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const metricSource = readFileSync(new URL("./profile-metric-contract.ts", import.meta.url), "utf8");
const snapshotSource = readFileSync(new URL("./stats-snapshot-contract.ts", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("./drawers/StatsDrawer.tsx", import.meta.url), "utf8");
const { formatSnapshotMetric, snapshotStatusSummary } = await import("./stats-snapshot-contract.ts");

test("+8 is a stale rolling 72h delta with exact dates, never live", () => {
  assert.match(metricSource, /"Rolling 72 h"/);
  assert.match(metricSource, /delta\?\.deltaFrom \?\? delta\?\.from/);
  assert.match(metricSource, /delta\?\.deltaTo \?\? delta\?\.to/);
  assert.match(metricSource, /Snapshot \$\{delta\?\.dataFreshness/);
  assert.doesNotMatch(metricSource, /gain du jour|live delta/i);
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
