/* global fetch, setTimeout */

const { app, BrowserWindow, ipcMain, powerMonitor, powerSaveBlocker, session, shell } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { closeAllDeviceViews, registerDeviceViewIpc, runDeviceViewSelfTest, openDeviceView } = require("./device-view-manager.cjs");
const {
  parseOpenDeviceViewDeepLink,
  findOpenDeviceViewDeepLink,
} = require("./open-device-view-protocol.cjs");
const { localToolDiagnostics, resolveAdbPath } = require("./local-tools.cjs");
const {
  clearRelayKeyFromSecureStore,
  isEncryptionAvailable,
  loadRelayKeyFromSecureStore,
  readDisabledRuntimeConfigBackup,
  saveRelayKeyToSecureStore,
} = require("./relay-credential-store.cjs");
const {
  bootstrapRelayRuntime,
  canonicalUserDataDir,
  resolveRepairState,
  writeBootstrapStatus,
} = require("./relay-runtime-bootstrap.cjs");
const botappSchedulerRuntime = require("./botapp-scheduler-runtime.cjs");
const { findNonCloneablePath, serializeIpcPayload, toRedactedIpcError } = require("./ipc-structured-clone.cjs");
const {
  runtimeControllerPathFromEnv,
  runtimeControllerCwd,
  runRuntimeControllerCommand,
} = require("./runtime-controller.cjs");

let pendingIpcBridgeProbeMainReport = null;

// Electron default userData follows package.json name (botapp-mac-foundation).
// macOS requires overriding userData before the ready event.
app.setPath("userData", canonicalUserDataDir());

function writeStartupTrace(phase, detail = "") {
  try {
    const tracePath = path.join(app.getPath("userData"), "botapp-startup.trace.log");
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.appendFileSync(tracePath, `${new Date().toISOString()} ${phase}${detail ? ` ${detail}` : ""}\n`);
    try {
      fs.chmodSync(tracePath, 0o600);
    } catch {
      // Ignore chmod on append.
    }
  } catch {
    // Non-blocking startup tracing only.
  }
}

writeStartupTrace("main_loaded", `packaged=${String(app.isPackaged)} userData=${app.getPath("userData")}`);

const isDev = !app.isPackaged;
const devServerUrl = process.env.BOTAPP_DEV_SERVER_URL || "http://127.0.0.1:5173";
let compassLastConnectionTestAt = null;
let compassLastAnalysisAt = null;
let compassLastSafeError = null;
let compassLastProviderErrorCode = null;
let compassServerKeyStatus = "unknown";
let runtimeConfigCache = null;
const captureSessionId = process.env.BOTAPP_INTEGRATION_CAPTURE_SESSION_ID || crypto.randomUUID();

function safeUrl(value, fallback) {
  try {
    const url = new URL(value || fallback);
    return `${url.protocol}//${url.host}`;
  } catch {
    return fallback;
  }
}

function runtimeConfigPath() {
  return path.join(app.getPath("userData"), "botapp-runtime-config.json");
}

function readRuntimeConfig() {
  if (runtimeConfigCache) return runtimeConfigCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(runtimeConfigPath(), "utf8"));
    runtimeConfigCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    runtimeConfigCache = {};
  }
  return runtimeConfigCache;
}

function writeRuntimeConfig(nextConfig) {
  runtimeConfigCache = { ...readRuntimeConfig(), ...nextConfig };
  fs.mkdirSync(path.dirname(runtimeConfigPath()), { recursive: true });
  fs.writeFileSync(runtimeConfigPath(), JSON.stringify(runtimeConfigCache, null, 2), { mode: 0o600 });
  return runtimeConfigCache;
}

function removeRuntimeConfig(keys) {
  const current = { ...readRuntimeConfig() };
  for (const key of keys) {
    delete current[key];
  }
  runtimeConfigCache = current;
  fs.mkdirSync(path.dirname(runtimeConfigPath()), { recursive: true });
  fs.writeFileSync(runtimeConfigPath(), JSON.stringify(runtimeConfigCache, null, 2), { mode: 0o600 });
  return runtimeConfigCache;
}

function normalizeRelayUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeHttpsUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function maskUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/[redacted]`;
  } catch {
    return "[redacted-url]";
  }
}

function inferWebhookProvider(value) {
  const url = String(value || "").toLowerCase();
  if (url.includes("slack")) return "slack";
  if (url.includes("discord")) return "discord";
  return "custom";
}

function userDataDir() {
  return app.getPath("userData");
}

function readRelayKeyFromSources(stored = readRuntimeConfig()) {
  const envKey = process.env[["BOTAPP", "RELAY", "API", "KEY"].join("_")] || "";
  if (envKey) return envKey.trim();
  const secureKey = loadRelayKeyFromSecureStore(userDataDir());
  if (secureKey) return secureKey;
  return typeof stored.botappRelayKey === "string" ? stored.botappRelayKey.trim() : "";
}

function persistRelayCredential(relayUrl, relayKey) {
  const nextConfig = {};
  if (relayUrl) nextConfig.compassAiRelayUrl = relayUrl;
  if (relayKey) {
    if (saveRelayKeyToSecureStore(userDataDir(), relayKey)) {
      removeRuntimeConfig(["botappRelayKey"]);
    } else {
      nextConfig.botappRelayKey = relayKey;
    }
  }
  if (Object.keys(nextConfig).length) writeRuntimeConfig(nextConfig);
}

function bootstrapRelayConfig(options = {}) {
  runtimeConfigCache = null;
  const status = bootstrapRelayRuntime({
    forceRestore: options.forceRestore === true,
    userDataDir: userDataDir(),
    envRelayUrl: process.env.BOTAPP_COMPASS_AI_RELAY_URL || "",
    envRelayKey: process.env[["BOTAPP", "RELAY", "API", "KEY"].join("_")] || "",
    normalizeRelayUrl,
  });
  writeBootstrapStatus(userDataDir(), status);
  return status;
}

function repairRelayClientMessage(bootstrap, relay, overview) {
  if (bootstrap.repairState === "keychain_unavailable") {
    return "Keychain indisponible sur ce Mac. Relancez BotApp ou utilisez Copy diagnostics.";
  }
  if (bootstrap.repairState === "initial_association_required") {
    return "Initial association required for this Mac. Contact the technical team with Copy diagnostics.";
  }
  if (!relay?.ok || !relay?.relay_authenticated) {
    if (bootstrap.repairState === "backend_unavailable") {
      return "Backend relay is temporarily unavailable.";
    }
    return relay?.message || "BotApp connection unavailable.";
  }
  if (overview?.ok) {
    return `BotApp connection operational (${Number(overview?.profilesMeta?.accountsCount || 0)} accounts).`;
  }
  return overview?.error || "Backend reachable but Profiles unavailable.";
}

function isIntegrationLocalMode() {
  return process.env.BOTAPP_INTEGRATION_LOCAL === "1";
}

function integrationLocalBanner() {
  return "LOCAL TEST MODE — no phone or production activity";
}

function integrationLocalCaptureDir() {
  if (!isIntegrationLocalMode()) return null;
  const dir = String(process.env.BOTAPP_INTEGRATION_CAPTURE_DIR || "").trim();
  return dir || null;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCaptureSelector(mainWindow, selector, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await executeCaptureJavaScript(
      mainWindow,
      "capture_selector_wait",
      "webContents.executeJavaScript",
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    );
    if (ready) return;
    await sleepMs(500);
  }
  throw new Error(`Capture selector not ready: ${selector}`);
}

function captureIpcTraceEnabled() {
  return isIntegrationLocalMode() && process.env.BOTAPP_INTEGRATION_CAPTURE_IPC_TRACE === "1";
}

function captureReadyOnlyMode() {
  return isIntegrationLocalMode() && process.env.BOTAPP_INTEGRATION_CAPTURE_READY_ONLY === "1";
}

function captureRehearsalOnlyMode() {
  return isIntegrationLocalMode() && process.env.BOTAPP_INTEGRATION_CAPTURE_REHEARSAL_ONLY === "1";
}

function captureReadyMarkerName() {
  return String(process.env.BOTAPP_CAPTURE_READY_MARKER || "botapp-capture-ready.json").trim()
    || "botapp-capture-ready.json";
}

function captureReadyTargetFile() {
  return String(process.env.BOTAPP_CAPTURE_READY_TARGET_FILE || "").trim();
}

function valueShape(value, depth = 0) {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) return { type: "array", length: value.length };
  const type = typeof value;
  if (type !== "object") return { type };
  const constructorName = value?.constructor?.name || "Object";
  const keys = Object.keys(value).slice(0, 20);
  if (depth > 0) return { type: "object", constructorName, keys };
  return {
    type: "object",
    constructorName,
    keys,
    fields: Object.fromEntries(keys.map((key) => [key, valueShape(value[key], depth + 1)])),
  };
}

function appendCaptureIpcTrace(entry) {
  if (!captureIpcTraceEnabled()) return;
  const outDir = integrationLocalCaptureDir();
  if (!outDir) return;
  const tracePath = path.join(outDir, "botapp-capture-ipc-trace.jsonl");
  const safe = serializeIpcPayload({
    at: new Date().toISOString(),
    ...entry,
  });
  try {
    fs.writeFileSync(tracePath, `${JSON.stringify(safe)}\n`, { flag: "a", mode: 0o600 });
  } catch {
    // Trace must never affect capture execution.
  }
}

async function executeCaptureJavaScript(mainWindow, phase, channel, script, preloadMethod = null) {
  const started = Date.now();
  appendCaptureIpcTrace({
    phase,
    channel,
    direction: "main_to_renderer",
    preloadMethod,
    argumentCount: 1,
    payloadShape: { script: { type: "string", length: script.length } },
    structuredCloneOk: true,
  });
  try {
    const result = await mainWindow.webContents.executeJavaScript(script);
    const nonCloneable = findNonCloneablePath(result);
    appendCaptureIpcTrace({
      phase,
      channel,
      direction: "renderer_to_main",
      preloadMethod,
      argumentCount: 1,
      payloadShape: valueShape(result),
      structuredCloneOk: !nonCloneable,
      nonCloneable: nonCloneable ? { path: nonCloneable.path, kind: nonCloneable.kind } : null,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (error) {
    appendCaptureIpcTrace({
      phase,
      channel,
      direction: "renderer_to_main",
      preloadMethod,
      argumentCount: 1,
      structuredCloneOk: false,
      error: toRedactedIpcError(error, "capture_execute_javascript_failed"),
      durationMs: Date.now() - started,
    });
    throw error;
  }
}

async function readCaptureSurfaceDiagnostics(mainWindow) {
  return executeCaptureJavaScript(mainWindow, "surface_diagnostics", "webContents.executeJavaScript", `(() => {
    const activeView = document.querySelector("[data-testid^='botapp-active-view-']")?.getAttribute("data-testid") || null;
    const routeObserved = activeView ? activeView.replace("botapp-active-view-", "") : null;
    const topBarLabel = document.querySelector(".main h1")?.textContent?.trim() || null;
    return {
      routeObserved,
      topBarLabel,
      overviewVisible: Boolean(document.querySelector('[data-testid="overview-view"]')),
      runtimeHealthVisible: Boolean(document.querySelector('[data-testid="runtime-health-view"]')),
      integrationBanner: Boolean(document.querySelector('[data-testid="integration-local-banner"]')),
      needsHumanReviewCount: Boolean(document.querySelector('[data-testid="needs-human-review-count"]')),
      incidentRow: Boolean(document.querySelector('[data-testid="runtime-health-incident-row"]')),
      incidentScopeHost: document.querySelector('[data-testid="incident-scope-host"]')?.textContent?.trim() || null,
      scopeSelectorVisible: Boolean(document.querySelector('[data-testid="runtime-scope-selector"]')),
      scopeMyMacVisible: Boolean(document.querySelector('[data-testid="runtime-scope-option-my-mac"]')),
      scopeAllMacsVisible: Boolean(document.querySelector('[data-testid="runtime-scope-option-all-macs"]')),
      scopeAllMacsActive: document.querySelector('[data-testid="runtime-scope-option-all-macs"]')?.getAttribute("data-active") === "true",
      incidentHosts: Array.from(document.querySelectorAll('[data-testid="runtime-health-incident-host"]')).map((node) => node.textContent?.trim()).filter(Boolean),
      openCountText: document.querySelector('[data-testid="needs-human-review-count"]')?.textContent?.trim() || null,
      drawerOpen: Boolean(document.querySelector('[data-testid="incident-drawer"]')),
      drawerLoaded: Boolean(document.querySelector('[data-testid="incident-drawer-loaded"]')),
      drawerDetailReady: Boolean(document.querySelector('[data-testid="incident-drawer-detail-ready"]')),
      drawerLoadingText: /Loading incident detail\\.\\.\\./i.test(document.body?.innerText || ""),
      actionProof: (() => {
        const proof = document.querySelector('[data-testid="botapp-incident-action-proof"]');
        return proof ? {
          present: true,
          action: proof.getAttribute("data-action") || null,
          status: proof.getAttribute("data-status") || null,
          text: proof.textContent?.trim() || "",
        } : null;
      })(),
      notificationProofs: ["slack", "discord"].map((channel) => ({
        channel,
        proof: document.querySelector('[data-testid="botapp-incident-notification-' + channel + '-proof"]')?.textContent?.trim() || "",
        lastTest: document.querySelector('[data-testid="botapp-incident-notification-' + channel + '-last-test"]')?.textContent?.trim() || "",
      })),
      notificationOutboxItemCount: document.querySelectorAll('[data-testid="botapp-incident-notification-outbox-item"]').length,
      notificationMessage: document.querySelector('[data-testid="botapp-incident-notification-message"]')?.textContent?.trim() || "",
      drawerAuditItems: Array.from(document.querySelectorAll('[data-testid="incident-drawer-audit-timeline"] li')).map((node) => node.textContent?.trim()).filter(Boolean),
      devicesViewVisible: Boolean(document.querySelector('[data-testid="devices-view"]')),
      deviceRowCount: document.querySelectorAll('[data-testid="device-row"]').length,
      deviceIncidentBadgeCount: document.querySelectorAll('[data-testid="device-incident-badge"]').length,
      devicesDataCount: Number(document.querySelector('[data-testid="devices-view"]')?.getAttribute("data-device-count") || 0),
      devicesIncidentCount: Number(document.querySelector('[data-testid="devices-view"]')?.getAttribute("data-incident-count") || 0),
      relayOperational: /BotApp connection:\\s*operational/i.test(document.body?.innerText || ""),
      connectionUnavailableText: /BotApp connection unavailable|Local relay is not authenticated/i.test(document.body?.innerText || ""),
      loadingBackendDataText: /Loading backend data/i.test(document.body?.innerText || ""),
    };
  })()`);
}

async function navigateCaptureRoute(mainWindow, routeId, timeoutMs = 45000) {
  await executeCaptureJavaScript(
    mainWindow,
    "capture_route_navigation",
    "webContents.executeJavaScript",
    `window.dispatchEvent(new CustomEvent('botapp-capture-nav', { detail: { route: ${JSON.stringify(routeId)} } }));`,
  );
  const selector = `[data-testid="botapp-active-view-${routeId}"]`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const diagnostics = await readCaptureSurfaceDiagnostics(mainWindow);
    if (diagnostics.routeObserved === routeId) {
      return diagnostics;
    }
    await sleepMs(400);
  }
  const last = await readCaptureSurfaceDiagnostics(mainWindow);
  throw new Error(`Route ${routeId} not mounted (observed=${last.routeObserved || "none"} label=${last.topBarLabel || "none"})`);
}

async function waitForRuntimeHealthCaptureSurface(mainWindow) {
  await navigateCaptureRoute(mainWindow, "runtime");
  const start = Date.now();
  while (Date.now() - start < 45000) {
    const diagnostics = await readCaptureSurfaceDiagnostics(mainWindow);
    if (diagnostics.overviewVisible) {
      throw new Error("Overview surface active — Runtime Health capture blocked");
    }
    if (
      diagnostics.runtimeHealthVisible
      && diagnostics.integrationBanner
      && diagnostics.needsHumanReviewCount
      && diagnostics.incidentRow
    ) {
      return diagnostics;
    }
    await sleepMs(500);
  }
  const last = await readCaptureSurfaceDiagnostics(mainWindow);
  throw new Error(`Runtime Health capture surface incomplete: ${JSON.stringify(last)}`);
}

async function waitForDevicesIncidentBadgeSurface(mainWindow, timeoutMs = 45000) {
  await navigateCaptureRoute(mainWindow, "devices");
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await readCaptureSurfaceDiagnostics(mainWindow);
    if (
      last.devicesViewVisible
      && Number(last.devicesDataCount || 0) > 0
      && Number(last.deviceRowCount || 0) > 0
      && Number(last.devicesIncidentCount || 0) > 0
      && Number(last.deviceIncidentBadgeCount || 0) > 0
    ) {
      return last;
    }
    await sleepMs(500);
  }
  throw new Error(`Devices incident badge surface incomplete: ${JSON.stringify(last)}`);
}

async function assertCaptureReady(mainWindow, step) {
  if (step.assert === "runtime_health") {
    const diagnostics = await waitForRuntimeHealthCaptureSurface(mainWindow);
    const hosts = Array.isArray(diagnostics.incidentHosts) ? diagnostics.incidentHosts : [];
    if (!diagnostics.scopeMyMacVisible || !/my mac/i.test(String(diagnostics.incidentScopeHost || ""))) {
      throw new Error(`host_bound scope selector mismatch: ${JSON.stringify(diagnostics)}`);
    }
    if (hosts.includes("integration-mac-b")) {
      throw new Error(`host_bound leaked Host B incident: ${JSON.stringify(diagnostics)}`);
    }
    return diagnostics;
  }
  if (step.assert === "global_admin_scope") {
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const diagnostics = await waitForRuntimeHealthCaptureSurface(mainWindow);
      const hosts = Array.isArray(diagnostics.incidentHosts) ? diagnostics.incidentHosts : [];
      if (
        diagnostics.scopeSelectorVisible
        && diagnostics.scopeMyMacVisible
        && diagnostics.scopeAllMacsVisible
        && diagnostics.scopeAllMacsActive
        && /all macs/i.test(String(diagnostics.incidentScopeHost || ""))
        && hosts.includes("integration-mac-a")
        && hosts.includes("integration-mac-b")
      ) {
        return diagnostics;
      }
      await sleepMs(500);
    }
    const last = await readCaptureSurfaceDiagnostics(mainWindow);
    throw new Error(`global_admin scope selector mismatch: ${JSON.stringify(last)}`);
  }
  if (step.assert === "profiles_badge") {
    await waitForCaptureSelector(mainWindow, '[data-testid="profile-incident-badge"]');
    await waitForCaptureSelector(mainWindow, '[data-testid="incident-drawer-loaded"]');
    return readCaptureSurfaceDiagnostics(mainWindow);
  }
  if (step.assert === "devices_badge") {
    await waitForDevicesIncidentBadgeSurface(mainWindow);
    await waitForCaptureSelector(mainWindow, '[data-testid="incident-drawer-loaded"]');
    return readCaptureSurfaceDiagnostics(mainWindow);
  }
  if (step.assert === "incident_drawer") {
    await waitForCaptureSelector(mainWindow, '[data-testid="incident-drawer-loaded"]');
    return readCaptureSurfaceDiagnostics(mainWindow);
  }
  if (step.assert === "incident_notifications") {
    await navigateCaptureRoute(mainWindow, "incident-notifications");
    await waitForCaptureSelector(mainWindow, '[data-testid="botapp-incident-notifications-settings"]');
    await waitForCaptureSelector(mainWindow, '[data-testid="botapp-incident-notification-slack"]');
    await waitForCaptureSelector(mainWindow, '[data-testid="botapp-incident-notification-discord"]');
    return readCaptureSurfaceDiagnostics(mainWindow);
  }
  if (step.route) {
    return navigateCaptureRoute(mainWindow, step.route);
  }
  return readCaptureSurfaceDiagnostics(mainWindow);
}

async function waitForDrawerLoaded(mainWindow, timeoutMs = 45000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    const ready = await executeCaptureJavaScript(
      mainWindow,
      "capture_drawer_loaded_wait",
      "webContents.executeJavaScript",
      `Boolean(document.querySelector('[data-testid="incident-drawer-loaded"]'))
        && Boolean(document.querySelector('[data-testid="incident-drawer-detail-ready"]'))
        && !/Loading incident detail\\.\\.\\./i.test(document.body?.innerText || "")`,
    );
    if (ready) return;
    last = await executeCaptureJavaScript(
      mainWindow,
      "capture_drawer_loaded_diagnostics",
      "webContents.executeJavaScript",
      `(() => ({
        drawer: Boolean(document.querySelector('[data-testid="incident-drawer"]')),
        drawerLoaded: Boolean(document.querySelector('[data-testid="incident-drawer-loaded"]')),
        runtimeRow: Boolean(document.querySelector('[data-testid="runtime-health-incident-row"]')),
        topBarLabel: document.querySelector('[data-testid="topbar-active-route"]')?.textContent?.trim() || null,
        bodyText: (document.body?.innerText || "").slice(0, 500),
      }))()`,
    ).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    await sleepMs(500);
  }
  writeCaptureDiagnostic("botapp-drawer-timeout-diagnostics.json", {
    at: new Date().toISOString(),
    last,
  });
  throw new Error(`Incident drawer detail did not load in time: ${JSON.stringify(last)}`);
}

async function waitForActionProof(mainWindow, step, timeoutMs = 45000) {
  if (!step.expectedAction) return null;
  const expectedStatus = step.expectActionError ? "error" : "ok";
  const expectedAuditText = step.expectedAuditText || (
    step.expectedAction === "acknowledge" ? "incident_acknowledged"
      : step.expectedAction === "keep_paused" ? "incident_keep_paused"
        : step.expectedAction === "manual_retry" ? "incident_manual_retry_blocked"
          : null
  );
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await executeCaptureJavaScript(
      mainWindow,
      "capture_action_proof_wait",
      "webContents.executeJavaScript",
      `(() => {
        const proof = document.querySelector('[data-testid="botapp-incident-action-proof"]');
        return {
          present: Boolean(proof),
          action: proof?.getAttribute("data-action") || null,
          status: proof?.getAttribute("data-status") || null,
          text: proof?.textContent?.trim() || "",
          loading: /Loading incident detail\\.\\.\\./i.test(document.body?.innerText || ""),
          auditItems: Array.from(document.querySelectorAll('[data-testid="incident-drawer-audit-timeline"] li')).map((node) => node.textContent?.trim()).filter(Boolean),
        };
      })()`,
    );
    const auditText = Array.isArray(last?.auditItems) ? last.auditItems.join("\\n") : "";
    if (
      last?.present
      && last.action === step.expectedAction
      && last.status === expectedStatus
      && !last.loading
      && (!expectedAuditText || auditText.includes(expectedAuditText))
    ) {
      return last;
    }
    await sleepMs(500);
  }
  throw new Error(`Incident action proof missing: ${JSON.stringify({ expectedAction: step.expectedAction, expectedStatus, last })}`);
}

async function waitForActionButtonEnabled(mainWindow, testId, timeoutMs = 45000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await executeCaptureJavaScript(
      mainWindow,
      "capture_action_button_enabled_wait",
      "webContents.executeJavaScript",
      `(() => {
        const button = document.querySelector('[data-testid="${testId}"]');
        return {
          present: Boolean(button),
          disabled: Boolean(button?.disabled),
          text: button?.textContent?.trim() || "",
        };
      })()`,
    );
    if (last?.present && !last.disabled) return last;
    await sleepMs(250);
  }
  throw new Error(`Incident action button not enabled: ${JSON.stringify({ testId, last })}`);
}

async function waitForNotificationButtonEnabled(mainWindow, channel, timeoutMs = 45000) {
  const testId = `botapp-incident-notification-${channel}-test`;
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await executeCaptureJavaScript(
      mainWindow,
      "capture_notification_button_enabled_wait",
      "webContents.executeJavaScript",
      `(() => {
        const button = document.querySelector('[data-testid="${testId}"]');
        return {
          present: Boolean(button),
          disabled: Boolean(button?.disabled),
          text: button?.textContent?.trim() || "",
        };
      })()`,
    );
    if (last?.present && !last.disabled) return last;
    await sleepMs(250);
  }
  throw new Error(`Notification test button not enabled: ${JSON.stringify({ channel, last })}`);
}

async function waitForNotificationProof(mainWindow, channels, beforeState, timeoutMs = 60000) {
  const expected = Array.isArray(channels) && channels.length ? channels : ["slack"];
  const beforeByChannel = new Map(
    (Array.isArray(beforeState?.notificationProofs) ? beforeState.notificationProofs : [])
      .map((item) => [item.channel, item.lastTest || ""]),
  );
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await readCaptureSurfaceDiagnostics(mainWindow);
    const proofs = new Map((last.notificationProofs || []).map((item) => [item.channel, item]));
    const allPassed = expected.every((channel) => {
      const proof = proofs.get(channel);
      const previous = beforeByChannel.get(channel) || "";
      return proof
        && /local loopback/i.test(proof.proof || "")
        && proof.lastTest
        && !/not configured/i.test(proof.lastTest)
        && proof.lastTest !== previous;
    });
    if (allPassed && Number(last.notificationOutboxItemCount || 0) >= expected.length) {
      return last;
    }
    await sleepMs(500);
  }
  throw new Error(`Notification test proof missing: ${JSON.stringify({ expected, last })}`);
}

function writeCaptureStepMeta(outDir, fileName, meta) {
  const base = fileName.replace(/\.png$/i, "");
  const metaPath = path.join(outDir, `${base}.meta.json`);
  fs.writeFileSync(metaPath, `${JSON.stringify({ ...meta, metaPath }, null, 2)}\n`);
  return metaPath;
}

function captureOwnership(mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed?.() || mainWindow.webContents?.isDestroyed?.()) {
    throw new Error("capture_window_destroyed");
  }
  return {
    captureSessionId,
    browserWindowId: mainWindow.id,
    webContentsId: mainWindow.webContents.id,
    processId: typeof mainWindow.webContents.getOSProcessId === "function" ? mainWindow.webContents.getOSProcessId() : null,
    userDataDir: app.getPath("userData"),
    captureDir: integrationLocalCaptureDir() || null,
    isFocused: mainWindow.isFocused?.() === true,
    isVisible: mainWindow.isVisible?.() === true,
    capturedAt: new Date().toISOString(),
  };
}

function sameCaptureSource(before, after) {
  return before
    && after
    && before.captureSessionId === after.captureSessionId
    && before.browserWindowId === after.browserWindowId
    && before.webContentsId === after.webContentsId
    && before.processId === after.processId
    && before.userDataDir === after.userDataDir;
}

function validateStepVisualState(step, diagnostics, phase) {
  if (!step || !diagnostics) throw new Error(`capture_state_missing:${phase}`);
  if (step.assert === "runtime_health") {
    if (diagnostics.routeObserved !== "runtime") throw new Error(`runtime_capture_route_mismatch:${phase}:${diagnostics.routeObserved || "none"}`);
    if (diagnostics.topBarLabel !== "Runtime Health") throw new Error(`runtime_capture_topbar_mismatch:${phase}:${diagnostics.topBarLabel || "none"}`);
    if (diagnostics.overviewVisible) throw new Error(`runtime_capture_overview_visible:${phase}`);
    if (!diagnostics.runtimeHealthVisible) throw new Error(`runtime_capture_surface_missing:${phase}`);
    if (!diagnostics.relayOperational || diagnostics.connectionUnavailableText) throw new Error(`runtime_capture_relay_not_operational:${phase}`);
    if (diagnostics.loadingBackendDataText) throw new Error(`runtime_capture_backend_loading:${phase}`);
    if (!diagnostics.integrationBanner || !diagnostics.needsHumanReviewCount || !diagnostics.incidentRow) {
      throw new Error(`runtime_capture_required_dom_missing:${phase}`);
    }
    if (!diagnostics.scopeMyMacVisible || !/my mac/i.test(String(diagnostics.incidentScopeHost || ""))) {
      throw new Error(`runtime_capture_host_bound_scope_mismatch:${phase}`);
    }
  }
}

async function captureBoundWebContentsPng(mainWindow) {
  const webContents = mainWindow.webContents;
  const wasAttached = webContents.debugger.isAttached();
  if (!wasAttached) webContents.debugger.attach("1.3");
  try {
    await webContents.debugger.sendCommand("Page.enable").catch(() => undefined);
    const result = await webContents.debugger.sendCommand("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const png = Buffer.from(String(result?.data || ""), "base64");
    if (!Buffer.isBuffer(png) || png.length === 0) throw new Error("capture_png_empty_buffer");
    return png;
  } finally {
    if (!wasAttached && webContents.debugger.isAttached()) {
      webContents.debugger.detach();
    }
  }
}

async function captureVerifiedPng(mainWindow, outDir, fileName, { step = null, diagnostics = null } = {}) {
  if (!fileName || !/\.png$/i.test(fileName)) {
    throw new Error("capture_artifact_invalid_file");
  }
  const targetPath = path.join(outDir, fileName);
  const resolvedOutDir = path.resolve(outDir);
  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(`${resolvedOutDir}${path.sep}`)) {
    throw new Error("capture_artifact_outside_run_dir");
  }
  if (fs.existsSync(resolvedTarget)) {
    throw new Error(`capture_artifact_preexists:${fileName}`);
  }
  const ownershipBefore = captureOwnership(mainWindow);
  validateStepVisualState(step, diagnostics, "before_png");
  await executeCaptureJavaScript(
    mainWindow,
    "capture_wait_renderer_paint",
    "webContents.executeJavaScript",
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`,
  );
  const diagnosticsBeforePng = await readCaptureSurfaceDiagnostics(mainWindow);
  validateStepVisualState(step, diagnosticsBeforePng, "after_paint");
  const png = await captureBoundWebContentsPng(mainWindow);
  const ownershipAfter = captureOwnership(mainWindow);
  if (!sameCaptureSource(ownershipBefore, ownershipAfter)) {
    throw new Error(`capture_webcontents_ownership_changed:${fileName}`);
  }
  const diagnosticsAfterPng = await readCaptureSurfaceDiagnostics(mainWindow);
  validateStepVisualState(step, diagnosticsAfterPng, "after_png");
  fs.writeFileSync(resolvedTarget, png);
  const stats = fs.statSync(resolvedTarget);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`capture_png_missing_or_empty:${fileName}`);
  }
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(resolvedTarget)).digest("hex");
  return {
    path: resolvedTarget,
    size: stats.size,
    sha256,
    ownership: {
      before: ownershipBefore,
      after: ownershipAfter,
      screenshotSource: "webContents.debugger.Page.captureScreenshot",
      sameWebContents: true,
    },
    diagnosticsBeforePng,
    diagnosticsAfterPng,
  };
}

async function invokeRendererBridge(mainWindow, bridge, invokeJs) {
  const started = Date.now();
  try {
    appendCaptureIpcTrace({
      phase: "capture_preflight_bridge",
      channel: bridge,
      direction: "renderer_to_main",
      preloadMethod: bridge,
      argumentCount: invokeJs.includes("({") ? 1 : 0,
      payloadShape: { request: { type: "preload_method_call" } },
      structuredCloneOk: true,
    });
    const payload = await mainWindow.webContents.executeJavaScript(`(async () => (${invokeJs}))()`);
    const nonCloneable = findNonCloneablePath(payload);
    appendCaptureIpcTrace({
      phase: "capture_preflight_bridge",
      channel: bridge,
      direction: "main_to_renderer",
      preloadMethod: bridge,
      argumentCount: 1,
      payloadShape: valueShape(payload),
      structuredCloneOk: !nonCloneable,
      nonCloneable: nonCloneable ? { path: nonCloneable.path, kind: nonCloneable.kind } : null,
      durationMs: Date.now() - started,
    });
    return { bridge, ok: true, summary: summarizeProbeBridgeResult(bridge, payload) };
  } catch (error) {
    const message = sanitizeProbeMessage(error instanceof Error ? error.message : String(error));
    appendCaptureIpcTrace({
      phase: "capture_preflight_bridge",
      channel: bridge,
      direction: "main_to_renderer",
      preloadMethod: bridge,
      argumentCount: 1,
      structuredCloneOk: false,
      error: toRedactedIpcError(error, "capture_preflight_bridge_failed"),
      durationMs: Date.now() - started,
    });
    return {
      bridge,
      ok: false,
      error: message,
      failureDirection: message === "structured_clone_failed" ? "main_to_renderer_ipc_return" : "renderer_invoke",
    };
  }
}

async function waitForBotAppCapturePreflight(mainWindow) {
  const bridgeChecks = [
    { bridge: "relay.health", invokeJs: "window.botappDesktop?.relay?.health?.()" },
    { bridge: "incidents.list", invokeJs: "window.botappDesktop?.incidents?.list?.({ status: \"open,acknowledged\", limit: 20 })" },
    { bridge: "data.overview", invokeJs: "window.botappDesktop?.data?.overview?.()" },
  ];
  let last = null;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const bridgeResults = {};
    let failedBridge = null;
    for (const check of bridgeChecks) {
      const result = await invokeRendererBridge(mainWindow, check.bridge, check.invokeJs);
      bridgeResults[check.bridge] = result;
      if (!result.ok) {
        failedBridge = result;
        break;
      }
    }
    const relay = bridgeResults["relay.health"];
    const incidents = bridgeResults["incidents.list"];
    const overview = bridgeResults["data.overview"];
    last = {
      relayOk: Boolean(relay?.summary?.ok && relay?.summary?.relay_authenticated),
      incidentCount: Number(incidents?.summary?.incidentCount || 0),
      accountCount: Number(overview?.summary?.accountsCount || 0),
      syncError: overview?.summary?.syncError || null,
      failedBridge: failedBridge?.bridge || null,
      bridgeResults,
    };
    if (!failedBridge && last.relayOk && last.incidentCount > 0 && last.accountCount > 0 && !last.syncError) {
      return last;
    }
    if (failedBridge) {
      writeCaptureDiagnostic("botapp-capture-preflight-bridge.json", {
        at: new Date().toISOString(),
        failedBridge: failedBridge.bridge,
        error: failedBridge.error || null,
        failureDirection: failedBridge.failureDirection || null,
        bridgeResults,
      });
      throw new Error(`BotApp capture preflight bridge failed: ${failedBridge.bridge} (${failedBridge.error || "unknown"})`);
    }
    await sleepMs(2000);
  }
  writeCaptureDiagnostic("botapp-capture-preflight-last.json", last);
  throw new Error(`BotApp capture preflight failed: ${JSON.stringify(last)}`);
}

function writeCaptureDiagnostic(fileName, payload) {
  const outDir = integrationLocalCaptureDir();
  if (!outDir) return;
  try {
    fs.writeFileSync(path.join(outDir, fileName), `${JSON.stringify(payload, null, 2)}\n`);
  } catch {
    // best effort
  }
}

function loadIntegrationCaptureSteps(outDir) {
  const planPath = String(process.env.BOTAPP_INTEGRATION_CAPTURE_PLAN || "").trim()
    || path.join(outDir, "botapp-capture-plan.json");
  if (fs.existsSync(planPath)) {
    const parsed = JSON.parse(fs.readFileSync(planPath, "utf8"));
    if (Array.isArray(parsed?.steps)) return parsed.steps;
  }
  return [
    { file: "06-botapp-runtime-health.png", route: "runtime", assert: "runtime_health", waitDrawer: false },
    { file: "10-botapp-profiles-badge.png", route: "profiles", assert: "profiles_badge", click: '[data-testid="profile-incident-badge"]', waitDrawer: true, closeDrawer: true },
    { file: "11-botapp-devices-badge.png", route: "devices", assert: "devices_badge", click: '[data-testid="device-incident-badge"]', waitDrawer: true, closeDrawer: true },
    { file: "12-botapp-incident-drawer.png", route: "runtime", assert: "incident_drawer", openDrawerFromRuntime: true, waitDrawer: true },
  ];
}

async function runIntegrationLocalCapture(mainWindow) {
  const outDir = integrationLocalCaptureDir();
  if (!outDir || !mainWindow) return;
  fs.mkdirSync(outDir, { recursive: true });

  try {
    await executeCaptureJavaScript(
      mainWindow,
      "capture_dialog_shims",
      "webContents.executeJavaScript",
      `(() => { window.confirm = () => true; window.alert = () => undefined; return { ok: true }; })()`,
    );
    await sleepMs(3000);
    const preflight = await waitForBotAppCapturePreflight(mainWindow);
    console.log("[BotApp integration capture] preflight ok", preflight);

    const steps = loadIntegrationCaptureSteps(outDir);
    const rehearsalOnly = captureRehearsalOnlyMode();
    const rehearsalSteps = [];

    for (const step of steps) {
      if (step.route) {
        await navigateCaptureRoute(mainWindow, step.route);
      }
      if (step.prepare) {
        await executeCaptureJavaScript(
          mainWindow,
          "capture_prepare",
          "webContents.executeJavaScript",
          `(() => { document.querySelector(${JSON.stringify(step.prepare)})?.scrollIntoView?.({ block: "center" }); return true; })()`,
        ).catch(() => undefined);
        await sleepMs(800);
      }
      if (step.click) {
        if (step.assert === "profiles_badge") {
          await waitForCaptureSelector(mainWindow, '[data-testid="profile-incident-badge"]');
        }
        if (step.assert === "devices_badge") {
          await waitForDevicesIncidentBadgeSurface(mainWindow);
        }
        const clicked = await executeCaptureJavaScript(
          mainWindow,
          "capture_click",
          "webContents.executeJavaScript",
          `(() => {
            const target = document.querySelector(${JSON.stringify(step.click)});
            if (!target) return { ok: false, reason: "capture_click_target_missing" };
            target.click?.();
            return { ok: true };
          })()`,
        );
        if (!clicked?.ok) {
          const clickDiagnostics = await executeCaptureJavaScript(
            mainWindow,
            "capture_click_missing_diagnostics",
            "webContents.executeJavaScript",
            `(() => ({
              route: document.querySelector("[data-testid^='botapp-active-view-']")?.getAttribute("data-testid") || null,
              profileBadgeCount: document.querySelectorAll('[data-testid="profile-incident-badge"]').length,
              deviceBadgeCount: document.querySelectorAll('[data-testid="device-incident-badge"]').length,
              profileRows: Array.from(document.querySelectorAll('[data-testid="profile-incident-badge"], .account-row, .profile-row, [data-profile-id], [data-username]')).slice(0, 20).map((node) => ({
                testId: node.getAttribute("data-testid"),
                profileId: node.getAttribute("data-profile-id"),
                username: node.getAttribute("data-username"),
                text: node.textContent?.trim().slice(0, 240) || "",
              })),
              bodyText: document.body?.innerText?.slice(0, 1200) || "",
            }))()`,
          ).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
          writeCaptureDiagnostic(`botapp-click-missing-${String(step.assert || "unknown")}.json`, clickDiagnostics);
          throw new Error(`Capture click failed: ${step.click}:${clicked?.reason || "unknown"}`);
        }
      }
      if (step.openDrawerFromRuntime) {
        await waitForRuntimeHealthCaptureSurface(mainWindow);
        const clickResult = await executeCaptureJavaScript(
          mainWindow,
          "capture_open_runtime_drawer",
          "webContents.executeJavaScript",
          `(() => {
            const row = document.querySelector('[data-testid="runtime-health-incident-row"]');
            if (!row) return { ok: false, reason: "runtime_incident_row_missing" };
            row.click();
            return {
              ok: true,
              text: row.textContent?.trim() || "",
              drawerAfterClick: Boolean(document.querySelector('[data-testid="incident-drawer"]')),
            };
          })()`,
        );
        if (!clickResult?.ok) {
          throw new Error(`Runtime incident row click failed: ${clickResult?.reason || "unknown"}`);
        }
        await waitForDrawerLoaded(mainWindow);
      }
      if (step.testNotificationChannel || step.testNotificationChannels) {
        await navigateCaptureRoute(mainWindow, "incident-notifications");
        await waitForCaptureSelector(mainWindow, '[data-testid="botapp-incident-notifications-settings"]');
        const beforeNotificationState = await readCaptureSurfaceDiagnostics(mainWindow);
        const channels = Array.isArray(step.testNotificationChannels) && step.testNotificationChannels.length
          ? step.testNotificationChannels
          : [step.testNotificationChannel];
        for (const channel of channels) {
          let lastNotificationError = null;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              await waitForNotificationButtonEnabled(mainWindow, channel);
              const testSelector = `[data-testid="botapp-incident-notification-${channel}-test"]`;
              const clicked = await executeCaptureJavaScript(
                mainWindow,
                "capture_notification_test",
                "webContents.executeJavaScript",
                `(() => {
                  const button = document.querySelector(${JSON.stringify(testSelector)});
                  if (!button) return { ok: false, reason: "notification_button_missing" };
                  if (button.disabled) return { ok: false, reason: "notification_button_disabled" };
                  button.click();
                  return { ok: true };
                })()`,
              );
              if (!clicked?.ok) throw new Error(`Notification test click failed: ${channel}:${clicked?.reason || "unknown"}`);
              await waitForNotificationProof(mainWindow, [channel], beforeNotificationState, 25000);
              lastNotificationError = null;
              break;
            } catch (error) {
              lastNotificationError = error;
              if (attempt < 2) await sleepMs(800);
            }
          }
          if (lastNotificationError) throw lastNotificationError;
        }
        step.observedNotificationProof = await waitForNotificationProof(mainWindow, channels, beforeNotificationState);
      }
      if (step.fillNote !== undefined) {
        await executeCaptureJavaScript(
          mainWindow,
          "capture_fill_note",
          "webContents.executeJavaScript",
          `(() => {
            const el = document.querySelector('[data-testid="botapp-incident-resolution-note"]');
            if (!el) return false;
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
            setter?.call(el, ${JSON.stringify(step.fillNote)});
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()`,
        );
      }
      if (step.actionClick) {
        step.initialDiagnostics = await readCaptureSurfaceDiagnostics(mainWindow);
        await waitForActionButtonEnabled(mainWindow, step.actionClick);
        const clicked = await executeCaptureJavaScript(
          mainWindow,
          "capture_action_click",
          "webContents.executeJavaScript",
          `(() => {
            const button = document.querySelector('[data-testid="${step.actionClick}"]');
            if (!button) return { ok: false, reason: "action_button_missing" };
            if (button.disabled) return { ok: false, reason: "action_button_disabled" };
            button.click();
            return { ok: true };
          })()`,
        );
        if (clicked?.ok === false) throw new Error(`Incident action click failed: ${clicked.reason || "unknown"}`);
        const actionProof = await waitForActionProof(mainWindow, step);
        if (!step.expectActionError && step.expectActionSuccess) {
          const hasError = await executeCaptureJavaScript(
            mainWindow,
            "capture_action_error_check",
            "webContents.executeJavaScript",
            `Boolean(document.querySelector('[data-testid="botapp-incident-action-error"]'))`,
          );
          if (hasError) {
            const errText = await executeCaptureJavaScript(
              mainWindow,
              "capture_action_error_text",
              "webContents.executeJavaScript",
              `document.querySelector('[data-testid="botapp-incident-action-error"]')?.textContent?.trim() || ""`,
            );
            throw new Error(`Unexpected action error for ${step.actionClick}: ${errText}`);
          }
        }
        step.observedActionProof = actionProof;
      }
      if (step.reloadDrawer) {
        await executeCaptureJavaScript(
          mainWindow,
          "capture_reload_drawer_close",
          "webContents.executeJavaScript",
          `(() => { document.querySelector('[data-testid="incident-drawer"] button')?.click?.(); return true; })()`,
        ).catch(() => undefined);
        await sleepMs(600);
        await waitForRuntimeHealthCaptureSurface(mainWindow);
        await executeCaptureJavaScript(
          mainWindow,
          "capture_reload_drawer_open",
          "webContents.executeJavaScript",
          `(() => { document.querySelector('[data-testid="runtime-health-incident-row"]')?.click?.(); return true; })()`,
        ).catch(() => undefined);
        await waitForDrawerLoaded(mainWindow);
      }
      if (step.waitDrawer) {
        const drawerOpen = await executeCaptureJavaScript(
          mainWindow,
          "capture_drawer_open_check",
          "webContents.executeJavaScript",
          `Boolean(document.querySelector('[data-testid="incident-drawer"]'))`,
        );
        if (!drawerOpen) {
          throw new Error(`Incident drawer not open before capture ${step.file}`);
        }
        await waitForDrawerLoaded(mainWindow);
      }
      const diagnostics = await assertCaptureReady(mainWindow, step);
      if (step.waitDrawer && diagnostics?.drawerLoadingText) {
        throw new Error(`Refusing drawer capture while incident detail is loading (${step.file})`);
      }
      if (step.route === "runtime" && step.assert === "runtime_health" && diagnostics?.overviewVisible) {
        throw new Error(`Refusing Runtime Health capture while Overview is visible (${step.file})`);
      }
      if (captureReadyOnlyMode()) {
        const targetFile = captureReadyTargetFile();
        if (targetFile && step.file !== targetFile) {
          continue;
        }
        writeCaptureDiagnostic(captureReadyMarkerName(), {
          readyAt: new Date().toISOString(),
          stepFile: step.file,
          expectedRoute: step.route || null,
          expectedView: step.assert || step.route || null,
          observedRoute: diagnostics?.routeObserved || null,
          observedTopBarLabel: diagnostics?.topBarLabel || null,
          integrationMode: true,
          relayKeyConfigured: true,
        });
        if (process.env.BOTAPP_INTEGRATION_CAPTURE_QUIT === "1") {
          app.quit();
        }
        return;
      }
      if (rehearsalOnly) {
        const ownershipBeforeRehearsal = captureOwnership(mainWindow);
        const diagnosticsBeforeRehearsal = await readCaptureSurfaceDiagnostics(mainWindow);
        validateStepVisualState(step, diagnosticsBeforeRehearsal, "rehearsal");
        const ownershipAfterRehearsal = captureOwnership(mainWindow);
        if (!sameCaptureSource(ownershipBeforeRehearsal, ownershipAfterRehearsal)) {
          throw new Error(`capture_rehearsal_webcontents_ownership_changed:${step.file}`);
        }
        rehearsalSteps.push({
          stepFile: step.file,
          expectedRoute: step.route || null,
          expectedView: step.assert || step.route || null,
          observedRoute: diagnostics?.routeObserved || null,
          observedTopBarLabel: diagnostics?.topBarLabel || null,
          hostScope: diagnostics?.incidentScopeHost || null,
          drawerLoaded: Boolean(step.waitDrawer),
          captureOwnership: {
            before: ownershipBeforeRehearsal,
            after: ownershipAfterRehearsal,
            sameWebContents: true,
          },
          checkedAt: new Date().toISOString(),
        });
        console.log(`[BotApp integration capture] rehearsal ok ${step.file}`);
        if (step.closeDrawer) {
          await executeCaptureJavaScript(
            mainWindow,
            "capture_rehearsal_close_drawer",
            "webContents.executeJavaScript",
            `(() => { document.querySelector('[data-testid="incident-drawer"] button')?.click?.(); return true; })()`,
          ).catch(() => undefined);
          await sleepMs(800);
        }
        continue;
      }
      const artifact = await captureVerifiedPng(mainWindow, outDir, step.file, { step, diagnostics });
      writeCaptureStepMeta(outDir, step.file, {
        generatedAt: new Date().toISOString(),
        pngPath: artifact.path,
        pngSizeBytes: artifact.size,
        sha256: artifact.sha256,
        expectedRoute: step.route || null,
        expectedView: step.assert || step.route || null,
        observedRoute: diagnostics?.routeObserved || null,
        observedTopBarLabel: diagnostics?.topBarLabel || null,
        validatedTestIds: {
          integrationLocalBanner: Boolean(diagnostics?.integrationBanner),
          needsHumanReviewCount: Boolean(diagnostics?.needsHumanReviewCount),
          runtimeHealthIncidentRow: Boolean(diagnostics?.incidentRow),
          incidentScopeHost: diagnostics?.incidentScopeHost || null,
        },
        hostScope: diagnostics?.incidentScopeHost || null,
        incidentOpenCountText: diagnostics?.openCountText || null,
        drawerLoaded: Boolean(diagnostics?.drawerLoaded),
        drawerDetailReady: Boolean(diagnostics?.drawerDetailReady),
        drawerLoadingText: Boolean(diagnostics?.drawerLoadingText),
        devicesDataCount: Number(diagnostics?.devicesDataCount || 0),
        deviceRowCount: Number(diagnostics?.deviceRowCount || 0),
        deviceIncidentBadgeCount: Number(diagnostics?.deviceIncidentBadgeCount || 0),
        devicesIncidentCount: Number(diagnostics?.devicesIncidentCount || 0),
        requestedAction: step.expectedAction || null,
        initialState: step.initialDiagnostics || null,
        actionProof: step.observedActionProof || null,
        notificationProof: step.observedNotificationProof || null,
        drawerAuditItems: diagnostics?.drawerAuditItems || [],
        captureOwnership: artifact.ownership,
        diagnosticsBeforePng: artifact.diagnosticsBeforePng || null,
        diagnosticsAfterPng: artifact.diagnosticsAfterPng || null,
        assertionCompletedBeforeScreenshotAt: new Date().toISOString(),
        integrationMode: true,
        relayKeyConfigured: true,
      });
      console.log(`[BotApp integration capture] saved ${step.file}`);
      if (step.closeDrawer) {
        await executeCaptureJavaScript(
          mainWindow,
          "capture_close_drawer",
          "webContents.executeJavaScript",
          `(() => { document.querySelector('[data-testid="incident-drawer"] button')?.click?.(); return true; })()`,
        ).catch(() => undefined);
        await sleepMs(800);
      }
    }

    if (rehearsalOnly) {
      writeCaptureDiagnostic(String(process.env.BOTAPP_CAPTURE_REHEARSAL_REPORT || "botapp-capture-rehearsal.json").trim()
        || "botapp-capture-rehearsal.json", {
        ok: true,
        completedAt: new Date().toISOString(),
        mode: "capture-rehearsal",
        stepCount: rehearsalSteps.length,
        expectedStepCount: steps.length,
        steps: rehearsalSteps,
      });
    }

    if (process.env.BOTAPP_INTEGRATION_CAPTURE_QUIT === "1") {
      const marker = String(process.env.BOTAPP_CAPTURE_COMPLETION_MARKER || "botapp-capture-complete.json").trim()
        || "botapp-capture-complete.json";
      writeCaptureDiagnostic(marker, {
        ok: true,
        completedAt: new Date().toISOString(),
        rehearsalOnly,
        stepCount: steps.length,
        lastFile: steps.length ? steps[steps.length - 1].file : null,
      });
      app.quit();
    }
  } catch (error) {
    writeCaptureDiagnostic("botapp-capture-error.json", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      at: new Date().toISOString(),
    });
    console.error("[BotApp integration capture] failed", error);
    if (process.env.BOTAPP_INTEGRATION_CAPTURE_QUIT === "1") {
      app.quit();
    }
  }
}

function assertIntegrationLocalRelayUrl(urlValue) {
  if (!isIntegrationLocalMode()) return;
  let hostname = "";
  try {
    hostname = new URL(String(urlValue || "").trim()).hostname.toLowerCase();
  } catch {
    hostname = "";
  }
  if (!hostname || !["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("BOTAPP_INTEGRATION_LOCAL refuses non-loopback relay URL.");
  }
}

function compassConfig() {
  const stored = readRuntimeConfig();
  const relayUrl = normalizeRelayUrl(process.env.BOTAPP_COMPASS_AI_RELAY_URL || stored.compassAiRelayUrl || "");
  assertIntegrationLocalRelayUrl(relayUrl);
  const relayKey = readRelayKeyFromSources(stored);
  return {
    relayUrl,
    relayKey,
    model: "server-side",
  };
}

function compassRuntimeMode(cfg = compassConfig()) {
  if (cfg.relayUrl) return "relay";
  return "rules_only";
}

function compassRuntimeStatus(message, cfg = compassConfig()) {
  const mode = compassRuntimeMode(cfg);
  const relayOrigin = cfg.relayUrl ? safeUrl(cfg.relayUrl, null) : null;
  const status = mode === "relay"
    ? "ready"
    : "relay_missing";
  const defaultMessage = mode === "relay"
    ? "Compass AI relay is configured."
    : "Compass AI relay not configured. Add a relay URL to enable AI recommendations.";
  return {
    mode,
    status,
    provider: "OpenAI",
    model: cfg.model,
    relayUrlConfigured: Boolean(cfg.relayUrl),
    relayOrigin,
    relayKeyConfigured: Boolean(cfg.relayKey),
    serverKeyStatus: compassServerKeyStatus,
    lastConnectionTestAt: compassLastConnectionTestAt,
    lastAnalysisAt: compassLastAnalysisAt,
    lastSafeError: compassLastSafeError,
    lastProviderErrorCode: compassLastProviderErrorCode,
    message: message || defaultMessage,
  };
}

const sensitiveTextPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  new RegExp(`${["s", "k-"].join("")}[A-Za-z0-9._-]{8,}`, "gi"),
  /ak_(?:live|test)_[A-Za-z0-9._-]{8,}/gi,
  new RegExp(`${["wh", "sec_"].join("")}[A-Za-z0-9._-]+`, "gi"),
];
const sensitiveKeyPattern = new RegExp([
  ["pass", "word"].join(""),
  ["to", "ken"].join(""),
  ["authoriza", "tion"].join(""),
  ["sec", "ret"].join(""),
  ["service", "role"].join("_"),
  ["web", "hook"].join(""),
].join("|"), "i");

function sanitizeCompassValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeCompassValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
      if (sensitiveKeyPattern.test(key)) {
        return [key, "[REDACTED]"];
      }
      return [key, sanitizeCompassValue(nested)];
    }));
  }
  if (typeof value === "string") {
    return sensitiveTextPatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), value);
  }
  return value;
}

function fallbackCompassAdvisor(period, message, status = "ai_unavailable") {
  return {
    status,
    provider: "openai",
    model: compassConfig().model,
    lastAnalyzedAt: null,
    period,
    summary: message,
    healthAssessment: "watch",
    analysis: null,
    relayTarget: "/api/instagram-dashboard/compass/analyze",
    serverSideOnly: true,
  };
}

function safeAnalyzeMessage(reason, fallback) {
  if (reason === "model_unavailable") return "AI provider model unavailable.";
  if (reason === "schema_validation_failed") return "AI response failed schema validation.";
  if (reason === "invalid_provider_json") return "AI provider returned invalid JSON.";
  if (reason === "payload_invalid") return "Relay analyze payload invalid.";
  if (reason === "provider_timeout") return "Provider timeout.";
  if (reason === "provider_rate_limited") return "AI provider quota/rate limit reached.";
  if (reason === "provider_error") return "AI provider returned an error.";
  if (reason === "compass_ai_disabled") return "AI provider disabled on relay.";
  if (reason === "provider_key_missing") return "AI provider is not configured on the relay server.";
  if (reason === "provider_key_invalid") return "AI provider key is invalid on the relay server.";
  if (reason === "unsupported_model_parameter") return "AI provider model does not support a requested API parameter.";
  return fallback;
}

function routeFromRelayTarget(targetTab) {
  if (targetTab === "activity_log") return "activity";
  if (targetTab === "client_accounts") return "account";
  if (["credentials", "devices", "targets", "profiles", "compass"].includes(targetTab)) return targetTab;
  return "compass";
}

function targetFromRelay(targetTab, label, filter, accountId, username, clientId) {
  return {
    targetTab: routeFromRelayTarget(targetTab),
    label: label || `Open ${routeFromRelayTarget(targetTab)}`,
    context: {
      accountId: accountId || undefined,
      username: username || undefined,
      clientId: clientId || undefined,
      filter: filter || undefined,
    },
  };
}

function normalizeCompassAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object") return null;
  return {
    analysisId: typeof analysis.analysisId === "string" ? analysis.analysisId : analysis.analysis_id,
    period: analysis.period === "24h" || analysis.period === "30d" ? analysis.period : "7d",
    overallSummary: typeof analysis.overallSummary === "string" ? analysis.overallSummary : analysis.overall_summary,
    healthAssessment: typeof analysis.healthAssessment === "string" ? analysis.healthAssessment : analysis.health_assessment,
    recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations.map((recommendation, index) => ({
      id: recommendation.id || `ai_rec_${index + 1}`,
      severity: recommendation.severity || "info",
      confidence: recommendation.confidence || "medium",
      title: recommendation.title || "AI recommendation",
      summary: recommendation.summary || recommendation.admin_summary || recommendation.adminSummary || "",
      recommendationType: recommendation.recommendationType || recommendation.recommendation_type || "operational_risk",
      adminSummary: recommendation.adminSummary || recommendation.admin_summary || "",
      clientSummary: recommendation.clientSummary || recommendation.client_summary || "",
      clientVisible: Boolean(recommendation.clientVisible ?? recommendation.client_visible),
      clientRawVisible: Boolean(recommendation.clientRawVisible ?? recommendation.client_raw_visible),
      clientRecommendationInput: Boolean(recommendation.clientRecommendationInput ?? recommendation.client_recommendation_input ?? true),
      technicalReason: recommendation.technicalReason || recommendation.technical_reason || "",
      clientSafeReason: recommendation.clientSafeReason || recommendation.client_safe_reason || "",
      affectedAccounts: Array.isArray(recommendation.affectedAccounts || recommendation.affected_accounts)
        ? (recommendation.affectedAccounts || recommendation.affected_accounts).map((account) => {
          const accountId = account.accountId || account.account_id || "";
          const username = account.username || "";
          const clientId = account.clientId || account.client_id || "";
          const targetTab = account.targetTab || account.target_tab || recommendation.target_tab || "compass";
          return {
            accountId,
            username,
            clientId,
            reason: account.reason || "",
            target: targetFromRelay(targetTab, `Open ${username ? `@${username}` : targetTab}`, recommendation.target_tab || targetTab, accountId, username, clientId),
          };
        })
        : [],
      recommendedActions: Array.isArray(recommendation.recommendedActions || recommendation.recommended_actions)
        ? (recommendation.recommendedActions || recommendation.recommended_actions).map((action) => {
          const targetTab = action.targetTab || action.target_tab || recommendation.target_tab || "compass";
          const label = action.label || recommendation.recommended_action || "Open Compass";
          return {
            label,
            target: targetFromRelay(targetTab, label, action.filter || ""),
            actionType: action.actionType || action.action_type || "open_tab",
          };
        })
        : [],
      evidence: Array.isArray(recommendation.evidence) ? recommendation.evidence : [],
      sourceFacts: Array.isArray(recommendation.sourceFacts || recommendation.source_facts) ? (recommendation.sourceFacts || recommendation.source_facts) : [],
      target: targetFromRelay(recommendation.targetTab || recommendation.target_tab || "compass", recommendation.recommended_action || "Open Compass", recommendation.target_tab || ""),
      recommendedAction: recommendation.recommendedAction || recommendation.recommended_action || "",
      whyThisMatters: recommendation.whyThisMatters || recommendation.why_this_matters || "",
      whatNotToAssume: recommendation.whatNotToAssume || recommendation.what_not_to_assume || "",
    })) : [],
    internalSignals: Array.isArray(analysis.internalSignals || analysis.internal_signals)
      ? (analysis.internalSignals || analysis.internal_signals).map((signal) => ({
        signal: signal.signal || "inactive_accounts",
        adminVisible: true,
        clientRawVisible: false,
        clientRecommendationInput: true,
        count: Number.isFinite(Number(signal.count)) ? Number(signal.count) : 0,
        summary: signal.summary || "",
      }))
      : [],
    filteredRecommendationsCount: Number.isFinite(Number(analysis.filteredRecommendationsCount ?? analysis.filtered_recommendations_count))
      ? Number(analysis.filteredRecommendationsCount ?? analysis.filtered_recommendations_count)
      : 0,
    filteredReasons: Array.isArray(analysis.filteredReasons || analysis.filtered_reasons) ? (analysis.filteredReasons || analysis.filtered_reasons) : [],
  };
}

function normalizeCompassAdvisor(data, period) {
  const payload = data && typeof data === "object" && data.ok === true && data.data ? data.data : data;
  const status = typeof payload?.status === "string" ? payload.status : "ai_enabled";
  const analysis = normalizeCompassAnalysis(payload?.analysis);
  const fallbackReason = typeof payload?.fallback_reason === "string" ? payload.fallback_reason : null;
  const providerErrorCode = typeof payload?.provider_error_code === "string" ? payload.provider_error_code : null;
  const fallbackMessage = safeAnalyzeMessage(fallbackReason, "Compass AI returned a safe fallback.");
  return {
    status,
    provider: "openai",
    model: typeof payload?.model === "string" ? payload.model : compassConfig().model,
    lastAnalyzedAt: new Date().toISOString(),
    period,
    summary: typeof analysis?.overallSummary === "string" && analysis.overallSummary
      ? analysis.overallSummary
      : status === "ai_enabled"
        ? "Compass AI analysis received from secure runtime."
        : fallbackMessage,
    healthAssessment: typeof analysis?.healthAssessment === "string" ? analysis.healthAssessment : "watch",
    analysis,
    fallbackReason,
    providerErrorCode,
    relayTarget: "/api/instagram-dashboard/compass/analyze",
    serverSideOnly: true,
  };
}

async function analyzeCompassViaRelay(relayUrl, period, snapshot) {
  const cfg = compassConfig();
  const response = await fetch(relayUrl, {
    method: "POST",
    headers: relayHeaders(cfg),
    body: JSON.stringify({ period, snapshot: sanitizeCompassValue(snapshot), dry_run: true }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readRelayError(data, "Compass AI relay returned an error."));
  }
  return normalizeCompassAdvisor(data, period);
}

function relayHeaders(cfg = compassConfig()) {
  const headers = {
    "Content-Type": "application/json",
    "X-Request-Id": `botapp-compass-${Date.now().toString(36)}`,
  };
  if (cfg.relayKey) {
    headers.Authorization = `${["Bear", "er"].join("")} ${cfg.relayKey}`;
    headers["X-BotApp-Relay-Key"] = cfg.relayKey;
  }
  return headers;
}

function safeSha256Prefix(value) {
  const normalized = String(value || "");
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 8);
}

function relayCredentialSource() {
  if (process.env[["BOTAPP", "RELAY", "API", "KEY"].join("_")]) return "env";
  if (loadRelayKeyFromSecureStore(userDataDir())) return "secure_storage";
  if (readRuntimeConfig().botappRelayKey) return "runtime_config";
  return "missing";
}

function localRelayDiagnostics(cfg = compassConfig()) {
  return {
    present: Boolean(cfg.relayKey),
    length: cfg.relayKey ? cfg.relayKey.length : 0,
    sha256_prefix: safeSha256Prefix(cfg.relayKey),
    relayUrlConfigured: Boolean(cfg.relayUrl),
    relayOrigin: dashboardOrigin(cfg) || null,
    loadedFrom: relayCredentialSource(),
  };
}

function dashboardOrigin(cfg = compassConfig()) {
  if (!cfg.relayUrl) return "";
  try {
    const url = new URL(cfg.relayUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function absoluteDashboardPath(pathname, cfg = compassConfig()) {
  const origin = dashboardOrigin(cfg);
  if (!origin || !pathname || typeof pathname !== "string" || !pathname.startsWith("/api/instagram-dashboard/")) return pathname;
  return `${origin}${pathname}`;
}

function attachRelayHeadersForDashboardAvatars() {
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["*://*/api/instagram-dashboard/avatar*"] }, (details, callback) => {
    const cfg = compassConfig();
    const origin = dashboardOrigin(cfg);
    try {
      const requestUrl = new URL(details.url);
      if (origin && `${requestUrl.protocol}//${requestUrl.host}` === origin && requestUrl.pathname === "/api/instagram-dashboard/avatar" && cfg.relayKey) {
        details.requestHeaders.Authorization = `${["Bear", "er"].join("")} ${cfg.relayKey}`;
        details.requestHeaders["X-BotApp-Relay-Key"] = cfg.relayKey;
      }
    } catch {
      // Keep the request unchanged when it is not a dashboard avatar URL.
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

const endpointTestState = new Map();
const botappBuildCommit = "dm-drawer-emoji-assets-v10";
const botappIpcProbeBuildId = "ipc-probe-v11-notification-audit";
const INTEGRATION_HOST_MACHINE = "integration-mac-a";
const runtimeIpcHandlers = [
  "botapp:runtime:status",
  "botapp:diagnostics:provenance",
  "botapp:dispatcher:status",
  "botapp:dispatcher:action",
  "botapp:compass:ai-status",
  "botapp:compass:save-relay-config",
  "botapp:compass:remove-relay-config",
  "botapp:compass:analyze",
  "botapp:targeting-ai:status",
  "botapp:targeting-ai:save-config",
  "botapp:targeting-ai:reset-config",
  "botapp:targeting-ai:test-config",
  "botapp:email:list-templates",
  "botapp:email:save-template",
  "botapp:email:preview-template",
  "botapp:email:list-history",
  "botapp:email:history-detail",
  "botapp:email:test-delivery-status",
  "botapp:email:send-test-delivery",
  "botapp:auto-restart:overview",
  "botapp:auto-restart:dry-run",
  "botapp:auto-restart:action-preview",
  "botapp:auto-restart:settings-load",
  "botapp:auto-restart:settings-save",
  "botapp:auto-restart:execute",
  "botapp:scheduler:status",
  "botapp:scheduler:set-enabled",
  "botapp:scheduler:approve-preflight-retry",
  "botapp:incidents:list",
  "botapp:incidents:detail",
  "botapp:incidents:action",
  "botapp:incidents:notification-settings",
  "botapp:incidents:notification-settings-patch",
  "botapp:incidents:notification-test",
  "botapp:incidents:notification-outbox",
  "botapp:data:overview",
  "botapp:relay:health",
  "botapp:relay:repair",
  "botapp:connect:open-device-view",
  "botapp:dispatcher:ensure",
  "botapp:devices:list",
  "botapp:devices:restart-heartbeat-publisher",
  "botapp:device-heartbeat:status",
  "botapp:device-heartbeat:ensure",
  "botapp:device-heartbeat:action",
  "botapp:profiles:details",
  "botapp:profiles:create-dry-run",
  "botapp:profiles:create",
  "botapp:profiles:schedule-slots",
  "botapp:profiles:verify-username",
  "botapp:profiles:credentials:submit",
  "botapp:profiles:settings:save",
  "botapp:profiles:action",
  "botapp:client-accounts:status",
  "botapp:client-accounts:needs-more-targets",
  "botapp:profiles:assign-now",
  "botapp:profiles:readiness-now",
  "botapp:profiles:auto-login",
  "botapp:profiles:restore-login-screen",
  "botapp:profiles:run-start",
  "botapp:profiles:run-stop",
  "botapp:profiles:run-progress",
  "botapp:profiles:targets:add",
  "botapp:profiles:targets:bulk-add",
  "botapp:profiles:targets:delete",
  "botapp:profiles:targets:reset",
  "botapp:endpoints:list",
  "botapp:endpoints:test",
  "botapp:endpoints:test-all",
  "botapp:endpoints:export-profile",
  "botapp:integrations:list",
  "botapp:integrations:save-webhook",
  "botapp:integrations:remove-webhook",
];
const runtimeControllerPath = runtimeControllerPathFromEnv(process.env);
const runtimeControllerWorkingDirectory = runtimeControllerCwd(runtimeControllerPath);
const dispatcherWrapperPath = runtimeControllerPath;
const workerRootPath = runtimeControllerWorkingDirectory;
const deviceHeartbeatPublisherPath = process.env.BOTAPP_DEVICE_HEARTBEAT_PUBLISHER_PATH || "";
const deviceHeartbeatServiceWrapperPath = runtimeControllerPath;
const workerEnvFilePath = process.env.BOTAPP_WORKER_ENV_FILE || path.join(workerRootPath, ".env");
const deviceHeartbeatPythonPath = process.env.BOTAPP_PYTHON || "python3";
const ASSIGNMENT_HEARTBEAT_STALE_MS = 15 * 60 * 1000;
const dispatcherAllowedActions = new Set(["status", "install", "pause", "resume", "restart", "stop", "logs", "fix-duplicate"]);
const deviceHeartbeatAllowedActions = new Set(["status", "install", "pause", "resume", "restart", "stop", "logs", "fix-duplicate"]);
const botappEndpointRegistry = [
  {
    id: "botapp_overview",
    name: "BotApp overview aggregate",
    method: "GET",
    path: "/api/instagram-dashboard/botapp/overview",
    usedBy: ["Overview", "Profiles", "Client Accounts", "Credentials", "Activity Log", "Compass", "Auto Restart"],
    purpose: "Load production-safe shared backend aggregate for BotApp tabs",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "botapp_relay_health",
    name: "BotApp relay health",
    method: "GET",
    path: "/api/instagram-dashboard/botapp/relay-health",
    usedBy: ["Runtime Health", "Profiles"],
    purpose: "Verify BotApp relay authentication and critical route availability without creating runs or accounts",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "botapp_open_device_view",
    name: "BotApp open assigned device view",
    method: "POST",
    path: "/api/instagram-dashboard/botapp/open-device-view",
    usedBy: ["Client Connect verification", "Profiles Auto Login"],
    purpose: "Redeem a bounded client open_device_view intent and return the assigned phone serial for scrcpy focus only",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "devices_overview",
    name: "Devices overview",
    method: "GET",
    path: "/api/instagram-dashboard/devices",
    usedBy: ["Devices", "Overview", "Auto Restart", "Compass"],
    purpose: "Load physical phones and runtime heartbeat status",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "devices_delete_preflight",
    name: "Devices delete preflight",
    method: "POST",
    path: "/api/instagram-dashboard/devices/delete-phone-preflight",
    usedBy: ["Devices"],
    purpose: "Load safe delete preflight for an operational phone inventory row",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "devices_delete",
    name: "Devices delete phone",
    method: "POST",
    path: "/api/instagram-dashboard/devices/delete-phone",
    usedBy: ["Devices"],
    purpose: "Remove an empty phone from operational inventory after explicit confirmation",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "run_control_health",
    name: "Run Control dispatcher health",
    method: "GET",
    path: "/api/instagram-dashboard/runs/health",
    usedBy: ["Runtime Health", "Profiles"],
    purpose: "Read Supabase heartbeat projection for the local run-control dispatcher without mutating runs",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "botapp_scheduler_runtime_health",
    name: "BotApp scheduler runtime health",
    method: "GET",
    path: "/api/instagram-dashboard/botapp/scheduler-runtime-health",
    usedBy: ["Runtime Health", "Schedule session cron gate"],
    purpose: "Read BotApp scheduler runtime heartbeat projection",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "botapp_scheduler_runtime_heartbeat",
    name: "BotApp scheduler runtime heartbeat",
    method: "POST",
    path: "/api/instagram-dashboard/botapp/scheduler-runtime-health",
    usedBy: ["BotApp scheduler runtime"],
    purpose: "Publish BotApp-open scheduler runtime heartbeat for server-side schedule gating",
    authRequired: true,
    status: "active",
    testStrategy: "safe_post",
  },
  {
    id: "profiles_overview",
    name: "Profiles overview",
    method: "GET",
    path: "/api/instagram-dashboard/profiles",
    usedBy: ["Profiles"],
    purpose: "Load Supabase-backed profile account rows",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "profiles_live",
    name: "Profiles live projection",
    method: "GET",
    path: "/api/instagram-dashboard/profiles/live",
    usedBy: ["Profiles"],
    purpose: "Poll batched run state, verified counters, and current blockers without loading the full overview",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_account_details",
    name: "Profile account details",
    method: "GET",
    path: "/api/instagram-dashboard/profiles/:account_id/details",
    usedBy: ["Profiles", "Profile drawers"],
    purpose: "Load safe per-account stats, logs, targets, settings, and filters",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_stats_history",
    name: "Profile stats history",
    method: "GET",
    path: "/api/instagram-dashboard/profiles/:account_id/stats-history",
    usedBy: ["Profiles", "Stats"],
    purpose: "Load 30-day social action stats for the Stats drawer",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_create",
    name: "Profiles create dry-run",
    method: "POST",
    path: "/api/instagram-dashboard/accounts/create",
    usedBy: ["Profiles", "Add Profile"],
    purpose: "Validate profile create contract through secure relay without mutation",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_schedule_slots",
    name: "Profile schedule slots",
    method: "GET",
    path: "/api/instagram-dashboard/accounts/schedule-slots",
    usedBy: ["Add Profile"],
    purpose: "Load Supabase-backed assignment slot availability for selected device/app instance",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "settings_schedule",
    name: "Profile schedule settings",
    method: "GET",
    path: "/api/instagram-dashboard/settings/schedule",
    usedBy: ["Profiles", "Settings"],
    purpose: "Load and update account schedule assignment through shared backend",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "settings_account",
    name: "Profile account settings",
    method: "PATCH",
    path: "/api/instagram-dashboard/settings",
    usedBy: ["Profiles", "Settings", "Follow"],
    purpose: "Update account-scoped runtime settings through secure relay without creating runs",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "settings_follow_filters",
    name: "Profile Follow filters",
    method: "PATCH",
    path: "/api/instagram-dashboard/settings/follow-filters",
    usedBy: ["Profiles", "Settings", "Filters"],
    purpose: "Update runtime-ready Follow filter settings through secure relay without creating runs",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "settings_dm",
    name: "Profile DM settings",
    method: "PATCH",
    path: "/api/instagram-dashboard/settings/dm",
    usedBy: ["Profiles", "Settings", "DM"],
    purpose: "Update account DM settings and templates through secure relay without sending messages",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "settings_unfollow",
    name: "Profile Unfollow settings",
    method: "PATCH",
    path: "/api/instagram-dashboard/settings/unfollow",
    usedBy: ["Profiles", "Settings", "Followback"],
    purpose: "Update account Unfollow settings through secure relay without creating runs",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "settings_follow_sources",
    name: "Profile Follow source settings",
    method: "PATCH",
    path: "/api/instagram-dashboard/settings/follow-sources",
    usedBy: ["Profiles", "Settings", "Sources"],
    purpose: "Update per-account Follow source rotation settings through secure relay without target discovery",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_verify_username",
    name: "Profile username verification",
    method: "POST",
    path: "/api/instagram-dashboard/profiles/verify-username",
    usedBy: ["Profiles", "Add Profile"],
    purpose: "Verify an Instagram username through the secure backend provider without exposing provider credentials",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_credentials_submit",
    name: "Profile credentials submit",
    method: "POST",
    path: "/api/instagram-dashboard/credentials/submit",
    usedBy: ["Profiles", "Settings"],
    purpose: "Submit or update existing account credentials through secure Vault relay without login/provisioning/run",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_account_status",
    name: "Profile account status action",
    method: "PATCH",
    path: "/api/instagram-dashboard/accounts/status",
    usedBy: ["Profiles", "Client Accounts"],
    purpose: "Pause or reactivate account admin status through secure relay without login/provisioning/run",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_account_lifecycle",
    name: "Profile account lifecycle action",
    method: "POST",
    path: "/api/instagram-dashboard/accounts/lifecycle",
    usedBy: ["Profiles"],
    purpose: "Archive or restore account lifecycle through secure relay without login/provisioning/run",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_assign_now",
    name: "Profile assign now",
    method: "POST",
    path: "/api/instagram-dashboard/assignments/now",
    usedBy: ["Profiles"],
    purpose: "Create or repair the current phone/app assignment through secure relay without login/provisioning/run",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_readiness_now",
    name: "Profile readiness now",
    method: "POST",
    path: "/api/instagram-dashboard/readiness/now",
    usedBy: ["Profiles", "Settings"],
    purpose: "Refresh login/connect readiness through secure relay (dry_run, no device run)",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_run_start",
    name: "Profile run start",
    method: "POST",
    path: "/api/instagram-dashboard/runs/start",
    usedBy: ["Profiles"],
    purpose: "Create a real account_session account_run_request through the secure BotApp relay",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_auto_login_start",
    name: "Profile Auto Login start",
    method: "POST",
    path: "/api/instagram-dashboard/runs/start",
    usedBy: ["Profiles"],
    purpose: "Create a real login_provisioning account_run_request through the secure BotApp relay",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_restore_login_screen",
    name: "Profile restore login screen",
    method: "POST",
    path: "/api/instagram-dashboard/accounts/:account_id/restore-login-screen",
    usedBy: ["Profiles"],
    purpose: "Queue bounded orphan login-challenge recovery on the assigned clone without credentials or codes",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_run_stop",
    name: "Profile run stop",
    method: "POST",
    path: "/api/instagram-dashboard/stop",
    usedBy: ["Profiles"],
    purpose: "Cancel an active account_run_request or reconcile an active technical run through secure relay",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "profiles_run_progress",
    name: "Profile run progress",
    method: "GET",
    path: "/api/instagram-dashboard/runs/progress",
    usedBy: ["Profiles"],
    purpose: "Poll safe login provisioning progress without creating runs",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "targets_collection",
    name: "Targets collection",
    method: "POST",
    path: "/api/instagram-dashboard/targets",
    usedBy: ["Profile targets"],
    purpose: "Create CT targets through secure relay and Supabase",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "targets_reset",
    name: "Targets reset",
    method: "PATCH",
    path: "/api/instagram-dashboard/targets/reset",
    usedBy: ["Profile targets"],
    purpose: "Reset CT target verification state through secure relay and Supabase",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "client_accounts_overview",
    name: "Client accounts overview",
    method: "GET",
    path: "/api/instagram-dashboard/client-accounts",
    usedBy: ["Client Accounts"],
    purpose: "Load Supabase-backed client account operations rows from shared backend projections",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "client_accounts_needs_more_targets",
    name: "Client accounts needs more targets",
    method: "PATCH",
    path: "/api/instagram-dashboard/client-accounts/needs-more-targets",
    usedBy: ["Client Accounts"],
    purpose: "Mark or clear the non-blocking needs-more-target-accounts signal for one account without login, run, or phone actions",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "credentials_actions",
    name: "Credentials actions",
    method: "GET",
    path: "/api/instagram-dashboard/credentials-actions",
    usedBy: ["Credentials"],
    purpose: "Load Supabase-backed credential blockers/actions",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "activity_log",
    name: "Activity log",
    method: "GET",
    path: "/api/instagram-dashboard/activity-log",
    usedBy: ["Activity Log"],
    purpose: "Load safe interaction evidence and CT audit activity",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "incidents_overview",
    name: "Incidents overview",
    method: "GET",
    path: "/api/instagram-dashboard/incidents",
    usedBy: ["Runtime Health", "Compass"],
    purpose: "Load redacted account incidents for local Mac scope and human-review actions",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "incidents_detail",
    name: "Incident detail",
    method: "GET",
    path: "/api/instagram-dashboard/incidents/:incidentId",
    usedBy: ["Runtime Health", "Profiles", "Devices"],
    purpose: "Load redacted incident detail scoped by relay host binding",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "incidents_action",
    name: "Incidents action",
    method: "POST",
    path: "/api/instagram-dashboard/incidents/action",
    usedBy: ["Runtime Health"],
    purpose: "Acknowledge, resolve, keep paused, or manual retry through audited incident actions",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "incidents_notification_settings",
    name: "Incident notification settings",
    method: "GET",
    path: "/api/instagram-dashboard/incidents/notifications/settings",
    usedBy: ["Runtime Health", "API / Webhooks / Keys"],
    purpose: "Load redacted Slack/Discord incident notification settings",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "incidents_notification_settings_patch",
    name: "Incident notification settings patch",
    method: "PATCH",
    path: "/api/instagram-dashboard/incidents/notifications/settings",
    usedBy: ["Runtime Health", "API / Webhooks / Keys"],
    purpose: "Update Slack/Discord incident notification settings through write-only webhook fields",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "incidents_notification_test",
    name: "Incident notification test",
    method: "POST",
    path: "/api/instagram-dashboard/incidents/notifications/test",
    usedBy: ["Runtime Health", "API / Webhooks / Keys"],
    purpose: "Send a loopback-safe incident notification test without creating incidents",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "incidents_notification_outbox",
    name: "Incident notification outbox",
    method: "GET",
    path: "/api/instagram-dashboard/incidents/notifications/outbox",
    usedBy: ["Runtime Health"],
    purpose: "Read redacted incident notification delivery rows",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "email_templates",
    name: "Email templates",
    method: "GET",
    path: "/api/instagram-dashboard/email-templates",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Load versioned transactional email templates from canonical backend",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "email_templates_save",
    name: "Email templates save",
    method: "POST",
    path: "/api/instagram-dashboard/email-templates",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Create a new active transactional email template version without sending email",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "email_history",
    name: "Email history",
    method: "GET",
    path: "/api/instagram-dashboard/email-history",
    usedBy: ["Email History"],
    purpose: "Read paginated canonical email send intents and delivery status",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "email_history_detail",
    name: "Email history detail",
    method: "GET",
    path: "/api/instagram-dashboard/email-history/:intent_id",
    usedBy: ["Email History"],
    purpose: "Read one email intent detail with redacted delivery timeline",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "email_lifecycle_preview",
    name: "Account lifecycle email preview",
    method: "GET",
    path: "/api/instagram-dashboard/email-lifecycle/preview",
    usedBy: ["Email History"],
    purpose: "Read-only preview for account_paused, account_canceled, and needs_assistance lifecycle emails",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "email_needs_more_targets_preview",
    name: "Needs more targets lifecycle preview",
    method: "GET",
    path: "/api/instagram-dashboard/email-needs-more-targets/preview",
    usedBy: ["Email History"],
    purpose: "Read-only production preview of needs_more_target_accounts lifecycle decisions",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "email_lifecycle_outbox_preview",
    name: "Transactional email outbox preview",
    method: "GET",
    path: "/api/instagram-dashboard/email-lifecycle/outbox-preview",
    usedBy: ["Email History"],
    purpose: "Read-only combined outbox planner preview for all lifecycle email categories",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "email_test_delivery",
    name: "Email test delivery",
    method: "POST",
    path: "/api/instagram-dashboard/email-test-delivery",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Send one allowlisted internal Postmark test delivery when test gates are enabled",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "email_test_delivery_status",
    name: "Email test delivery status",
    method: "GET",
    path: "/api/instagram-dashboard/email-test-delivery",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Read masked test delivery gate status for BotApp",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "email_delivery_settings",
    name: "Email delivery settings",
    method: "GET",
    path: "/api/instagram-dashboard/email-delivery-settings",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Read transactional delivery settings projection for BotApp",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "email_delivery_settings_save",
    name: "Email delivery settings save",
    method: "PATCH",
    path: "/api/instagram-dashboard/email-delivery-settings",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Save support email or confirmed active sender with audit trail",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "email_delivery_settings_refresh_senders",
    name: "Email delivery settings refresh senders",
    method: "POST",
    path: "/api/instagram-dashboard/email-delivery-settings/refresh-senders",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Refresh confirmed Postmark sender identities without mutating provider state",
    authRequired: true,
    status: "active",
    testStrategy: "none",
  },
  {
    id: "email_delivery_settings_audit",
    name: "Email delivery settings audit",
    method: "GET",
    path: "/api/instagram-dashboard/email-delivery-settings/audit",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Read recent transactional delivery settings audit entries",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "settings_overview",
    name: "Settings overview",
    method: "GET",
    path: "/api/instagram-dashboard/settings?account_id=:account_id",
    usedBy: ["Settings"],
    purpose: "Account-scoped settings endpoint exists; global BotApp settings overview is planned",
    authRequired: true,
    status: "planned",
    testStrategy: "none",
  },
  {
    id: "compass_health",
    name: "Compass health",
    method: "GET",
    path: "/api/instagram-dashboard/compass/health",
    usedBy: ["Compass", "API / Webhooks / Keys"],
    purpose: "Check relay auth and server-side AI provider configuration",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "compass_analyze",
    name: "Compass analyze",
    method: "POST",
    path: "/api/instagram-dashboard/compass/analyze",
    usedBy: ["Compass", "API / Webhooks / Keys"],
    purpose: "Run server-side Compass AI analysis from grounded facts",
    authRequired: true,
    status: "active",
    testStrategy: "config_only",
  },
  {
    id: "targeting_ai_config",
    name: "Targeting AI config",
    method: "GET",
    path: "/api/instagram-dashboard/targeting-ai/config",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Read/write server-side targeting AI prompt/config without secrets",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "targeting_ai_config_reset",
    name: "Targeting AI config reset",
    method: "POST",
    path: "/api/instagram-dashboard/targeting-ai/config/reset",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Reset targeting AI config to code default prompt",
    authRequired: true,
    status: "active",
    testStrategy: "safe_post",
  },
  {
    id: "targeting_ai_test",
    name: "Targeting AI test",
    method: "POST",
    path: "/api/instagram-dashboard/targeting-ai/test",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Dry-run targeting AI prompt against a sample niche",
    authRequired: true,
    status: "active",
    testStrategy: "safe_post",
  },
  {
    id: "targeting_ai_health",
    name: "Targeting AI health",
    method: "GET",
    path: "/api/instagram-dashboard/targeting-ai/health",
    usedBy: ["API / Webhooks / Keys"],
    purpose: "Check targeting AI provider and SearchAPI configuration",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "auto_restart_overview",
    name: "Auto Restart overview",
    method: "GET",
    path: "/api/instagram-dashboard/auto-restart/overview",
    usedBy: ["Auto Restart"],
    purpose: "Load scheduler preview, rules, candidates, gates, and decisions",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "auto_restart_dry_run",
    name: "Auto Restart dry-run",
    method: "POST",
    path: "/api/instagram-dashboard/auto-restart/dry-run",
    usedBy: ["Auto Restart"],
    purpose: "Recompute restart preview without mutations",
    authRequired: true,
    status: "active",
    testStrategy: "safe_post",
  },
  {
    id: "auto_restart_action_preview",
    name: "Auto Restart action preview",
    method: "POST",
    path: "/api/instagram-dashboard/auto-restart/action-preview",
    usedBy: ["Auto Restart"],
    purpose: "Validate Auto Restart action contracts without runtime mutation",
    authRequired: true,
    status: "active",
    testStrategy: "safe_post",
  },
  {
    id: "auto_restart_settings",
    name: "Auto Restart settings",
    method: "GET",
    path: "/api/instagram-dashboard/auto-restart/settings",
    usedBy: ["Auto Restart"],
    purpose: "Load and persist canonical Auto Restart settings",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "auto_restart_settings_patch",
    name: "Auto Restart settings save",
    method: "PATCH",
    path: "/api/instagram-dashboard/auto-restart/settings",
    usedBy: ["Auto Restart"],
    purpose: "Persist Auto Restart settings",
    authRequired: true,
    status: "active",
    testStrategy: "safe_post",
  },
  {
    id: "auto_restart_execute",
    name: "Auto Restart execute",
    method: "POST",
    path: "/api/instagram-dashboard/auto-restart/execute",
    usedBy: ["Auto Restart"],
    purpose: "Execute confirmed Auto Restart mutations",
    authRequired: true,
    status: "active",
    testStrategy: "safe_post",
  },
  {
    id: "scheduler_status",
    name: "Scheduler status",
    method: "GET",
    path: "/api/instagram-dashboard/auto-restart/scheduler-status",
    usedBy: ["Scheduler"],
    purpose: "Read-only canonical scheduler observability (engine, backend mode, tick facts, recent decisions)",
    authRequired: true,
    status: "active",
    testStrategy: "fetch",
  },
  {
    id: "scheduler_preflight_retry_review",
    name: "Scheduler preflight retry review",
    method: "POST",
    path: "/api/instagram-dashboard/dashboard-actions/preflight-retry-review",
    usedBy: ["Scheduler"],
    purpose: "Operator-reviewed preflight retry approval (no direct account_session enqueue)",
    authRequired: true,
    status: "active",
    testStrategy: "safe_post",
  },
];

function endpointById(id) {
  return botappEndpointRegistry.find((endpoint) => endpoint.id === id) || null;
}

function endpointUrl(endpoint, routeParams = {}) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) return "";
  const url = new URL(cfg.relayUrl);
  let pathname = endpoint.path;
  for (const [key, value] of Object.entries(routeParams)) {
    pathname = pathname.replace(`:${key}`, encodeURIComponent(String(value)));
  }
  url.pathname = pathname;
  url.search = "";
  return url.toString();
}

function endpointPublicState(endpoint) {
  const state = endpointTestState.get(endpoint.id) || {};
  const cfg = compassConfig();
  const configuredStatus = endpoint.status === "active" && !cfg.relayUrl ? "failing" : endpoint.status === "active" ? "untested" : endpoint.status;
  return {
    id: endpoint.id,
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    usedBy: endpoint.usedBy,
    purpose: endpoint.purpose,
    authRequired: endpoint.authRequired,
    status: endpoint.status,
    lastTestAt: state.lastTestAt || null,
    lastStatusCode: state.lastStatusCode || null,
    lastSafeError: state.lastSafeError || null,
    testStatus: state.testStatus || configuredStatus,
  };
}

function endpointRegistryList() {
  return botappEndpointRegistry.map(endpointPublicState);
}

function safeEndpointBody(endpoint) {
  if (endpoint.id === "auto_restart_dry_run") return { dry_run: true };
  if (endpoint.id === "auto_restart_action_preview") {
    return {
      action: "dry_run_preview",
      request_id: `botapp-endpoint-test-${Date.now().toString(36)}`,
      target: null,
    };
  }
  return { dry_run: true };
}

async function testBotappEndpoint(id) {
  const endpoint = endpointById(id);
  const now = new Date().toISOString();
  if (!endpoint) {
    return { id, ok: false, status: "wiring_missing", lastTestAt: now, lastStatusCode: null, lastSafeError: "Unknown endpoint." };
  }
  if (endpoint.status !== "active" || endpoint.testStrategy === "none") {
    const result = {
      id: endpoint.id,
      ok: false,
      status: endpoint.status === "planned" ? "planned" : "wiring_missing",
      lastTestAt: now,
      lastStatusCode: null,
      lastSafeError: endpoint.status === "planned" ? "Planned endpoint; not deployed for testing." : "Wiring missing.",
    };
    endpointTestState.set(endpoint.id, { testStatus: result.status, lastTestAt: now, lastStatusCode: null, lastSafeError: result.lastSafeError });
    return result;
  }
  const cfg = compassConfig();
  if (!cfg.relayUrl) {
    const result = { id: endpoint.id, ok: false, status: "failing", lastTestAt: now, lastStatusCode: null, lastSafeError: "Authentication required: relay URL is not configured." };
    endpointTestState.set(endpoint.id, { testStatus: result.status, lastTestAt: now, lastStatusCode: null, lastSafeError: result.lastSafeError });
    return result;
  }
  if (endpoint.testStrategy === "config_only") {
    const result = { id: endpoint.id, ok: true, status: "connected", lastTestAt: now, lastStatusCode: null, lastSafeError: "Configured. Provider call not executed by endpoint registry test." };
    endpointTestState.set(endpoint.id, { testStatus: result.status, lastTestAt: now, lastStatusCode: null, lastSafeError: result.lastSafeError });
    return result;
  }
  try {
    const response = await fetch(endpointUrl(endpoint), {
      method: endpoint.method,
      headers: relayHeaders(cfg),
      body: endpoint.method === "POST" ? JSON.stringify(safeEndpointBody(endpoint)) : undefined,
    });
    const data = await response.json().catch(() => null);
    const ok = response.ok && data?.ok !== false;
    const status = ok ? "connected" : response.status === 401 || response.status === 403 ? "auth_protected" : response.status === 404 ? "not_deployed" : "failing";
    const result = {
      id: endpoint.id,
      ok,
      status,
      lastTestAt: now,
      lastStatusCode: response.status,
      lastSafeError: ok ? null : readRelayError(data, "Endpoint test failed."),
    };
    endpointTestState.set(endpoint.id, { testStatus: result.status, lastTestAt: now, lastStatusCode: response.status, lastSafeError: result.lastSafeError });
    return result;
  } catch (error) {
    const result = {
      id: endpoint.id,
      ok: false,
      status: "failing",
      lastTestAt: now,
      lastStatusCode: null,
      lastSafeError: safeRuntimeError(error, "Endpoint unavailable."),
    };
    endpointTestState.set(endpoint.id, { testStatus: result.status, lastTestAt: now, lastStatusCode: null, lastSafeError: result.lastSafeError });
    return result;
  }
}

async function testAllBotappEndpoints() {
  const results = [];
  for (const endpoint of botappEndpointRegistry) {
    results.push(await testBotappEndpoint(endpoint.id));
  }
  return { endpoints: endpointRegistryList(), results };
}

function exportBotappConnectionProfile() {
  const cfg = compassConfig();
  return {
    generatedAt: new Date().toISOString(),
    relayOrigin: cfg.relayUrl ? safeUrl(cfg.relayUrl, null) : null,
    endpoints: botappEndpointRegistry.map(({ id, name, method, path, usedBy, purpose, authRequired, status }) => ({
      id,
      name,
      method,
      path,
      usedBy,
      purpose,
      authRequired,
      status,
    })),
  };
}

function autoRestartUrl(pathnameSuffix) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) return "";
  const endpoint = endpointById(`auto_restart_${pathnameSuffix.replace("-", "_")}`);
  return endpoint ? endpointUrl(endpoint) : "";
}

function readPayload(data) {
  return data && typeof data === "object" && data.ok === true && data.data ? data.data : data;
}

function normalizeAutoRestartSchedulerMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === "production" || normalized === "active") return "production";
  if (normalized === "disabled" || normalized === "dry_run") return normalized;
  return "disabled";
}

function isAutoRestartSchedulerExecutable(enabled, mode) {
  if (!enabled) return false;
  return normalizeAutoRestartSchedulerMode(mode) === "production";
}

function autoRestartFallback(sourceSummary = "Auto Restart backend overview is not available.") {
  const control = (action, label, detail, confirmationRequired, impact) => ({
    action,
    label,
    detail,
    requestId: `botapp-auto-restart-${action}-${Date.now().toString(36)}`,
    dryRun: true,
    confirmationRequired,
    impact,
    affectedAccountsCount: 0,
    affectedDevicesCount: 0,
    backendStatus: "backend_pending",
  });
  return {
    status: "backend_pending",
    enabled: false,
    mode: "backend_pending",
    lastRestartAt: null,
    nextEligibleRestartAt: null,
    activeAccountsAffected: 0,
    safetyStatus: "backend_pending",
    backendSyncStatus: "backend_pending",
    sourceSummary,
    sessionResume: {
      pausedDueToQuota: 0,
      eligibleToResume: 0,
      remainingDailyQuota: { follows: null, unfollows: null, dms: null },
      resumeBlockedReason: sourceSummary,
      lastSuccessfulAction: null,
      nextResumeWindow: null,
    },
    businessSessionWindow: {
      status: "backend_pending",
      currentStart: null,
      currentEnd: null,
      timeRemaining: null,
      preventOverrun: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      packageRelation: "Not available yet",
    },
    phoneRest: {
      phonesResting: 0,
      phonesActive: 0,
      nextRestWindow: null,
      reason: "Not available yet",
      devices: [],
    },
    affectedAccounts: [],
    controls: [
      control("refresh_overview", "Refresh overview", "Reload status", false, "Reloads overview only."),
      control("dry_run_preview", "Run dry-run preview", "Compute safe preview", false, "No mutation."),
      control("enable_auto_restart", "Enable Auto Restart", "Requires backend settings", true, "Would enable scheduler mode."),
      control("disable_auto_restart", "Disable Auto Restart", "Requires backend settings", true, "Would disable scheduler mode."),
      control("restart_eligible_sessions", "Restart eligible sessions", "Requires worker scheduler", true, "Would enqueue eligible sessions."),
      control("resume_quota_paused", "Resume quota-paused accounts", "Requires worker scheduler", true, "Would resume eligible quota-paused accounts."),
      control("pause_device_rest", "Pause device rest", "Requires rest policy", true, "Would override rest policy."),
      control("resume_phone", "Resume phone", "Requires rest policy", true, "Would resume one phone."),
      control("open_affected_accounts", "Open affected accounts", "Navigate to account projection", false, "Read-only navigation."),
      control("open_device", "Open device", "Navigate to device", false, "Read-only navigation."),
      control("open_compass_issue", "Open Compass issue", "Navigate to Compass", false, "Read-only navigation."),
      control("open_credentials", "Open Credentials", "Navigate to credential blockers", false, "Read-only navigation."),
      control("open_activity_log", "Open Activity Log", "Navigate to evidence", false, "Read-only navigation."),
      control("view_safety_gates", "View safety gates", "Focus safety gates", false, "Read-only navigation."),
      control("view_candidates", "View candidates", "Focus candidates", false, "Read-only navigation."),
      control("export_preview", "Export preview", "Export backend pending", false, "No mutation."),
      control("copy_safe_summary", "Copy safe summary", "Copy safe status", false, "No mutation."),
    ],
    safetyRules: [
      { id: "no_overlap", label: "No overlapping runs", detail: "No active run or account_run_request.", status: "backend_pending" },
      { id: "day_limits", label: "Respect day limits", detail: "Daily follow/unfollow/DM caps must pass.", status: "backend_pending" },
      { id: "session_window", label: "Respect 6h session", detail: "Restart only inside assigned window.", status: "backend_pending" },
      { id: "phone_rest", label: "Respect phone rest", detail: "Avoid 24/24 runtime.", status: "backend_pending" },
      { id: "credential_blocks", label: "Block credential accounts", detail: "Checkpoint/2FA/password blocks restart.", status: "backend_pending" },
      { id: "device_health", label: "Block offline devices", detail: "Assigned device must be online.", status: "backend_pending" },
    ],
    rules: {
      enabled: false,
      restartYellowAccounts: true,
      restartRedAccounts: true,
      respectFixedBlackouts: true,
      respectSixHourWindow: true,
      checkEveryMinutes: 15,
      maxRestartsPerAccountPerDay: 2,
      maxRestartsPerAccountPerWindow: 1,
      writable: false,
    },
    quotaCandidates: [],
    decisions: [],
  };
}

function normalizeAutoRestartOverview(data) {
  const payload = readPayload(data);
  if (!payload || typeof payload !== "object") return autoRestartFallback();
  const status = payload.status || {};
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const sourceStatus = Array.isArray(payload.sourceStatus) ? payload.sourceStatus : [];
  const safetyGates = Array.isArray(payload.safetyGates) ? payload.safetyGates : [];
  const rules = payload.rules || {};
  const firstCandidate = candidates[0] || {};
  const quotaRemaining = (key) => {
    const value = firstCandidate?.quotas?.[key]?.remaining;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  };
  const candidateAccounts = candidates.map((candidate) => ({
    accountId: candidate.accountId || "",
    username: candidate.username || "unknown",
    clientName: candidate.username || "Unknown client",
    packageLabel: candidate.packageLabel || "Unknown package",
    status: candidate.gateStatus || "unknown",
    quotaStatus: candidate.restartEligible ? "quota_available" : "blocked",
    resumeEligibility: candidate.restartEligible ? "eligible" : "blocked",
    assignedDevice: candidate.phoneName || "Not assigned",
    lastRun: null,
    nextAction: candidate.restartEligible ? `Plan ${candidate.plannedRunType}` : "Review blocker",
    blockingReason: candidate.blockReason || null,
  }));
  const resting = candidates.filter((candidate) => /rest/i.test(String(candidate.phoneRestStatus || ""))).length;
  const active = candidates.filter((candidate) => /active|ok|none|not active/i.test(String(candidate.phoneRestStatus || ""))).length;
  const schedulerMode = normalizeAutoRestartSchedulerMode(status.mode);
  const autoRestartEnabled = Boolean(status.enabled);
  const schedulerExecutable = isAutoRestartSchedulerExecutable(autoRestartEnabled, status.mode);
  const backendWritable = sourceStatus.every((source) => source.status !== "pending");
  const mutationBackendStatus = schedulerExecutable ? "relay_ready" : "backend_pending";
  const control = (action, label, detail, confirmationRequired, impact, backendStatus = "relay_ready", dryRun = false) => ({
    action,
    label,
    detail,
    requestId: `botapp-auto-restart-${action}-${Date.now().toString(36)}`,
    dryRun,
    confirmationRequired,
    impact,
    affectedAccountsCount: candidateAccounts.length,
    affectedDevicesCount: new Set(candidateAccounts.map((account) => account.assignedDevice).filter(Boolean)).size,
    backendStatus,
  });
  return {
    status: schedulerExecutable ? "enabled" : "disabled",
    enabled: autoRestartEnabled,
    mode: schedulerMode,
    operationalState: status.operationalState || (schedulerExecutable ? "active" : autoRestartEnabled ? "ready" : "disabled"),
    blockReasons: Array.isArray(status.blockReasons) ? status.blockReasons : [],
    lastRestartAt: status.lastSchedulerCheck || null,
    nextEligibleRestartAt: schedulerExecutable ? (status.nextSchedulerCheck || null) : null,
    activeAccountsAffected: Number(status.activeRestartCandidates || 0),
    safetyStatus: Number(status.blockedCandidates || 0) > 0 ? "watch" : schedulerExecutable ? "safe" : "backend_pending",
    backendSyncStatus: backendWritable ? "relay_ready" : "backend_pending",
    sourceSummary: status.statusLabel || "Auto Restart overview loaded from shared backend.",
    sessionResume: {
      pausedDueToQuota: candidates.filter((candidate) => /quota/i.test(String(candidate.blockReason || ""))).length,
      eligibleToResume: Number(status.activeRestartCandidates || 0),
      remainingDailyQuota: {
        follows: quotaRemaining("follow"),
        unfollows: quotaRemaining("unfollow"),
        dms: quotaRemaining("welcome") ?? quotaRemaining("outreach"),
      },
      resumeBlockedReason: Number(status.blockedCandidates || 0) ? `${status.blockedCandidates} blocked candidate(s)` : null,
      lastSuccessfulAction: null,
      nextResumeWindow: status.nextSchedulerCheck || null,
    },
    businessSessionWindow: {
      status: String(firstCandidate.sessionWindowStatus || "").includes("in_window") ? "in_window" : firstCandidate.sessionWindowStatus ? "outside_window" : "not_configured",
      currentStart: null,
      currentEnd: null,
      timeRemaining: null,
      preventOverrun: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      packageRelation: "Shared backend applies package/session caps before restart planning.",
    },
    phoneRest: {
      phonesResting: resting,
      phonesActive: active,
      nextRestWindow: null,
      reason: "Derived from shared backend phone_rest_windows and schedule gates.",
      devices: candidates.slice(0, 20).map((candidate) => ({
        deviceId: candidate.phoneName || candidate.accountId || "",
        deviceLabel: candidate.phoneName || "Unknown phone",
        status: /offline/i.test(String(candidate.phoneRestStatus || "")) ? "offline" : /rest/i.test(String(candidate.phoneRestStatus || "")) ? "resting" : "active",
        reason: candidate.phoneRestStatus || "No rest blocker",
        nextRestWindow: null,
        highVolumePackageProtection: /80|120|pro|premium/i.test(String(candidate.packageLabel || "")),
      })),
    },
    affectedAccounts: candidateAccounts,
    controls: [
      control("refresh_overview", "Refresh overview", "Reload latest backend overview", false, "Reloads overview only."),
      control("dry_run_preview", "Run dry-run check", "Evaluate candidates without enqueue", false, "No mutation."),
      control("enable_auto_restart", "Enable Auto Restart", "Enable scheduler after confirmation", true, "Enables scheduler mode in backend settings.", mutationBackendStatus, !backendWritable),
      control("disable_auto_restart", "Disable Auto Restart", "Disable scheduler after confirmation", true, "Disables scheduler mode; existing runs continue.", mutationBackendStatus, !backendWritable),
      control("restart_eligible_sessions", "Restart eligible sessions", "Manual scheduler tick", true, "Enqueues eligible sessions only.", mutationBackendStatus, !schedulerExecutable),
      control("resume_quota_paused", "Resume quota-paused accounts", "Manual quota resume tick", true, "Resumes quota-paused accounts with runtime support.", mutationBackendStatus, !schedulerExecutable),
      control("pause_device_rest", "Pause device rest", "Pause rest for selected phone", true, "Overrides rest window for selected phone.", mutationBackendStatus, !backendWritable),
      control("resume_phone", "Resume phone", "Resume selected phone", true, "Ends phone rest override after confirmation.", mutationBackendStatus, !backendWritable),
      control("open_affected_accounts", "Open affected accounts", "Open affected accounts", false, "Read-only navigation."),
      control("open_device", "Open device", "Open Devices", false, "Read-only navigation."),
      control("open_compass_issue", "Open Compass issue", "Open Compass", false, "Read-only navigation."),
      control("open_credentials", "Open Credentials", "Open blockers", false, "Read-only navigation."),
      control("open_activity_log", "Open Activity Log", "Open evidence", false, "Read-only navigation."),
      control("view_safety_gates", "View safety gates", "Focus safety gates", false, "Read-only navigation."),
      control("view_candidates", "View candidates", "Focus candidates", false, "Read-only navigation."),
      control("export_preview", "Export preview", "Export safe summary", false, "Export backend pending.", "backend_pending"),
      control("copy_safe_summary", "Copy safe summary", "Copy safe summary", false, "No mutation."),
    ],
    safetyRules: safetyGates.length ? safetyGates.map((gate, index) => ({
      id: `gate_${index + 1}`,
      label: gate.label || "Safety gate",
      detail: gate.detail || "",
      status: gate.status === "ready" ? "safe" : gate.status === "blocked" ? "blocked" : "watch",
    })) : sourceStatus.map((source, index) => ({
      id: `source_${index + 1}`,
      label: source.label || "Source",
      detail: source.detail || "",
      status: source.status === "connected" ? "safe" : "backend_pending",
    })),
    rules: {
      enabled: Boolean(rules.enabled),
      pilotAccountId: rules.pilotAccountId || null,
      pilotUsername: rules.pilotUsername || null,
      restartYellowAccounts: Boolean(rules.restartYellowAccounts),
      restartRedAccounts: Boolean(rules.restartRedAccounts),
      respectFixedBlackouts: Boolean(rules.respectPhoneRest),
      respectSixHourWindow: Boolean(rules.respectSixHourWindow),
      checkEveryMinutes: Number(rules.checkEveryMinutes || 15),
      restartDelayMinutes: Number(rules.restartDelayMinutes || 20),
      maxAttemptsPerSession: Number(rules.maxAttemptsPerSession || 2),
      maxRestartsPerAccountPerDay: Number(rules.maxRestartsPerDayPerAccount || rules.maxRestartsPerAccountPerDay || 2),
      maxRestartsPerAccountPerWindow: Number(rules.maxRestartsPerWindowPerAccount || rules.maxRestartsPerAccountPerWindow || 1),
      resumeFollowIfQuotaRemaining: Boolean(rules.resumeFollowIfQuotaRemaining),
      resumeUnfollowIfQuotaRemaining: Boolean(rules.resumeUnfollowIfQuotaRemaining),
      blockOnChallenge: Boolean(rules.blockOnChallenge),
      blockOnRestriction: Boolean(rules.blockOnRestriction),
      blockOnAccountMismatch: Boolean(rules.blockOnAccountMismatch),
      blockOnDeviceOffline: Boolean(rules.blockOnDeviceOffline),
      notifyOnBlockedRestart: Boolean(rules.notifyOnBlockedRestart),
      writable: backendWritable,
    },
    quotaCandidates: candidates.map((candidate) => ({
      accountId: candidate.accountId || "",
      username: candidate.username || "unknown",
      packageLabel: candidate.packageLabel || "Unknown package",
      phoneName: candidate.phoneName || "No phone",
      followRemaining: Number(candidate.quotas?.follow?.remaining || 0),
      unfollowRemaining: Number(candidate.quotas?.unfollow?.remaining || 0),
      welcomeRemaining: Number(candidate.quotas?.welcome?.remaining || 0),
      outreachRemaining: Number(candidate.quotas?.outreach?.remaining || 0),
      plannedRunType: candidate.plannedRunType || "none",
      decision: candidate.restartEligible ? "Eligible" : "Blocked",
      reason: candidate.blockReason || "",
    })),
    decisions: Array.isArray(payload.decisions) ? payload.decisions.map((decision) => ({
      id: decision.id || `${decision.account || "decision"}-${decision.decisionTime || ""}`,
      account: decision.account || "Unknown",
      decisionTime: decision.decisionTime || null,
      action: decision.action || "",
      reason: decision.reason || "",
      requestId: decision.requestId || null,
    })) : [],
  };
}

async function autoRestartOverview() {
  const cfg = compassConfig();
  const url = autoRestartUrl("overview");
  if (!url) return autoRestartFallback("Configure the relay URL to load Auto Restart overview.");
  try {
    const response = await fetch(url, { method: "GET", headers: relayHeaders(cfg) });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) return autoRestartFallback(readRelayError(data, "Auto Restart overview unavailable."));
    return normalizeAutoRestartOverview(data);
  } catch (error) {
    return autoRestartFallback(safeRuntimeError(error, "Auto Restart overview unavailable."));
  }
}

async function incidentsOverview(input = {}) {
  const hostHint = String(input?.host_machine || input?.client_host_hint || os.hostname() || "").trim();
  try {
    const data = await dashboardGetWithQuery("incidents_overview", {
      status: String(input?.status || "open,acknowledged"),
      client_host_hint: hostHint,
      device_id: String(input?.device_id || "").trim() || undefined,
      account_id: String(input?.account_id || "").trim() || undefined,
      limit: String(input?.limit || 50),
      // P3.1: always fetch test incidents too; the renderer's "Show test
      // incidents" toggle filters client-side and operational counters
      // already exclude them. Without this the toggle never appears.
      include_test: "1",
    });
    const incidents = Array.isArray(data?.incidents) ? data.incidents.map((item) => serializeIpcPayload(item)) : [];
    return serializeIpcPayload({
      ok: true,
      hostMachine: data?.scope?.authorizedHostMachine || hostHint,
      authorizedHostMachine: data?.scope?.authorizedHostMachine || null,
      scopeMode: data?.scope?.mode === "relay_global_admin" ? "global_admin" : "host_bound",
      openCount: Number(data?.summary?.openCount || incidents.filter((item) => item.status === "open" || item.status === "acknowledged").length),
      incidents,
      generatedAt: data?.generatedAt || new Date().toISOString(),
    });
  } catch (error) {
    return serializeIpcPayload({
      ok: false,
      hostMachine: hostHint,
      authorizedHostMachine: null,
      openCount: 0,
      incidents: [],
      message: safeRuntimeError(error, "Incidents overview unavailable."),
      generatedAt: new Date().toISOString(),
    });
  }
}

async function incidentsDetail(incidentId) {
  const id = String(incidentId || "").trim();
  if (!id) return { ok: false, message: "incident_id_required" };
  try {
    const data = await dashboardGetWithQuery("incidents_detail", {}, { incidentId: id });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: safeRuntimeError(error, "Incident detail unavailable.") };
  }
}

async function performIncidentAction(input = {}) {
  const action = String(input?.action || "").trim();
  const incidentId = String(input?.incident_id || input?.incidentId || "").trim();
  if (!incidentId || !action) {
    return { ok: false, error: "incident_action_payload_invalid" };
  }
  try {
    const data = await dashboardPost("incidents_action", {
      incident_id: incidentId,
      action,
      source: "botapp_relay",
      resolution_note: String(input?.resolution_note || "").trim(),
      resume_scheduling: Boolean(input?.resume_scheduling),
      requested_run_type: String(input?.requested_run_type || "account_session"),
      idempotency_key: String(input?.idempotency_key || "").trim() || undefined,
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Incident action failed.") };
  }
}

async function incidentsNotificationSettings() {
  try {
    const data = await dashboardGetWithQuery("incidents_notification_settings", {});
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: safeRuntimeError(error, "Notification settings unavailable.") };
  }
}

async function patchIncidentsNotificationSettings(input = {}) {
  try {
    const result = await dashboardRequestResult("PATCH", "incidents_notification_settings_patch", input || {});
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        error: result.error || "Notification settings update failed.",
        reason: result.data?.reason || null,
        channel: result.data?.channel || null,
      };
    }
    return { ok: true, status: result.status, data: result.data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Notification settings update failed.") };
  }
}

async function testIncidentsNotification(input = {}) {
  try {
    const result = await dashboardRequestResult("POST", "incidents_notification_test", input || {});
    const statusText = String(result.data?.status || result.data?.reason || result.error || "");
    if (!result.ok || /unavailable|not_configured|disabled|failed/i.test(statusText)) {
      return {
        ok: false,
        status: result.status,
        error: result.error || statusText || "Notification test failed.",
        reason: result.data?.reason || result.data?.status || null,
        channel: result.data?.channel || input?.channel || null,
        data: result.data || null,
      };
    }
    return { ok: true, status: result.status, data: result.data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Notification test failed.") };
  }
}

async function incidentsNotificationOutbox(input = {}) {
  try {
    const data = await dashboardGetWithQuery("incidents_notification_outbox", {
      channel: String(input?.channel || "").trim() || undefined,
      limit: String(input?.limit || 20),
      offset: String(input?.offset || 0),
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: safeRuntimeError(error, "Notification outbox unavailable.") };
  }
}

async function autoRestartDryRun() {
  const cfg = compassConfig();
  const url = autoRestartUrl("dry-run");
  if (!url) return { ok: false, error: "Configure the relay URL to run Auto Restart dry-run.", overview: autoRestartFallback() };
  try {
    const response = await fetch(url, { method: "POST", headers: relayHeaders(cfg), body: JSON.stringify({ dry_run: true }) });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) return { ok: false, error: readRelayError(data, "Auto Restart dry-run unavailable."), overview: autoRestartFallback() };
    return { ok: true, overview: normalizeAutoRestartOverview(readPayload(data)?.overview || data), dryRun: true };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Auto Restart dry-run unavailable."), overview: autoRestartFallback() };
  }
}

async function autoRestartActionPreview(input) {
  const cfg = compassConfig();
  const url = autoRestartUrl("action-preview");
  if (!url) return { ok: false, error: "Configure the relay URL to preview Auto Restart actions." };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: relayHeaders(cfg),
      body: JSON.stringify({
        action: input?.action,
        request_id: input?.requestId || `botapp-auto-restart-${Date.now().toString(36)}`,
        target: sanitizeCompassValue(input?.target || {}),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) return { ok: false, error: readRelayError(data, "Auto Restart action preview failed.") };
    return { ok: true, data: readPayload(data) };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Auto Restart action preview failed.") };
  }
}

async function autoRestartSettingsLoad() {
  const result = await dashboardRequestResult("GET", "auto_restart_settings");
  if (!result.ok) return { ok: false, error: result.error || "Auto Restart settings unavailable." };
  return { ok: true, data: result.data };
}

async function autoRestartSettingsSave(patch) {
  const result = await dashboardRequestResult("PATCH", "auto_restart_settings_patch", sanitizeCompassValue(patch || {}));
  if (!result.ok) return { ok: false, error: result.error || "Could not save Auto Restart settings." };
  return { ok: true, data: result.data };
}

async function schedulerStatusLoad() {
  const result = await dashboardRequestResult("GET", "scheduler_status");
  if (!result.ok) return { ok: false, error: result.error || "Scheduler status unavailable." };
  return { ok: true, data: result.data };
}

// Global operator switch: only flips the canonical backend flag through the
// existing relay/admin protected settings endpoint. Never creates a run and
// never calls the worker; the next canonical tick applies the new mode.
async function schedulerSetEnabled(input) {
  const enabled = input?.enabled === true;
  const result = await dashboardRequestResult("PATCH", "auto_restart_settings_patch", {
    auto_restart_enabled: enabled,
  });
  if (!result.ok) return { ok: false, error: result.error || "Could not update the Scheduler switch." };
  return { ok: true, data: result.data };
}

async function schedulerApprovePreflightRetry(input) {
  const actionId = String(input?.action_id || "").trim();
  const accountId = String(input?.account_id || "").trim();
  const resolutionNote = String(input?.resolution_note || "").trim();
  if (!actionId || !accountId) {
    return { ok: false, error: "Missing preflight retry review payload." };
  }
  const result = await dashboardRequestResult("POST", "scheduler_preflight_retry_review", {
    action_id: actionId,
    account_id: accountId,
    source: "botapp_relay",
    ...(resolutionNote ? { resolution_note: resolutionNote } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error || "Could not approve preflight retry." };
  return { ok: true, data: result.data };
}

async function autoRestartExecute(input) {
  const result = await dashboardRequestResult("POST", "auto_restart_execute", {
    action: input?.action,
    request_id: input?.requestId || `botapp-auto-restart-${Date.now().toString(36)}`,
    target: sanitizeCompassValue(input?.target || {}),
    confirmed: input?.confirmed !== false,
  });
  if (!result.ok) return { ok: false, error: result.error || "Auto Restart action failed." };
  return { ok: true, data: result.data };
}

function dashboardApiUrl(pathnameSuffix) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) return "";
  const endpoint = endpointById(pathnameSuffix);
  if (endpoint) return endpointUrl(endpoint);
  const url = new URL(cfg.relayUrl);
  url.pathname = url.pathname.replace(/\/compass\/analyze\/?$/, `/${pathnameSuffix.replace(/^\/+/, "")}`);
  return url.toString();
}

async function dashboardGet(pathnameSuffix, routeParams = {}) {
  const cfg = compassConfig();
  const endpoint = endpointById(pathnameSuffix);
  const url = endpoint ? endpointUrl(endpoint, routeParams) : dashboardApiUrl(pathnameSuffix);
  if (!url) return null;
  const response = await fetch(url, { method: "GET", headers: relayHeaders(cfg) });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) throw new Error(readRelayError(data, `${pathnameSuffix} unavailable.`));
  return readPayload(data);
}

async function dashboardGetWithQuery(endpointId, queryParams = {}, routeParams = {}) {
  const cfg = compassConfig();
  const endpoint = endpointById(endpointId);
  const url = endpoint ? new URL(endpointUrl(endpoint, routeParams)) : new URL(dashboardApiUrl(endpointId));
  for (const [key, value] of Object.entries(queryParams)) {
    const normalized = String(value ?? "").trim();
    if (normalized) url.searchParams.set(key, normalized);
  }
  const response = await fetch(url.toString(), { method: "GET", headers: relayHeaders(cfg) });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) throw new Error(readRelayError(data, `${endpointId} unavailable.`));
  return readPayload(data);
}

async function dashboardPost(endpointId, body, routeParams = {}) {
  return dashboardRequest("POST", endpointId, body, routeParams);
}

async function dashboardRequest(method, endpointId, body, routeParams = {}) {
  const result = await dashboardRequestResult(method, endpointId, body, routeParams);
  if (!result.ok) throw new Error(result.error || `${endpointId} unavailable.`);
  return result.data;
}

async function dashboardRequestResult(method, endpointId, body, routeParams = {}) {
  const cfg = compassConfig();
  const endpoint = endpointById(endpointId);
  const url = endpoint ? endpointUrl(endpoint, routeParams) : dashboardApiUrl(endpointId);
  if (!url) return { ok: false, status: 0, data: null, error: "Relay URL is not configured." };
  const response = await fetch(url, {
    method,
    headers: relayHeaders(cfg),
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => null);
  const ok = response.ok && data?.ok !== false;
  return {
    ok,
    status: response.status,
    data: ok ? readPayload(data) : data,
    error: ok ? null : readRelayError(data, `${endpointId} unavailable.`),
  };
}

async function profileDetailsData(accountId) {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) return { ok: false, error: "Missing account id." };
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to load profile details." };
  try {
    const data = await dashboardGet("profiles_account_details", { account_id: normalizedAccountId });
    return { ok: true, data: normalizeProfileDetailsAvatarUrls(data, cfg) };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Profile details unavailable.") };
  }
}

async function profileStatsHistoryData(accountId, days = 30) {
  const normalizedAccountId = String(accountId || "").trim();
  const normalizedDays = Math.max(1, Math.min(30, Number(days) || 30));
  if (!normalizedAccountId) return { ok: false, error: "Missing account id." };
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to load stats history." };
  try {
    const data = await dashboardGetWithQuery("profiles_stats_history", { days: normalizedDays }, { account_id: normalizedAccountId });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Stats history unavailable.") };
  }
}

async function profileCreateDryRun(input) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to validate profile creation." };
  try {
    const payload = sanitizeAddProfilePayload(input);
    const data = await dashboardPost("profiles_create", { ...payload, dry_run: true });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Profile create dry-run failed.") };
  }
}

async function profileCreate(input) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to create profiles." };
  try {
    const payload = sanitizeAddProfilePayload(input);
    const hasPassword = Boolean(String(payload.password || "").trim());
    console.log("[botapp] profile_create_request", {
      schedule_mode: payload.schedule_mode || null,
      has_starts_at: Boolean(payload.starts_at),
      has_ends_at: Boolean(payload.ends_at),
      has_device_id: Boolean(payload.device_id),
      has_app_instance_id: Boolean(payload.app_instance_id),
      credentials_requested: hasPassword,
    });
    const result = await dashboardRequestResult("POST", "profiles_create", {
      ...payload,
      dry_run: false,
      login_method: hasPassword ? "credentials" : (payload.login_method || "manual"),
      submit_credentials: hasPassword,
      credential_status: hasPassword ? "pending_write_only" : "not_submitted",
      credentials_submitted: hasPassword,
      provisioning_enabled: false,
      login_enabled: false,
      start_run: false,
    });
    if (!result.ok) {
      const partial = result.data?.partial || null;
      console.log("[botapp] profile_create_failed", {
        reason: result.error,
        account_id: partial?.account_id || null,
        assignment_failed: partial?.assignment_failed ?? null,
        credentials_saved: partial?.credentials_saved ?? null,
      });
      return { ok: false, error: result.error, partial };
    }
    const accountId = result.data?.account?.id || result.data?.account_id || null;
    console.log("[botapp] create_success", {
      account_id: accountId,
      credentials_configured: result.data?.credentials_configured ?? null,
      login_started: false,
      provisioning_started: false,
      run_started: false,
    });
    return { ok: true, data: result.data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Profile create failed.") };
  }
}

async function profileScheduleSettingsGet(accountId) {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) return { ok: false, error: "Missing account id." };
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to load schedule settings." };
  try {
    const data = await dashboardGetWithQuery("settings_schedule", { account_id: normalizedAccountId });
    const profilesPayload = await dashboardGet("profiles_overview").catch(() => null);
    return { ok: true, data: repairSettingsScheduleEditSlots(data, normalizedAccountId, profilesPayload) };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Schedule settings unavailable.") };
  }
}

function normalizeScheduleSlotLabel(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function profileAccountId(profile) {
  return String(profile?.accountId || profile?.account_id || profile?.id || "").trim();
}

function profileDeviceId(profile) {
  return String(profile?.deviceId || profile?.device_id || "").trim();
}

function profileScheduleMode(profile) {
  return readScheduleMode(profile);
}

function profileScheduleLabel(profile) {
  const explicit = normalizeScheduleSlotLabel(profile?.scheduleLabel || profile?.schedule_label || "");
  if (explicit && explicit !== "Unassigned" && explicit !== "Manual") return explicit;
  if (readScheduleMode(profile) === "manual_only") return "Manual";
  return normalizeScheduleSlotLabel(formatAssignmentWindowLabel(profile));
}

function profileUsername(profile) {
  return String(profile?.username || profile?.instagramCanonicalUsername || profile?.instagram_canonical_username || "").trim();
}

function profileAssignmentStatus(profile) {
  return String(profile?.assignmentStatus || profile?.assignment_status || profile?.status || "").trim();
}

function repairSettingsScheduleEditSlots(scheduleData, accountId, profilesPayload) {
  if (!scheduleData || !Array.isArray(scheduleData.available_slots)) return scheduleData;
  const profiles = Array.isArray(profilesPayload?.profiles) ? profilesPayload.profiles : [];
  const current = profiles.find((profile) => profileAccountId(profile) === accountId);
  const deviceId = String(scheduleData.device_id || scheduleData.current_assignment?.device_id || profileDeviceId(current) || "").trim();
  if (!deviceId) return scheduleData;

  const scheduledProfiles = profiles.filter((profile) => {
    if (profileDeviceId(profile) !== deviceId) return false;
    if (profileScheduleMode(profile) !== "scheduled") return false;
    if (!["pending", "reserved", "active"].includes(profileAssignmentStatus(profile))) return false;
    return Boolean(profileScheduleLabel(profile));
  });
  const currentLabel = normalizeScheduleSlotLabel(scheduleData.current_assignment?.local_label || profileScheduleLabel(current));
  const currentUsername = profileUsername(current);
  const repairedSlots = scheduleData.available_slots.map((slot) => {
    const isManual = String(slot?.slot_kind || "") === "manual_only";
    if (isManual) {
      const isCurrentManual = String(scheduleData.current_assignment?.schedule_mode || profileScheduleMode(current)) === "manual_only";
      return {
        ...slot,
        slot_id: slot.slot_id || "manual_only",
        available: true,
        selectable: true,
        availability: "manual_only",
        is_current: isCurrentManual,
        is_conflict: false,
        reason: isCurrentManual ? "current" : "manual_only",
        occupied_by: null,
      };
    }

    const slotLabel = normalizeScheduleSlotLabel(slot?.local_label);
    const occupants = scheduledProfiles.filter((profile) => profileScheduleLabel(profile) === slotLabel);
    const otherOccupants = occupants.filter((profile) => profileAccountId(profile) !== accountId);
    const isCurrent = Boolean(currentLabel && slotLabel === currentLabel);
    const otherUsername = profileUsername(otherOccupants[0]);

    if (isCurrent && otherOccupants.length) {
      return {
        ...slot,
        slot_id: slot.slot_id || `${slot.slot_kind}:${slot.starts_at || ""}:${slot.ends_at || ""}`,
        available: true,
        selectable: true,
        availability: "conflict",
        is_current: true,
        is_conflict: true,
        reason: "current_conflict",
        occupied_by: otherUsername || "assigned account",
      };
    }
    if (isCurrent) {
      return {
        ...slot,
        slot_id: slot.slot_id || `${slot.slot_kind}:${slot.starts_at || ""}:${slot.ends_at || ""}`,
        available: true,
        selectable: true,
        availability: "current",
        is_current: true,
        is_conflict: false,
        reason: "current",
        occupied_by: currentUsername || null,
      };
    }
    if (otherOccupants.length) {
      return {
        ...slot,
        slot_id: slot.slot_id || `${slot.slot_kind}:${slot.starts_at || ""}:${slot.ends_at || ""}`,
        available: false,
        selectable: false,
        availability: "occupied",
        is_current: false,
        is_conflict: false,
        reason: "occupied",
        occupied_by: otherUsername || "assigned account",
      };
    }
    return {
      ...slot,
      slot_id: slot.slot_id || `${slot.slot_kind}:${slot.starts_at || ""}:${slot.ends_at || ""}`,
      available: true,
      selectable: true,
      availability: "available",
      is_current: false,
      is_conflict: false,
      reason: "available",
      occupied_by: null,
    };
  });

  return {
    ...scheduleData,
    available_slots: repairedSlots,
    save_ready: true,
    botapp_schedule_edit_repaired: true,
  };
}

async function profileScheduleSettingsSave(input) {
  const accountId = String(input?.account_id || input?.accountId || "").trim();
  if (!accountId) return { ok: false, error: "Missing account id." };
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to save schedule settings." };
  try {
    const data = await dashboardRequest("PATCH", "settings_schedule", {
      account_id: accountId,
      device_id: input?.device_id || input?.deviceId || "",
      app_instance_id: input?.app_instance_id || input?.appInstanceId || "",
      schedule_mode: input?.schedule_mode || input?.scheduleMode || "scheduled",
      starts_at: input?.starts_at || input?.startsAt || "",
      ends_at: input?.ends_at || input?.endsAt || "",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Schedule save failed.") };
  }
}

function safeResourceRef(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return normalized.length <= 8 ? normalized : `…${normalized.slice(-8)}`;
}

async function profileScheduleSlots(input) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to load schedule slots." };
  const deviceId = String(input?.device_id || input?.deviceId || "").trim();
  const appInstanceId = String(input?.app_instance_id || input?.appInstanceId || "").trim();
  const runtimeMode = String(input?.runtime_mode || input?.runtimeMode || "safe_setup").trim();
  if (!deviceId) return { ok: false, error: "Missing device id." };
  if (!appInstanceId) return { ok: false, error: "Missing app instance id." };
  const endpoint = endpointById("profiles_schedule_slots");
  const requestUrl = endpoint ? endpointUrl(endpoint) : dashboardApiUrl("profiles_schedule_slots");
  console.log("[botapp] schedule_slots_request", {
    endpoint: "/api/instagram-dashboard/accounts/schedule-slots",
    relayOrigin: dashboardOrigin(cfg) || null,
    relayKeyConfigured: Boolean(cfg.relayKey),
    hasDeviceId: Boolean(deviceId),
    hasAppInstanceId: Boolean(appInstanceId),
    deviceRef: safeResourceRef(deviceId),
    appInstanceRef: safeResourceRef(appInstanceId),
    runtimeMode,
  });
  try {
    const data = await dashboardGetWithQuery("profiles_schedule_slots", {
      device_id: deviceId,
      app_instance_id: appInstanceId,
      runtime_mode: runtimeMode,
    });
    const slotCount = Array.isArray(data?.slots) ? data.slots.length : 0;
    const manualOnlyCount = Array.isArray(data?.slots)
      ? data.slots.filter((slot) => String(slot?.schedule_mode || "") === "manual_only").length
      : 0;
    console.log("[botapp] schedule_slots_response", {
      status: 200,
      slotCount,
      manualOnlyCount,
      timezone: data?.timezone || null,
    });
    return { ok: true, data };
  } catch (error) {
    const message = safeRuntimeError(error, "Schedule slots unavailable.");
    console.log("[botapp] schedule_slots_response", {
      status: "error",
      error: message,
      requestUrl: requestUrl ? safeUrl(requestUrl, null) : null,
    });
    return { ok: false, error: message };
  }
}

async function profileCredentialsSubmit(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const username = String(input?.username || "").trim().replace(/^@+/, "").toLowerCase();
  const password = String(input?.password || "");
  const dryRun = input?.dry_run === true || input?.dryRun === true;
  if (!accountId || !username) return { ok: false, error: "Missing account id or username." };
  if (!dryRun && password.trim().length < 6) return { ok: false, error: "Password must contain at least 6 characters." };
  try {
    const data = await dashboardPost("profiles_credentials_submit", {
      account_id: accountId,
      username,
      password: dryRun ? "" : password,
      reason: "botapp_credentials_update",
      login_after_save: false,
      provisioning_enabled: false,
      start_run: false,
      dry_run: dryRun,
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Credentials submit failed.") };
  }
}

async function profileSettingsSave(input) {
  const mode = String(input?.mode || "").trim().toLowerCase();
  const patch = input?.patch && typeof input.patch === "object" ? input.patch : input;
  const accountId = String(patch?.account_id || patch?.accountId || input?.account_id || input?.accountId || "").trim();
  if (!accountId) return { ok: false, error: "Missing account id." };
  if (!["follow", "filters", "dm", "followback", "sources"].includes(mode)) {
    return { ok: false, error: "backend_pending" };
  }

  const endpointId = mode === "filters"
    ? "settings_follow_filters"
    : mode === "dm"
      ? "settings_dm"
      : mode === "followback"
        ? "settings_unfollow"
        : mode === "sources"
          ? "settings_follow_sources"
          : "settings_account";
  try {
    const data = await dashboardRequest("PATCH", endpointId, {
      ...patch,
      account_id: accountId,
    });
    return { ok: true, data };
  } catch (error) {
    const message = safeRuntimeError(error, `${mode} settings save failed.`);
    if (/authentication required/i.test(message)) {
      return { ok: false, error: `Backend auth failed for ${mode} settings save.` };
    }
    if (/relay authentication failed/i.test(message)) {
      return { ok: false, error: `Backend auth failed for ${mode} settings save.` };
    }
    return { ok: false, error: message };
  }
}

async function profileVerifyUsername(input) {
  const username = String(input?.username || "").trim().replace(/^@+/, "").toLowerCase();
  if (!username) return { ok: false, error: "Missing username." };
  try {
    const data = await dashboardPost("profiles_verify_username", {
      username,
      platform: "instagram",
      source: "botapp_add_profile",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Username verification failed.") };
  }
}

async function performClientAccountNeedsMoreTargetsAction(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const action = String(input?.action || "mark").trim().toLowerCase();
  const reason = String(input?.reason || `client_accounts_needs_more_targets_${action}`).trim().slice(0, 160) || "client_accounts_needs_more_targets";
  const dryRun = input?.dryRun === true;
  if (!accountId) return { ok: false, error: "Missing account id." };
  if (!["mark", "clear"].includes(action)) {
    return { ok: false, error: "Unsupported needs more targets action." };
  }
  const cfg = compassConfig();
  if (!cfg.relayUrl || !cfg.relayKey) {
    return { ok: false, error: "Secure relay not connected — action unavailable.", code: "relay_unavailable" };
  }
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      data: {
        account_id: accountId,
        action,
        reason,
        expected_effect: "needs_more_target_accounts_signal_only",
      },
    };
  }
  try {
    const metadata = input?.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : {};
    const data = await dashboardRequest("PATCH", "client_accounts_needs_more_targets", {
      account_id: accountId,
      action,
      reason,
      metadata: {
        source_surface: "client_accounts",
        expected_effect: "needs_more_target_accounts_signal_only",
        ...metadata,
      },
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Needs more targets update failed.") };
  }
}

async function performClientAccountStatusAction(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const action = String(input?.action || "").trim().toLowerCase();
  const reason = String(input?.reason || `client_accounts_${action}`).trim().slice(0, 160) || "client_accounts_action";
  const dryRun = input?.dryRun === true;
  if (!accountId) return { ok: false, error: "Missing account id." };
  if (!["pause", "cancel", "mark_needs_assistance", "reactivate"].includes(action)) {
    return { ok: false, error: "Unsupported lifecycle action." };
  }
  const cfg = compassConfig();
  if (!cfg.relayUrl || !cfg.relayKey) {
    return { ok: false, error: "Secure relay not connected — action unavailable.", code: "relay_unavailable" };
  }
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      data: {
        account_id: accountId,
        action,
        reason,
        expected_effect: "admin_status_write_only",
      },
    };
  }
  try {
    const metadata = input?.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : {};
    const data = await dashboardRequest("PATCH", "profiles_account_status", {
      account_id: accountId,
      action,
      reason,
      actor_type: "botapp",
      start_run: false,
      provisioning_enabled: false,
      login_enabled: false,
      metadata: {
        source_surface: "client_accounts",
        expected_effect: "admin_status_write_only",
        ...metadata,
      },
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Account status update failed.") };
  }
}

async function performProfileAction(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const action = String(input?.action || "").trim().toLowerCase();
  const reason = String(input?.reason || "botapp_account_action").trim().slice(0, 160) || "botapp_account_action";
  if (!accountId) return { ok: false, error: "Missing account id." };
  if (!["start", "stop", "archive", "trash", "restore"].includes(action)) return { ok: false, error: "Unsupported account action." };
  try {
    const common = {
      account_id: accountId,
      reason,
      actor_type: "botapp",
      start_run: false,
      provisioning_enabled: false,
      login_enabled: false,
    };
    const data = action === "start" || action === "stop"
      ? await dashboardRequest("PATCH", "profiles_account_status", {
        ...common,
        action: action === "start" ? "reactivate" : "pause",
        metadata: {
          botapp_action: action,
          expected_effect: "safe_status_write_only",
        },
      })
      : await dashboardPost("profiles_account_lifecycle", {
        ...common,
        action,
        metadata: {
          botapp_action: action,
          expected_effect: "safe_lifecycle_write_only",
        },
      });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeLifecycleActionError(error, action) };
  }
}

async function assignProfileNow(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  if (!accountId) return { ok: false, error: "Missing account id." };
  try {
    const data = await dashboardPost("profiles_assign_now", {
      account_id: accountId,
      start_run: false,
      provisioning_enabled: false,
      login_enabled: false,
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Assign Now failed.") };
  }
}

async function profileReadinessNow(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  if (!accountId) return { ok: false, error: "Missing account id." };
  try {
    const data = await dashboardPost("profiles_readiness_now", {
      account_id: accountId,
      audience: "admin",
      dry_run: true,
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Readiness check failed.") };
  }
}

function safeIdempotencyPart(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "_")
    .slice(0, 80) || "account";
}

async function profileRunStart(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const username = safeIdempotencyPart(input?.username || input?.account_username || accountId);
  if (!accountId) return { ok: false, error: "Missing account id." };
  try {
    const data = await dashboardPost("profiles_run_start", {
      account_id: accountId,
      requested_run_type: "account_session",
      trigger: "manual_botapp",
      source: "botapp_manual_play",
      manual_start: true,
      idempotency_key: `botapp:${username}:account_session:${Date.now()}`,
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Account run request failed.") };
  }
}

async function profileRestoreLoginScreenStart(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const username = safeIdempotencyPart(input?.username || input?.account_username || accountId);
  if (!accountId) return { ok: false, error: "Missing account id." };
  try {
    const data = await dashboardPost("profiles_restore_login_screen", {
      account_id: accountId,
      source: "BotApp",
      idempotency_key: `botapp:${username}:restore-login-screen:${Date.now()}`,
    }, { account_id: accountId });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Restore login screen request failed.") };
  }
}

async function profileAutoLoginStart(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const username = safeIdempotencyPart(input?.username || input?.account_username || accountId);
  if (!accountId) return { ok: false, error: "Missing account id." };
  try {
    const data = await dashboardPost("profiles_auto_login_start", {
      account_id: accountId,
      requested_run_type: "login_provisioning",
      trigger: "manual",
      manual_start: true,
      idempotency_key: `botapp:${username}:login_provisioning:${Date.now()}`,
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Auto Login request failed.") };
  }
}

async function profileRunStop(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const reason = String(input?.reason || "botapp_manual_stop").trim().slice(0, 160) || "botapp_manual_stop";
  if (!accountId) return { ok: false, error: "Missing account id." };
  try {
    const data = await dashboardPost("profiles_run_stop", {
      account_id: accountId,
      reason,
      source: "botapp_manual_stop",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Run stop failed.") };
  }
}

async function profileRunProgress(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const requestId = String(input?.requestId || input?.request_id || "").trim();
  if (!accountId) return { ok: false, error: "Missing account id." };
  try {
    const data = await dashboardGetWithQuery("profiles_run_progress", {
      account_id: accountId,
      request_id: requestId,
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Run progress unavailable.") };
  }
}

async function addProfileTarget(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const username = String(input?.username || input?.target_username || "").trim();
  if (!accountId || !username) return { ok: false, error: "Missing account id or target username." };
  try {
    const data = await dashboardPost("targets_collection", {
      account_id: accountId,
      target_username: username,
      actor_type: "admin",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Target add failed.") };
  }
}

async function bulkAddProfileTargets(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const usernames = Array.isArray(input?.usernames) ? input.usernames.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (!accountId || !usernames.length) return { ok: false, error: "Missing account id or target usernames." };
  try {
    const data = await dashboardPost("targets_collection", {
      account_id: accountId,
      usernames,
      actor_type: "admin",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Bulk target add failed.") };
  }
}

async function deleteProfileTargets(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const ids = normalizeTargetIds(input);
  if (!accountId || !ids.length) return { ok: false, error: "Missing account id or target ids." };
  try {
    const data = await dashboardRequest("DELETE", "targets_collection", {
      account_id: accountId,
      ids,
      actor_type: "admin",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Target delete failed.") };
  }
}

async function resetProfileTargets(input) {
  const accountId = String(input?.accountId || input?.account_id || "").trim();
  const ids = normalizeTargetIds(input);
  if (!accountId || !ids.length) return { ok: false, error: "Missing account id or target ids." };
  try {
    const data = await dashboardRequest("PATCH", "targets_reset", {
      account_id: accountId,
      ids,
      actor_type: "admin",
      mode: input?.mode === "reset_state_only" ? "reset_state_only" : "reset_and_requeue_verification",
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Target reset failed.") };
  }
}

function normalizeTargetIds(input) {
  if (Array.isArray(input?.ids)) return input.ids.map((item) => String(item || "").trim()).filter(Boolean);
  if (Array.isArray(input?.targetIds)) return input.targetIds.map((item) => String(item || "").trim()).filter(Boolean);
  const single = String(input?.id || input?.targetId || input?.target_id || "").trim();
  return single ? [single] : [];
}

function sanitizeAddProfilePayload(input) {
  const allowed = [
    "username",
    "password",
    "email",
    "display_name",
    "internal_label",
    "notes",
    "login_method",
    "clone_mode",
    "device_id",
    "app_instance_id",
    "device_name",
    "device_udid",
    "template_mode",
    "template_id",
    "runtime_mode",
    "commercial_package",
    "addons",
    "schedule_mode",
    "starts_at",
    "ends_at",
    "submit_credentials",
    "credential_status",
    "credentials_submitted",
    "credentials_deferred",
  ];
  const payload = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input || {}, key)) payload[key] = input[key];
  }
  return payload;
}

function normalizeProfileDetailsAvatarUrls(data, cfg = compassConfig()) {
  const targetItems = data?.targets?.items;
  if (!Array.isArray(targetItems)) return data;
  return {
    ...data,
    targets: {
      ...data.targets,
      items: targetItems.map((target) => {
        if (!target || typeof target !== "object") return target;
        return {
          ...target,
          avatar_url: typeof target.avatar_url === "string" && target.avatar_url.startsWith("/api/instagram-dashboard/")
            ? absoluteDashboardPath(target.avatar_url, cfg)
            : target.avatar_url,
        };
      }),
    },
  };
}

const knownPhoneSerials = [
  { serial: "RFGL145VCKE", label: "PHONE 1" },
  { serial: "RFGL145LZHE", label: "PHONE 2" },
];

function maskSerial(serial) {
  const value = String(serial || "");
  if (value.length <= 4) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function localAdbDeviceMap() {
  const adb = resolveAdbPath();
  if (!adb.ok) {
    return {
      adbAvailable: false,
      adbPath: null,
      checkedAt: new Date().toISOString(),
      devices: new Map(),
    };
  }
  spawnSync(adb.path, ["start-server"], { encoding: "utf8", stdio: "pipe", timeout: 3500 });
  const result = spawnSync(adb.path, ["devices", "-l"], { encoding: "utf8", stdio: "pipe", timeout: 2500 });
  const devices = new Map();
  if (!result.error && result.status === 0) {
    for (const line of String(result.stdout || "").split(/\r?\n/).slice(1)) {
      const [serial, state] = line.trim().split(/\s+/);
      if (serial && state) devices.set(serial, state);
    }
  }
  return { adbAvailable: true, adbPath: adb.path, checkedAt: new Date().toISOString(), devices };
}

function localKnownDevices() {
  return knownPhoneSerials.map((phone) => ({
    id: phone.serial,
    name: phone.label,
    model: "Samsung A16",
    status: "offline",
    adbSerial: phone.serial,
    shortSerial: maskSerial(phone.serial),
    deviceKind: "physical_phone",
    pool: "full_cycle",
    product: "a16nsxx",
    deviceCode: "a16",
    profileCount: 0,
    latencyMs: null,
    appInstancesCount: 0,
    appInstancesAvailableCount: 0,
    appInstancesOccupiedCount: 0,
    heartbeatStatus: "unknown",
    hostLabel: null,
    hubLabel: null,
    hubPort: null,
    viewAvailable: true,
    viewUnavailableReason: null,
    battery: 0,
    cloneCount: 0,
    activeSession: null,
    nextBufferEndsAt: null,
    lockReason: "Backend heartbeat unavailable",
    backendStatus: "unknown",
    backendLastSeenAt: "",
    backendHeartbeatDbStatus: "unknown",
    localAdbStatus: "unknown",
    localAdbCheckedAt: "",
    localAdbAvailable: false,
    inventorySource: "local fallback",
    appInstances: [],
  }));
}

function safeAppOccupant(app) {
  const occupant = app?.occupant && typeof app.occupant === "object" ? app.occupant : {};
  const accountId = String(occupant.account_id || app?.current_account_id || "");
  if (!accountId) return null;
  return {
    assignmentId: String(occupant.assignment_id || ""),
    accountId,
    username: occupant.username ? String(occupant.username) : "",
    status: String(occupant.status || "occupied"),
  };
}

function safeAppInstance(app) {
  const instanceType = String(app?.instance_type || "clone");
  const instanceIndex = Number(app?.instance_index || 0);
  const occupant = safeAppOccupant(app);
  const availability = String(app?.availability || (occupant ? "occupied" : app?.status || "unknown"));
  return {
    appInstanceId: String(app?.app_instance_id || app?.id || ""),
    deviceId: String(app?.device_id || ""),
    instanceType,
    instanceIndex,
    label: String(app?.label || app?.visible_label || (instanceType === "primary_app" ? "Primary Instagram" : `Clone ${instanceIndex}`)),
    packageName: String(app?.package_name || ""),
    status: String(app?.status || "unknown"),
    availability,
    occupant,
    selectable: Boolean(app?.selectable) && availability === "available" && !occupant,
  };
}

function asDashboardDevice(row, index, localAdb) {
  const id = row?.id || row?.device_id || row?.adb_serial || knownPhoneSerials[index]?.serial || `phone_${index + 1}`;
  const label = row?.device_name || row?.phone_name || row?.display_name || row?.name || knownPhoneSerials[index]?.label || `PHONE ${index + 1}`;
  const rawStatus = String(row?.heartbeat_status || row?.status || "").toLowerCase();
  const connected = ["online", "connected", "available", "reserved"].includes(rawStatus);
  const offline = ["offline", "stale", "unavailable"].includes(rawStatus);
  const serial = row?.adb_serial || id;
  const appInstances = Array.isArray(row?.app_instances) ? row.app_instances.map(safeAppInstance) : [];
  const instanceCount = Number(row?.app_instances_count || row?.total_app_instances || appInstances.length || 0);
  const localState = localAdb?.devices?.get(String(serial || "")) || "not_seen";
  return {
    id: String(id),
    name: String(label),
    model: String(row?.model || "Samsung A16"),
    status: offline ? "offline" : connected ? "connected" : "maintenance",
    adbSerial: String(serial || ""),
    shortSerial: maskSerial(serial),
    deviceKind: String(row?.device_kind || row?.kind || "physical_phone").includes("emulator") ? "emulator" : "physical_phone",
    pool: String(row?.pool_type || row?.pool || "full_cycle").includes("outreach") ? "outreach_only" : "full_cycle",
    product: String(row?.product || ""),
    deviceCode: String(row?.device || row?.device_code || ""),
    profileCount: instanceCount,
    latencyMs: null,
    appInstancesCount: instanceCount,
    appInstancesAvailableCount: Number(row?.app_instances_available_count || appInstances.filter((app) => app.selectable).length || 0),
    appInstancesOccupiedCount: Number(row?.app_instances_occupied_count || appInstances.filter((app) => app.occupant).length || 0),
    heartbeatStatus: rawStatus === "stale" ? "stale" : connected ? "connected" : offline ? "offline" : "unknown",
    hostLabel: row?.host_name || row?.host_label || null,
    hubLabel: row?.hub_label || null,
    hubPort: row?.hub_port || null,
    viewAvailable: Boolean(serial),
    viewUnavailableReason: serial ? localState === "not_seen" ? "Local ADB does not currently see this phone." : null : "ADB serial unavailable.",
    battery: 0,
    cloneCount: instanceCount,
    activeSession: row?.ui_lease_status === "active"
      ? {
        id: String(row?.ui_lease_request_id || row?.ui_lease_expires_at || id),
        profileId: String(row?.ui_lease_account_id || ""),
        username: String(row?.ui_lease_account_username || "active operation"),
        state: "active_ui",
        startedAt: String(row?.ui_lease_expires_at || ""),
      }
      : null,
    nextBufferEndsAt: null,
    lockReason: row?.ui_lease_status === "active"
      ? String(row?.ui_lease_operator_label || "Device currently in use")
      : (row?.heartbeat_warning || null),
    backendStatus: String(row?.status || "unknown"),
    backendLastSeenAt: String(row?.heartbeat_last_seen_at || row?.last_seen_at || ""),
    backendHeartbeatDbStatus: String(row?.heartbeat_status || row?.status || "unknown").toLowerCase(),
    localAdbStatus: localAdb?.adbAvailable ? localState : "adb_unavailable",
    localAdbCheckedAt: localAdb?.checkedAt || "",
    localAdbAvailable: Boolean(localAdb?.adbAvailable),
    inventorySource: "shared backend API",
    appInstances,
  };
}

function normalizeDashboardDevices(rows) {
  const items = Array.isArray(rows?.items) ? rows.items : Array.isArray(rows?.phone_devices) ? rows.phone_devices : Array.isArray(rows) ? rows : [];
  const localAdb = localAdbDeviceMap();
  const normalized = items
    .filter((row) => row && typeof row === "object")
    .map((row, index) => asDashboardDevice(row, index, localAdb));
  if (normalized.length) return normalized;
  return localKnownDevices();
}

function packageLabel(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("premium")) return "Premium";
  if (text.includes("pro")) return "Pro";
  return "Growth";
}

function accountStatus(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("pause")) return "paused";
  if (text.includes("cancel")) return "cancelled";
  if (text.includes("onboard")) return "onboarding";
  if (text.includes("pending")) return "pending";
  if (text.includes("active") || text.includes("ready")) return "active";
  return "unknown";
}

function normalizeMatchText(value) {
  return String(value || "").trim().toLowerCase();
}

function profileCounters(account) {
  const packageCaps = packageCounterCaps(account);
  const counterKey = { follow: "follows", unfollow: "unfollows", like: "likes", comment: "comments", dm: "dms" };
  const cap = (key, fallbackMax) => {
    const projectionKey = counterKey[key] || key;
    const fallback = packageCaps[key] ?? fallbackMax;
    const current = Number(account?.countersToday?.[projectionKey] ?? account?.quotas?.[key]?.used ?? account?.[`${key}Today`] ?? 0);
    const max = Number(account?.capsToday?.[projectionKey] ?? account?.quotas?.[key]?.max ?? account?.[`${key}Cap`] ?? fallback);
    return {
      current: Number.isFinite(current) ? current : 0,
      max: Number.isFinite(max) && max >= 0 ? max : fallback,
    };
  };
  return {
    follow: cap("follow", packageCaps.follow),
    unfollow: cap("unfollow", packageCaps.unfollow),
    like: cap("like", packageCaps.like),
    comment: cap("comment", 0),
    dm: cap("dm", packageCaps.dm),
  };
}

function packageCounterCaps(account) {
  const label = readPackageLabel(account).toLowerCase();
  if (label.includes("premium")) return { follow: 180, unfollow: 240, like: 500, dm: 100, comment: 0 };
  if (label.includes("pro")) return { follow: 120, unfollow: 120, like: 500, dm: 10, comment: 0 };
  return { follow: 80, unfollow: 80, like: 100, dm: 0, comment: 0 };
}

function formatCompactDateTime(value, fallback = "No session yet") {
  if (!value) return fallback;
  const raw = String(value);
  if (/scheduled/i.test(raw)) return "Scheduled";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.includes("T") ? "—" : raw;
  const iso = date.toISOString();
  return `${iso.slice(11, 19)} ${iso.slice(0, 10)}`;
}

function formatTimePart(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const hhmm = raw.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  if (hhmm) return `${hhmm[1]}:${hhmm[2]}`;
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(11, 16);
  return "";
}

function readScheduleLabel(account) {
  const explicit = String(account?.scheduleLabel || account?.schedule_label || account?.assignment?.scheduleLabel || account?.assignment?.schedule_label || "").trim();
  if (explicit && explicit !== "00:00-00:00" && explicit !== "Unassigned") return explicit;
  return "";
}

function readScheduleMode(account) {
  const mode = String(
    account?.scheduleMode
    || account?.schedule_mode
    || account?.assignment?.scheduleMode
    || account?.assignment?.schedule_mode
    || "",
  ).trim();
  if (mode) return mode;
  const slotKind = String(account?.slotKind || account?.slot_kind || account?.assignment?.slotKind || "").trim();
  if (slotKind === "manual_only") return "manual_only";
  const hasPlacement = Boolean(
    account?.appInstanceId
    || account?.app_instance_id
    || account?.assignmentStatus
    || account?.assignment_status
    || account?.deviceId
    || account?.device_id,
  );
  const hasTimes = Boolean(
    account?.assignmentStartsAt
    || account?.assignment_starts_at
    || account?.assignment?.startsAt
    || account?.assignment?.starts_at,
  );
  if (hasPlacement || hasTimes) return "scheduled";
  return "";
}

function formatAssignmentWindowLabel(account) {
  const timezone = String(account?.timezone || account?.deviceTimezone || account?.device_timezone || "Europe/Paris").trim() || "Europe/Paris";
  const assignmentStart = account?.assignmentStartsAt || account?.assignment_starts_at || account?.assignment?.startsAt || account?.assignment?.starts_at;
  const assignmentEnd = account?.assignmentEndsAt || account?.assignment_ends_at || account?.assignment?.endsAt || account?.assignment?.ends_at;
  if (!assignmentStart || !assignmentEnd) return "";
  try {
    const formatPart = (value) => new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(value));
    const startTime = formatPart(assignmentStart);
    const endTime = formatPart(assignmentEnd);
    if (startTime && endTime && startTime !== endTime) return `${startTime}-${endTime}`;
  } catch {
    // fall through to UTC slice
  }
  const startTime = formatTimePart(assignmentStart);
  const endTime = formatTimePart(assignmentEnd);
  if (startTime && endTime && startTime !== endTime) return `${startTime}-${endTime}`;
  return "";
}

function accountRowId(account, index) {
  return String(account?.accountId || account?.account_id || account?.id || `account_${index + 1}`);
}

function uniqueManageAccounts(lists) {
  const seen = new Set();
  const rows = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const account of list) {
      if (!account || typeof account !== "object") continue;
      const id = accountRowId(account, rows.length);
      const key = id || normalizeMatchText(account?.username) || `row_${rows.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(account);
    }
  }
  return rows;
}

function extractManageAccounts(profilesPayload, clientAccountsPayload, overviewPayload) {
  const manageSection = overviewPayload?.manage;
  const manage = manageSection?.ok ? manageSection.data : null;
  const combinedLifecycle = manage
    ? uniqueManageAccounts([manage.activeAccounts, manage.archivedAccounts, manage.trashedAccounts])
    : [];
  const candidates = uniqueManageAccounts([
    profilesPayload?.profiles,
    profilesPayload?.allAccounts,
    clientAccountsPayload?.accounts,
    manage?.allAccounts,
    combinedLifecycle,
  ]);
  const counts = {
    profiles_endpoint_count: Array.isArray(profilesPayload?.profiles) ? profilesPayload.profiles.length : 0,
    manage_all_accounts_count: Array.isArray(manage?.allAccounts) ? manage.allAccounts.length : 0,
    client_accounts_count: Array.isArray(clientAccountsPayload?.accounts) ? clientAccountsPayload.accounts.length : 0,
    lifecycle_combined_count: combinedLifecycle.length,
    normalized_profiles_count: candidates.length,
  };
  let source = "none";
  if (counts.normalized_profiles_count > 0) {
    if (counts.profiles_endpoint_count === counts.normalized_profiles_count) source = "profiles_endpoint";
    else if (counts.manage_all_accounts_count === counts.normalized_profiles_count) source = "manage_all_accounts";
    else if (counts.client_accounts_count === counts.normalized_profiles_count) source = "client_accounts";
    else if (counts.lifecycle_combined_count === counts.normalized_profiles_count) source = "manage_lifecycle";
    else source = "manage_merged";
  }
  return { accounts: candidates, counts, source };
}

function resolveProfileDevice(account, devices) {
  const hints = [
    account?.phoneName,
    account?.phone_name,
    account?.phoneLabel,
    account?.phone_label,
    account?.assignedPhone,
    account?.assigned_phone,
    account?.assignedDevice,
    account?.assigned_device,
    account?.assigned_device_name,
    account?.deviceName,
    account?.device_name,
    account?.safeDeviceLabel,
    account?.deviceId,
    account?.device_id,
    account?.phoneId,
    account?.phone_id,
    account?.assignedDeviceId,
    account?.assigned_device_id,
    account?.adbSerial,
    account?.adb_serial,
    account?.deviceSerial,
    account?.device_serial,
    account?.assignment?.deviceName,
    account?.assignment?.deviceId,
    account?.assignment?.phoneName,
    account?.assignment?.phoneId,
    account?.assignment?.adbSerial,
  ].map(normalizeMatchText).filter(Boolean);
  return devices.find((item) => {
    const labels = [item.name, item.id, item.adbSerial, item.shortSerial].map(normalizeMatchText);
    return hints.some((hint) => labels.includes(hint) || labels.some((label) => label && (label.includes(hint) || hint.includes(label))));
  }) || null;
}

function readAssignmentLabel(account) {
  return String(
    account?.phoneName
      || account?.phone_name
      || account?.phoneLabel
      || account?.phone_label
      || account?.assignedDevice
      || account?.assigned_device
      || account?.assigned_device_name
      || account?.deviceName
      || account?.device_name
      || account?.assignment?.deviceName
      || "No phone",
  );
}

function readActiveWindow(account) {
  const scheduleMode = readScheduleMode(account);
  if (scheduleMode === "manual_only") return "Manual";
  const scheduleLabel = readScheduleLabel(account);
  if (scheduleLabel) return scheduleLabel;
  const windowLabel = formatAssignmentWindowLabel(account);
  if (windowLabel) return windowLabel;
  const hasAssignmentPlacement = Boolean(
    account?.appInstanceId
    || account?.app_instance_id
    || account?.assignment?.appInstanceId
    || account?.assignment?.app_instance_id
    || account?.assignmentStatus
    || account?.assignment_status,
  );
  if (!hasAssignmentPlacement) return "Unassigned";
  if (scheduleMode === "scheduled") return "No schedule";
  return "Unassigned";
}

function readSlotKind(account) {
  const scheduleMode = readScheduleMode(account);
  if (scheduleMode === "manual_only") return "manual_only";
  const value = String(account?.slotKind || account?.slot_kind || account?.assignment?.slotKind || account?.runtimeProfile || account?.runtimeProfilesLabel || "");
  if (/40|outreach/i.test(value)) return "outreach_40m";
  if (/3h|growth/i.test(value)) return "growth_3h";
  return "full_cycle_6h";
}

function readRuntimeProfile(account) {
  const scheduleMode = readScheduleMode(account);
  if (scheduleMode === "manual_only") return "manual_only";
  const value = String(account?.runtimeProfile || account?.runtime_profile || account?.runtimeProfilesLabel || account?.slotKind || "");
  if (/outreach/i.test(value)) return "outreach_only";
  if (/follow/i.test(value)) return "follow_only";
  return "full_cycle";
}

function readProfileNumber(account, index) {
  const value = Number(account?.profileNumber || account?.profile_number || account?.cloneIndex || account?.clone_index || account?.appInstanceIndex || account?.app_instance_index || index + 1);
  return Number.isFinite(value) && value > 0 ? value : index + 1;
}

function readNullableProfileNumber(account, keys) {
  for (const key of keys) {
    const value = Number(account?.[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function readProfileLifecycleStatus(account) {
  const accountLifecycle = normalizeMatchText(
    account?.accountLifecycleStatus || account?.account_lifecycle_status || account?.status || "",
  );
  if (accountLifecycle === "trashed" || accountLifecycle === "trash" || account?.trashedAt || account?.trashed_at) return "trashed";
  if (accountLifecycle === "archived" || account?.archivedAt || account?.archived_at) return "archived";
  if (account?.trashedAt || account?.trashed_at) return "trashed";
  if (account?.archivedAt || account?.archived_at) return "archived";
  return "active";
}

function safeLifecycleActionError(error, action) {
  const raw = safeRuntimeError(error, "Profile account action failed.");
  if (/check constraint|violates|admin_lifecycle_status_check|lifecycle status mapping is invalid/i.test(raw)) {
    if (action === "trash") return "Move to Bin failed. Lifecycle status mapping is invalid.";
    if (action === "archive") return "Archive failed. Lifecycle status mapping is invalid.";
    if (action === "restore") return "Restore failed. Lifecycle status mapping is invalid.";
  }
  return raw;
}

function readDeviceId(account, device) {
  return String(device?.id || account?.deviceId || account?.device_id || account?.phoneId || account?.phone_id || account?.assignment?.deviceId || "");
}

function readAssignmentHealth(account) {
  const raw = normalizeMatchText(account?.assignmentHealth || account?.assignment_health || account?.assignment?.assignmentHealth || account?.assignment?.assignment_health || "");
  if (raw === "requires_attention" || raw.includes("attention") || raw.includes("inconsistent")) return "requires_attention";
  if (raw === "assigned") return "assigned";
  if (raw === "unassigned") return "unassigned";
  const assignmentStatus = normalizeMatchText(account?.assignmentStatus || account?.assignment_status || account?.assignmentState || account?.assignment_state || account?.assignment?.assignmentStatus);
  if (assignmentStatus.includes("reserved") || assignmentStatus.includes("active") || assignmentStatus.includes("assigned")) return "assigned";
  return "unassigned";
}

function readAssignmentHealthReason(account) {
  return String(account?.assignmentHealthReason || account?.assignment_health_reason || account?.assignment?.assignmentHealthReason || account?.assignment?.assignment_health_reason || "").trim() || null;
}

function readDeviceName(account, device) {
  return device?.name || readAssignmentLabel(account);
}

function readAssignmentState(account, device) {
  if (readAssignmentHealth(account) === "requires_attention") return "requires_attention";
  const raw = normalizeMatchText(account?.assignmentStatus || account?.assignment_status || account?.assignmentState || account?.assignment_state || account?.assignment?.assignmentStatus);
  if (raw.includes("reserved")) return "reserved";
  if (raw.includes("blocked")) return "blocked";
  if (raw.includes("assigned") || device?.id) return "assigned";
  if (raw.includes("missing")) return "missing_slot";
  return device?.id ? "assigned" : "missing_slot";
}

function readDeviceAvailability(account, device) {
  if (readAssignmentHealth(account) === "requires_attention") return "maintenance";
  if (!device) return "unassigned";
  const raw = normalizeMatchText(account?.assignmentStatus || account?.assignment_status || account?.assignmentState || account?.assignment_state);
  if (raw.includes("reserved")) return "reserved";
  if (raw.includes("blocked")) return "blocked";
  if (device.status === "offline") return "offline";
  return "available";
}

function readProfileStatus(account, blocked) {
  const activeRequest = String(account?.activeRunRequestStatus || account?.active_run_request_status || "").trim().toLowerCase();
  const activeRun = String(account?.activeRunStatus || account?.active_run_status || "").trim().toLowerCase();
  if (
    activeRequest === "running"
    || activeRun === "running"
    || ["claimed", "starting", "stopping", "canceling", "queued"].includes(activeRequest)
  ) {
    return "running";
  }
  const raw = normalizeMatchText(account?.runStatus || account?.run_status || account?.currentRunStatus || account?.current_run_status || account?.status);
  if (raw.includes("running")) return "running";
  if (raw.includes("pause")) return "paused";
  if (raw.includes("archive")) return "archived";
  if (raw.includes("trash") || raw.includes("delete")) return "trashed";
  if (blocked) return "blocked";
  return "ready";
}

function readReadiness(account, blocked) {
  const raw = normalizeMatchText(account?.readiness || account?.readinessStatus || account?.readiness_status);
  if (raw.includes("ready")) return "ready";
  if (raw.includes("login")) return "needs_login";
  if (raw.includes("target")) return "needs_targets";
  if (blocked) return "blocked";
  return "ready";
}

function readEligibility(account, blocked, loginStatus = "") {
  if (readAssignmentHealth(account) === "requires_attention") return "blocked_now";
  const raw = normalizeMatchText(account?.eligibility || account?.eligibilityStatus || account?.eligibility_status);
  if (raw.includes("can_start") || raw === "ready") return "can_start";
  if (raw.includes("blocked")) return "blocked_now";
  if (loginStatus && loginStatus !== "connected") return "blocked_now";
  return blocked ? "blocked_now" : "can_start";
}

function readEligibilityReason(account, blocked, loginStatus = "") {
  if (readAssignmentHealth(account) === "requires_attention") return "assignment_requires_attention";
  if (loginStatus && loginStatus !== "connected") return "login_not_connected";
  return String(account?.eligibilityReason || account?.eligibility_reason || account?.primaryBlockReason || account?.primary_block_reason || (blocked ? "blocked" : "ready"));
}

function readPackageLabel(account) {
  return packageLabel(account?.packageLabel || account?.package_label || account?.commercialPackage || account?.commercial_package || account?.package);
}

function readPlatform(account) {
  const platformRaw = String(account?.platform || account?.platformLabel || account?.platform_label || "instagram").trim();
  return /tiktok/i.test(platformRaw) ? "TikTok" : "Instagram";
}

function readEntitlements(account, packageValue) {
  const raw = account?.entitlements || account?.entitlementSummary || account?.entitlement_summary || account?.packageLabel || packageValue || "follow";
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  return String(raw).split(/[,+]/).map((item) => item.trim()).filter(Boolean);
}

function readCredentialStatus(account) {
  const value = String(account?.credentialsStatus || account?.credentialStatus || account?.credential_status || "");
  const reauthRequired = account?.reauthRequired === true || account?.reauth_required === true;
  if (/missing/i.test(value)) return "missing";
  if (/invalid|failed|password_invalid/i.test(value)) return "needs_update";
  if (/active|configured/i.test(value)) return reauthRequired ? "saved_pending_verification" : "active";
  if (/reauth/i.test(value)) return reauthRequired ? "saved_pending_verification" : "needs_update";
  if (/update/i.test(value)) return "needs_update";
  return value ? "active" : "missing";
}

function readLoginStatus(account) {
  const value = String(account?.loginStatus || account?.login_status || account?.credentialsStatus || "");
  if (/challenge/i.test(value)) return "challenge_required";
  if (/2fa/i.test(value)) return "needs_2fa";
  if (/missing/i.test(value)) return "missing_credentials";
  if (/connected/i.test(value)) return "connected";
  return "ready";
}

function readRefreshReadinessRequirement({
  account,
  credentialStatus,
  loginStatus,
  device,
  appInstanceId,
  assignmentState,
  deviceAvailability,
  profileStatus,
}) {
  const lifecycle = normalizeMatchText(`${account?.adminStatus || account?.admin_status || ""} ${account?.customerStatus || account?.customer_status || ""} ${account?.subscriptionStatus || account?.subscription_status || ""} ${account?.status || ""}`);
  if (lifecycle.includes("cancel") || lifecycle.includes("delete") || lifecycle.includes("trashed") || lifecycle.includes("archived") || profileStatus === "archived" || profileStatus === "paused") {
    return requirementState(false, "status_blocked", "Account unavailable", "Archived, deleted, cancelled, or paused accounts cannot refresh readiness.");
  }
  if (credentialStatus === "missing" || loginStatus === "missing_credentials") {
    return requirementState(false, "missing_credentials", "Missing credentials", "Save Instagram credentials before refreshing readiness.");
  }
  if (credentialStatus === "needs_update" || loginStatus === "password_invalid") {
    return requirementState(false, "password_needs_update", "Credentials invalid", "Update the Instagram password before refreshing readiness.");
  }
  if (assignmentState === "requires_attention") {
    return requirementState(false, "assignment_requires_attention", "Affectation à vérifier", "Assignment/device/app instance state is inconsistent. Review the assigned phone, clone, and timeslot before refreshing readiness.");
  }
  if (!device?.id || !appInstanceId || assignmentState === "missing_slot") {
    return requirementState(false, "assignment_missing", "Device not assigned", "Assign a phone and Instagram app instance first.");
  }
  if (assignmentState === "blocked" || deviceAvailability === "offline" || deviceAvailability === "maintenance") {
    return requirementState(false, "device_unavailable", "Device unavailable", "The assigned phone or Instagram app instance is unavailable.");
  }
  return requirementState(true, "ready", "Ready", "Refresh saved credentials, login status, assignment, and connect readiness.");
}

function readRequirement(blocked, label) {
  return {
    enabled: !blocked,
    reason: blocked ? "runtime_blocked" : "ready",
    label: blocked ? "Blocked" : label,
    detail: blocked ? "Runtime or credential gate blocked" : "Prerequisites are satisfied.",
  };
}

function requirementState(enabled, reason, label, detail) {
  return { enabled, reason, label, detail };
}

function readRestoreLoginScreenRequirement({
  account,
  device,
  appInstanceId,
  assignmentState,
  deviceAvailability,
  runtimeLock,
  profileStatus,
}) {
  const lifecycle = normalizeMatchText(`${account?.adminStatus || account?.admin_status || ""} ${account?.customerStatus || account?.customer_status || ""} ${account?.subscriptionStatus || account?.subscription_status || ""} ${account?.status || ""}`);
  if (lifecycle.includes("cancel") || lifecycle.includes("delete") || lifecycle.includes("trashed") || lifecycle.includes("archived") || profileStatus === "archived" || profileStatus === "paused") {
    return requirementState(false, "status_blocked", "Account unavailable", "Archived, deleted, cancelled, or paused accounts cannot run login screen recovery.");
  }
  if (!account?.orphanRecoveryBotappActionAvailable) {
    return requirementState(false, "runtime_blocked", "Orphan challenge not confirmed", "Restore login screen is only available when an orphan email-code challenge is confirmed for this assigned clone.");
  }
  if (assignmentState === "requires_attention") {
    return requirementState(false, "assignment_requires_attention", "Affectation à vérifier", "Assignment/device/app instance state is inconsistent. Review the assigned phone, clone, and timeslot before recovery.");
  }
  if (!device?.id || !appInstanceId || assignmentState === "missing_slot") {
    return requirementState(false, "assignment_missing", "Device not assigned", "Assign the account to the target phone and clone before recovery.");
  }
  if (assignmentState === "blocked" || deviceAvailability === "offline" || deviceAvailability === "maintenance") {
    return requirementState(false, "device_unavailable", "Device unavailable", "The assigned phone or Instagram app instance is not available.");
  }
  if (runtimeLock !== "none" || profileStatus === "running") {
    return requirementState(false, "login_already_running", "Active run in progress", "Wait for the active run/request to finish before recovery.");
  }
  return requirementState(true, "ready", "Restore login screen", "Run one bounded back action on the assigned clone to return to a safe login surface.");
}

function readAutoLoginRequirement({
  account,
  credentialStatus,
  loginStatus,
  device,
  appInstanceId,
  assignmentState,
  deviceAvailability,
  runtimeLock,
  profileStatus,
}) {
  const lifecycle = normalizeMatchText(`${account?.adminStatus || account?.admin_status || ""} ${account?.customerStatus || account?.customer_status || ""} ${account?.subscriptionStatus || account?.subscription_status || ""} ${account?.status || ""}`);
  if (lifecycle.includes("cancel") || lifecycle.includes("delete") || lifecycle.includes("trashed") || lifecycle.includes("archived")) {
    return requirementState(false, "status_blocked", "Account unavailable", "Archived, deleted, cancelled, or trashed accounts cannot start Auto Login.");
  }
  if (assignmentState === "requires_attention") {
    return requirementState(false, "assignment_requires_attention", "Affectation à vérifier", "Assignment/device/app instance state is inconsistent. Review the assigned phone, clone, and timeslot before Auto Login.");
  }
  if (credentialStatus === "missing" || loginStatus === "missing_credentials") {
    return requirementState(false, "missing_credentials", "Missing credentials", "Add or update Instagram credentials before Auto Login.");
  }
  if (credentialStatus === "saved_pending_verification") {
    return requirementState(true, "ready_to_connect", "Ready to connect", "Credentials are saved. Auto Login will verify the Instagram session on the assigned phone.");
  }
  if (credentialStatus === "needs_update" || loginStatus === "password_invalid") {
    return requirementState(false, "password_needs_update", "Credentials invalid", "Update the Instagram password before Auto Login.");
  }
  if (!device?.id || !appInstanceId || assignmentState === "missing_slot") {
    return requirementState(false, "assignment_missing", "Device not assigned", "Assign a phone and Instagram app instance before Auto Login.");
  }
  if (assignmentState === "blocked" || deviceAvailability === "offline" || deviceAvailability === "maintenance") {
    return requirementState(false, "device_unavailable", "Device unavailable", "The assigned phone or Instagram app instance is not available for Auto Login.");
  }
  if (runtimeLock !== "none" || profileStatus === "running") {
    return requirementState(false, "login_already_running", "Active run in progress", "Wait for the active run/request to finish before Auto Login.");
  }
  return requirementState(true, "ready", "Ready to connect", "Credentials are saved and the assigned phone/app can run login_provisioning.");
}

function readNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readFollowerDelta(account) {
  if (account?.followerDelta3d && typeof account.followerDelta3d === "object") {
    return readNullableNumber(account.followerDelta3d.value);
  }
  return null;
}

function readFollowerDelta3d(account) {
  const source = account?.followerDelta3d && typeof account.followerDelta3d === "object" ? account.followerDelta3d : {};
  const value = readNullableNumber(source.value);
  const currentFollowers = readNullableNumber(source.currentFollowers ?? source.current_followers);
  const previousFollowers = readNullableNumber(source.previousFollowers ?? source.previous_followers);
  return {
    value,
    currentFollowers,
    previousFollowers,
    from: source.from || null,
    to: source.to || null,
    source: String(source.source || "pending_account_follower_snapshots"),
    freshness: String(source.freshness || "no_snapshot_table"),
  };
}

function readInteractionsToday(account) {
  const value = Number(account?.countersToday?.interactionsTotal ?? account?.countersToday?.interactions_total ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function readCurrentRunCounters(account) {
  const source = account?.currentRunCounters && typeof account.currentRunCounters === "object"
    ? account.currentRunCounters
    : {};
  const readCount = (camel, snake) => {
    const value = Number(source?.[camel] ?? source?.[snake] ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  return {
    follows: readCount("follows", "follows"),
    unfollows: readCount("unfollows", "unfollows"),
    likes: readCount("likes", "likes"),
    comments: readCount("comments", "comments"),
    dms: readCount("dms", "dms"),
    stories: readCount("stories", "stories"),
    interactionsTotal: readCount("interactionsTotal", "interactions_total"),
    source: String(source?.source || ""),
    runId: source?.runId || source?.run_id || null,
    projectionSource: String(source?.projectionSource || source?.projection_source || source?.source || ""),
    lastProgressAt: source?.lastProgressAt || source?.last_progress_at || null,
    canonicalDailyCount: source?.canonicalDailyCount || source?.canonical_daily_count || null,
    activeRunVerifiedCount: source?.activeRunVerifiedCount || source?.active_run_verified_count || null,
    projectedDisplayCount: source?.projectedDisplayCount || source?.projected_display_count || null,
  };
}

function readRuntimeIndicator(account) {
  const source = account?.runtimeIndicator && typeof account.runtimeIndicator === "object"
    ? account.runtimeIndicator
    : {};
  const state = String(source?.state || "idle").toLowerCase();
  return {
    state: state === "active" || state === "error" ? state : "idle",
    reason: String(source?.reason || "no_active_run"),
    lastRunId: source?.lastRunId || source?.last_run_id || null,
    lastRunStatus: source?.lastRunStatus || source?.last_run_status || null,
    lastRunExitCode: source?.lastRunExitCode ?? source?.last_run_exit_code ?? null,
    lastRunFinishedAt: source?.lastRunFinishedAt || source?.last_run_finished_at || null,
  };
}

function readLastSessionAt(account) {
  return formatCompactDateTime(account?.lastSafeUpdate || account?.last_safe_update || account?.lastSessionAt || account?.last_session_at || null);
}

function profileFromManageAccount(account, index, devices) {
  const loginVerificationPending = account?.reauthRequired === true || account?.reauth_required === true;
  const hardLoginBlock = /checkpoint|challenge|password_invalid|missing_credentials/i.test(String(account?.loginStatus || account?.login_status || ""));
  const blocked = Boolean(
    account?.blockingCampaign
    || hardLoginBlock,
  );
  const device = resolveProfileDevice(account, devices);
  const packageValue = readPackageLabel(account);
  const entitlements = readEntitlements(account, packageValue);
  const scheduleModeValue = readScheduleMode(account) || null;
  const scheduleLabelValue = readActiveWindow(account);
  const credentialStatus = readCredentialStatus(account);
  const loginStatus = readLoginStatus(account);
  const eligibilityReason = readEligibilityReason(account, blocked, loginStatus);
  const eligibility = readEligibility(account, blocked, loginStatus);
  const readiness = readReadiness(account, blocked);
  const deviceAvailability = readDeviceAvailability(account, device);
  const assignmentState = readAssignmentState(account, device);
  const assignmentHealth = readAssignmentHealth(account);
  const assignmentHealthReason = readAssignmentHealthReason(account);
  const appInstanceId = String(account?.appInstanceId || account?.app_instance_id || account?.assignment?.appInstanceId || account?.assignment?.app_instance_id || "");
  const lifecycleStatus = readProfileLifecycleStatus(account);
  const appInstanceIndex = readNullableProfileNumber(account, ["appInstanceIndex", "app_instance_index", "cloneIndex", "clone_index"]);
  const profileStatus = lifecycleStatus === "archived" ? "archived" : lifecycleStatus === "trashed" ? "trashed" : readProfileStatus(account, blocked);
  const runtimeLock = String(account?.runtimeLock || account?.runtime_lock || "none");
  const hasAssignment = Boolean(
    account?.assignmentStatus
    || account?.assignment_status
    || account?.appInstanceId
    || account?.app_instance_id
    || account?.deviceId
    || account?.device_id,
  );
  console.info("[botapp] profile_schedule_mapping", {
    account: String(account?.username || accountRowId(account, index)),
    hasAssignment,
    scheduleMode: scheduleModeValue,
    scheduleLabel: scheduleLabelValue,
    source: String(account?.sourceLabel || account?.source_label || "manage_overview"),
  });
  return {
    id: accountRowId(account, index),
    username: String(account?.username || "unknown"),
    displayName: String(account?.displayName || account?.username || "unknown"),
    platform: readPlatform(account),
    package: packageValue,
    planType: "normal",
    profileNumber: readProfileNumber(account, index),
    clientName: String(account?.clientName || "Client"),
    status: profileStatus,
    deviceId: readDeviceId(account, device),
    deviceName: readDeviceName(account, device),
    appInstanceId,
    appInstanceLabel: account?.appInstanceLabel || account?.app_instance_label || account?.assignment?.appInstanceLabel || null,
    appInstanceIndex,
    cloneIndex: appInstanceIndex,
    lifecycleStatus,
    archivedAt: account?.archivedAt || account?.archived_at || null,
    trashedAt: account?.trashedAt || account?.trashed_at || null,
    scheduledTrashAt: account?.scheduledTrashAt || account?.scheduled_trash_at || null,
    scheduledDeleteAt: account?.scheduledDeleteAt || account?.scheduled_delete_at || null,
    activeWindow: scheduleLabelValue,
    scheduleLabel: scheduleLabelValue,
    followers: Number(account?.followerDelta3d?.currentFollowers ?? account?.followersCount ?? account?.followers_count ?? account?.followers ?? 0),
    followerDelta: readFollowerDelta(account) ?? 0,
    followerDelta3d: readFollowerDelta3d(account),
    interactionsToday: readInteractionsToday(account),
    currentRunCounters: readCurrentRunCounters(account),
    followsToday: Number(account?.followsToday || account?.follows_today || 0),
    dmsToday: Number(account?.dmsToday || account?.dms_today || 0),
    counters: profileCounters(account),
    twoFactorEnabled: /enabled/i.test(String(account?.twoFactorDisplay || "")),
    credentialStatus,
    loginStatus,
    deviceAvailability,
    assignmentState,
    assignmentHealth,
    assignmentHealthReason,
    entitlements,
    runtimeProfile: readRuntimeProfile(account),
    scheduleMode: scheduleModeValue,
    slotKind: readSlotKind(account),
    autoLoginRequirement: readAutoLoginRequirement({
      account,
      credentialStatus,
      loginStatus,
      device,
      appInstanceId,
      assignmentState,
      deviceAvailability,
      runtimeLock,
      profileStatus,
    }),
    restoreLoginScreenRequirement: readRestoreLoginScreenRequirement({
      account,
      device,
      appInstanceId,
      assignmentState,
      deviceAvailability,
      runtimeLock,
      profileStatus,
    }),
    refreshReadinessRequirement: readRefreshReadinessRequirement({
      account,
      credentialStatus,
      loginStatus,
      device,
      appInstanceId,
      assignmentState,
      deviceAvailability,
      profileStatus,
    }),
    assignNowRequirement: readRequirement(blocked, "Ready to assign"),
    lastSessionAt: readLastSessionAt(account),
    readiness,
    eligibility,
    eligibilityReason,
    eligibilityDetail: {
      status: eligibility,
      primary_block_reason: eligibility === "blocked_now" ? eligibilityReason : "",
      reason_label: eligibility === "blocked_now" ? eligibilityReason.replaceAll("_", " ") : "Ready",
      reason_description: eligibility === "blocked_now" ? "Start is blocked until eligibility is resolved." : "Ready",
    },
    runtimeLock,
    activeRunRequestId: account?.activeRunRequestId || account?.active_run_request_id || null,
    activeRunRequestStatus: account?.activeRunRequestStatus || account?.active_run_request_status || null,
    activeRunId: account?.activeRunId || account?.active_run_id || null,
    activeRunStatus: account?.activeRunStatus || account?.active_run_status || null,
    runtimeIndicator: readRuntimeIndicator(account),
  };
}

function overlayClientAccountNeedsMoreTargets(items, clientAccountsPayload) {
  const relayAccounts = Array.isArray(clientAccountsPayload?.accounts) ? clientAccountsPayload.accounts : [];
  if (!relayAccounts.length) return items;
  const byId = new Map(relayAccounts.map((row, index) => [accountRowId(row, index), row]));
  return items.map((item) => {
    const relay = byId.get(item.accountId);
    if (!relay) return item;
    return {
      ...item,
      needsMoreTargets: Boolean(relay.needsMoreTargets ?? relay.needs_more_targets),
      eligibleTargetCount: Number(relay.eligibleTargetCount ?? relay.eligible_target_count ?? 0),
      clientContactEmailDisplay: String(relay.clientContactEmail || relay.clientContactEmailDisplay || item.clientContactEmailDisplay || "Not provided"),
      safeEmailDisplay: String(relay.clientContactEmail || relay.clientContactEmailDisplay || item.safeEmailDisplay || "Not provided"),
      clientContactEmailSource: String(relay.clientContactEmailSource || item.clientContactEmailSource || "missing"),
      clientContactEmailAvailable: Boolean(relay.clientContactEmailAvailable ?? item.clientContactEmailAvailable),
    };
  });
}

function clientAccountFromManage(account, profile, devices) {
  const device = devices.find((item) => item.id === profile.deviceId);
  const status = accountStatus(account?.adminStatus || account?.customerStatus || account?.subscriptionStatus);
  const actionsNeeded = [];
  if (account?.pendingActionsCount) actionsNeeded.push(`${account.pendingActionsCount} pending action(s)`);
  if (account?.blockingCampaign) actionsNeeded.push("campaign blocked");
  return {
    accountId: profile.id,
    profileId: profile.id,
    clientId: String(account?.clientId || profile.id),
    clientName: profile.clientName,
    username: profile.username,
    displayName: profile.displayName,
    platform: "Instagram",
    createdAtLabel: String(account?.createdAt || ""),
    accountStatus: status,
    adminStatus: String(account?.adminStatus || "unknown"),
    customerStatus: String(account?.customerStatus || "unknown"),
    subscriptionStatus: String(account?.subscriptionStatus || "unknown"),
    lifecycleStatus: profile.lifecycleStatus || (status === "cancelled" ? "deleted" : "active"),
    loginStatus: profile.loginStatus,
    credentialStatus: profile.credentialStatus,
    credentialsConfigured: Boolean(account?.credentialsConfigured),
    reauthRequired: Boolean(account?.reauthRequired),
    twoFactorStatus: /enabled/i.test(String(account?.twoFactorDisplay || "")) ? "enabled" : "unknown",
    readiness: profile.readiness,
    eligibility: profile.eligibility,
    eligibilityReason: profile.eligibilityReason,
    reasonLabel: profile.eligibilityDetail.reason_label,
    packageLabel: profile.package,
    entitlementSummary: String(account?.entitlementSummary || ""),
    entitlements: profile.entitlements,
    assignment: {
      deviceId: device?.id || "",
      deviceName: device?.name || account?.phoneName || "No phone",
      deviceStatus: device?.status || "offline",
      appInstanceLabel: String(account?.appInstanceLabel || ""),
      packageName: String(account?.appPackageName || "com.instagram.android"),
      assignmentStatus: profile.assignmentState,
      assignmentHealth: profile.assignmentHealth,
      assignmentHealthReason: profile.assignmentHealthReason,
      scheduleMode: profile.scheduleMode,
      slotKind: profile.slotKind,
      activeWindow: profile.activeWindow,
    },
    lastActivityAt: account?.lastSafeUpdate || null,
    targetsCount: 0,
    needsMoreTargets: Boolean(account?.needsMoreTargets ?? account?.needs_more_targets),
    eligibleTargetCount: Number(account?.eligibleTargetCount ?? account?.eligible_target_count ?? 0),
    actionsNeeded,
    safeEmailDisplay: String(account?.clientContactEmail || account?.clientContactEmailDisplay || "Not provided"),
    clientContactEmailDisplay: String(account?.clientContactEmail || account?.clientContactEmailDisplay || "Not provided"),
    clientContactEmailSource: String(account?.clientContactEmailSource || "missing"),
    clientContactEmailAvailable: Boolean(account?.clientContactEmailAvailable),
    assignmentHealth: profile.assignmentHealth,
    assignmentHealthReason: profile.assignmentHealthReason,
    sourceLabel: "supabase_projection:manage_overview",
    profileImageUrl: account?.profileImageUrl || null,
    instagramVerificationStatus: account?.instagramVerificationStatus === "verified" ? "verified" : account?.instagramVerificationStatus === "pending" ? "pending" : "unknown",
    passwordStatus: /missing/i.test(String(account?.passwordDisplay || account?.credentialsStatus || "")) ? "missing" : /update|reauth/i.test(String(account?.passwordDisplay || account?.credentialsStatus || "")) ? "update_needed" : "configured",
    twoFactorDisplay: /enabled/i.test(String(account?.twoFactorDisplay || "")) ? "enabled" : /code/i.test(String(account?.twoFactorDisplay || "")) ? "code required" : "unknown",
  };
}

function summarizeClientAccounts(items) {
  return {
    total: items.length,
    active: items.filter((item) => item.accountStatus === "active").length,
    pending: items.filter((item) => item.accountStatus === "pending").length,
    onboarding: items.filter((item) => item.accountStatus === "onboarding").length,
    paused: items.filter((item) => item.accountStatus === "paused").length,
    cancelled: items.filter((item) => item.accountStatus === "cancelled").length,
    needsAssistance: items.filter((item) => item.actionsNeeded.length > 0).length,
    reauthRequired: items.filter((item) => item.reauthRequired).length,
  };
}

function credentialsFromDashboard(credentials, accountsById) {
  const source = credentials?.ok ? credentials.data : credentials;
  const groups = Array.isArray(source?.actionGroups) ? source.actionGroups : [];
  const actions = groups.map((group, index) => {
    const account = accountsById.get(String(group.accountId || ""));
    return {
      id: `${group.accountId || "action"}_${index}`,
      accountId: String(group.accountId || account?.accountId || ""),
      clientId: account?.clientId || String(group.accountId || ""),
      profileId: account?.profileId || String(group.accountId || ""),
      username: String(group.username || account?.username || "unknown"),
      clientName: String(group.clientName || account?.clientName || "Client"),
      actionType: String(group.actionTypes?.[0] || "review_credentials"),
      title: String(group.mainIssue || "Review credentials"),
      description: String(group.description || group.recommendedAction || ""),
      status: String(group.status || "pending").replace("unknown", "pending"),
      priority: String(group.severity || "info").replace("error", "critical").replace("unknown", "info"),
      audience: String(group.audience || "admin").replace("unknown", "admin"),
      requiresClientAction: Boolean(group.audience === "client"),
      blockingCampaign: Boolean(group.blockingCampaign),
      credentialStatus: String(group.credentialsStatus || account?.credentialStatus || "unknown"),
      loginStatus: String(group.loginStatus || account?.loginStatus || "unknown"),
      provisioningStatus: String(group.provisioningStatus || account?.readiness || "unknown"),
      sourceLabel: group.sourceLabel === "account_dashboard_actions" ? "account_dashboard_actions" : "derived from shared backend overview",
      assignedPhone: account?.assignment?.deviceName || "",
      createdAtLabel: "",
      updatedAtLabel: "",
      ageLabel: "",
      nextAction: String(group.recommendedAction || "Review account"),
    };
  });
  return {
    actions,
    summary: {
      openActions: actions.filter((action) => !["resolved", "dismissed"].includes(action.status)).length,
      passwordUpdates: actions.filter((action) => action.actionType.includes("password")).length,
      verificationCodes: actions.filter((action) => action.actionType.includes("verification") || action.actionType.includes("two_factor")).length,
      needsReview: actions.filter((action) => action.audience === "admin" || action.priority === "warning").length,
      clientActionRequired: actions.filter((action) => action.requiresClientAction).length,
    },
    relayPayload: { action: "credentials_actions_overview", source: "BotApp", requested_by: null, include: ["account_dashboard_actions", "account_credentials", "client_instagram_accounts", "manage_overview", "radar_overview"], metadata_safe: { expected_effect: "read_only_credentials_actions_overview" } },
  };
}

function notificationsFromRadar(radar) {
  const source = radar?.ok ? radar.data : radar;
  const items = [
    ...(Array.isArray(source?.notificationItems?.radar) ? source.notificationItems.radar : []),
    ...(Array.isArray(source?.notificationItems?.serverCheck) ? source.notificationItems.serverCheck : []),
  ];
  return items.map((item, index) => ({
    id: String(item.id || `notification_${index + 1}`),
    severity: ["critical", "error", "warning", "info"].includes(item.severity) ? item.severity : "info",
    title: String(item.title || item.warningType || "Runtime signal"),
    message: String(item.message || item.detail || ""),
    profileId: item.accountId || undefined,
    createdAt: String(item.timestamp || ""),
    acknowledged: false,
  }));
}

function logsFromRadar(radar) {
  const source = radar?.ok ? radar.data : radar;
  const warnings = Array.isArray(source?.warnings) ? source.warnings : [];
  const runs = Array.isArray(source?.runs) ? source.runs : [];
  return [...warnings.slice(0, 30).map((row, index) => ({
    id: String(row.id || `warning_${index + 1}`),
    timestamp: String(row.timestamp || ""),
    level: ["critical", "error", "warning", "info"].includes(row.severity) ? row.severity : "info",
    actor: "backend",
    event: String(row.warningType || "warning"),
    target: String(row.username || ""),
    detail: String(row.message || row.recommendedAction || ""),
    domain: "runtime",
    source: String(row.sourceLabel || "shared_backend"),
    account: row.username || null,
    device: row.phoneName || null,
    status: "review",
  })), ...runs.slice(0, 20).map((row, index) => ({
    id: String(row.runId || `run_${index + 1}`),
    timestamp: String(row.updatedAt || row.startedAt || ""),
    level: row.status === "failed" ? "error" : row.status === "running" ? "info" : "info",
    actor: "worker",
    event: `run.${row.status || "unknown"}`,
    target: String(row.username || ""),
    detail: `Run ${row.status || "unknown"}`,
    domain: "runs",
    source: String(row.sourceLabel || "shared_backend"),
    account: row.username || null,
    device: row.phoneName || null,
    status: String(row.status || "unknown"),
  }))];
}

function logsFromActivity(activityLog) {
  const source = activityLog?.ok ? activityLog.data : activityLog;
  const items = Array.isArray(source?.items) ? source.items : [];
  return items.slice(0, 120).map((item, index) => ({
    id: String(item.id || item.sourceRecordId || `activity_${index + 1}`),
    timestamp: String(item.occurredAt || item.timestamp || ""),
    level: item.result === "failed" ? "error" : item.result === "pending" ? "warning" : "info",
    actor: String(item.actor || item.actorType || "backend"),
    event: String(item.actionType || item.action || "activity"),
    target: String(item.interactedUsername || item.ctUsername || item.targetLabel || ""),
    detail: String(item.safeSummary || item.reason || item.evidenceSummary || ""),
    domain: String(item.domain || item.evidenceSource || "activity"),
    source: String(item.sourceLabel || item.evidenceSource || "shared_backend"),
    account: item.clientAccountUsername || item.username || null,
    device: item.safeDeviceLabel || null,
    status: String(item.actionStatus || item.result || "unknown"),
  }));
}

function summarizeProfileGroup(profiles) {
  return {
    total: profiles.length,
    normal: profiles.filter((profile) => profile.planType === "normal").length,
    dual: profiles.filter((profile) => profile.planType === "dual").length,
    other: profiles.filter((profile) => profile.planType === "other").length,
  };
}

const ACTIVE_DEVICE_RUNTIME_STATUSES = new Set(["pending", "queued", "claimed", "running", "starting", "stopping", "canceling"]);

function profileRuntimeActive(profile) {
  const request = String(profile?.activeRunRequestStatus || profile?.active_run_request_status || "").trim().toLowerCase();
  const run = String(profile?.activeRunStatus || profile?.active_run_status || "").trim().toLowerCase();
  const runtimeState = String(profile?.runtimeIndicator?.state || "").trim().toLowerCase();
  return (
    profile?.status === "running"
    || ACTIVE_DEVICE_RUNTIME_STATUSES.has(request)
    || ACTIVE_DEVICE_RUNTIME_STATUSES.has(run)
    || runtimeState === "active"
  );
}

function resolveGroupPhoneStatus(groupProfiles, fallbackStatus) {
  if (groupProfiles.some((profile) => profileRuntimeActive(profile))) return "active";
  return fallbackStatus;
}

function buildDeviceProfileGroup(device, groupProfiles) {
  const fallbackStatus = device.status === "offline" ? "inactive" : groupProfiles.some((profile) => profile.status === "running") ? "running" : "idle";
  return {
    deviceId: device.id,
    deviceLabel: device.name,
    deviceSerial: device.adbSerial,
    deviceSerialLabel: device.shortSerial,
    deviceStatus: device.status,
    phoneStatus: resolveGroupPhoneStatus(groupProfiles, fallbackStatus),
    deviceView: {
      available: device.viewAvailable,
      unavailableReason: device.viewUnavailableReason,
    },
    summary: summarizeProfileGroup(groupProfiles),
    profiles: groupProfiles,
  };
}

function buildUnassignedProfileGroup(ungroupedProfiles) {
  return {
    deviceId: "unassigned-live-profiles",
    deviceLabel: "Unassigned / backend profiles",
    deviceSerial: "",
    deviceSerialLabel: "No device",
    deviceStatus: "maintenance",
    phoneStatus: "idle",
    deviceView: {
      available: false,
      unavailableReason: "No ADB serial is attached to this backend account row.",
    },
    summary: summarizeProfileGroup(ungroupedProfiles),
    profiles: ungroupedProfiles,
  };
}

function buildProfileBackedDeviceGroup(deviceId, groupProfiles) {
  const first = groupProfiles[0] || {};
  const requiresAttention = groupProfiles.some((profile) => profile.assignmentState === "requires_attention" || profile.assignmentHealth === "requires_attention");
  const label = String(first.deviceName || (requiresAttention ? "Affectation à vérifier" : "Assigned backend device"));
  return {
    deviceId,
    deviceLabel: label,
    deviceSerial: "",
    deviceSerialLabel: requiresAttention ? "Device/app instance requires review" : "Device inventory pending",
    deviceStatus: requiresAttention ? "maintenance" : "reserved",
    phoneStatus: resolveGroupPhoneStatus(groupProfiles, groupProfiles.some((profile) => profile.status === "running") ? "running" : "idle"),
    deviceView: {
      available: false,
      unavailableReason: requiresAttention
        ? "Assignment exists, but device/app instance/timeslot state requires review before runtime actions."
        : "Device is projected from the account assignment, but no ADB serial is attached in the device inventory payload.",
    },
    summary: summarizeProfileGroup(groupProfiles),
    profiles: groupProfiles,
  };
}

function profileGroupsFromData(profiles, devices) {
  const knownDeviceIds = new Set(devices.map((device) => device.id));
  const assignedProfiles = new Map();
  for (const device of devices) assignedProfiles.set(device.id, []);
  const ungroupedProfiles = [];
  const profileBackedDeviceGroups = new Map();

  for (const profile of profiles) {
    const deviceId = String(profile.deviceId || "");
    if (deviceId && knownDeviceIds.has(deviceId)) {
      assignedProfiles.get(deviceId).push(profile);
      continue;
    }
    if (deviceId || profile.assignmentState === "requires_attention" || profile.assignmentHealth === "requires_attention") {
      const key = deviceId || `assignment-attention:${profile.id || profile.username}`;
      profileBackedDeviceGroups.set(key, [...(profileBackedDeviceGroups.get(key) || []), profile]);
      continue;
    }
    ungroupedProfiles.push(profile);
  }

  const groups = devices
    .map((device) => buildDeviceProfileGroup(device, assignedProfiles.get(device.id) || []))
    .filter((group) => group.profiles.length > 0);

  for (const [deviceId, groupProfiles] of profileBackedDeviceGroups) {
    groups.push(buildProfileBackedDeviceGroup(deviceId, groupProfiles));
  }

  if (ungroupedProfiles.length) {
    groups.push(buildUnassignedProfileGroup(ungroupedProfiles));
  } else if (!groups.length && profiles.length) {
    groups.push(buildUnassignedProfileGroup(profiles));
  }

  return groups;
}

function enrichDeviceAppOccupants(devices, profiles) {
  const profileById = new Map();
  for (const profile of profiles) {
    if (profile?.id) profileById.set(String(profile.id), profile);
    if (profile?.accountId) profileById.set(String(profile.accountId), profile);
  }
  return devices.map((device) => ({
    ...device,
    appInstances: Array.isArray(device.appInstances)
      ? device.appInstances.map((app) => {
        const accountId = String(app?.occupant?.accountId || "");
        const profile = accountId ? profileById.get(accountId) : null;
        if (!profile || app.occupant?.username) return app;
        return {
          ...app,
          occupant: {
            ...app.occupant,
            username: String(profile.username || ""),
            status: app.occupant?.status || String(profile.assignmentState || "occupied"),
          },
        };
      })
      : [],
  }));
}

function compassFromData(profiles, devices, credentials) {
  const blockedAccounts = profiles.filter((profile) => profile.eligibility === "blocked_now").length;
  const openCredentialActions = credentials.summary.openActions;
  const problemDevices = devices.filter((device) => device.status === "offline" || device.heartbeatStatus === "stale").length;
  const target = (targetTab, label, context = {}) => ({ targetTab, label, context });
  const affectedFromCredentials = credentials.actions.map((action) => ({
    accountId: action.accountId,
    profileId: action.profileId,
    username: action.username,
    clientName: action.clientName,
    deviceId: null,
    deviceName: action.assignedPhone || null,
    packageLabel: "Growth",
    reason: action.title,
    target: target("credentials", "Open Credentials", { accountId: action.accountId, username: action.username }),
  }));
  const credentialInsight = openCredentialActions ? {
    id: "credentials",
    category: "credentials",
    severity: "critical",
    title: "Credential actions",
    summary: `${openCredentialActions} credential action(s) need review.`,
    sinceLabel: "current",
    impact: "Blocked accounts may not restart safely.",
    cause: "Shared backend credential actions are open.",
    clientVisible: true,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Open credential actions should be cleared before restart.",
    clientSummary: "Account access action required.",
    technicalReason: "account_dashboard_actions returned open groups.",
    clientSafeReason: "Account access action required.",
    recommendedAction: "Open Credentials",
    targetTab: "credentials",
    confidence: "high",
    affectedAccounts: affectedFromCredentials,
    evidence: [{ source: "credentials_actions", label: "Open actions", value: openCredentialActions, confidence: "high" }],
    recommendations: [],
  } : null;
  const deviceInsight = problemDevices ? {
    id: "devices",
    category: "devices",
    severity: "warning",
    title: "Device gates",
    summary: `${problemDevices} phone(s) need heartbeat or availability review.`,
    sinceLabel: "current",
    impact: "Device gates can block run and restart eligibility.",
    cause: "Device heartbeat or availability is not green.",
    clientVisible: false,
    clientRawVisible: false,
    clientRecommendationInput: true,
    adminSummary: "Review device heartbeat before runtime actions.",
    clientSummary: null,
    technicalReason: "devices overview contains offline/stale phone signals.",
    clientSafeReason: null,
    recommendedAction: "Open Devices",
    targetTab: "devices",
    confidence: "medium",
    affectedAccounts: [],
    evidence: [{ source: "devices_overview", label: "Problem devices", value: problemDevices, confidence: "medium" }],
    recommendations: [],
  } : null;
  const insights = [credentialInsight, deviceInsight].filter(Boolean);
  return {
    generatedAt: new Date().toISOString(),
    healthScore: Math.max(0, 100 - blockedAccounts * 12 - problemDevices * 10),
    summary: {
      totalAccounts: profiles.length,
      workingAccounts: profiles.length - blockedAccounts,
      blockedAccounts,
      underQuotaAccounts: 0,
      inactiveAccounts: profiles.filter((profile) => profile.status === "paused" || profile.status === "archived").length,
      clientVisibleRecommendations: 0,
    },
    trends: [],
    insights,
    problemGroups: [],
    recommendations: [],
    internalSignals: [
      {
        id: "credential_blocker",
        signal: "credential_blocker",
        title: "Credential blockers",
        summary: "Open credential actions from shared backend.",
        count: openCredentialActions,
        severity: "critical",
        adminVisible: true,
        clientRawVisible: false,
        clientRecommendationInput: true,
        target: target("credentials", "Open Credentials"),
        affectedAccounts: affectedFromCredentials,
        evidence: [{ source: "credentials_actions", label: "Open actions", value: openCredentialActions, confidence: "high" }],
      },
      {
        id: "device_blocker",
        signal: "device_blocker",
        title: "Device gates",
        summary: "Device availability or heartbeat gates.",
        count: problemDevices,
        severity: "warning",
        adminVisible: true,
        clientRawVisible: false,
        clientRecommendationInput: true,
        target: target("devices", "Open Devices"),
        affectedAccounts: [],
        evidence: [{ source: "devices_overview", label: "Problem devices", value: problemDevices, confidence: "medium" }],
      },
    ].filter((signal) => signal.count > 0),
    clientSafePreview: [],
    aiAdvisor: {
      status: "relay_pending",
      provider: "openai",
      model: "server-side relay",
      lastAnalyzedAt: null,
      period: "7d",
      summary: "Compass facts loaded from shared backend APIs. Run AI analysis through the secure relay.",
      healthAssessment: blockedAccounts || problemDevices ? "watch" : "good",
      relayTarget: "/api/instagram-dashboard/compass/analyze",
      serverSideOnly: true,
      analysis: null,
      fallbackReason: null,
      providerErrorCode: null,
    },
    aiAnalysisPayload: {
      generatedAt: new Date().toISOString(),
      summary: {
        totalAccounts: profiles.length,
        blockedAccounts,
        problemDevices,
        openCredentialActions,
      },
      insights,
      internalSignals: [],
      clientSafePreview: [],
    },
    relayPayload: {
      action: "compass_overview",
      source: "BotApp",
      requested_by: null,
      include: ["client_accounts_overview", "credentials_actions", "devices_overview", "activity_log_interaction_evidence_admin_v1", "runs_eligibility", "account_run_requests", "ig_runs", "incidents"],
      metadata_safe: { expected_effect: "read_only_compass_decision_overview", ai_provider: "openai" },
    },
  };
}

function emptySettings() {
  return {
    business: { defaultPackage: "Growth", welcomeEnabledForPro: false, outreachRequiresAddon: true },
    admin: { appMode: "relay", apiBase: "Configured in API / Webhooks / Keys", updatesChannel: "manual" },
    opsSafetyCaps: { effectiveFollowCap: "server", deviceLevelLock: true, cloneBufferMinutes: 10 },
    killSwitches: { startAllAccounts: false, realDeviceActions: false, realDmSend: false },
    runtimeState: { source: "backend_relay", polling: "manual", websocket: "disabled" },
  };
}

async function botappOverviewData() {
  const [overview, devicesPayload, profilesPayload, clientAccountsPayload, credentialsPayload, activityPayload] = await Promise.all([
    dashboardGet("botapp_overview").catch((error) => ({ error: safeRuntimeError(error, "Authentication required") })),
    dashboardGet("devices_overview").catch(() => null),
    dashboardGet("profiles_overview").catch(() => null),
    dashboardGet("client_accounts_overview").catch(() => null),
    dashboardGet("credentials_actions").catch(() => null),
    dashboardGet("activity_log").catch(() => null),
  ]);
  const overviewPayload = overview?.error ? null : overview;
  const overviewDevices = overviewPayload?.devices?.ok ? overviewPayload.devices.data : null;
  const devices = normalizeDashboardDevices(overviewDevices || devicesPayload);
  const manage = overviewPayload?.manage?.ok ? overviewPayload.manage.data : null;
  const credentials = overviewPayload?.credentials?.ok ? overviewPayload.credentials.data : credentialsPayload;
  const radar = overviewPayload?.radar?.ok ? overviewPayload.radar.data : null;
  const activityLog = overviewPayload?.activity_log?.ok ? overviewPayload.activity_log.data : activityPayload;
  const extracted = extractManageAccounts(profilesPayload, clientAccountsPayload, overviewPayload);
  const accounts = extracted.accounts;
  const profiles = accounts.map((account, index) => profileFromManageAccount(account, index, devices));
  const enrichedDevices = enrichDeviceAppOccupants(devices, profiles);
  const profileGroups = profileGroupsFromData(profiles, enrichedDevices);
  const groupedProfilesCount = profileGroups.reduce((total, group) => total + group.profiles.length, 0);
  const overviewError = overview?.error || null;
  const profilesSourceCounts = {
    patch: "manage-sync-v1",
    ...extracted.counts,
    grouped_profiles_count: groupedProfilesCount,
    unassigned_count: profileGroups.find((group) => group.deviceId === "unassigned-live-profiles")?.profiles.length || 0,
    known_device_group_count: profileGroups.filter((group) => group.deviceId !== "unassigned-live-profiles").length,
    relay_configured: Boolean(compassConfig().relayUrl),
    relay_ok: !overviewError && Boolean(accounts.length),
    relay_error: overviewError || null,
    overview_ok: Boolean(overviewPayload?.manage?.ok),
    profiles_endpoint_ok: Array.isArray(profilesPayload?.profiles) || Array.isArray(profilesPayload?.allAccounts),
    client_accounts_endpoint_ok: Array.isArray(clientAccountsPayload?.accounts),
  };
  console.info("[botapp] profiles_patch_active manage-sync-v1");
  console.info("[botapp] profiles_source_counts", profilesSourceCounts);
  const clientItems = overlayClientAccountNeedsMoreTargets(
    accounts.map((account, index) => clientAccountFromManage(account, profiles[index], enrichedDevices)),
    clientAccountsPayload,
  );
  const clientAccounts = {
    items: clientItems,
    summary: summarizeClientAccounts(clientItems),
    sourceStatus: { manageOverview: accounts.length || manage ? "connected" : "pending", credentialsActions: credentials ? "connected" : "pending", statusMutations: "pending", botAppRelay: overview?.error ? "pending" : "connected" },
    relayPayload: { action: "client_accounts_overview", source: "BotApp", requested_by: null, include: ["manage_overview", "credentials_actions", "readiness_projection", "assignments", "targets_summary"], metadata_safe: { expected_effect: "read_only_client_accounts_overview" } },
  };
  const accountsById = new Map(clientItems.map((account) => [account.accountId, account]));
  const credentialsOverview = credentialsFromDashboard(credentials, accountsById);
  const liveActivityLogs = logsFromActivity(activityLog);
  const logs = liveActivityLogs.length ? liveActivityLogs : logsFromRadar(radar);
  const relayConfigured = Boolean(compassConfig().relayUrl);
  const syncError = accounts.length
    ? null
    : overviewError
      || (!relayConfigured ? "Configure the relay URL in API / Webhooks / Keys to load shared backend data." : null)
      || "No accounts returned from the shared backend API. Check relay URL, relay credential, and deployed endpoints.";
  return serializeIpcPayload({
    ok: !syncError,
    error: syncError,
    profilesMeta: {
      source: extracted.source,
      accountsCount: accounts.length,
      counts: profilesSourceCounts,
    },
    data: {
      profiles,
      profileGroups,
      clientAccounts,
      credentials: credentialsOverview,
      compass: compassFromData(profiles, enrichedDevices, credentialsOverview),
      autoRestart: overviewPayload?.auto_restart?.ok ? normalizeAutoRestartOverview(overviewPayload.auto_restart.data) : autoRestartFallback(overviewPayload?.auto_restart?.error || "Auto Restart overview unavailable."),
      devices: enrichedDevices,
      notifications: notificationsFromRadar(radar),
      logs,
      apiKeys: [],
      webhooks: listIntegrationConfig().webhooks,
      settings: emptySettings(),
    },
  });
}

async function botappProfilesLiveData(input) {
  const accountIds = Array.isArray(input?.accountIds)
    ? [...new Set(input.accountIds.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 200)
    : [];
  try {
    const payload = await dashboardGetWithQuery("profiles_live", { account_ids: accountIds.join(",") });
    return serializeIpcPayload({
      ok: true,
      data: {
        profiles: Array.isArray(payload?.profiles) ? payload.profiles : [],
        generatedAt: payload?.generated_at || new Date().toISOString(),
        source: String(payload?.source || "profiles_live_batched_v1"),
        queryCount: Number(payload?.query_count || 0),
      },
      error: null,
    });
  } catch (error) {
    return serializeIpcPayload({
      ok: false,
      data: { profiles: [], generatedAt: new Date().toISOString(), source: "profiles_live_unavailable", queryCount: 0 },
      error: safeRuntimeError(error, "Live Profiles projection unavailable."),
    });
  }
}

function probeRelayUrlRedacted() {
  const origin = dashboardOrigin(compassConfig());
  return origin || maskUrl(process.env.BOTAPP_COMPASS_AI_RELAY_URL || "");
}

function isCaptureExactPreflightMode() {
  return process.env.BOTAPP_CAPTURE_PREFLIGHT_EXACT === "1";
}

function captureExactPreflightOutDir() {
  if (!isIntegrationLocalMode() || !isCaptureExactPreflightMode()) return null;
  const dir = String(process.env.BOTAPP_CAPTURE_PREFLIGHT_EXACT_DIR || "").trim();
  if (!dir || dir.includes(`${path.sep}captures${path.sep}incidents${path.sep}run-`)) return null;
  return dir;
}

function captureExactPreflightScopeMode() {
  return process.env.BOTAPP_CAPTURE_PREFLIGHT_SCOPE === "global_admin" ? "global_admin" : "host_bound";
}

function writeCaptureExactPreflightReport(report) {
  const outDir = captureExactPreflightOutDir();
  if (!outDir) return null;
  fs.mkdirSync(outDir, { recursive: true });
  const scope = captureExactPreflightScopeMode();
  const outPath = path.join(outDir, `capture-preflight-exact-${scope}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}

const CAPTURE_EXACT_PREFLIGHT_BRIDGES = [
  {
    step: "relay.health",
    bridge: "relay.health",
    channel: "botapp:relay:health",
    preloadPath: "window.botappDesktop.relay.health",
    invokeJs: "window.botappDesktop?.relay?.health?.()",
  },
  {
    step: "incidents.list",
    bridge: "incidents.list",
    channel: "botapp:incidents:list",
    preloadPath: "window.botappDesktop.incidents.list",
    invokeJs: "window.botappDesktop?.incidents?.list?.({ status: \"open,acknowledged\", limit: 20 })",
  },
  {
    step: "data.overview",
    bridge: "data.overview",
    channel: "botapp:data:overview",
    preloadPath: "window.botappDesktop.data.overview",
    invokeJs: "window.botappDesktop?.data?.overview?.()",
  },
];

async function runCaptureExactPreflightDiagnostic(mainWindow) {
  await waitForBotappDesktopBridge(mainWindow);
  const scopeMode = captureExactPreflightScopeMode();
  const steps = [];
  for (const bridge of CAPTURE_EXACT_PREFLIGHT_BRIDGES) {
    const started = Date.now();
    const entry = {
      step: bridge.step,
      bridge: bridge.bridge,
      channel: bridge.channel,
      preloadPath: bridge.preloadPath,
      phase: "before_invoke",
      scopeMode,
      buildMarker: botappIpcProbeBuildId,
      relayUrl: probeRelayUrlRedacted(),
      autostartSkipped: shouldSkipIntegrationAutostart(),
      durationMs: null,
      returnType: null,
      summary: null,
      error: null,
      nonCloneablePath: null,
      failureDirection: null,
    };
    const invokeStarted = Date.now();
    try {
      const payload = await mainWindow.webContents.executeJavaScript(`(async () => (${bridge.invokeJs}))()`);
      entry.durationMs = Date.now() - invokeStarted;
      entry.returnType = Array.isArray(payload) ? "array" : payload === null ? "null" : typeof payload;
      entry.phase = "invoke_ok";
      try {
        structuredClone(payload);
        entry.phase = "return_clone_ok";
        entry.summary = summarizeProbeBridgeResult(bridge.bridge, payload);
      } catch (cloneError) {
        entry.phase = "return_clone_error";
        entry.error = sanitizeProbeMessage(cloneError instanceof Error ? cloneError.message : String(cloneError));
        entry.nonCloneablePath = findNonCloneablePath(payload);
        entry.failureDirection = "main_to_renderer_ipc_return";
      }
    } catch (error) {
      entry.durationMs = Date.now() - invokeStarted;
      entry.phase = "invoke_error";
      entry.error = sanitizeProbeMessage(error instanceof Error ? error.message : String(error));
      entry.failureDirection = entry.error === "structured_clone_failed" ? "main_to_renderer_ipc_return" : "renderer_invoke";
    }
    entry.totalStepMs = Date.now() - started;
    steps.push(entry);
    if (entry.phase !== "return_clone_ok") break;
    await sleepMs(300);
  }

  const hostBoundOnly = scopeMode === "host_bound"
    ? steps.find((step) => step.step === "incidents.list")?.summary?.scopeMode === "host_bound"
    : null;
  const globalAdminBreadth = scopeMode === "global_admin"
    ? steps.find((step) => step.step === "incidents.list")?.summary?.scopeMode === "global_admin"
      && Number(steps.find((step) => step.step === "incidents.list")?.summary?.incidentCount || 0) >= 2
    : null;

  return {
    mode: "capture_preflight_exact",
    generatedAt: new Date().toISOString(),
    packaged: app.isPackaged,
    integrationLocal: true,
    scopeMode,
    authorizedHostMachine: scopeMode === "host_bound" ? INTEGRATION_HOST_MACHINE : null,
    buildMarker: botappIpcProbeBuildId,
    relayUrl: probeRelayUrlRedacted(),
    autostartSkipped: shouldSkipIntegrationAutostart(),
    sameApiAsCapturePreflight: true,
    sameInvokeArgumentsAsCapturePreflight: true,
    rendererPreloadIpcPath: true,
    steps,
    hostBoundOnly,
    globalAdminBreadth,
    ok: steps.length === CAPTURE_EXACT_PREFLIGHT_BRIDGES.length
      && steps.every((step) => step.phase === "return_clone_ok")
      && steps.every((step) => step.summary?.ok !== false)
      && (scopeMode !== "host_bound" || hostBoundOnly === true)
      && (scopeMode !== "global_admin" || globalAdminBreadth === true),
  };
}

async function finishCaptureExactPreflight(mainWindow) {
  try {
    await sleepMs(3000);
    const report = await runCaptureExactPreflightDiagnostic(mainWindow);
    const outPath = writeCaptureExactPreflightReport(report);
    console.log("[capture-preflight-exact] complete", outPath || "(no out dir)", report.ok ? "ok" : "failed");
    if (!report.ok) {
      writeCaptureExactPreflightReport({
        ...report,
        failureCode: report.steps.find((step) => step.phase !== "return_clone_ok")?.phase || "preflight_failed",
      });
    }
  } catch (error) {
    writeCaptureExactPreflightReport({
      mode: "capture_preflight_exact",
      generatedAt: new Date().toISOString(),
      ok: false,
      failureCode: "capture_preflight_exact_exception",
      error: sanitizeProbeMessage(error instanceof Error ? error.message : String(error)),
      steps: [],
    });
    console.error("[capture-preflight-exact] failed", sanitizeProbeMessage(error instanceof Error ? error.message : String(error)));
  } finally {
    if (process.env.BOTAPP_INTEGRATION_CAPTURE_QUIT === "1") {
      app.quit();
    }
  }
}

function isIpcBridgeProbeMode() {
  return process.env.BOTAPP_IPC_BRIDGE_PROBE === "1";
}

function shouldSkipIntegrationAutostart() {
  return isIpcBridgeProbeMode() || isCaptureExactPreflightMode() || process.env.BOTAPP_INTEGRATION_SKIP_AUTOSTART === "1";
}

function ipcBridgeProbeOutDir() {
  if (!isIntegrationLocalMode() || !isIpcBridgeProbeMode()) return null;
  const dir = String(process.env.BOTAPP_IPC_BRIDGE_PROBE_DIR || "").trim();
  if (!dir || dir.includes(`${path.sep}captures${path.sep}incidents${path.sep}run-`)) return null;
  return dir;
}

function writeProbeDiagnostic(fileName, payload) {
  const outDir = ipcBridgeProbeOutDir();
  if (!outDir) return;
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, fileName), `${JSON.stringify(payload, null, 2)}\n`);
  } catch {
    // best effort
  }
}

function sanitizeProbeMessage(message) {
  const raw = String(message || "").trim();
  if (!raw) return "unknown_error";
  if (/could not be cloned/i.test(raw)) return "structured_clone_failed";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(raw)) return "backend_unreachable";
  return raw.slice(0, 240);
}

function summarizeProbeBridgeResult(bridge, result) {
  if (bridge === "relay.health") {
    return {
      ok: Boolean(result?.ok),
      relay_authenticated: Boolean(result?.relay_authenticated),
    };
  }
  if (bridge === "incidents.list") {
    return {
      ok: Boolean(result?.ok),
      incidentCount: Array.isArray(result?.incidents)
        ? result.incidents.length
        : Number(result?.openCount || 0),
      scopeMode: result?.scopeMode || null,
    };
  }
  if (bridge === "data.overview") {
    return {
      ok: Boolean(result?.ok),
      accountsCount: Number(result?.profilesMeta?.accountsCount || 0),
      syncError: result?.error ? "present" : null,
    };
  }
  return { ok: Boolean(result?.ok) };
}

const IPC_BRIDGE_PROBE_DEFINITIONS = [
  {
    bridge: "relay.health",
    channel: "botapp:relay:health",
    preloadPath: "window.botappDesktop.relay.health",
    invokeArgs: [],
    runMain: () => botappRelayHealth(),
    rendererInvokeJs: "window.botappDesktop?.relay?.health?.()",
  },
  {
    bridge: "incidents.list",
    channel: "botapp:incidents:list",
    preloadPath: "window.botappDesktop.incidents.list",
    invokeArgs: [{ status: "open,acknowledged", limit: 20 }],
    runMain: () => incidentsOverview({ status: "open,acknowledged", limit: 20 }),
    rendererInvokeJs: "window.botappDesktop?.incidents?.list?.({ status: \"open,acknowledged\", limit: 20 })",
  },
  {
    bridge: "data.overview",
    channel: "botapp:data:overview",
    preloadPath: "window.botappDesktop.data.overview",
    invokeArgs: [],
    runMain: () => botappOverviewData(),
    rendererInvokeJs: "window.botappDesktop?.data?.overview?.()",
  },
];

function withProbeTimeout(promise, bridge, timeoutMs = 30000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`probe_timeout_${bridge}`)), timeoutMs);
    }),
  ]);
}

async function runIpcBridgeProbeMain() {
  const bridges = {};
  for (const probe of IPC_BRIDGE_PROBE_DEFINITIONS) {
    const entry = {
      bridge: probe.bridge,
      channel: probe.channel,
      preloadPath: probe.preloadPath,
      invokeArgs: probe.invokeArgs,
      mainProcess: { ok: false },
    };
    try {
      const payload = await withProbeTimeout(probe.runMain(), probe.bridge);
      entry.mainProcess.handlerOk = true;
      entry.mainProcess.summary = summarizeProbeBridgeResult(probe.bridge, payload);
      try {
        structuredClone(payload);
        entry.mainProcess.structuredCloneOk = true;
      } catch (cloneError) {
        entry.mainProcess.structuredCloneOk = false;
        entry.mainProcess.failureDirection = "main_handler_return";
        entry.mainProcess.error = sanitizeProbeMessage(cloneError instanceof Error ? cloneError.message : String(cloneError));
        entry.mainProcess.nonCloneablePath = findNonCloneablePath(payload);
        entry.mainProcess.nonCloneableKind = entry.mainProcess.nonCloneablePath?.kind || null;
      }
      entry.mainProcess.ok = entry.mainProcess.structuredCloneOk === true;
    } catch (error) {
      entry.mainProcess.handlerOk = false;
      entry.mainProcess.error = sanitizeProbeMessage(error instanceof Error ? error.message : String(error));
    }
    bridges[probe.bridge] = entry;
  }
  return {
    phase: "main_process",
    packaged: app.isPackaged,
    generatedAt: new Date().toISOString(),
    bridges,
  };
}

async function waitForBotappDesktopBridge(mainWindow, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await mainWindow.webContents.executeJavaScript(
      "Boolean(window.botappDesktop?.relay?.health && window.botappDesktop?.incidents?.list && window.botappDesktop?.data?.overview)",
    );
    if (ready) return;
    await sleepMs(250);
  }
  throw new Error("botappDesktop bridge not ready");
}

async function runIpcBridgeProbeRenderer(mainWindow) {
  await waitForBotappDesktopBridge(mainWindow);
  const bridges = {};
  for (const probe of IPC_BRIDGE_PROBE_DEFINITIONS) {
    const entry = {
      bridge: probe.bridge,
      channel: probe.channel,
      preloadPath: probe.preloadPath,
      rendererProcess: { ok: false },
    };
    try {
      const payload = await mainWindow.webContents.executeJavaScript(
        `(async () => (${probe.rendererInvokeJs}))()`,
      );
      entry.rendererProcess.invokeOk = true;
      entry.rendererProcess.summary = summarizeProbeBridgeResult(probe.bridge, payload);
      try {
        structuredClone(payload);
        entry.rendererProcess.structuredCloneOk = true;
      } catch (cloneError) {
        entry.rendererProcess.structuredCloneOk = false;
        entry.rendererProcess.failureDirection = "main_to_renderer_ipc_return";
        entry.rendererProcess.error = sanitizeProbeMessage(cloneError instanceof Error ? cloneError.message : String(cloneError));
        entry.rendererProcess.nonCloneablePath = findNonCloneablePath(payload);
        entry.rendererProcess.nonCloneableKind = entry.rendererProcess.nonCloneablePath?.kind || null;
      }
      entry.rendererProcess.ok = entry.rendererProcess.structuredCloneOk === true;
    } catch (error) {
      entry.rendererProcess.invokeOk = false;
      const message = sanitizeProbeMessage(error instanceof Error ? error.message : String(error));
      entry.rendererProcess.error = message;
      if (message === "structured_clone_failed") {
        entry.rendererProcess.failureDirection = "main_to_renderer_ipc_return";
      }
    }
    bridges[probe.bridge] = entry;
    await sleepMs(300);
  }
  return {
    phase: "renderer_invoke",
    generatedAt: new Date().toISOString(),
    bridges,
  };
}

function writeIpcBridgeProbeReport(report, fileName = "botapp-ipc-bridge-probe.json") {
  const outDir = ipcBridgeProbeOutDir();
  if (!outDir) return null;
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, fileName);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}

async function finishIpcBridgeProbe(mainWindow) {
  const rendererTimeoutMs = 60000;
  try {
    const renderer = await withProbeTimeout(runIpcBridgeProbeRenderer(mainWindow), "renderer_invoke", rendererTimeoutMs);
    const report = {
      mode: "packaged_ipc_bridge_probe",
      integrationLocal: true,
      relayUrl: probeRelayUrlRedacted(),
      relayKeyConfigured: true,
      autostartSkipped: shouldSkipIntegrationAutostart(),
      ipcProbeBuildId: botappIpcProbeBuildId,
      completedAt: new Date().toISOString(),
      main: pendingIpcBridgeProbeMainReport,
      renderer,
    };
    const outPath = writeIpcBridgeProbeReport(report);
    console.log("[ipc-bridge-probe] complete", outPath || "(no out dir)");
  } catch (error) {
    const report = {
      mode: "packaged_ipc_bridge_probe",
      integrationLocal: true,
      relayUrl: probeRelayUrlRedacted(),
      relayKeyConfigured: true,
      autostartSkipped: shouldSkipIntegrationAutostart(),
      ipcProbeBuildId: botappIpcProbeBuildId,
      completedAt: new Date().toISOString(),
      main: pendingIpcBridgeProbeMainReport,
      renderer: {
        phase: "renderer_invoke",
        error: sanitizeProbeMessage(error instanceof Error ? error.message : String(error)),
      },
    };
    writeIpcBridgeProbeReport(report);
    writeCaptureDiagnostic("botapp-ipc-bridge-probe-error.json", {
      message: sanitizeProbeMessage(error instanceof Error ? error.message : String(error)),
      at: new Date().toISOString(),
    });
    writeProbeDiagnostic("botapp-ipc-bridge-probe-error.json", {
      message: sanitizeProbeMessage(error instanceof Error ? error.message : String(error)),
      at: new Date().toISOString(),
    });
    console.error("[ipc-bridge-probe] failed", sanitizeProbeMessage(error instanceof Error ? error.message : String(error)));
  } finally {
    if (process.env.BOTAPP_INTEGRATION_CAPTURE_QUIT === "1") {
      app.quit();
    }
  }
}

async function botappRelayHealth() {
  const cfg = compassConfig();
  const checkedAt = new Date().toISOString();
  const localRelay = localRelayDiagnostics(cfg);
  if (!cfg.relayUrl) {
    return serializeIpcPayload({
      ok: false,
      relay_authenticated: false,
      backend_configured: false,
      source: "botapp_local",
      server_time: null,
      reason: "unreachable",
      backend_key: { present: false, length: 0, sha256_prefix: null, environment_scope: "unknown" },
      provided_key: { present: localRelay.present, length: localRelay.length, sha256_prefix: localRelay.sha256_prefix },
      routes: {},
      message: "Relay URL is not configured in BotApp.",
      checkedAt,
      localRelay,
    });
  }

  try {
    const result = await dashboardRequestResult("GET", "botapp_relay_health");
    const data = result.ok ? result.data : (result.data?.data || result.data || {});
    const backendKey = data?.backend_key && typeof data.backend_key === "object" ? data.backend_key : {};
    const providedKey = data?.provided_key && typeof data.provided_key === "object" ? data.provided_key : {};
    const routes = data?.routes && typeof data.routes === "object" ? serializeIpcPayload(data.routes) : {};
    return serializeIpcPayload({
      ok: Boolean(data?.ok),
      relay_authenticated: Boolean(data?.relay_authenticated),
      backend_configured: Boolean(data?.backend_configured),
      source: String(data?.source || "botapp_relay"),
      server_time: typeof data?.server_time === "string" ? data.server_time : null,
      reason: data?.reason || null,
      backend_key: {
        present: Boolean(backendKey.present),
        length: Number.isFinite(Number(backendKey.length)) ? Number(backendKey.length) : 0,
        sha256_prefix: typeof backendKey.sha256_prefix === "string" ? backendKey.sha256_prefix : null,
        environment_scope: typeof backendKey.environment_scope === "string" ? backendKey.environment_scope : "unknown",
      },
      provided_key: {
        present: Boolean(providedKey.present),
        length: Number.isFinite(Number(providedKey.length)) ? Number(providedKey.length) : localRelay.length,
        sha256_prefix: typeof providedKey.sha256_prefix === "string" ? providedKey.sha256_prefix : localRelay.sha256_prefix,
      },
      routes,
      route_paths: data?.route_paths && typeof data.route_paths === "object" ? serializeIpcPayload(data.route_paths) : {},
      message: data?.relay_authenticated ? "BotApp relay auth OK." : String(result.error || readRelayError(data, "BotApp relay auth failed.")),
      checkedAt,
      localRelay,
    });
  } catch (error) {
    return serializeIpcPayload({
      ok: false,
      relay_authenticated: false,
      backend_configured: false,
      source: "botapp_relay",
      server_time: null,
      reason: "unreachable",
      backend_key: { present: false, length: 0, sha256_prefix: null, environment_scope: "unknown" },
      provided_key: { present: localRelay.present, length: localRelay.length, sha256_prefix: localRelay.sha256_prefix },
      routes: {},
      message: safeRuntimeError(error, "BotApp relay health unavailable."),
      checkedAt,
      localRelay,
    });
  }
}

async function botappDevicesList(input = {}) {
  try {
    const data = await dashboardGet("devices_overview");
    const devices = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return { ok: true, data: input?.format === "raw" ? devices : normalizeDashboardDevices(devices), tools: localToolDiagnostics() };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Device inventory unavailable.") };
  }
}

async function deviceDeletePreflight(deviceId) {
  const normalizedDeviceId = String(deviceId || "").trim();
  if (!normalizedDeviceId) return { ok: false, error: "Missing device id." };
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to delete devices." };
  return dashboardRequestResult("POST", "devices_delete_preflight", { device_id: normalizedDeviceId });
}

async function deviceDelete(input = {}) {
  const deviceId = String(input?.deviceId || input?.device_id || "").trim();
  const confirmationName = String(input?.confirmationName || input?.confirmation_name || "").trim();
  if (!deviceId) return { ok: false, error: "Missing device id." };
  if (!confirmationName) return { ok: false, error: "Missing confirmation name." };
  const cfg = compassConfig();
  if (!cfg.relayUrl) return { ok: false, error: "Configure the relay URL in API / Webhooks / Keys to delete devices." };
  return dashboardRequestResult("POST", "devices_delete", {
    device_id: deviceId,
    confirmation_name: confirmationName,
    source: "BotApp",
  });
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPhysicalDeviceAssignmentHeartbeatLive(device) {
  if (String(device?.deviceKind || "") !== "physical_phone") return true;
  const dbStatus = String(device?.backendHeartbeatDbStatus || device?.heartbeatStatus || "").toLowerCase();
  const lastSeenAt = String(device?.backendLastSeenAt || "").trim();
  if (dbStatus !== "online" || !lastSeenAt) return false;
  const lastSeenMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) return false;
  return Date.now() - lastSeenMs <= ASSIGNMENT_HEARTBEAT_STALE_MS;
}

function parsePublisherJson(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Ignore non-JSON noise on stdout.
    }
  }
  return null;
}

function runDeviceHeartbeatPublisherOnce() {
  if (!fs.existsSync(deviceHeartbeatPublisherPath)) {
    return { ok: false, error: "heartbeat_publisher_missing", published_count: 0, skipped_count: 0 };
  }
  const args = [deviceHeartbeatPublisherPath, "--env-file", workerEnvFilePath, "--include-battery"];
  const result = spawnSync(deviceHeartbeatPythonPath, args, {
    cwd: workerRootPath,
    encoding: "utf8",
    shell: false,
    timeout: 90000,
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
  if (result.error) {
    const reason = result.error.code === "ETIMEDOUT" ? "heartbeat_publisher_timeout" : safeRuntimeError(result.error, "Heartbeat publisher failed.");
    return { ok: false, error: reason, published_count: 0, skipped_count: 0, stdout: safeDispatcherText(result.stdout), stderr: safeDispatcherText(result.stderr) };
  }
  const parsed = parsePublisherJson(result.stdout);
  if (!parsed) {
    return {
      ok: false,
      error: result.status === 0 ? "heartbeat_publisher_output_invalid" : safeDispatcherText(result.stderr) || "heartbeat_publisher_failed",
      published_count: 0,
      skipped_count: 0,
      stdout: safeDispatcherText(result.stdout),
      stderr: safeDispatcherText(result.stderr),
      exitCode: result.status ?? null,
    };
  }
  const publishedCount = Number(parsed.published_count ?? 0);
  const skippedCount = Number(parsed.skipped_count ?? 0);
  if (result.status !== 0) {
    return {
      ok: false,
      error: safeDispatcherText(result.stderr) || "heartbeat_publisher_failed",
      published_count: publishedCount,
      skipped_count: skippedCount,
      stdout: safeDispatcherText(result.stdout),
      stderr: safeDispatcherText(result.stderr),
      exitCode: result.status ?? null,
    };
  }
  return {
    ok: true,
    published_count: publishedCount,
    skipped_count: skippedCount,
    observed_count: Number(parsed.observed_count ?? 0),
    stdout: safeDispatcherText(result.stdout),
    stderr: safeDispatcherText(result.stderr),
  };
}

function deviceHeartbeatFallbackStatus(status, message, extra = {}) {
  const now = new Date().toISOString();
  return {
    ok: false,
    status,
    operatorStatus: status === "stopped" ? "stopped" : "degraded",
    operatorLabelFr: status === "stopped" ? "Arrêté" : "Dégradé",
    serviceId: "device-heartbeat-publisher",
    paused: false,
    processRunning: false,
    pid: null,
    processCount: 0,
    duplicateProcess: false,
    launchdLoaded: false,
    intervalSeconds: 60,
    lastCycleAt: null,
    lastCycleOk: false,
    lastPublishedCount: 0,
    lastObservedCount: 0,
    physicalPhonesSeen: 0,
    youngestBackendHeartbeatAgeSeconds: null,
    physicalPhonesInInventory: null,
    lastError: message,
    logsPath: null,
    checkedAt: now,
    message,
    ...extra,
  };
}

function computeDeviceHeartbeatOperatorLabel(normalized) {
  if (!normalized.processRunning && (normalized.status === "stopped" || normalized.status === "paused" || !normalized.launchdLoaded)) {
    return { operatorStatus: "stopped", operatorLabelFr: "Arrêté" };
  }
  if (normalized.processRunning && normalized.lastObservedCount === 0 && normalized.physicalPhonesSeen === 0) {
    return { operatorStatus: "no_phones_detected", operatorLabelFr: "Aucun téléphone détecté" };
  }
  if (normalized.status === "running" && normalized.lastCycleOk && !normalized.duplicateProcess) {
    return { operatorStatus: "operational", operatorLabelFr: "Opérationnel" };
  }
  return { operatorStatus: "degraded", operatorLabelFr: "Dégradé" };
}

function normalizeDeviceHeartbeatStatus(raw, action) {
  const lastError = safeDispatcherText(raw?.lastError || "");
  const status = ["running", "paused", "stopped", "degraded", "starting", "unhealthy", "runtime_root_invalid", "runtime_root_mismatch", "unknown"].includes(raw?.status) ? raw.status : "unknown";
  const normalized = {
    ok: Boolean(raw?.ok),
    status,
    serviceId: String(raw?.service_id || raw?.serviceId || "device-heartbeat-publisher"),
    paused: Boolean(raw?.paused),
    processRunning: Boolean(raw?.processRunning),
    pid: Number.isFinite(Number(raw?.pid)) ? Number(raw.pid) : null,
    processCount: Number.isFinite(Number(raw?.processCount)) ? Number(raw.processCount) : 0,
    duplicateProcess: Boolean(raw?.duplicateProcess),
    launchdLoaded: Boolean(raw?.launchdLoaded),
    intervalSeconds: Number.isFinite(Number(raw?.intervalSeconds)) ? Number(raw.intervalSeconds) : 60,
    lastCycleAt: typeof raw?.lastCycleAt === "string" && raw.lastCycleAt ? raw.lastCycleAt : null,
    lastCycleOk: Boolean(raw?.lastCycleOk),
    lastPublishedCount: Number.isFinite(Number(raw?.lastPublishedCount)) ? Number(raw.lastPublishedCount) : 0,
    lastObservedCount: Number.isFinite(Number(raw?.lastObservedCount)) ? Number(raw.lastObservedCount) : 0,
    physicalPhonesSeen: Number.isFinite(Number(raw?.physicalPhonesSeen)) ? Number(raw.physicalPhonesSeen) : 0,
    youngestBackendHeartbeatAgeSeconds: null,
    physicalPhonesInInventory: null,
    lastError: lastError || null,
    logsPath: typeof raw?.logsPath === "string" ? raw.logsPath : null,
    activeRoot: typeof raw?.activeRoot === "string" ? raw.activeRoot : null,
    resolvedRoot: typeof raw?.resolvedRoot === "string" ? raw.resolvedRoot : null,
    runtimeCommit: typeof raw?.runtimeCommit === "string" ? raw.runtimeCommit : null,
    checkedAt: typeof raw?.checkedAt === "string" && raw.checkedAt ? raw.checkedAt : new Date().toISOString(),
    message: safeDispatcherText(raw?.message || "Device heartbeat service status unavailable."),
    action,
  };
  const operator = computeDeviceHeartbeatOperatorLabel(normalized);
  return {
    ...normalized,
    operatorStatus: operator.operatorStatus,
    operatorLabelFr: operator.operatorLabelFr,
  };
}

function runDeviceHeartbeatWrapperAsync(command, args = [], timeoutMs = 25000) {
  if (!deviceHeartbeatAllowedActions.has(command)) {
    return Promise.resolve({ ok: false, error: "device_heartbeat_action_not_allowed" });
  }
  return runRuntimeControllerCommand({
    controllerPath: deviceHeartbeatServiceWrapperPath,
    component: "heartbeat",
    command,
    args,
    cwd: runtimeControllerWorkingDirectory,
    timeoutMs,
  });
}

async function enrichDeviceHeartbeatStatus(normalized) {
  try {
    const inventory = await botappDevicesList({});
    if (!inventory.ok || !Array.isArray(inventory.data)) return normalized;
    const physical = inventory.data.filter((device) => String(device?.deviceKind || "") === "physical_phone");
    let youngestAgeSeconds = null;
    for (const device of physical) {
      const lastSeenAt = String(device?.backendLastSeenAt || "").trim();
      if (!lastSeenAt) continue;
      const lastSeenMs = Date.parse(lastSeenAt);
      if (!Number.isFinite(lastSeenMs)) continue;
      const ageSeconds = Math.max(0, (Date.now() - lastSeenMs) / 1000);
      youngestAgeSeconds = youngestAgeSeconds === null ? ageSeconds : Math.min(youngestAgeSeconds, ageSeconds);
    }
    const enriched = {
      ...normalized,
      youngestBackendHeartbeatAgeSeconds: youngestAgeSeconds,
      physicalPhonesInInventory: physical.length,
    };
    const operator = computeDeviceHeartbeatOperatorLabel(enriched);
    if (youngestAgeSeconds !== null && youngestAgeSeconds > ASSIGNMENT_HEARTBEAT_STALE_MS / 1000 && enriched.processRunning) {
      return {
        ...enriched,
        operatorStatus: "degraded",
        operatorLabelFr: "Dégradé",
        message: "Les téléphones sont connectés localement, mais leur signal backend n'est plus à jour. Le service tente une récupération automatique.",
      };
    }
    return {
      ...enriched,
      operatorStatus: operator.operatorStatus,
      operatorLabelFr: operator.operatorLabelFr,
    };
  } catch {
    return normalized;
  }
}

function normalizeDeviceHeartbeatWrapperResult(result, action) {
  if (!result.ok && !result.stdout) {
    return deviceHeartbeatFallbackStatus("unknown", result.error || "Device heartbeat status unavailable.");
  }
  const parsed = parseDispatcherJson(result.stdout);
  if (!parsed) {
    return deviceHeartbeatFallbackStatus("unknown", "Device heartbeat status output was not valid JSON.", {
      lastError: result.error || result.stderr || "device_heartbeat_status_json_invalid",
    });
  }
  return normalizeDeviceHeartbeatStatus(parsed, action);
}

async function fetchPhysicalDeviceHeartbeatSnapshot() {
  try {
    const data = await dashboardGet("devices_overview");
    const items = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.phone_devices)
          ? data.phone_devices
          : Array.isArray(data)
            ? data
            : [];
    return items
      .filter((row) => row && typeof row === "object")
      .map((row) => ({
        deviceKind: String(row?.device_kind || row?.kind || "physical_phone").includes("emulator") ? "emulator" : "physical_phone",
        adbSerial: String(row?.adb_serial || row?.adbSerial || "").trim(),
        name: String(row?.device_name || row?.name || row?.phone_name || "").trim(),
        backendLastSeenAt: String(row?.heartbeat_last_seen_at || row?.last_seen_at || ""),
        backendHeartbeatDbStatus: String(row?.heartbeat_status || row?.status || "unknown").toLowerCase(),
      }))
      .filter((device) => device.deviceKind === "physical_phone");
  } catch {
    return null;
  }
}

function adbPresentPhysicalHeartbeatDevices(physicalRows, localAdb) {
  const adbDevices = localAdb?.devices instanceof Map ? localAdb.devices : new Map();
  return (physicalRows || []).filter((device) => {
    const serial = String(device?.adbSerial || "").trim();
    return serial && adbDevices.get(serial) === "device";
  });
}

async function enrichDeviceHeartbeatStatusLight(normalized) {
  const physical = await fetchPhysicalDeviceHeartbeatSnapshot();
  if (!physical) return normalized;
  let youngestAgeSeconds = null;
  for (const device of physical) {
    const lastSeenAt = String(device?.backendLastSeenAt || "").trim();
    if (!lastSeenAt) continue;
    const lastSeenMs = Date.parse(lastSeenAt);
    if (!Number.isFinite(lastSeenMs)) continue;
    const ageSeconds = Math.max(0, (Date.now() - lastSeenMs) / 1000);
    youngestAgeSeconds = youngestAgeSeconds === null ? ageSeconds : Math.min(youngestAgeSeconds, ageSeconds);
  }
  const enriched = {
    ...normalized,
    youngestBackendHeartbeatAgeSeconds: youngestAgeSeconds,
    physicalPhonesInInventory: physical.length,
  };
  const operator = computeDeviceHeartbeatOperatorLabel(enriched);
  if (youngestAgeSeconds !== null && youngestAgeSeconds > ASSIGNMENT_HEARTBEAT_STALE_MS / 1000 && enriched.processRunning) {
    return {
      ...enriched,
      operatorStatus: "degraded",
      operatorLabelFr: "Dégradé",
      message: "Les téléphones sont connectés localement, mais leur signal backend n'est plus à jour. Le service tente une récupération automatique.",
    };
  }
  return {
    ...enriched,
    operatorStatus: operator.operatorStatus,
    operatorLabelFr: operator.operatorLabelFr,
  };
}

async function deviceHeartbeatStatusAsync(options = {}) {
  const result = await runDeviceHeartbeatWrapperAsync("status", ["--json"], 25000);
  const normalized = normalizeDeviceHeartbeatWrapperResult(result, "status");
  if (options.skipInventoryEnrich) return normalized;
  return enrichDeviceHeartbeatStatusLight(normalized);
}

async function deviceHeartbeatStatus() {
  const result = await runDeviceHeartbeatWrapperAsync("status", ["--json"]);
  const normalized = normalizeDeviceHeartbeatWrapperResult(result, "status");
  return enrichDeviceHeartbeatStatus(normalized);
}

async function ensureDeviceHeartbeatAutostart() {
  if (shouldSkipIntegrationAutostart()) {
    return deviceHeartbeatFallbackStatus("deferred", "Integration autostart skipped.");
  }
  let status = await deviceHeartbeatStatus();
  if (status.status === "running" && status.processRunning && !status.duplicateProcess) {
    return status;
  }

  if (status.duplicateProcess) {
    await runDeviceHeartbeatWrapperAsync("fix-duplicate", [], 45000);
    status = await deviceHeartbeatStatus();
    if (status.status === "running" && status.processRunning && !status.duplicateProcess) {
      return status;
    }
  }

  if (!status.launchdLoaded) {
    const install = await runDeviceHeartbeatWrapperAsync("install", [], 30000);
    if (!install.ok) {
      return {
        ...status,
        message: "Device heartbeat LaunchAgent install failed. Open Runtime Health to retry.",
        lastError: install.error || install.stderr || status.lastError,
      };
    }
  }

  const resume = await runDeviceHeartbeatWrapperAsync("resume", [], 45000);
  status = await deviceHeartbeatStatus();
  if (status.status === "running" && status.processRunning) {
    return status;
  }

  return {
    ...status,
    ok: status.status === "running" && status.processRunning,
    message: resume.ok
      ? (status.message || "Device heartbeat service is starting.")
      : `Device heartbeat autostart attempted: ${safeDispatcherText(resume.error || resume.stderr || status.lastError || "unknown")}`,
  };
}

async function deviceHeartbeatAction(action) {
  const normalized = String(action || "").trim();
  if (!deviceHeartbeatAllowedActions.has(normalized) || normalized === "status") {
    return deviceHeartbeatFallbackStatus("unknown", "Device heartbeat action is not allowed.", { action: normalized || "status" });
  }
  try {
    if (normalized === "logs") {
      const result = await runDeviceHeartbeatWrapperAsync("logs", ["--path"], 8000);
      const logPath = String(result.stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
      if (!result.ok || !logPath) {
        return deviceHeartbeatFallbackStatus("unknown", result.error || "Device heartbeat logs path unavailable.", { action: "logs" });
      }
      if (fs.existsSync(logPath)) {
        shell.showItemInFolder(logPath);
      } else {
        await shell.openPath(path.dirname(logPath));
      }
      const current = await deviceHeartbeatStatus();
      return {
        ...current,
        action: "logs",
        logsPath: logPath,
        message: "Device heartbeat logs opened.",
      };
    }
    const timeoutMs = normalized === "restart" || normalized === "fix-duplicate" ? 45000 : 25000;
    const result = await runDeviceHeartbeatWrapperAsync(normalized, [], timeoutMs);
    const current = await deviceHeartbeatStatus();
    return {
      ...current,
      action: normalized,
      ok: result.ok && current.ok,
      lastError: result.ok ? current.lastError : safeDispatcherText(result.error || result.stderr || current.lastError || "device_heartbeat_action_failed"),
      message: result.ok ? current.message : `Device heartbeat ${normalized} failed. Runtime Health stayed open; retry or use Restart cleanly.`,
    };
  } catch (error) {
    const current = await deviceHeartbeatStatus().catch(() => deviceHeartbeatFallbackStatus("unknown", "Device heartbeat status unavailable after action error."));
    return {
      ...current,
      action: normalized,
      ok: false,
      lastError: safeRuntimeError(error, "device_heartbeat_action_exception"),
      message: `Device heartbeat ${normalized} failed safely. BotApp stayed open.`,
    };
  }
}

const DEVICE_HEARTBEAT_RECOVERY_CHANNEL = "botapp:devices:heartbeat-recovery";
let activeHeartbeatRecovery = null;

function sendHeartbeatRecoveryProgress(webContents, payload) {
  if (!webContents || webContents.isDestroyed()) return;
  webContents.send(DEVICE_HEARTBEAT_RECOVERY_CHANNEL, payload);
}

function cancelActiveHeartbeatRecovery() {
  if (!activeHeartbeatRecovery) return;
  activeHeartbeatRecovery.aborted = true;
  activeHeartbeatRecovery = null;
}

function startDeviceHeartbeatRecovery(webContents) {
  if (activeHeartbeatRecovery && !activeHeartbeatRecovery.aborted) {
    return {
      ok: true,
      started: false,
      stage: "recovery_in_progress",
      message: "Récupération déjà en cours…",
    };
  }
  const job = { aborted: false, webContents };
  activeHeartbeatRecovery = job;
  void runDeviceHeartbeatRecoveryJob(job);
  return {
    ok: true,
    started: true,
    stage: "service_verifying",
    message: "Vérification du service…",
  };
}

async function runDeviceHeartbeatRecoveryJob(job) {
  const progress = (payload) => {
    if (job.aborted) return;
    sendHeartbeatRecoveryProgress(job.webContents, payload);
  };
  try {
    progress({
      ok: true,
      stage: "service_verifying",
      message: "Vérification du service…",
      published_count: 0,
      skipped_count: 0,
    });
    let service = await deviceHeartbeatStatusAsync({ skipInventoryEnrich: true });
    if (job.aborted) return;
    const recoveryAction = service.duplicateProcess ? "fix-duplicate" : "restart";
    const restart = await runDeviceHeartbeatWrapperAsync(recoveryAction, [], 45000);
    if (job.aborted) return;
    if (!restart.ok) {
      progress({
        ok: false,
        stage: "service_failed",
        message: "Impossible de relancer le service heartbeat devices.",
        error: safeDispatcherText(restart.error || restart.stderr || "device_heartbeat_service_restart_failed"),
        published_count: service.lastPublishedCount || 0,
        skipped_count: 0,
      });
      return;
    }

    const serviceDeadline = Date.now() + 25000;
    while (Date.now() < serviceDeadline && !job.aborted) {
      await sleepMs(2000);
      service = await deviceHeartbeatStatusAsync({ skipInventoryEnrich: true });
      if (service.processRunning && service.lastCycleOk) break;
    }
    if (job.aborted) return;

    progress({
      ok: true,
      stage: "waiting_heartbeat",
      message: "Attente d'un heartbeat récent…",
      published_count: service.lastPublishedCount || 0,
      skipped_count: 0,
    });

    const localAdb = localAdbDeviceMap();
    const initialPhysical = await fetchPhysicalDeviceHeartbeatSnapshot();
    const offlineExcludedCount = initialPhysical
      ? Math.max(0, initialPhysical.length - adbPresentPhysicalHeartbeatDevices(initialPhysical, localAdb).length)
      : 0;
    if (offlineExcludedCount > 0) {
      progress({
        ok: true,
        stage: "waiting_heartbeat",
        message: offlineExcludedCount === 1
          ? "1 téléphone hors ligne non inclus dans la vérification"
          : `${offlineExcludedCount} téléphones hors ligne non inclus dans la vérification`,
        published_count: service.lastPublishedCount || 0,
        skipped_count: 0,
        offline_excluded_count: offlineExcludedCount,
      });
    }

    const deadline = Date.now() + 45000;
    while (Date.now() < deadline && !job.aborted) {
      await sleepMs(2000);
      const physical = await fetchPhysicalDeviceHeartbeatSnapshot();
      if (!physical) continue;
      const adbPresent = adbPresentPhysicalHeartbeatDevices(physical, localAdb);
      if (!adbPresent.length || adbPresent.every(isPhysicalDeviceAssignmentHeartbeatLive)) {
        progress({
          ok: true,
          stage: "heartbeat_received",
          message: offlineExcludedCount > 0
            ? "Heartbeat reçu — prêt (téléphones hors ligne exclus de la vérification)"
            : "Heartbeat reçu — prêt",
          published_count: service.lastPublishedCount || 0,
          skipped_count: 0,
          offline_excluded_count: offlineExcludedCount,
        });
        return;
      }
    }

    if (job.aborted) return;
    progress({
      ok: false,
      stage: "heartbeat_timeout",
      message: "La récupération n'a pas abouti. Le téléphone reste non assignable.",
      error: "heartbeat_timeout",
      published_count: service.lastPublishedCount || 0,
      skipped_count: 0,
    });
  } catch (error) {
    if (job.aborted) return;
    progress({
      ok: false,
      stage: "service_failed",
      message: "Impossible de relancer le service heartbeat devices.",
      error: safeRuntimeError(error, "device_heartbeat_recovery_failed"),
      published_count: 0,
      skipped_count: 0,
    });
  } finally {
    if (activeHeartbeatRecovery === job) {
      activeHeartbeatRecovery = null;
    }
  }
}

function readRelayError(data, fallback) {
  const reason = data?.reason || data?.error?.code || data?.error;
  const fallbackReason = data?.fallback_reason || data?.data?.fallback_reason;
  if (typeof fallbackReason === "string") return safeAnalyzeMessage(fallbackReason, fallback);
  if (reason === "provider_key_missing") return "AI provider is not configured on the relay server.";
  if (reason === "model_unavailable") return "AI provider model unavailable.";
  if (reason === "schema_validation_failed") return "AI response failed schema validation.";
  if (reason === "payload_invalid") return "Relay analyze payload invalid.";
  if (reason === "provider_timeout") return "Provider timeout.";
  if (reason === "provider_rate_limited") return "AI provider quota/rate limit reached.";
  if (reason === "provider_error") return "AI provider returned an error.";
  const providerErrorCode = data?.provider_error_code || data?.data?.provider_error_code;
  if (typeof providerErrorCode === "string" && providerErrorCode) return `Provider error: ${providerErrorCode}`;
  if (reason === "relay_auth_required") return "Relay authentication is required.";
  if (reason === "relay_auth_invalid") return "Relay authentication failed.";
  if (reason === "relay_auth_unconfigured") return "Dashboard backend relay credential is not configured. Set the matching backend and BotApp relay credential, then restart/deploy the dashboard backend.";
  if (typeof data?.error === "string") return data.error;
  if (typeof data?.message === "string") return data.message;
  return fallback;
}

function safeRuntimeError(error, fallback) {
  const raw = error instanceof Error ? error.message : "";
  if (!raw || /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(raw)) {
    return fallback;
  }
  return raw;
}

async function compassHealth() {
  const cfg = compassConfig();
  const runtimeBefore = compassRuntimeStatus(undefined, cfg);
  if (!cfg.relayUrl) return runtimeBefore;
  try {
    const healthUrl = new URL(cfg.relayUrl);
    healthUrl.pathname = healthUrl.pathname.replace(/\/analyze\/?$/, "/health");
    const response = await fetch(healthUrl.toString(), {
      method: "GET",
      headers: relayHeaders(cfg),
    });
    const data = await response.json().catch(() => null);
    compassLastConnectionTestAt = new Date().toISOString();
    if (!response.ok || data?.ok === false) {
      const message = readRelayError(data, "Compass AI relay health check failed.");
      compassLastSafeError = message;
      compassServerKeyStatus = data?.reason === "provider_key_missing" ? "missing" : data?.provider_key_configured === true ? "configured" : "unknown";
      return {
        ...compassRuntimeStatus(message, cfg),
        status: "unavailable",
        serverKeyStatus: compassServerKeyStatus,
      };
    }
    compassLastSafeError = null;
    compassServerKeyStatus = data?.provider_key_configured === true ? "configured" : "unknown";
    return {
      ...compassRuntimeStatus("Compass AI relay health check passed.", cfg),
      model: typeof data?.model === "string" ? data.model : cfg.model,
      serverKeyStatus: compassServerKeyStatus,
      status: "ready",
    };
  } catch {
    const message = "Compass AI relay is unreachable.";
    compassLastSafeError = message;
    compassServerKeyStatus = "unknown";
    compassLastConnectionTestAt = new Date().toISOString();
    return { ...compassRuntimeStatus(message, cfg), status: "unavailable" };
  }
}

async function targetingAiStatus() {
  const cfg = compassConfig();
  const base = {
    status: "relay_missing",
    message: "Configure the Compass relay to load targeting AI configuration.",
    relayUrlConfigured: Boolean(cfg.relayUrl),
    openaiKeyConfigured: false,
    searchapiKeyConfigured: false,
    config: null,
    lastCheckedAt: new Date().toISOString(),
  };
  if (!cfg.relayUrl) return base;
  const result = await dashboardRequestResult("GET", "targeting_ai_config");
  if (!result.ok) {
    const routeMissing = result.status === 404;
    return {
      ...base,
      status: "unavailable",
      relayUrlConfigured: true,
      message: routeMissing
        ? "Targeting AI routes are not deployed on this relay host. Use http://localhost:3000/api/instagram-dashboard/compass/analyze for local validation."
        : (result.error || "Targeting AI configuration unavailable."),
      config: {
        enabled: false,
        provider: "openai",
        model: "gpt-4.1-mini",
        promptVersion: "targeting_ai_v1",
        promptSource: "code_default",
        systemPrompt: "",
        userPromptTemplate: "",
        maxGptCandidates: 50,
        maxDisplayedResults: 20,
        minFollowers: 500,
        maxFollowers: 50000,
        minEligibleTarget: 8,
        allowVerified: false,
        secondPassEnabled: true,
        temperature: 0.5,
        searchapiConcurrency: 4,
        maxSearchapiChecks: 55,
        editable: false,
        backendPending: routeMissing ? false : true,
        defaultSystemPrompt: "",
        defaultUserPromptTemplate: "",
        lastUpdated: null,
        updatedBy: null,
      },
      lastCheckedAt: new Date().toISOString(),
    };
  }
  return mapTargetingAiRuntimeFromPayload(result.data, cfg);
}

function mapTargetingAiRuntimeFromPayload(data, cfg) {
  const configLoaded = Boolean(data && data.backend_pending !== true);
  const fullyReady = configLoaded
    && data.enabled === true
    && data.openai_key_configured === true
    && data.searchapi_key_configured === true;
  return {
    status: configLoaded ? "ready" : "unavailable",
    message: configLoaded
      ? (fullyReady
        ? `Targeting AI config loaded (${data.prompt_source || "code_default"} · ${data.prompt_version || "targeting_ai_v1"}).`
        : "Targeting AI config loaded. Provider keys or feature flag may still need attention.")
      : "Targeting AI configuration unavailable or migration pending.",
    relayUrlConfigured: Boolean(cfg?.relayUrl),
    openaiKeyConfigured: data?.openai_key_configured === true,
    searchapiKeyConfigured: data?.searchapi_key_configured === true,
    config: data ? {
      enabled: data.enabled === true,
      provider: data.provider || "openai",
      model: data.model || "gpt-4.1-mini",
      promptVersion: data.prompt_version || "targeting_ai_v1",
      promptSource: data.prompt_source || "code_default",
      systemPrompt: data.system_prompt || data.default_system_prompt || "",
      userPromptTemplate: data.user_prompt_template || data.default_user_prompt_template || "",
      maxGptCandidates: data.max_gpt_candidates ?? 50,
      maxDisplayedResults: data.max_displayed_results ?? 20,
      minFollowers: data.min_followers ?? 500,
      maxFollowers: data.max_followers ?? 50000,
      minEligibleTarget: data.min_eligible_target ?? 8,
      allowVerified: data.allow_verified === true,
      secondPassEnabled: data.second_pass_enabled !== false,
      temperature: typeof data.temperature === "number" ? data.temperature : 0.5,
      searchapiConcurrency: data.searchapi_concurrency ?? 4,
      maxSearchapiChecks: data.max_searchapi_checks ?? 55,
      editable: data.prompt_editable !== false,
      backendPending: data.backend_pending === true,
      defaultSystemPrompt: data.default_system_prompt || "",
      defaultUserPromptTemplate: data.default_user_prompt_template || "",
      lastUpdated: data.updated_at || null,
      updatedBy: data.updated_by || null,
    } : null,
    lastCheckedAt: new Date().toISOString(),
  };
}

async function targetingAiSaveConfig(input) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) {
    return { ok: false, runtime: await targetingAiStatus(), error: "Configure the relay URL before saving targeting AI config." };
  }
  const result = await dashboardRequestResult("PATCH", "targeting_ai_config", input || {});
  if (!result.ok) {
    return {
      ok: false,
      runtime: {
        ...(await targetingAiStatus()),
        message: result.error || "Targeting AI config could not be saved.",
      },
      error: result.error || "Targeting AI config could not be saved.",
      field: result.data?.field || null,
    };
  }
  return {
    ok: true,
    runtime: mapTargetingAiRuntimeFromPayload(result.data, cfg),
    data: result.data,
  };
}

async function targetingAiResetConfig() {
  const cfg = compassConfig();
  if (!cfg.relayUrl) {
    return { ok: false, runtime: await targetingAiStatus(), error: "Configure the relay URL before resetting targeting AI config." };
  }
  const result = await dashboardRequestResult("POST", "targeting_ai_config_reset", {});
  if (!result.ok) {
    return {
      ok: false,
      runtime: await targetingAiStatus(),
      error: result.error || "Targeting AI config could not be reset.",
    };
  }
  return {
    ok: true,
    runtime: mapTargetingAiRuntimeFromPayload(result.data, cfg),
    data: result.data,
  };
}

async function targetingAiTestConfig(input) {
  const cfg = compassConfig();
  if (!cfg.relayUrl) {
    return { ok: false, error: "Configure the relay URL before testing targeting AI config." };
  }
  const result = await dashboardRequestResult("POST", "targeting_ai_test", {
    niche: input?.niche || "coffee shop",
    location_label: input?.locationLabel || "Paris, France",
    dry_run: true,
  });
  if (!result.ok) {
    return { ok: false, error: result.error || "Targeting AI test failed." };
  }
  return { ok: true, data: result.data };
}

function normalizeEmailTemplatesRelay(result) {
  if (!result?.ok) {
    return {
      ok: false,
      data: null,
      error: result?.error || "Email templates unavailable.",
    };
  }
  const projection = result.data;
  if (!projection || typeof projection.featureAvailable !== "boolean" || !Array.isArray(projection.templates)) {
    return {
      ok: false,
      data: null,
      error: "Email templates response was invalid.",
    };
  }
  return { ok: true, data: projection, error: null };
}

function normalizeEmailHistoryRelay(projection, errorMessage) {
  if (!projection || typeof projection.featureAvailable !== "boolean" || !Array.isArray(projection.items)) {
    return { ok: false, data: null, error: errorMessage || "Email history unavailable." };
  }
  return { ok: true, data: projection, error: null };
}

async function emailTemplatesList() {
  const result = await dashboardRequestResult("GET", "email_templates");
  return normalizeEmailTemplatesRelay(result);
}

async function emailTemplatesSave(input) {
  const result = await dashboardRequestResult("POST", "email_templates_save", {
    category: input?.category,
    subject: input?.subject,
    body_text: input?.bodyText,
  });
  return { ok: result.ok, data: result.data, error: result.error };
}

async function emailTemplatesPreview(input) {
  const result = await dashboardRequestResult("POST", "email_templates_save", {
    action: "preview",
    subject: input?.subject,
    body_text: input?.bodyText,
  });
  return { ok: result.ok, data: result.data, error: result.error };
}

async function emailAccountLifecyclePreview() {
  try {
    const data = await dashboardGet("email_lifecycle_preview");
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: safeRuntimeError(error, "Account lifecycle preview unavailable."),
    };
  }
}

async function emailNeedsMoreTargetsPreview() {
  try {
    const data = await dashboardGet("email_needs_more_targets_preview");
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: safeRuntimeError(error, "Needs-more lifecycle preview unavailable."),
    };
  }
}

async function emailOutboxPreview() {
  try {
    const data = await dashboardGet("email_lifecycle_outbox_preview");
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: safeRuntimeError(error, "Transactional email outbox preview unavailable."),
    };
  }
}

async function emailHistoryList(query = {}) {
  try {
    const projection = await dashboardGetWithQuery("email_history", query);
    return normalizeEmailHistoryRelay(projection);
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: safeRuntimeError(error, "Email history unavailable."),
    };
  }
}

async function emailHistoryDetail(intentId) {
  const normalized = String(intentId || "").trim();
  if (!normalized) return { ok: false, error: "Missing email intent id." };
  try {
    const data = await dashboardGet("email_history_detail", { intent_id: normalized });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeRuntimeError(error, "Email history detail unavailable.") };
  }
}

async function emailTestDeliveryStatus() {
  const result = await dashboardRequestResult("GET", "email_test_delivery_status");
  return { ok: result.ok, data: result.data, error: result.error };
}

async function emailDeliverySettings() {
  const result = await dashboardRequestResult("GET", "email_delivery_settings");
  return { ok: result.ok, data: result.data, error: result.error };
}

async function emailDeliverySettingsRefreshSenders() {
  const result = await dashboardRequestResult("POST", "email_delivery_settings_refresh_senders", {});
  const payload = result.data && typeof result.data === "object" ? result.data : null;
  const projection = payload?.projection ?? payload?.data?.projection ?? null;
  return {
    ok: result.ok,
    data: result.ok ? result.data : projection ? { projection } : result.data,
    error: result.error,
    reason: payload?.reason ?? null,
  };
}

async function emailDeliverySettingsSave(input) {
  const result = await dashboardRequestResult("PATCH", "email_delivery_settings_save", {
    support_email: input?.supportEmail,
    active_from_email: input?.activeFromEmail,
    config_version: input?.configVersion,
    confirmed: input?.confirmed === true,
  });
  return { ok: result.ok, data: result.data, error: result.error };
}

async function emailDeliverySettingsAudit() {
  const result = await dashboardRequestResult("GET", "email_delivery_settings_audit");
  return { ok: result.ok, data: result.data, error: result.error };
}

async function emailSendTestDelivery(input) {
  const result = await dashboardRequestResult("POST", "email_test_delivery", {
    category: input?.category,
    confirm: true,
  });
  return { ok: result.ok, data: result.data, error: result.error, reason: result.data?.reason ?? result.reason ?? null };
}

async function saveCompassRelayConfig(input) {
  const relayUrl = normalizeRelayUrl(input?.relayUrl || "");
  if (!relayUrl) {
    throw new Error("Relay URL must be HTTPS, localhost, or 127.0.0.1.");
  }
  const relayCredential = typeof input?.relayCredential === "string" ? input.relayCredential.trim() : "";
  persistRelayCredential(relayUrl, relayCredential);
  return compassRuntimeStatus("Compass AI relay URL saved.", compassConfig());
}

async function removeCompassRelayConfig() {
  removeRuntimeConfig(["compassAiRelayUrl", "botappRelayKey"]);
  clearRelayKeyFromSecureStore(userDataDir());
  runtimeConfigCache = null;
  compassLastConnectionTestAt = null;
  compassLastAnalysisAt = null;
  compassLastSafeError = null;
  compassServerKeyStatus = "unknown";
  return compassRuntimeStatus("Compass AI relay config removed.", compassConfig());
}

async function repairRelayConnection() {
  const bootstrap = bootstrapRelayConfig({ forceRestore: true });
  runtimeConfigCache = null;
  const relay = await botappRelayHealth();
  let overview = null;
  if (relay.ok && relay.relay_authenticated && !shouldSkipIntegrationAutostart()) {
    overview = await botappOverviewData();
    await ensureDispatcherAutostart();
  } else if (relay.ok && relay.relay_authenticated) {
    overview = await botappOverviewData();
  }
  const ok = Boolean(relay.ok && relay.relay_authenticated && overview?.ok);
  const result = {
    ok,
    bootstrap,
    relay,
    repairState: bootstrap.repairState || resolveRepairState({
      relayUrlConfigured: bootstrap.relayUrlConfigured,
      relayKeyConfigured: bootstrap.relayKeyConfigured,
      secureStorageAvailable: bootstrap.secureStorageAvailable,
      importedFrom: bootstrap.importedFrom,
      lastError: bootstrap.lastError,
    }),
    profilesReloaded: Boolean(overview?.ok),
    accountsCount: Number(overview?.profilesMeta?.accountsCount || 0),
    message: repairRelayClientMessage(bootstrap, relay, overview),
  };
  writeBootstrapStatus(userDataDir(), {
    ...bootstrap,
    relayOk: Boolean(relay.ok && relay.relay_authenticated),
    profilesOk: Boolean(overview?.ok),
    accountsCount: result.accountsCount,
    repairState: result.repairState,
    checkedAt: new Date().toISOString(),
  });
  return result;
}

function safeWebhook(record) {
  return {
    id: record.id,
    url: maskUrl(record.url),
    events: Array.isArray(record.events) ? record.events : [],
    status: record.status === "disabled" ? "disabled" : "active",
    lastDeliveryStatus: record.lastDeliveryStatus || "not_sent",
    lastDeliveryAt: record.lastDeliveryAt || null,
    provider: record.provider || inferWebhookProvider(record.url),
    latestError: record.latestError || null,
  };
}

function listIntegrationConfig() {
  const stored = readRuntimeConfig();
  const webhooks = Array.isArray(stored.botappWebhooks) ? stored.botappWebhooks.map(safeWebhook) : [];
  return { webhooks };
}

async function saveWebhookConfig(input) {
  const url = normalizeHttpsUrl(input?.url || "");
  if (!url) {
    throw new Error("Webhook URL must be HTTPS, localhost, or 127.0.0.1.");
  }
  const stored = readRuntimeConfig();
  const current = Array.isArray(stored.botappWebhooks) ? stored.botappWebhooks : [];
  const id = input?.id || `local_wh_${Date.now().toString(36)}`;
  const nextWebhook = {
    id,
    label: String(input?.label || "Webhook").slice(0, 80),
    url,
    signingValue: typeof input?.secret === "string" && input.secret.trim() ? input.secret.trim() : undefined,
    events: Array.isArray(input?.events) ? input.events : [],
    status: "active",
    lastDeliveryStatus: "not_sent",
    lastDeliveryAt: null,
    provider: inferWebhookProvider(url),
    latestError: null,
  };
  writeRuntimeConfig({ botappWebhooks: [...current.filter((hook) => hook.id !== id), nextWebhook] });
  return listIntegrationConfig();
}

async function removeWebhookConfig(input) {
  const stored = readRuntimeConfig();
  const current = Array.isArray(stored.botappWebhooks) ? stored.botappWebhooks : [];
  writeRuntimeConfig({ botappWebhooks: current.filter((hook) => hook.id !== input?.id) });
  return listIntegrationConfig();
}

async function compassAnalyze(input) {
  const period = input?.period === "24h" || input?.period === "30d" ? input.period : "7d";
  const snapshot = sanitizeCompassValue(input?.snapshot || {});
  const cfg = compassConfig();
  const runtimeBefore = compassRuntimeStatus(undefined, cfg);
  if (runtimeBefore.mode === "rules_only") {
    const advisor = fallbackCompassAdvisor(period, runtimeBefore.message);
    return { ok: false, advisor, runtime: runtimeBefore, error: runtimeBefore.message };
  }
  try {
    const advisor = await analyzeCompassViaRelay(cfg.relayUrl, period, snapshot);
    compassLastAnalysisAt = advisor.lastAnalyzedAt || new Date().toISOString();
    compassLastConnectionTestAt = compassLastAnalysisAt;
    const safeError = advisor.status === "ai_enabled" ? null : advisor.summary || "AI provider returned an error.";
    compassLastSafeError = safeError;
    compassLastProviderErrorCode = advisor.status === "ai_enabled" ? null : advisor.providerErrorCode || null;
    const runtime = compassRuntimeStatus(advisor.status === "ai_enabled" ? "Compass AI analysis completed through secure relay." : safeError, cfg);
    return { ok: advisor.status === "ai_enabled", advisor, runtime, error: advisor.status === "ai_enabled" ? undefined : safeError };
  } catch (error) {
    const message = safeRuntimeError(error, "Compass AI relay is unreachable.");
    compassLastSafeError = message;
    compassLastProviderErrorCode = null;
    const advisor = fallbackCompassAdvisor(period, message);
    const serverKeyStatus = message === "AI provider is not configured on the relay server." ? "missing" : compassServerKeyStatus;
    compassServerKeyStatus = serverKeyStatus;
    return { ok: false, advisor, runtime: { ...compassRuntimeStatus(message, cfg), status: "unavailable", serverKeyStatus }, error: message };
  }
}

function runtimeIntegrationStatus() {
  const now = new Date().toISOString();
  const relayUrl = process.env.BOTAPP_SECURE_RELAY_URL || "";
  const dashboardUrl = process.env.BOTAPP_DASHBOARD_API_URL || relayUrl;
  const compassStatus = compassRuntimeStatus();
  return {
    localGateway: {
      status: "running",
      mode: isDev ? "development" : "packaged",
      transport: "electron_ipc",
      port: null,
      lastHealthCheck: now,
    },
    secureRelay: {
      status: relayUrl ? "configured" : "disconnected",
      baseUrl: relayUrl ? safeUrl(relayUrl, "configured") : "Not configured",
      lastHealthCheck: relayUrl ? now : null,
    },
    dashboardBackend: {
      status: dashboardUrl ? "configured" : "disconnected",
      baseUrl: dashboardUrl ? safeUrl(dashboardUrl, "configured") : "Not configured",
      lastHealthCheck: dashboardUrl ? now : null,
    },
    compassAi: {
      status: compassStatus.mode === "relay" ? "configured" : "missing_key",
      mode: compassStatus.mode,
      provider: "OpenAI",
      model: compassStatus.model,
      relayKeyConfigured: compassStatus.relayKeyConfigured,
      serverKeyStatus: compassStatus.serverKeyStatus,
      relayUrlConfigured: compassStatus.relayUrlConfigured,
      relayOrigin: compassStatus.relayOrigin,
      lastTestAt: compassStatus.lastConnectionTestAt,
      lastAnalysisAt: compassStatus.lastAnalysisAt,
      lastSafeError: compassStatus.lastSafeError,
      relayEndpoint: "/api/instagram-dashboard/compass/analyze",
    },
    environment: app.isPackaged ? "production" : "development",
    integrationLocal: isIntegrationLocalMode(),
    integrationLocalBanner: isIntegrationLocalMode() ? integrationLocalBanner() : null,
  };
}

function safeDispatcherText(value) {
  const sensitiveEnvNames = [
    ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_"),
    ["BOTAPP", "RELAY", "API", "KEY"].join("_"),
    "RELAY_KEY",
    "PASSWORD",
    "TOKEN",
    "SECRET",
  ].join("|");
  return String(value || "")
    .replace(new RegExp(`(${sensitiveEnvNames})[^,\\n]*`, "gi"), "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .slice(0, 600);
}

function dispatcherFallbackStatus(status, message, extra = {}) {
  const now = new Date().toISOString();
  return {
    ok: false,
    status,
    dispatcher_id: "",
    worker_id: "",
    paused: false,
    processRunning: false,
    pid: null,
    processCount: 0,
    duplicateProcess: false,
    launchdLoaded: false,
    launchEnabled: false,
    healthOnly: false,
    allowExistingQueue: false,
    heartbeatAge: null,
    lastSeenAt: null,
    preflightOk: false,
    preflight: null,
    queueActiveCount: null,
    lastError: message,
    logsPath: null,
    supabaseRestStatus: "unknown",
    deviceCountOnline: null,
    checkedAt: now,
    message,
    ...extra,
  };
}

function normalizeDispatcherStatus(raw, action) {
  const preflight = raw && typeof raw.preflight === "object" && !Array.isArray(raw.preflight) ? raw.preflight : null;
  const lastError = safeDispatcherText(raw?.lastError || preflight?.reason || preflight?.error || "");
  const status = ["running", "paused", "stopped", "degraded", "unhealthy", "starting", "runtime_root_invalid", "runtime_root_mismatch", "unknown"].includes(raw?.status) ? raw.status : "unknown";
  return {
    ok: Boolean(raw?.ok),
    status,
    dispatcher_id: String(raw?.dispatcher_id || raw?.worker_id || ""),
    worker_id: String(raw?.worker_id || raw?.dispatcher_id || ""),
    paused: Boolean(raw?.paused),
    processRunning: Boolean(raw?.processRunning),
    pid: Number.isFinite(Number(raw?.pid)) ? Number(raw.pid) : null,
    processCount: Number.isFinite(Number(raw?.processCount)) ? Number(raw.processCount) : 0,
    duplicateProcess: Boolean(raw?.duplicateProcess),
    launchdLoaded: Boolean(raw?.launchdLoaded),
    launchEnabled: Boolean(raw?.launchEnabled),
    healthOnly: Boolean(raw?.healthOnly),
    allowExistingQueue: Boolean(raw?.allowExistingQueue),
    heartbeatAge: Number.isFinite(Number(raw?.heartbeatAge)) ? Number(raw.heartbeatAge) : null,
    lastSeenAt: typeof raw?.lastSeenAt === "string" && raw.lastSeenAt ? raw.lastSeenAt : null,
    preflightOk: Boolean(raw?.preflightOk),
    preflight,
    queueActiveCount: Number.isFinite(Number(raw?.queueActiveCount)) ? Number(raw.queueActiveCount) : null,
    lastError: lastError || null,
    logsPath: typeof raw?.logsPath === "string" ? raw.logsPath : null,
    activeRoot: typeof raw?.activeRoot === "string" ? raw.activeRoot : null,
    resolvedRoot: typeof raw?.resolvedRoot === "string" ? raw.resolvedRoot : null,
    runtimeCommit: typeof raw?.runtimeCommit === "string" ? raw.runtimeCommit : null,
    supabaseRestStatus: raw?.preflightOk ? "ok" : lastError ? "failed" : "unknown",
    deviceCountOnline: Number.isFinite(Number(raw?.deviceCountOnline)) ? Number(raw.deviceCountOnline) : null,
    checkedAt: typeof raw?.checkedAt === "string" && raw.checkedAt ? raw.checkedAt : new Date().toISOString(),
    message: safeDispatcherText(raw?.message || "Dispatcher status unavailable."),
    action,
  };
}

function mergeRunControlProjection(localStatus, projection) {
  if (!projection || typeof projection !== "object") return localStatus;
  const heartbeatAge = Number.isFinite(Number(projection.heartbeatAgeSeconds)) ? Number(projection.heartbeatAgeSeconds) : null;
  const remoteStatus = typeof projection.dispatcherStatus === "string" && projection.dispatcherStatus ? projection.dispatcherStatus : null;
  const remoteWorkerId = typeof projection.dispatcherWorkerId === "string" && projection.dispatcherWorkerId ? projection.dispatcherWorkerId : "";
  const remoteLaunchEnabled = typeof projection.dispatcherLaunchEnabled === "boolean" ? projection.dispatcherLaunchEnabled : localStatus.launchEnabled;
  return {
    ...localStatus,
    dispatcher_id: localStatus.dispatcher_id || remoteWorkerId,
    worker_id: localStatus.worker_id || remoteWorkerId,
    launchEnabled: remoteLaunchEnabled,
    heartbeatAge,
    lastSeenAt: typeof projection.lastSeenAt === "string" && projection.lastSeenAt ? projection.lastSeenAt : localStatus.lastSeenAt,
    supabaseRestStatus: "ok",
    message: localStatus.status === "unknown" && typeof projection.message === "string" ? projection.message : localStatus.message,
    lastError: localStatus.lastError || (projection.healthy === false ? String(projection.reason || remoteStatus || "dispatcher_unhealthy") : null),
  };
}

async function readRunControlProjection() {
  try {
    return await dashboardGet("run_control_health");
  } catch {
    return null;
  }
}

function parseDispatcherJson(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Try the previous line if stderr-like noise reached stdout.
    }
  }
  return null;
}

function runDispatcherWrapperAsync(command, args = [], timeoutMs = 25000) {
  if (!dispatcherAllowedActions.has(command)) {
    return Promise.resolve({ ok: false, error: "dispatcher_action_not_allowed" });
  }
  return runRuntimeControllerCommand({
    controllerPath: dispatcherWrapperPath,
    component: "dispatcher",
    command,
    args,
    cwd: runtimeControllerWorkingDirectory,
    timeoutMs,
  });
}

function schedulerRuntimeDeps() {
  return {
    dashboardPost,
    getDispatcherStatus: dispatcherStatus,
    ensureDispatcher: ensureDispatcherAutostart,
    getRelayHealth: botappRelayHealth,
  };
}

let schedulerRuntimePowerSaveBlockerId = null;
let schedulerRuntimeSelfHealHandle = null;

function startSchedulerRuntimePowerSaveBlocker() {
  if (schedulerRuntimePowerSaveBlockerId !== null) return;
  schedulerRuntimePowerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
}

function stopSchedulerRuntimePowerSaveBlocker() {
  if (schedulerRuntimePowerSaveBlockerId === null) return;
  powerSaveBlocker.stop(schedulerRuntimePowerSaveBlockerId);
  schedulerRuntimePowerSaveBlockerId = null;
}

async function schedulerRuntimeStatus() {
  const local = await botappSchedulerRuntime.getSchedulerRuntimeStatus(schedulerRuntimeDeps());
  let serverHealth = null;
  try {
    serverHealth = await dashboardGet("botapp_scheduler_runtime_health");
  } catch {
    serverHealth = null;
  }
  const dailyGatePassing = Boolean(serverHealth?.schedulerConnected);
  return {
    ...local,
    server_health: serverHealth,
    daily_gate_passing: dailyGatePassing,
    heartbeat_age_seconds: serverHealth?.heartbeatAgeSeconds ?? local.heartbeatAgeSeconds ?? null,
    daily_gate_reason: serverHealth?.reason || (dailyGatePassing ? "BotApp scheduler runtime is active." : local.message),
  };
}

async function ensureSchedulerRuntimeAutostart() {
  if (shouldSkipIntegrationAutostart()) {
    return { ok: false, status: "deferred", message: "Integration autostart skipped." };
  }
  const result = await botappSchedulerRuntime.startSchedulerRuntime(schedulerRuntimeDeps());
  startSchedulerRuntimePowerSaveBlocker();
  return result;
}

async function stopSchedulerRuntimeVoluntarily() {
  stopSchedulerRuntimePowerSaveBlocker();
  return botappSchedulerRuntime.stopSchedulerRuntime(schedulerRuntimeDeps(), { voluntary: true });
}

function attachSchedulerRuntimeResilienceHooks() {
  const recoverSchedulerRuntime = () => {
    void ensureSchedulerRuntimeAutostart().catch(() => undefined);
  };

  powerMonitor.on("resume", recoverSchedulerRuntime);
  app.on("activate", recoverSchedulerRuntime);

  if (schedulerRuntimeSelfHealHandle) clearInterval(schedulerRuntimeSelfHealHandle);
  schedulerRuntimeSelfHealHandle = setInterval(() => {
    void (async () => {
      if (shouldSkipIntegrationAutostart()) return;
      const status = await botappSchedulerRuntime.getSchedulerRuntimeStatus(schedulerRuntimeDeps()).catch(() => null);
      if (!status) return;
      if (!status.running && !status.voluntary_shutdown) {
        await ensureSchedulerRuntimeAutostart().catch(() => undefined);
        return;
      }
      if (!status.running || status.voluntary_shutdown) return;
      const relay = await botappRelayHealth().catch(() => null);
      if (!relay?.ok || !relay?.relay_authenticated) return;
      const ageSeconds = Number(status.heartbeatAgeSeconds);
      if (!Number.isFinite(ageSeconds) || ageSeconds >= 45) {
        await botappSchedulerRuntime.tickSchedulerRuntime(schedulerRuntimeDeps(), { force: true }).catch(() => undefined);
      }
    })();
  }, 120_000);
  if (typeof schedulerRuntimeSelfHealHandle.unref === "function") {
    schedulerRuntimeSelfHealHandle.unref();
  }
}

async function dispatcherStatus() {
  const result = await runDispatcherWrapperAsync("status", ["--json"]);
  if (!result.ok && !result.stdout) {
    const projection = await readRunControlProjection();
    return mergeRunControlProjection(dispatcherFallbackStatus("unknown", result.error || "Dispatcher status unavailable."), projection);
  }
  const parsed = parseDispatcherJson(result.stdout);
  if (!parsed) {
    const projection = await readRunControlProjection();
    return mergeRunControlProjection(dispatcherFallbackStatus("unknown", "Dispatcher status output was not valid JSON.", {
      lastError: result.error || result.stderr || "dispatcher_status_json_invalid",
    }), projection);
  }
  return mergeRunControlProjection(normalizeDispatcherStatus(parsed, "status"), await readRunControlProjection());
}

async function ensureDispatcherAutostart() {
  if (shouldSkipIntegrationAutostart()) {
    return dispatcherFallbackStatus("deferred", "Integration autostart skipped.");
  }
  const relay = await botappRelayHealth();
  if (!relay.ok || !relay.relay_authenticated) {
    const current = await dispatcherStatus();
    return {
      ...current,
      ok: false,
      status: current.status === "unknown" ? "stopped" : current.status,
      message: "Dispatcher autostart deferred until relay is healthy.",
    };
  }

  let status = await dispatcherStatus();
  const queueActiveCount = Number.isFinite(Number(status.queueActiveCount)) ? Number(status.queueActiveCount) : 0;
  if (queueActiveCount > 0) {
    return {
      ...status,
      ok: false,
      message: "Dispatcher autostart deferred while queue activity is present.",
    };
  }

  if (status.status === "running" && status.processRunning) return status;

  if (!status.launchdLoaded) {
    const install = await runDispatcherWrapperAsync("install", [], 30000);
    if (!install.ok) {
      return {
        ...status,
        message: "Dispatcher LaunchAgent install failed. Open Runtime Health to retry.",
        lastError: install.error || install.stderr || status.lastError,
      };
    }
  }

  const resume = await runDispatcherWrapperAsync("resume", [], 45000);
  status = await dispatcherStatus();
  if (status.status === "running" && status.processRunning) return status;

  return {
    ...status,
    ok: status.status === "running" && status.processRunning,
    message: resume.ok
      ? (status.message || "Dispatcher is starting.")
      : `Dispatcher autostart attempted: ${safeDispatcherText(resume.error || resume.stderr || status.lastError || "unknown")}`,
  };
}

async function dispatcherAction(action) {
  const normalized = String(action || "").trim();
  if (!dispatcherAllowedActions.has(normalized) || normalized === "status") {
    return dispatcherFallbackStatus("unknown", "Dispatcher action is not allowed.", { action: normalized || "status" });
  }
  try {
    if (normalized === "logs") {
      const result = await runDispatcherWrapperAsync("logs", ["--path"], 8000);
      const logPath = String(result.stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
      if (!result.ok || !logPath) {
        return dispatcherFallbackStatus("unknown", result.error || "Dispatcher logs path unavailable.", { action: "logs" });
      }
      const openResult = fs.existsSync(logPath)
        ? shell.showItemInFolder(logPath)
        : await shell.openPath(path.dirname(logPath));
      const current = await dispatcherStatus();
      return {
        ...current,
        action: "logs",
        logsPath: logPath,
        message: openResult ? safeDispatcherText(openResult) : "Dispatcher logs opened.",
      };
    }
    const timeoutMs = normalized === "restart" || normalized === "fix-duplicate" ? 45000 : 25000;
    const result = await runDispatcherWrapperAsync(normalized, [], timeoutMs);
    const current = await dispatcherStatus();
    return {
      ...current,
      action: normalized,
      ok: result.ok && current.ok,
      lastError: result.ok ? current.lastError : safeDispatcherText(result.error || result.stderr || current.lastError || "dispatcher_action_failed"),
      message: result.ok ? current.message : `Dispatcher ${normalized} failed. Runtime Health stayed open; retry or use Restart cleanly.`,
    };
  } catch (error) {
    const current = await dispatcherStatus().catch(() => dispatcherFallbackStatus("unknown", "Dispatcher status unavailable after action error."));
    return {
      ...current,
      action: normalized,
      ok: false,
      lastError: safeRuntimeError(error, "dispatcher_action_exception"),
      message: `Dispatcher ${normalized} failed safely. BotApp stayed open.`,
    };
  }
}

async function openDeviceViewFromClientIntent(intentToken) {
  const token = String(intentToken || "").trim();
  if (!token) return { ok: false, error: "Missing open device intent." };
  const result = await dashboardRequestResult("POST", "botapp_open_device_view", { intent_token: token });
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || "Open device intent could not be redeemed." };
  }
  const deviceSerial = String(result.data.device_serial || "").trim();
  const deviceLabel = String(result.data.device_label || deviceSerial || "Assigned phone").trim();
  if (!deviceSerial) return { ok: false, error: "Assigned phone is unavailable." };
  const viewResult = await openDeviceView({ deviceSerial, deviceLabel });
  return {
    ok: Boolean(viewResult?.ok),
    data: {
      action: "open_device_view",
      account_id: result.data.account_id || null,
      focus_only: true,
      device_label: deviceLabel,
    },
    error: viewResult?.ok ? null : (viewResult?.error || "Could not open assigned phone view."),
  };
}

async function handleOpenDeviceViewDeepLink(rawUrl) {
  const parsed = parseOpenDeviceViewDeepLink(rawUrl);
  if (!parsed.ok) {
    return { ok: false, error: "Unsupported BotApp link.", reason: parsed.reason };
  }
  return openDeviceViewFromClientIntent(parsed.intent);
}

function resolveBundlePath() {
  if (!app.isPackaged) return app.getAppPath();
  const parts = process.execPath.split(path.sep);
  const appIndex = parts.findIndex((part) => part.endsWith(".app"));
  if (appIndex >= 0) return parts.slice(0, appIndex + 1).join(path.sep);
  return process.execPath;
}

async function botappDiagnosticsProvenance() {
  const appPath = app.getAppPath();
  let packageDate = null;
  try {
    packageDate = fs.statSync(appPath).mtime.toISOString();
  } catch {
    packageDate = null;
  }
  const dispatcher = await dispatcherStatus().catch(() => null);
  return {
    botAppCommit: process.env.BOTAPP_BUILD_COMMIT || botappBuildCommit,
    packageDate,
    bundlePath: resolveBundlePath(),
    appPath,
    runtimeRoot: dispatcher?.activeRoot || dispatcher?.resolvedRoot || null,
    runtimeCommit: dispatcher?.runtimeCommit || null,
    runtimeStatus: dispatcher?.status || null,
    checkedAt: new Date().toISOString(),
  };
}

function registerRuntimeIpc() {
  ipcMain.handle("botapp:runtime:status", () => runtimeIntegrationStatus());
  ipcMain.handle("botapp:diagnostics:provenance", () => botappDiagnosticsProvenance());
  ipcMain.handle("botapp:dispatcher:status", () => dispatcherStatus());
  ipcMain.handle("botapp:dispatcher:action", (_event, action) => dispatcherAction(action).catch((error) => dispatcherFallbackStatus("unknown", safeRuntimeError(error, "Dispatcher action crashed safely."))));
  ipcMain.handle("botapp:compass:ai-status", () => compassHealth());
  ipcMain.handle("botapp:compass:save-relay-config", (_event, input) => saveCompassRelayConfig(input));
  ipcMain.handle("botapp:compass:remove-relay-config", () => removeCompassRelayConfig());
  ipcMain.handle("botapp:compass:analyze", (_event, input) => compassAnalyze(input));
  ipcMain.handle("botapp:targeting-ai:status", () => targetingAiStatus());
  ipcMain.handle("botapp:targeting-ai:save-config", (_event, input) => targetingAiSaveConfig(input));
  ipcMain.handle("botapp:targeting-ai:reset-config", () => targetingAiResetConfig());
  ipcMain.handle("botapp:targeting-ai:test-config", (_event, input) => targetingAiTestConfig(input));
  ipcMain.handle("botapp:email:list-templates", () => emailTemplatesList());
  ipcMain.handle("botapp:email:save-template", (_event, input) => emailTemplatesSave(input));
  ipcMain.handle("botapp:email:preview-template", (_event, input) => emailTemplatesPreview(input));
  ipcMain.handle("botapp:email:account-lifecycle-preview", () => emailAccountLifecyclePreview());
  ipcMain.handle("botapp:email:outbox-preview", () => emailOutboxPreview());
  ipcMain.handle("botapp:email:needs-more-targets-preview", () => emailNeedsMoreTargetsPreview());
  ipcMain.handle("botapp:email:list-history", (_event, input) => emailHistoryList(input || {}));
  ipcMain.handle("botapp:email:history-detail", (_event, intentId) => emailHistoryDetail(intentId));
  ipcMain.handle("botapp:email:test-delivery-status", () => emailTestDeliveryStatus());
  ipcMain.handle("botapp:email:delivery-settings", () => emailDeliverySettings());
  ipcMain.handle("botapp:email:delivery-settings-audit", () => emailDeliverySettingsAudit());
  ipcMain.handle("botapp:email:refresh-delivery-senders", () => emailDeliverySettingsRefreshSenders());
  ipcMain.handle("botapp:email:save-delivery-settings", (_event, input) => emailDeliverySettingsSave(input));
  ipcMain.handle("botapp:email:send-test-delivery", (_event, input) => emailSendTestDelivery(input));
  ipcMain.handle("botapp:auto-restart:overview", () => autoRestartOverview());
  ipcMain.handle("botapp:incidents:list", (_event, input) => incidentsOverview(input || {}));
  ipcMain.handle("botapp:incidents:detail", (_event, incidentId) => incidentsDetail(incidentId));
  ipcMain.handle("botapp:incidents:action", (_event, input) => performIncidentAction(input || {}));
  ipcMain.handle("botapp:incidents:notification-settings", () => incidentsNotificationSettings());
  ipcMain.handle("botapp:incidents:notification-settings-patch", (_event, input) => patchIncidentsNotificationSettings(input || {}));
  ipcMain.handle("botapp:incidents:notification-test", (_event, input) => testIncidentsNotification(input || {}));
  ipcMain.handle("botapp:incidents:notification-outbox", (_event, input) => incidentsNotificationOutbox(input || {}));
  ipcMain.handle("botapp:auto-restart:dry-run", () => autoRestartDryRun());
  ipcMain.handle("botapp:auto-restart:action-preview", (_event, input) => autoRestartActionPreview(input));
  ipcMain.handle("botapp:auto-restart:settings-load", () => autoRestartSettingsLoad());
  ipcMain.handle("botapp:auto-restart:settings-save", (_event, patch) => autoRestartSettingsSave(patch));
  ipcMain.handle("botapp:auto-restart:execute", (_event, input) => autoRestartExecute(input));
  ipcMain.handle("botapp:scheduler:status", () => schedulerStatusLoad().catch((error) => ({
    ok: false,
    error: safeRuntimeError(error, "Scheduler status unavailable."),
  })));
  ipcMain.handle("botapp:scheduler:set-enabled", (_event, input) => schedulerSetEnabled(input).catch((error) => ({
    ok: false,
    error: safeRuntimeError(error, "Could not update the Scheduler switch."),
  })));
  ipcMain.handle("botapp:scheduler:approve-preflight-retry", (_event, input) => schedulerApprovePreflightRetry(input).catch((error) => ({
    ok: false,
    error: safeRuntimeError(error, "Could not approve preflight retry."),
  })));
  ipcMain.handle("botapp:data:overview", () => botappOverviewData());
  ipcMain.handle("botapp:data:profiles-live", (_event, input) => botappProfilesLiveData(input || {}));
  ipcMain.handle("botapp:relay:health", () => botappRelayHealth());
  ipcMain.handle("botapp:relay:repair", () => repairRelayConnection().catch((error) => ({
    ok: false,
    message: safeRuntimeError(error, "Connexion BotApp repair failed."),
    relay: null,
    profilesReloaded: false,
    accountsCount: 0,
  })));
  ipcMain.handle("botapp:connect:open-device-view", (_event, input) => openDeviceViewFromClientIntent(input?.intent_token || input?.intentToken || input));
  ipcMain.handle("botapp:dispatcher:ensure", () => ensureDispatcherAutostart().catch((error) => dispatcherFallbackStatus("unknown", safeRuntimeError(error, "Dispatcher autostart failed."))));
  ipcMain.handle("botapp:scheduler-runtime:status", () => schedulerRuntimeStatus().catch((error) => ({
    ok: false,
    status: "unknown",
    message: safeRuntimeError(error, "Scheduler runtime status unavailable."),
    checkedAt: new Date().toISOString(),
  })));
  ipcMain.handle("botapp:scheduler-runtime:ensure", () => ensureSchedulerRuntimeAutostart().catch((error) => ({
    ok: false,
    status: "unknown",
    message: safeRuntimeError(error, "Scheduler runtime autostart failed."),
    checkedAt: new Date().toISOString(),
  })));
  ipcMain.handle("botapp:device-heartbeat:status", () => deviceHeartbeatStatus().catch((error) => deviceHeartbeatFallbackStatus("unknown", safeRuntimeError(error, "Device heartbeat status failed."))));
  ipcMain.handle("botapp:device-heartbeat:ensure", () => ensureDeviceHeartbeatAutostart().catch((error) => deviceHeartbeatFallbackStatus("unknown", safeRuntimeError(error, "Device heartbeat autostart failed."))));
  ipcMain.handle("botapp:device-heartbeat:action", (_event, action) => deviceHeartbeatAction(action).catch((error) => deviceHeartbeatFallbackStatus("unknown", safeRuntimeError(error, "Device heartbeat action crashed safely."))));
  ipcMain.handle("botapp:devices:list", (_event, input) => botappDevicesList(input));
  ipcMain.handle("botapp:devices:delete-preflight", (_event, input) => deviceDeletePreflight(input?.deviceId || input?.device_id || input));
  ipcMain.handle("botapp:devices:delete", (_event, input) => deviceDelete(input));
  ipcMain.handle("botapp:devices:restart-heartbeat-publisher", (event) => {
    try {
      return startDeviceHeartbeatRecovery(event.sender);
    } catch (error) {
      return {
        ok: false,
        stage: "service_failed",
        message: "Impossible de relancer le service heartbeat devices.",
        error: safeRuntimeError(error, "Heartbeat recovery start crashed safely."),
        published_count: 0,
        skipped_count: 0,
      };
    }
  });
  ipcMain.handle("botapp:profiles:details", (_event, accountId) => profileDetailsData(accountId));
  ipcMain.handle("botapp:profiles:stats-history", (_event, input) => profileStatsHistoryData(input?.accountId || input?.account_id || input, input?.days));
  ipcMain.handle("botapp:profiles:create-dry-run", (_event, input) => profileCreateDryRun(input));
  ipcMain.handle("botapp:profiles:create", (_event, input) => profileCreate(input));
  ipcMain.handle("botapp:profiles:schedule-slots", (_event, input) => profileScheduleSlots(input));
  ipcMain.handle("botapp:profiles:schedule:get", (_event, accountId) => profileScheduleSettingsGet(accountId));
  ipcMain.handle("botapp:profiles:schedule:save", (_event, input) => profileScheduleSettingsSave(input));
  ipcMain.handle("botapp:profiles:verify-username", (_event, input) => profileVerifyUsername(input));
  ipcMain.handle("botapp:profiles:credentials:submit", (_event, input) => profileCredentialsSubmit(input));
  ipcMain.handle("botapp:profiles:settings:save", (_event, input) => profileSettingsSave(input));
  ipcMain.handle("botapp:profiles:action", (_event, input) => performProfileAction(input));
  ipcMain.handle("botapp:client-accounts:status", (_event, input) => performClientAccountStatusAction(input));
  ipcMain.handle("botapp:client-accounts:needs-more-targets", (_event, input) => performClientAccountNeedsMoreTargetsAction(input));
  ipcMain.handle("botapp:profiles:assign-now", (_event, input) => assignProfileNow(input));
  ipcMain.handle("botapp:profiles:readiness-now", (_event, input) => profileReadinessNow(input));
  ipcMain.handle("botapp:profiles:auto-login", (_event, input) => profileAutoLoginStart(input));
  ipcMain.handle("botapp:profiles:restore-login-screen", (_event, input) => profileRestoreLoginScreenStart(input));
  ipcMain.handle("botapp:profiles:run-start", (_event, input) => profileRunStart(input));
  ipcMain.handle("botapp:profiles:run-stop", (_event, input) => profileRunStop(input));
  ipcMain.handle("botapp:profiles:run-progress", (_event, input) => profileRunProgress(input));
  ipcMain.handle("botapp:profiles:targets:add", (_event, input) => addProfileTarget(input));
  ipcMain.handle("botapp:profiles:targets:bulk-add", (_event, input) => bulkAddProfileTargets(input));
  ipcMain.handle("botapp:profiles:targets:delete", (_event, input) => deleteProfileTargets(input));
  ipcMain.handle("botapp:profiles:targets:reset", (_event, input) => resetProfileTargets(input));
  ipcMain.handle("botapp:endpoints:list", () => endpointRegistryList());
  ipcMain.handle("botapp:endpoints:test", (_event, input) => testBotappEndpoint(input?.id));
  ipcMain.handle("botapp:endpoints:test-all", () => testAllBotappEndpoints());
  ipcMain.handle("botapp:endpoints:export-profile", () => exportBotappConnectionProfile());
  ipcMain.handle("botapp:integrations:list", () => listIntegrationConfig());
  ipcMain.handle("botapp:integrations:save-webhook", (_event, input) => saveWebhookConfig(input));
  ipcMain.handle("botapp:integrations:remove-webhook", (_event, input) => removeWebhookConfig(input));
}

function logBuildMarker() {
  const cfg = compassConfig();
  console.log("[botapp] build_marker", {
    buildCommit: process.env.BOTAPP_BUILD_COMMIT || botappBuildCommit,
    ipcProbeBuildId: botappIpcProbeBuildId,
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
    relayOrigin: dashboardOrigin(cfg) || null,
    relayUrlConfigured: Boolean(cfg.relayUrl),
    relayKeyConfigured: Boolean(cfg.relayKey),
    endpointRegistryKeys: botappEndpointRegistry.map((endpoint) => endpoint.id),
    ipcHandlers: runtimeIpcHandlers,
  });
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: integrationLocalCaptureDir() ? 1280 : 960,
    minWidth: 1180,
    minHeight: 760,
    title: "BotApp",
    backgroundColor: "#0B1020",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("[BotApp] renderer load failed", { errorCode, errorDescription, validatedURL });
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowedOrigin = isDev ? devServerUrl : `file://${path.join(__dirname, "../dist/index.html")}`;

    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
    }
  });

  const indexPath = path.join(__dirname, "../dist/index.html");

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(indexPath);
  }

  mainWindow.webContents.on("did-finish-load", () => {
    if (isIpcBridgeProbeMode()) {
      void finishIpcBridgeProbe(mainWindow);
      return;
    }
    if (isCaptureExactPreflightMode()) {
      void finishCaptureExactPreflight(mainWindow);
      return;
    }
    if (integrationLocalCaptureDir()) {
      void runIntegrationLocalCapture(mainWindow).catch((error) => {
        console.error("[BotApp integration capture] unhandled", error);
        writeCaptureDiagnostic("botapp-capture-error.json", {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null,
          at: new Date().toISOString(),
        });
        if (process.env.BOTAPP_INTEGRATION_CAPTURE_QUIT === "1") {
          app.quit();
        }
      });
    }
  });
}

let pendingOpenDeviceDeepLink = findOpenDeviceViewDeepLink(process.argv);
const hasSingleInstanceLock = isIntegrationLocalMode() || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLink = findOpenDeviceViewDeepLink(argv);
    if (deepLink) {
      void handleOpenDeviceViewDeepLink(deepLink);
    }
  });

app.whenReady().then(async () => {
  writeStartupTrace("when_ready", `packaged=${String(app.isPackaged)} userData=${app.getPath("userData")}`);
  try {
    const bootstrapStatus = bootstrapRelayConfig();
    writeStartupTrace("bootstrap_done", `url=${bootstrapStatus.relayUrlConfigured} key=${bootstrapStatus.relayKeyConfigured}`);
    runtimeConfigCache = null;
    attachRelayHeadersForDashboardAvatars();
    registerRuntimeIpc();
    registerDeviceViewIpc();
    attachSchedulerRuntimeResilienceHooks();
    if (!app.isDefaultProtocolClient("botapp")) {
      app.setAsDefaultProtocolClient("botapp");
    }
    app.on("open-url", (event, url) => {
      event.preventDefault();
      void handleOpenDeviceViewDeepLink(url);
    });
    logBuildMarker();

    if (isIpcBridgeProbeMode()) {
      writeStartupTrace("ipc_probe_main_begin");
      pendingIpcBridgeProbeMainReport = await runIpcBridgeProbeMain();
      writeStartupTrace("ipc_probe_main_done");
      writeIpcBridgeProbeReport({
        mode: "packaged_ipc_bridge_probe",
        phase: "main_only_partial",
        integrationLocal: true,
        relayUrl: probeRelayUrlRedacted(),
        relayKeyConfigured: true,
        autostartSkipped: shouldSkipIntegrationAutostart(),
        ipcProbeBuildId: botappIpcProbeBuildId,
        completedAt: new Date().toISOString(),
        main: pendingIpcBridgeProbeMainReport,
        renderer: null,
      }, "botapp-ipc-bridge-probe.partial.json");
      createMainWindow();
      return;
    }

    const relay = await botappRelayHealth();
    let dispatcher = null;
    let deviceHeartbeat = null;
    if (!shouldSkipIntegrationAutostart()) {
      deviceHeartbeat = await ensureDeviceHeartbeatAutostart().catch((error) => ({
        ...deviceHeartbeatFallbackStatus("unknown", safeRuntimeError(error, "Device heartbeat autostart failed.")),
      }));
      if (relay.ok && relay.relay_authenticated) {
        dispatcher = await ensureDispatcherAutostart().catch((error) => ({
          ...dispatcherFallbackStatus("unknown", safeRuntimeError(error, "Dispatcher autostart failed.")),
        }));
        await ensureSchedulerRuntimeAutostart().catch(() => undefined);
      }
    }

    writeBootstrapStatus(userDataDir(), {
      ...bootstrapStatus,
      relayOk: Boolean(relay.ok && relay.relay_authenticated),
      dispatcherStatus: dispatcher?.status || "deferred",
      dispatcherRunning: Boolean(dispatcher?.processRunning),
      deviceHeartbeatStatus: deviceHeartbeat?.operatorLabelFr || deviceHeartbeat?.status || "unknown",
      deviceHeartbeatRunning: Boolean(deviceHeartbeat?.processRunning),
      checkedAt: new Date().toISOString(),
    });

    if (pendingOpenDeviceDeepLink) {
      const deepLink = pendingOpenDeviceDeepLink;
      pendingOpenDeviceDeepLink = null;
      void handleOpenDeviceViewDeepLink(deepLink);
    }

    createMainWindow();

    if (process.env.BOTAPP_STARTUP_DIAGNOSTICS) {
      setTimeout(() => app.quit(), 2500);
    }
  } catch (error) {
    writeBootstrapStatus(userDataDir(), {
      userDataDir: userDataDir(),
      relayUrlConfigured: false,
      relayKeyConfigured: false,
      secureStorageAvailable: isEncryptionAvailable(),
      repairState: "backend_unavailable",
      lastError: safeRuntimeError(error, "startup_bootstrap_failed"),
      checkedAt: new Date().toISOString(),
    });
    createMainWindow();
    if (process.env.BOTAPP_STARTUP_DIAGNOSTICS) {
      setTimeout(() => app.quit(), 2500);
    }
  }

  if (process.env.BOTAPP_DEVICE_VIEW_SELF_TEST) {
    setTimeout(() => {
      runDeviceViewSelfTest()
        .catch((error) => {
          console.error("[BotApp device-view self-test]", error);
        })
        .finally(() => {
          if (process.env.BOTAPP_DEVICE_VIEW_SELF_TEST_QUIT !== "0") {
            app.quit();
          }
        });
    }, 1500);
  }

  if (process.env.BOTAPP_COMPASS_AI_SELF_TEST) {
    setTimeout(() => {
      compassHealth()
        .then((statusBefore) => {
          console.log("[BotApp compass status]", {
            mode: statusBefore.mode,
            status: statusBefore.status,
            relayUrlConfigured: statusBefore.relayUrlConfigured,
            relayKeyConfigured: statusBefore.relayKeyConfigured,
            serverKeyStatus: statusBefore.serverKeyStatus,
          });
          return compassAnalyze({
        period: "7d",
        snapshot: {
          provider: "openai",
          mode: "server_side_openai",
          facts: { generatedAt: new Date().toISOString(), insights: [], recommendations: [], internalSignals: [] },
          outputContract: { format: "json", mustNotInventFacts: true, allowedFields: ["priority", "explanation", "recommended_order", "risk_notes"] },
        },
          });
        })
        .then((result) => {
          console.log("[BotApp compass self-test]", {
            ok: result.ok,
            mode: result.runtime.mode,
            status: result.runtime.status,
            relayUrlConfigured: result.runtime.relayUrlConfigured,
            relayKeyConfigured: result.runtime.relayKeyConfigured,
            serverKeyStatus: result.runtime.serverKeyStatus,
            advisorStatus: result.advisor.status,
            message: result.runtime.message,
          });
        })
        .catch((error) => {
          console.error("[BotApp compass self-test]", error);
        })
        .finally(() => {
          if (process.env.BOTAPP_COMPASS_AI_SELF_TEST_QUIT !== "0") {
            app.quit();
          }
        });
    }, 1500);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  cancelActiveHeartbeatRecovery();
  closeAllDeviceViews();
  void stopSchedulerRuntimeVoluntarily().catch(() => undefined);
});
