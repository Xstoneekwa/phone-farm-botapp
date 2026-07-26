import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./drawers/SettingsDrawer.tsx", import.meta.url), "utf8");

test("Settings reads critical values from the canonical package runtime contract", () => {
  assert.match(source, /packageRuntimeContract/);
  assert.match(source, /contractSettings\.follow_day/);
  assert.match(source, /contractSettings\.follow_session/);
  assert.match(source, /contractSettings\.max_follows_per_target_per_run/);
  assert.match(source, /contractSettings\.max_targets_per_run/);
  assert.match(source, /Configuration incomplete/);
  assert.match(source, /Configured package limits/);
  assert.match(source, /Effective runtime limits/);
});

test("Settings no longer invents package or target fallback values", () => {
  assert.doesNotMatch(source, /function packageUnfollowCap/);
  assert.doesNotMatch(source, /includes\("premium"\)\) return 240/);
  assert.doesNotMatch(source, /includes\("pro"\) \? 30 : 27/);
  assert.doesNotMatch(source, /\["welcome_day_cap"\], 10/);
});

test("legacy fields stay visibly read-only", () => {
  assert.match(source, /Legacy compatibility \(read-only\)/);
  assert.match(source, /Warmup never replaces this field/);
});
