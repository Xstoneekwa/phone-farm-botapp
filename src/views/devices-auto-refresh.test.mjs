import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  createDevicesAutoRefreshController,
  DEVICES_REFRESH_INTERVAL_MS,
  DEVICES_RELATIVE_TICK_MS,
  shouldPollDevices,
} from "./devices-auto-refresh.ts";
import {
  formatRelativeTimeFr,
  projectBackendHeartbeat,
  summarizeBackendHeartbeats,
} from "./device-backend-heartbeat.ts";

function fakeTimers() {
  const intervals = new Map();
  let nextId = 1;
  return {
    intervals,
    setIntervalFn(handler, ms) {
      const id = nextId++;
      intervals.set(id, { handler, ms });
      return id;
    },
    clearIntervalFn(id) {
      intervals.delete(id);
    },
    tickAll() {
      for (const { handler } of intervals.values()) handler();
    },
  };
}

function samsungDevice(overrides = {}) {
  return {
    id: "phone-1",
    name: "Samsung A16-01",
    status: "connected",
    backendStatus: "available",
    deviceKind: "physical_phone",
    localAdbStatus: "device",
    backendHeartbeatDbStatus: "online",
    backendLastSeenAt: "2026-07-05T21:00:00.000Z",
    appInstances: [{ selectable: true }],
    appInstancesAvailableCount: 1,
    ...overrides,
  };
}

test("shouldPollDevices requires the devices route and a visible window", () => {
  assert.equal(shouldPollDevices("devices", "visible"), true);
  assert.equal(shouldPollDevices("devices", "hidden"), false);
  assert.equal(shouldPollDevices("overview", "visible"), false);
});

test("cadence: fetch every 15s and relative tick every 15s", () => {
  assert.equal(DEVICES_REFRESH_INTERVAL_MS, 15_000);
  assert.equal(DEVICES_RELATIVE_TICK_MS, 15_000);
});

test("start(visible) refreshes immediately then on every interval tick without caching", () => {
  const timers = fakeTimers();
  let calls = 0;
  const controller = createDevicesAutoRefreshController({
    refresh: () => { calls += 1; },
    ...timers,
  });
  controller.start(true);
  assert.equal(calls, 1, "immediate refresh on start");
  assert.equal(controller.isPolling(), true);
  timers.tickAll();
  timers.tickAll();
  assert.equal(calls, 3, "each tick triggers a fresh fetch (no memoized response)");
  const [{ ms }] = timers.intervals.values();
  assert.equal(ms, DEVICES_REFRESH_INTERVAL_MS);
});

test("start(hidden) does not poll; timers stop when the window is hidden", () => {
  const timers = fakeTimers();
  let calls = 0;
  const controller = createDevicesAutoRefreshController({
    refresh: () => { calls += 1; },
    ...timers,
  });
  controller.start(false);
  assert.equal(calls, 0);
  assert.equal(controller.isPolling(), false);

  controller.handleVisibilityChange(true);
  assert.equal(calls, 1);
  controller.handleVisibilityChange(false);
  assert.equal(controller.isPolling(), false);
  assert.equal(timers.intervals.size, 0, "no interval left while hidden");
});

test("returning to the foreground refreshes immediately and resumes polling", () => {
  const timers = fakeTimers();
  let calls = 0;
  const controller = createDevicesAutoRefreshController({
    refresh: () => { calls += 1; },
    ...timers,
  });
  controller.start(true);
  controller.handleVisibilityChange(false);
  const beforeReturn = calls;
  controller.handleVisibilityChange(true);
  assert.equal(calls, beforeReturn + 1, "immediate refresh on foreground return");
  assert.equal(controller.isPolling(), true);
});

test("stop() clears the interval and ignores later visibility events", () => {
  const timers = fakeTimers();
  let calls = 0;
  const controller = createDevicesAutoRefreshController({
    refresh: () => { calls += 1; },
    ...timers,
  });
  controller.start(true);
  controller.stop();
  assert.equal(controller.isPolling(), false);
  assert.equal(timers.intervals.size, 0);
  controller.handleVisibilityChange(true);
  assert.equal(calls, 1, "no refresh after stop, even on visibility change");
});

test("a new backend heartbeat surfaces automatically on the next refresh", () => {
  // Simulates the fetch pipeline: each refresh delivers fresher relay data and
  // the projection must follow it (no stale cache masking a new heartbeat).
  const timers = fakeTimers();
  const heartbeatFeed = [
    "2026-07-05T21:00:00.000Z",
    "2026-07-05T21:01:00.000Z",
    "2026-07-05T21:02:00.000Z",
  ];
  let fetchCount = 0;
  let device = samsungDevice();
  const controller = createDevicesAutoRefreshController({
    refresh: () => {
      device = samsungDevice({ backendLastSeenAt: heartbeatFeed[Math.min(fetchCount, heartbeatFeed.length - 1)] });
      fetchCount += 1;
    },
    ...timers,
  });
  controller.start(true);
  const now = new Date("2026-07-05T21:02:30.000Z");
  timers.tickAll();
  timers.tickAll();
  const projection = projectBackendHeartbeat(device, { now });
  assert.equal(fetchCount, 3);
  assert.equal(device.backendLastSeenAt, "2026-07-05T21:02:00.000Z");
  assert.equal(projection.label, "active");
  assert.equal(projection.relativeFr, "il y a 30 s");
});

test("relative label advances with the local clock tick, without any fetch", () => {
  const lastSeenAt = "2026-07-05T21:00:00.000Z";
  assert.equal(formatRelativeTimeFr(lastSeenAt, new Date("2026-07-05T21:00:45.000Z")), "il y a 45 s");
  assert.equal(formatRelativeTimeFr(lastSeenAt, new Date("2026-07-05T21:01:00.000Z")), "il y a 1 min");
  assert.equal(formatRelativeTimeFr(lastSeenAt, new Date("2026-07-05T21:03:15.000Z")), "il y a 3 min");
});

test("active Samsung stays distinct from the stale emulator", () => {
  const now = new Date("2026-07-05T21:02:00.000Z");
  const samsung1 = samsungDevice({ id: "phone-1", name: "Samsung A16-01", backendLastSeenAt: "2026-07-05T21:01:20.000Z" });
  const samsung2 = samsungDevice({ id: "phone-2", name: "Samsung A16-02", backendLastSeenAt: "2026-07-05T21:01:21.000Z" });
  const emulator = samsungDevice({
    id: "emu-1",
    name: "Entry 2C Emulator Full Cycle",
    status: "offline",
    localAdbStatus: "not_seen",
    backendHeartbeatDbStatus: "stale",
    backendLastSeenAt: "2026-05-24T23:40:32.000Z",
  });
  const summary = summarizeBackendHeartbeats([samsung1, samsung2, emulator], now);
  assert.equal(summary.active, 2, "both Samsung phones are active");
  assert.equal(summary.expired, 1, "the stale emulator is counted as expired, never active");
  const emulatorProjection = projectBackendHeartbeat(emulator, { now });
  assert.equal(emulatorProjection.label, "expired");
  assert.equal(emulatorProjection.assignable, false);
});

test("App wires devices polling gated on route + visibility with cleanup", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /createDevicesAutoRefreshController/);
  assert.match(appSource, /shouldPollDevices\(active, document\.visibilityState\)/);
  assert.match(appSource, /active !== "devices"\) return/);
  assert.match(appSource, /addEventListener\("visibilitychange"/);
  assert.match(appSource, /removeEventListener\("visibilitychange"/);
  assert.match(appSource, /controller\.stop\(\)/);
});

test("Devices view recomputes relative labels from a paused-aware clock tick", () => {
  const devicesSource = readFileSync(new URL("./Devices.tsx", import.meta.url), "utf8");
  assert.match(devicesSource, /useHeartbeatNowTick/);
  assert.match(devicesSource, /DEVICES_RELATIVE_TICK_MS/);
  assert.match(devicesSource, /projectBackendHeartbeat\(device, \{ pending, now \}\)/);
  assert.match(devicesSource, /summarizeBackendHeartbeats\(devices, now\)/);
  // The manual Refresh button must stay available as a manual action.
  assert.match(devicesSource, />Refresh<\/button>/);
});
