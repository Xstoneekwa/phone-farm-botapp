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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

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
    clearTimeoutFn(id) { timers.delete(id); },
    async tick() {
      const entry = timers.values().next().value;
      assert.ok(entry, "one refresh timer is scheduled");
      timers.clear();
      entry.handler();
      await Promise.resolve();
    },
  };
}

test("idle and active cadence use one timer", async () => {
  const timers = fakeTimers();
  let active = false;
  const controller = createProfilesAutoRefreshController({ refresh: () => undefined, isRuntimeActive: () => active, ...timers });
  controller.start(true);
  await Promise.resolve();
  assert.equal(timers.timers.size, 1);
  assert.equal(timers.timers.values().next().value.ms, PROFILES_IDLE_REFRESH_MS);
  active = true;
  await timers.tick();
  await Promise.resolve();
  assert.equal(timers.timers.size, 1);
  assert.equal(timers.timers.values().next().value.ms, PROFILES_ACTIVE_REFRESH_MS);
});

test("automatic triggers coalesce while a poll is in flight", async () => {
  const timers = fakeTimers();
  const pending = deferred();
  let calls = 0;
  const controller = createProfilesAutoRefreshController({
    refresh: async () => { calls += 1; if (calls === 1) await pending.promise; },
    isRuntimeActive: () => false,
    ...timers,
  });
  controller.start(true);
  await Promise.resolve();
  controller.handleFocus();
  controller.handleVisibilityChange(true);
  controller.handleRelayReconnect();
  assert.equal(calls, 1);
  pending.resolve();
  await pending.promise;
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 2);
});

test("manual Refresh supersedes an older poll response", async () => {
  const timers = fakeTimers();
  const poll = deferred();
  const manual = deferred();
  const applied = [];
  let calls = 0;
  const controller = createProfilesAutoRefreshController({
    refresh: async (reason, context) => {
      calls += 1;
      if (reason === "profiles_opened") await poll.promise;
      else await manual.promise;
      if (context.isLatest()) applied.push(reason);
    },
    isRuntimeActive: () => false,
    ...timers,
  });
  controller.start(true);
  await Promise.resolve();
  const manualRefresh = controller.requestFullRefresh();
  await Promise.resolve();
  assert.equal(calls, 2);
  manual.resolve();
  await manualRefresh;
  assert.deepEqual(applied, ["manual_refresh"]);
  poll.resolve();
  await poll.promise;
  await Promise.resolve();
  assert.deepEqual(applied, ["manual_refresh"]);
  assert.equal(timers.timers.size, 1);
});

test("stop cleans timer and disables focus, visibility and relay triggers", async () => {
  const timers = fakeTimers();
  let calls = 0;
  const controller = createProfilesAutoRefreshController({ refresh: () => { calls += 1; }, isRuntimeActive: () => false, ...timers });
  controller.start(true);
  await Promise.resolve();
  controller.stop();
  controller.handleFocus();
  controller.handleVisibilityChange(true);
  controller.handleRelayReconnect();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(timers.timers.size, 0);
  assert.equal(shouldPollProfiles("profiles", "visible"), true);
  assert.equal(shouldPollProfiles("overview", "visible"), false);
});

test("Profiles polling uses the light relay path and manual Refresh uses the same controller", () => {
  const appSource = readFileSync(new URL("../../app/App.tsx", import.meta.url), "utf8");
  const mainSource = readFileSync(new URL("../../../electron/main.cjs", import.meta.url), "utf8");
  assert.match(appSource, /data\.profilesLive\(\{ accountIds \}\)/);
  assert.match(appSource, /requestFullRefresh\("manual_refresh"\)/);
  assert.match(mainSource, /path:\s*"\/api\/instagram-dashboard\/profiles\/live"/);
  assert.match(mainSource, /dashboardGetWithQuery\("profiles_live"/);
});
