import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const metricSource = readFileSync(new URL("./profile-metric-contract.ts", import.meta.url), "utf8");
const snapshotSource = readFileSync(new URL("./stats-snapshot-contract.ts", import.meta.url), "utf8");

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
