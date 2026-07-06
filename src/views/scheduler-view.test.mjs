import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  SCHEDULER_REFRESH_INTERVAL_MS,
  backendModeCopy,
  decisionNavigationAccountId,
  decisionTone,
  engineBadgeCopy,
  formatTickInterval,
  shortReasonLabel,
  shouldPollScheduler,
} from "./scheduler-status.ts";
import { createDevicesAutoRefreshController } from "./devices-auto-refresh.ts";

const schedulerViewSource = readFileSync(new URL("./Scheduler.tsx", import.meta.url), "utf8");
const schedulerHelpersSource = readFileSync(new URL("./scheduler-status.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../electron/preload.cjs", import.meta.url), "utf8");

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

test("engine badge keeps running distinct from backend OFF", () => {
  // Engine liveness (dispatcher heartbeat) and backend mode are separate axes.
  assert.equal(engineBadgeCopy.running.label, "Running");
  assert.equal(engineBadgeCopy.degraded.label, "Degraded");
  assert.equal(engineBadgeCopy.unknown.label, "Unknown");
  assert.equal(backendModeCopy.enabled.label, "ON");
  assert.equal(backendModeCopy.disabled_by_config.label, "OFF");
  assert.notEqual(backendModeCopy.disabled_by_config.tone, engineBadgeCopy.running.tone);
});

test("scheduler OFF is displayed from the backend read-model, not recomputed", () => {
  assert.match(schedulerViewSource, /backend_mode === "disabled_by_config"/);
  assert.match(schedulerViewSource, /backendModeCopy\[status\.backend_mode\]/);
  // No local eligibility/slot/cap/readiness computation: the view only talks
  // to the scheduler read-model IPC surface, nothing else.
  const ipcSurfaces = schedulerViewSource.match(/window\.botappDesktop\?\.[a-zA-Z]+/g) || [];
  assert.ok(ipcSurfaces.length >= 2, "view reads and mutates through IPC");
  assert.ok(ipcSurfaces.every((call) => call === "window.botappDesktop?.scheduler"), `unexpected IPC surface: ${ipcSurfaces.join(", ")}`);
  assert.doesNotMatch(schedulerViewSource, /isEligible|computeEligib|slot_kind|checkCap|readinessCheck/);
});

test("scheduler ON is only reflected after a confirmed backend response", () => {
  assert.match(schedulerViewSource, /Reflect only the confirmed backend state/);
  assert.match(schedulerViewSource, /await refresh\(\);/);
  // The switch handler never writes backend_mode into state directly.
  assert.doesNotMatch(schedulerViewSource, /setStatus\(\{[^)]*backend_mode/s);
});

test("OFF → ON requires a compact confirmation; ON → OFF applies directly", () => {
  assert.match(schedulerViewSource, /setConfirmEnable\(true\)/);
  assert.match(schedulerViewSource, /void applyBackendMode\(false\)/);
  assert.match(schedulerViewSource, /Turn Scheduler ON\?/);
  assert.match(schedulerViewSource, /No run starts from this click\./);
  // OFF path documents that active runs keep running (tooltip).
  assert.match(schedulerViewSource, /Active runs keep running\./);
});

test("the switch never creates a run locally", () => {
  assert.match(schedulerViewSource, /scheduler\?\.setEnabled/);
  assert.doesNotMatch(schedulerViewSource, /startRun|run-start|createRun|autoRestart\?\.execute|profiles\?\.startRun/);
  // Main process: switch goes through the canonical settings PATCH only.
  assert.match(mainSource, /schedulerSetEnabled/);
  assert.match(mainSource, /"PATCH", "auto_restart_settings_patch", \{\n\s*auto_restart_enabled: enabled,\n\s*\}/);
  const schedulerSetEnabledBody = mainSource.slice(
    mainSource.indexOf("async function schedulerSetEnabled"),
    mainSource.indexOf("async function autoRestartExecute"),
  );
  assert.doesNotMatch(schedulerSetEnabledBody, /run_start|auto_restart_execute|runtimectl|spawn|exec/);
});

test("manual_only decisions surface as a short exclusion label", () => {
  assert.equal(shortReasonLabel("manual_only_requires_manual_trigger"), "manual only");
  assert.equal(shortReasonLabel("scheduler_disabled"), "scheduler disabled");
  assert.equal(shortReasonLabel("max_restarts_day"), "daily cap reached");
  // Comma-joined canonical reason lists stay compact.
  assert.equal(shortReasonLabel("manual_only_requires_manual_trigger,other_reason"), "manual only");
  // Unknown canonical reasons pass through unchanged (never invented).
  assert.equal(shortReasonLabel("some_new_backend_reason"), "some_new_backend_reason");
  assert.equal(decisionTone("blocked"), "warning");
  assert.equal(decisionTone("enqueued"), "success");
});

test("clicking a decision opens the account in Profiles, only for real accounts", () => {
  assert.equal(decisionNavigationAccountId({ account_id: "acc-1", username: "u" }), "acc-1");
  assert.equal(decisionNavigationAccountId({ account_id: null, username: null }), null);
  assert.match(schedulerViewSource, /onOpenProfile\(accountId\)/);
  assert.match(appSource, /<Scheduler onOpenProfile=\{\(id\) => \{ setSelectedProfileId\(id\); setActive\("profiles"\); \}\}/);
});

test("polling only while the scheduler view is active and the window visible", () => {
  assert.equal(shouldPollScheduler("scheduler", "visible"), true);
  assert.equal(shouldPollScheduler("scheduler", "hidden"), false);
  assert.equal(shouldPollScheduler("profiles", "visible"), false);
  // The view is mounted only on its route, and gates start() on visibility.
  assert.match(appSource, /active === "scheduler"/);
  assert.match(schedulerViewSource, /shouldPollScheduler\("scheduler", document\.visibilityState\)/);
  assert.match(schedulerViewSource, /addEventListener\("visibilitychange"/);
});

test("no polling survives leaving the view or hiding the window", () => {
  const timers = fakeTimers();
  let calls = 0;
  const controller = createDevicesAutoRefreshController({
    refresh: () => { calls += 1; },
    intervalMs: SCHEDULER_REFRESH_INTERVAL_MS,
    ...timers,
  });
  controller.start(true);
  assert.equal(calls, 1, "immediate refresh when visible");
  const [{ ms }] = timers.intervals.values();
  assert.equal(ms, SCHEDULER_REFRESH_INTERVAL_MS, "light cadence (60s), consistent with the real tick");
  controller.handleVisibilityChange(false);
  assert.equal(timers.intervals.size, 0, "hidden window stops the timer");
  controller.handleVisibilityChange(true);
  assert.equal(calls, 2, "foreground return refreshes immediately");
  controller.stop();
  assert.equal(timers.intervals.size, 0, "unmount clears every timer");
  assert.match(schedulerViewSource, /controller\.stop\(\)/);
  // The view never triggers the backend tick or a dry-run to refresh.
  assert.doesNotMatch(schedulerViewSource, /dryRun|dry-run|\/tick|runTick|auto-restart:dry-run/);
});

test("backend errors stay readable and non destructive", () => {
  assert.match(schedulerViewSource, /Scheduler status unavailable\./);
  assert.match(schedulerViewSource, /Switch not applied\./);
  assert.match(schedulerViewSource, /role="alert"/);
  // A failed fetch never wipes the previously loaded status.
  assert.match(schedulerViewSource, /setLoadError\(result\?\.error \|\| "Scheduler status unavailable\."\);/);
  assert.doesNotMatch(schedulerViewSource, /setStatus\(null\)/);
});

test("UI stays light: no permanent helper paragraphs, details behind tooltips", () => {
  assert.match(schedulerViewSource, /title=\{decision\.reason\}/);
  const helperParagraphs = schedulerViewSource.match(/<p>/g) || [];
  assert.ok(helperParagraphs.length <= 1, "only the confirmation modal contains a paragraph");
  assert.doesNotMatch(schedulerViewSource, /<table/i);
});

test("no legacy fallback: scheduler data comes only from the relay read-model", () => {
  assert.doesNotMatch(schedulerViewSource, /mockClient|localhost|127\.0\.0\.1|legacy/i);
  assert.match(preloadSource, /botapp:scheduler:status/);
  assert.match(preloadSource, /botapp:scheduler:set-enabled/);
  assert.match(mainSource, /"scheduler_status"/);
  assert.match(mainSource, /auto-restart\/scheduler-status/);
});
