import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  SCHEDULER_REFRESH_INTERVAL_MS,
  REASON_UNAVAILABLE_LABEL,
  backendModeCopy,
  dailyEngineCopy,
  decisionNavigationAccountId,
  decisionReasonLabel,
  decisionRowLabel,
  decisionTone,
  engineBadgeCopy,
  formatTickInterval,
  isSchedulerConfigDecision,
  shortReasonLabel,
  shouldPollScheduler,
  upcomingWindowBadge,
  upcomingWindowDayLabel,
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

test("CP1: stable reason codes drive the label; raw reason stays in the tooltip", () => {
  // reason_code is the preferred source, mirroring the backend nomenclature.
  assert.equal(decisionReasonLabel({ reason_code: "resume_plan_missing", reason: "worker_plan:resume_plan_missing" }), "resume plan missing");
  assert.equal(decisionReasonLabel({ reason_code: "phone_busy", reason: "skipped_phone_busy" }), "phone busy");
  assert.equal(decisionReasonLabel({ reason_code: "active_run_exists", reason: "already_running" }), "run already active");
  assert.equal(decisionReasonLabel({ reason_code: "scheduler_disabled_race_rejected", reason: "scheduler_disabled" }), "rejected: scheduler turned OFF");
  // Technical errors keep their own labels, distinct from business blocks.
  assert.equal(decisionReasonLabel({ reason_code: "enqueue_failed", reason: "enqueue_failed" }), "enqueue failed");
  // Older backend payloads without reason_code fall back to the raw reason.
  assert.equal(decisionReasonLabel({ reason: "manual_only_requires_manual_trigger" }), "manual only");
  // The backend's explicit non-answer renders as "reason unavailable" — never invented.
  assert.equal(decisionReasonLabel({ reason_code: "reason_unavailable", reason: "unknown" }), REASON_UNAVAILABLE_LABEL);
  assert.equal(shortReasonLabel("unknown"), REASON_UNAVAILABLE_LABEL);
  assert.equal(shortReasonLabel(""), REASON_UNAVAILABLE_LABEL);
  // Unknown-but-real canonical codes pass through unchanged.
  assert.equal(decisionReasonLabel({ reason_code: "some_future_reason", reason: "some_future_reason" }), "some_future_reason");
  assert.match(schedulerViewSource, /decisionReasonLabel\(decision\)/);
});

test("CP1: global ON/OFF events render as Scheduler configuration, never unknown account", () => {
  const onEvent = {
    account_id: null,
    username: null,
    action: "auto_restart_settings_updated",
    decision: "production",
    reason: "settings_patch",
    event: "scheduler_config",
    config_enabled: true,
    created_at: "2026-07-06T14:21:22Z",
  };
  const offEvent = { ...onEvent, decision: "disabled", config_enabled: false };
  assert.equal(isSchedulerConfigDecision(onEvent), true);
  assert.equal(decisionRowLabel(onEvent), "Scheduler configuration — ON");
  assert.equal(decisionRowLabel(offEvent), "Scheduler configuration — OFF");
  // Older backend payloads (no event field) are still recognized by shape.
  assert.equal(
    isSchedulerConfigDecision({ account_id: null, action: "auto_restart_settings_updated", reason: "settings_patch" }),
    true,
  );
  // Account decisions keep the username/account label.
  const accountDecision = { account_id: "acc-1", username: "client_account", action: "auto_restart_candidate_evaluated" };
  assert.equal(isSchedulerConfigDecision(accountDecision), false);
  assert.equal(decisionRowLabel(accountDecision), "client_account");
  // Config events are not navigable (no account behind them).
  assert.equal(decisionNavigationAccountId(onEvent), null);
  assert.match(schedulerViewSource, /decisionRowLabel\(decision\)/);
  assert.match(schedulerViewSource, /isSchedulerConfigDecision\(decision\)/);
});

test("CP1: the view distinguishes the Auto Restart engine, the daily engine and the toggle", () => {
  assert.match(schedulerViewSource, /Auto Restart engine: \$\{engineCopy\.label\}/);
  assert.match(schedulerViewSource, /Scheduler: \$\{modeCopy\.label\}/);
  assert.match(schedulerViewSource, /dailyEngineCopy\[status\.daily_engine\.state\]/);
  assert.equal(dailyEngineCopy.technical_disabled.label, "Daily engine: disabled (env)");
  assert.equal(dailyEngineCopy.dry_run.label, "Daily engine: dry run");
  assert.equal(dailyEngineCopy.scheduler_disabled.label, "Daily engine: gated by toggle");
  assert.equal(dailyEngineCopy.active.label, "Daily engine: active");
});

test("CP2: upcoming windows render the derived recurrence with honest states", () => {
  const baseWindow = {
    account_id: "acc-1",
    username: "client_account",
    device_id: "dev-1",
    device_name: "Samsung A16-01",
    starts_at: "2026-07-06T04:00:00.000Z",
    ends_at: "2026-07-06T10:00:00.000Z",
    timezone: "Africa/Johannesburg",
    local_slot: "06:00–12:00",
    is_open: false,
    materialized: true,
    stored_window_expired: false,
  };
  assert.deepEqual(upcomingWindowBadge({ ...baseWindow, is_open: true }), { label: "open now", tone: "success" });
  assert.deepEqual(
    upcomingWindowBadge({ ...baseWindow, stored_window_expired: true, materialized: false }),
    { label: "awaiting roll-forward", tone: "warning" },
  );
  assert.deepEqual(upcomingWindowBadge(baseWindow), { label: "planned", tone: "neutral" });

  // Day labels are computed in the window's own timezone (UTC+2 here):
  // 04:00Z on the 6th is 06:00 local on the 6th.
  const now = new Date("2026-07-06T03:00:00.000Z");
  assert.equal(upcomingWindowDayLabel(baseWindow, now), "today");
  assert.equal(upcomingWindowDayLabel({ ...baseWindow, starts_at: "2026-07-07T04:00:00.000Z" }, now), "tomorrow");
  assert.notEqual(upcomingWindowDayLabel({ ...baseWindow, starts_at: "2026-07-08T04:00:00.000Z" }, now), "today");

  // The view renders the section from the backend read-model only, and the
  // projection never creates a run (read-only card, no mutation surface).
  assert.match(schedulerViewSource, /Upcoming windows \(\$\{status\.windows_horizon_hours \?\? 48\}h\)/);
  assert.match(schedulerViewSource, /upcomingWindowBadge\(window\)/);
  assert.match(schedulerViewSource, /manual-only mode are never scheduled automatically/);
  assert.doesNotMatch(schedulerViewSource, /startRun|createRun|materializeWindow|rollForward/);
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
