"use strict";

const os = require("node:os");

const DEFAULT_INTERVAL_MS = 30_000;
const WORKER_PREFIX = "botapp-scheduler-runtime";

let intervalHandle = null;
let lastPublishedAt = null;
let lastError = null;
let voluntaryShutdown = false;
let running = false;
let consecutivePublishFailures = 0;

function safeRuntimeHost() {
  return String(os.hostname() || "unknown-host").trim().toLowerCase();
}

function buildWorkerId(runtimeHost = safeRuntimeHost()) {
  const normalized = String(runtimeHost || "unknown-host")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 80);
  return `${WORKER_PREFIX}:${normalized || "unknown-host"}`;
}

function fallbackStatus(status = "unknown", message = "Scheduler runtime status unavailable.") {
  return {
    ok: false,
    status,
    worker_id: buildWorkerId(),
    runtime_host: safeRuntimeHost(),
    scheduler_available: false,
    voluntary_shutdown: voluntaryShutdown,
    running,
    lastPublishedAt,
    lastError,
    consecutivePublishFailures,
    checkedAt: new Date().toISOString(),
    message,
  };
}

async function publishSchedulerRuntimeHeartbeat(deps, input = {}) {
  const runtimeHost = safeRuntimeHost();
  const dispatcher = typeof deps.getDispatcherStatus === "function"
    ? await deps.getDispatcherStatus().catch(() => null)
    : null;
  const relay = typeof deps.getRelayHealth === "function"
    ? await deps.getRelayHealth().catch(() => null)
    : null;
  const dispatcherStatus = String(dispatcher?.status || "unknown");
  const schedulerAvailable = !voluntaryShutdown
    && running
    && Boolean(relay?.ok && relay?.relay_authenticated)
    && dispatcherStatus === "running"
    && Boolean(dispatcher?.processRunning);

  const body = {
    runtime_host: runtimeHost,
    worker_id: buildWorkerId(runtimeHost),
    status: voluntaryShutdown ? "stopping" : schedulerAvailable ? "idle" : "offline",
    scheduler_available: schedulerAvailable,
    voluntary_shutdown: voluntaryShutdown,
    dispatcher_observed_status: dispatcherStatus,
    relay_authenticated: Boolean(relay?.ok && relay?.relay_authenticated),
    ...input,
  };

  if (typeof deps.dashboardPost !== "function") {
    throw new Error("scheduler_runtime_dashboard_post_missing");
  }

  await deps.dashboardPost("botapp_scheduler_runtime_heartbeat", body);
  lastPublishedAt = new Date().toISOString();
  lastError = null;
  consecutivePublishFailures = 0;
  return {
    ok: true,
    ...body,
    checkedAt: lastPublishedAt,
    message: schedulerAvailable
      ? "BotApp scheduler runtime heartbeat published."
      : "BotApp scheduler runtime heartbeat published while degraded.",
  };
}

async function tickSchedulerRuntime(deps) {
  if (!running || voluntaryShutdown) return fallbackStatus("unavailable", "Scheduler runtime is not active.");
  try {
    const relay = typeof deps.getRelayHealth === "function"
      ? await deps.getRelayHealth().catch(() => null)
      : null;
    if (relay?.ok && relay?.relay_authenticated && typeof deps.ensureDispatcher === "function") {
      const dispatcher = await deps.getDispatcherStatus().catch(() => null);
      if (!dispatcher?.processRunning || dispatcher?.status !== "running") {
        await deps.ensureDispatcher().catch(() => undefined);
      }
    }
    return await publishSchedulerRuntimeHeartbeat(deps);
  } catch (error) {
    consecutivePublishFailures += 1;
    lastError = error instanceof Error ? error.message : String(error);
    return fallbackStatus("degraded", "Scheduler runtime heartbeat publish failed.");
  }
}

function startSchedulerRuntime(deps, options = {}) {
  const intervalMs = Number(options.intervalMs || DEFAULT_INTERVAL_MS);
  if (running && intervalHandle) {
    return getSchedulerRuntimeStatus(deps);
  }
  voluntaryShutdown = false;
  running = true;
  void tickSchedulerRuntime(deps);
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => {
    void tickSchedulerRuntime(deps);
  }, Math.max(10_000, intervalMs));
  if (typeof intervalHandle.unref === "function") intervalHandle.unref();
  return getSchedulerRuntimeStatus(deps);
}

async function stopSchedulerRuntime(deps, options = {}) {
  voluntaryShutdown = options.voluntary !== false;
  running = false;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  try {
    if (typeof deps.dashboardPost === "function") {
      await publishSchedulerRuntimeHeartbeat(deps, {
        status: voluntaryShutdown ? "stopping" : "offline",
        scheduler_available: false,
        voluntary_shutdown: voluntaryShutdown,
      });
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }
  return getSchedulerRuntimeStatus(deps);
}

function getSchedulerRuntimeStatus(deps = {}) {
  const dispatcherPromise = typeof deps.getDispatcherStatus === "function"
    ? deps.getDispatcherStatus().catch(() => null)
    : Promise.resolve(null);
  return dispatcherPromise.then((dispatcher) => {
    const dispatcherStatus = String(dispatcher?.status || "unknown");
    const schedulerAvailable = running
      && !voluntaryShutdown
      && dispatcherStatus === "running"
      && Boolean(dispatcher?.processRunning);
    return {
      ok: schedulerAvailable && !lastError,
      status: voluntaryShutdown ? "unavailable" : schedulerAvailable ? "active" : running ? "degraded" : "stopped",
      worker_id: buildWorkerId(),
      runtime_host: safeRuntimeHost(),
      scheduler_available: schedulerAvailable,
      voluntary_shutdown: voluntaryShutdown,
      running,
      dispatcher_observed_status: dispatcherStatus,
      lastPublishedAt,
      lastError,
      consecutivePublishFailures,
      checkedAt: new Date().toISOString(),
      message: voluntaryShutdown
        ? "Scheduler runtime stopped voluntarily."
        : schedulerAvailable
          ? "Scheduler runtime is active."
          : "Scheduler runtime is degraded or waiting for dispatcher.",
    };
  });
}

module.exports = {
  buildWorkerId,
  startSchedulerRuntime,
  stopSchedulerRuntime,
  getSchedulerRuntimeStatus,
  publishSchedulerRuntimeHeartbeat,
  tickSchedulerRuntime,
};
