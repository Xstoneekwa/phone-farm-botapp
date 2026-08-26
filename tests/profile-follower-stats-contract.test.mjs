import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

const mainSource = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
const profilesSource = readFileSync(new URL("../src/views/profiles/ProfilesView.tsx", import.meta.url), "utf8");
const statsSource = readFileSync(new URL("../src/views/profiles/drawers/StatsDrawer.tsx", import.meta.url), "utf8");
const metricContractSource = readFileSync(new URL("../src/views/profiles/profile-metric-contract.ts", import.meta.url), "utf8");
const snapshotContractSource = readFileSync(new URL("../src/views/profiles/stats-snapshot-contract.ts", import.meta.url), "utf8");

test("desktop mapping preserves null follower deltas instead of coercing them to zero", () => {
  assert.match(mainSource, /account\.followerDelta3d\.value === null/);
  assert.match(mainSource, /readOptionalNumber/);
});

test("profile row retains gain, loss, or neutral and makes the historical 72h period explicit", () => {
  assert.doesNotMatch(metricContractSource, /live|gain du jour/i);
  assert.match(metricContractSource, /Rolling 72 h/);
  assert.match(metricContractSource, /deltaFrom \?\? delta\?\.from/);
  assert.match(metricContractSource, /deltaTo \?\? delta\?\.to/);
  assert.match(profilesSource, /followerDeltaTooltip/);
});

test("Stats drawer distinguishes available, pending, stale and unavailable snapshots", () => {
  assert.match(snapshotContractSource, /Followers snapshots available/);
  assert.match(snapshotContractSource, /Followers snapshot pending/);
  assert.match(snapshotContractSource, /Followers snapshot stale/);
  assert.match(snapshotContractSource, /Followings unavailable/);
  assert.match(statsSource, /snapshotStatusSummary/);
});
