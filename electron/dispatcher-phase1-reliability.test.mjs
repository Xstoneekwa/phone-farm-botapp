import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import scheduler from "./botapp-scheduler-runtime.cjs";

const mainSource = fs.readFileSync(new URL("./main.cjs", import.meta.url), "utf8");

test("auto-heal never invokes install and uses the safe runtime-controller start", () => {
  const ensureBody = mainSource.split("async function ensureDispatcherAutostart()", 2)[1]
    .split("\nasync function dispatcherAction", 1)[0];
  assert.doesNotMatch(ensureBody, /runDispatcherWrapperAsync\("install"/);
  assert.doesNotMatch(ensureBody, /command:\s*"install"/);
  assert.match(ensureBody, /command:\s*"start"/);
  assert.match(ensureBody, /service_state !== "stopped"/);
  assert.match(ensureBody, /processRunning !== false/);
});

test("incomplete timeout payload remains UNKNOWN and tri-state", () => {
  const fallbackBody = mainSource.split("function dispatcherFallbackStatus", 2)[1]
    .split("\nfunction normalizeDispatcherStatus", 1)[0];
  assert.match(fallbackBody, /service_state:\s*"unknown"/);
  assert.match(fallbackBody, /processRunning:\s*null/);
  assert.match(fallbackBody, /launchdLoaded:\s*null/);
});

test("dispatcher status does not await remote business preflight", () => {
  const statusBody = mainSource.split("async function dispatcherStatus()", 2)[1]
    .split("\nasync function dispatcherStatusWithBusinessPreflight", 1)[0];
  assert.doesNotMatch(statusBody, /readRunControlProjection/);
  assert.doesNotMatch(statusBody, /dashboardGet/);
  assert.match(mainSource, /dispatcherStatusWithBusinessPreflight/);
  assert.match(mainSource, /preflight_reason:\s*"business_preflight_unavailable"/);
});

test("remote business projection cannot overwrite local runtime identity or liveness", () => {
  const mergeBody = mainSource.split("function mergeRunControlProjection", 2)[1]
    .split("\nasync function readRunControlProjection", 1)[0];
  assert.doesNotMatch(mergeBody, /dispatcherWorkerId|dispatcherLaunchEnabled/);
  assert.match(mergeBody, /dispatcher_id:\s*localStatus\.dispatcher_id/);
  assert.match(mergeBody, /worker_id:\s*localStatus\.worker_id/);
  assert.doesNotMatch(mergeBody, /service_state:/);
  assert.doesNotMatch(mergeBody, /processRunning:/);
});

test("two scheduler ticks do not heal UNKNOWN or DEGRADED liveness", async () => {
  let ensureCalls = 0;
  const deps = {
    getRelayHealth: async () => ({ ok: true, relay_authenticated: true }),
    getDispatcherStatus: async () => ({
      status: "unknown",
      service_state: "unknown",
      service_health: "degraded",
      processRunning: null,
    }),
    ensureDispatcher: async () => { ensureCalls += 1; },
    dashboardPost: async () => undefined,
  };
  await scheduler.startSchedulerRuntime(deps, { intervalMs: 60_000 });
  await scheduler.tickSchedulerRuntime(deps);
  await scheduler.tickSchedulerRuntime(deps);
  await scheduler.stopSchedulerRuntime({}, { voluntary: true });
  assert.equal(ensureCalls, 0);
});

test("proven stopped liveness remains recovery eligible", async () => {
  let ensureCalls = 0;
  const deps = {
    getRelayHealth: async () => ({ ok: true, relay_authenticated: true }),
    getDispatcherStatus: async () => ({ status: "stopped", service_state: "stopped", processRunning: false }),
    ensureDispatcher: async () => { ensureCalls += 1; },
    dashboardPost: async () => undefined,
  };
  await scheduler.startSchedulerRuntime(deps, { intervalMs: 60_000 });
  await scheduler.tickSchedulerRuntime(deps);
  await scheduler.stopSchedulerRuntime({}, { voluntary: true });
  assert.ok(ensureCalls >= 1);
});

test("j_automatise regression: alive plus degraded never reaches install/bootout/restart", () => {
  const ensureBody = mainSource.split("async function ensureDispatcherAutostart()", 2)[1]
    .split("\nasync function dispatcherAction", 1)[0];
  assert.match(ensureBody, /service_state === "running" && status\.processRunning === true/);
  assert.doesNotMatch(ensureBody, /install|bootout|restart/);
});
