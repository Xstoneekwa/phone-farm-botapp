import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import {
  createProfilesAutoRefreshController,
  PROFILES_ACTIVE_REFRESH_MS,
  PROFILES_IDLE_REFRESH_MS,
  shouldPollProfiles,
} from "./profiles-auto-refresh.ts";

function fakeTimers() {
  const timers = new Map();
  let nextId = 1;
  return {
    timers,
    setTimeoutFn(handler, ms) {
      const id = nextId++;
      timers.set(id, { handler, ms });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    async tick() {
      const entry = timers.values().next().value;
      assert.ok(entry, "one refresh timer is scheduled");
      timers.clear();
      entry.handler();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test("idle Profiles polls immediately and every four seconds", async () => {
  const timers = fakeTimers();
  let calls = 0;
  const controller = createProfilesAutoRefreshController({
    refresh: () => { calls += 1; },
    isRuntimeActive: () => false,
    ...timers,
  });
  controller.start(true);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(timers.timers.size, 1);
  assert.equal(timers.timers.values().next().value.ms, PROFILES_IDLE_REFRESH_MS);
  await timers.tick();
  assert.equal(calls, 2);
});

test("idle snapshot discovers active backend and adapts to two seconds", async () => {
  const timers = fakeTimers();
  let active = false;
  let calls = 0;
  const controller = createProfilesAutoRefreshController({
    refresh: () => { calls += 1; if (calls === 2) active = true; },
    isRuntimeActive: () => active,
    ...timers,
  });
  controller.start(true);
  await Promise.resolve();
  await timers.tick();
  assert.equal(active, true);
  assert.equal(timers.timers.values().next().value.ms, PROFILES_ACTIVE_REFRESH_MS);
});

test("focus, visibility and relay reconnect refresh immediately without duplicate timers", async () => {
  const timers = fakeTimers();
  let calls = 0;
  const controller = createProfilesAutoRefreshController({
    refresh: () => { calls += 1; },
    isRuntimeActive: () => false,
    ...timers,
  });
  controller.start(true);
  await Promise.resolve();
  controller.handleFocus();
  await Promise.resolve();
  controller.handleVisibilityChange(true);
  await Promise.resolve();
  controller.handleRelayReconnect();
  await Promise.resolve();
  assert.equal(calls, 4);
  assert.equal(timers.timers.size, 1);
  controller.stop();
  assert.equal(timers.timers.size, 0);
});

test("navigation cleanup leaves no old timer and manual Refresh remains wired", async () => {
  const timers = fakeTimers();
  const controller = createProfilesAutoRefreshController({
    refresh: () => undefined,
    isRuntimeActive: () => false,
    ...timers,
  });
  controller.start(true);
  await Promise.resolve();
  controller.stop();
  controller.start(true);
  await Promise.resolve();
  assert.equal(timers.timers.size, 1);
  assert.equal(shouldPollProfiles("profiles", "visible"), true);
  assert.equal(shouldPollProfiles("overview", "visible"), false);
  const appSource = readFileSync(new URL("../../app/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /loadOverviewData\("manual_refresh"\)/);
  assert.match(appSource, /removeEventListener\("focus"/);
});
