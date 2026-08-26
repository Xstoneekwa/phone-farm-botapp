/* global module, setTimeout */

const electron = require("electron");
const { spawn, spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const { localToolDiagnostics, resolveAdbPath, resolveScrcpyPath } = require("./local-tools.cjs");

const isElectronRuntime = typeof electron !== "string";
const BrowserWindow = isElectronRuntime ? electron.BrowserWindow : { getAllWindows: () => [] };
const ipcMain = isElectronRuntime ? electron.ipcMain : { handle: () => undefined };
const screen = isElectronRuntime ? electron.screen : null;

const IPC_CHANNELS = {
  open: "botapp:device-views:open",
  focus: "botapp:device-views:focus",
  close: "botapp:device-views:close",
  list: "botapp:device-views:list",
  state: "botapp:device-views:state",
};

const STARTUP_VERIFY_MS = 1800;
const STDERR_TAIL_MAX = 400;
const SCRCPY_WINDOW_ASPECT_RATIO = 9 / 16;
const SCRCPY_WINDOW_MIN_HEIGHT = 650;
const SCRCPY_WINDOW_MAX_HEIGHT = 720;
const FOCUS_ATTEMPT_DELAY_MS = 1000;
const openViews = new Map();
const openingDeviceViews = new Set();
const closingDeviceViews = new Set();

function safeSerial(value) {
  return String(value || "").trim();
}

function parseDeviceSerialMap(value = process.env.BOTAPP_DEVICE_SERIAL_MAP || "") {
  const entries = new Map();
  for (const chunk of String(value).split(",")) {
    const [rawSource, rawTarget, ...extra] = chunk.split(":");
    if (extra.length > 0) continue;
    const source = safeSerial(rawSource);
    const target = safeSerial(rawTarget);
    if (!source || !target) continue;
    entries.set(source, target);
  }
  return entries;
}

function resolveDeviceSerialForScrcpy(deviceSerial) {
  const serial = safeSerial(deviceSerial);
  return parseDeviceSerialMap().get(serial) || serial;
}

function safeLabel(value, fallback) {
  return String(value || fallback || "Phone").trim().slice(0, 80);
}

function maskSerialForTitle(serial) {
  const value = safeSerial(serial);
  if (!value) return "unknown";
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function windowTitleFor(deviceLabel, deviceSerial) {
  return `BotApp Phone View · ${safeLabel(deviceLabel, deviceSerial)} · ${maskSerialForTitle(deviceSerial)}`;
}

function readAdbDeviceState(serial) {
  const adb = resolveAdbPath();
  if (!adb.ok) return { ok: false, reason: "adb_unavailable", state: "adb_unavailable", adbPath: null };
  spawnSync(adb.path, ["start-server"], { encoding: "utf8", stdio: "pipe", timeout: 3500 });
  const result = spawnSync(adb.path, ["devices", "-l"], { encoding: "utf8", stdio: "pipe", timeout: 2500 });
  if (result.error || result.status !== 0) {
    return { ok: false, reason: "adb_unavailable", state: "adb_unavailable", adbPath: adb.path };
  }
  for (const line of String(result.stdout || "").split(/\r?\n/).slice(1)) {
    const [deviceSerial, state] = line.trim().split(/\s+/);
    if (deviceSerial === serial) return { ok: true, reason: null, state: state || "unknown", adbPath: adb.path };
  }
  return { ok: false, reason: "adb_device_not_found", state: "not_seen", adbPath: adb.path };
}

function classifyScrcpyFailure(stderr, exitCode, adbState) {
  const text = String(stderr || "").toLowerCase();
  if (adbState === "unauthorized") return "device_unauthorized";
  if (adbState === "offline") return "device_offline";
  if (adbState === "not_seen") return "adb_device_not_found";
  if (text.includes("unauthorized")) return "device_unauthorized";
  if (text.includes("offline")) return "device_offline";
  if (text.includes("could not find") || text.includes("not found") || text.includes("no device")) {
    return "adb_device_not_found";
  }
  if (text.includes("command not found") || text.includes("enoent")) return "scrcpy_not_found";
  if (exitCode != null) return "process_exited";
  return "unknown_error";
}

function formatOpenError(reason, stderr) {
  const tail = String(stderr || "").trim().slice(-STDERR_TAIL_MAX);
  const base = {
    scrcpy_not_found: "scrcpy is not installed or not available in PATH.",
    adb_unavailable: "ADB is not installed or not available in PATH.",
    adb_device_not_found: "ADB does not see this phone serial.",
    device_unauthorized: "Phone is connected but unauthorized. Accept the USB debugging prompt.",
    device_offline: "Phone is offline in ADB.",
    process_exited: "scrcpy exited immediately after launch.",
    window_focus_failed: "scrcpy started but the window could not be brought to the front.",
    unknown_error: "Could not open phone view.",
  }[reason] || "Could not open phone view.";
  return tail ? `${base} ${tail}` : base;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function visibleBotAppWindows() {
  return BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed() && window.isVisible());
}

function activeBotAppWindow() {
  if (!isElectronRuntime) return null;
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  return visibleBotAppWindows()[0] || null;
}

function compactPhoneWindowDimensions(workArea) {
  const widthBase = Math.max(1, Number(workArea?.width) || 1);
  const heightBase = Math.max(1, Number(workArea?.height) || 1);
  const maxHeight = Math.max(1, Math.min(SCRCPY_WINDOW_MAX_HEIGHT, heightBase - 80));
  const minHeight = Math.max(1, Math.min(SCRCPY_WINDOW_MIN_HEIGHT, maxHeight));
  const targetHeight = clamp(Math.round(heightBase * 0.72), minHeight, maxHeight);
  const targetWidth = Math.round(targetHeight * SCRCPY_WINDOW_ASPECT_RATIO);
  const maxWidth = Math.max(1, widthBase - 80);
  return {
    windowWidth: clamp(targetWidth, 280, maxWidth),
    windowHeight: targetHeight,
  };
}

function botAppWindowContext(windowIndex = 0) {
  const window = activeBotAppWindow();
  const fallbackWorkArea = { x: 72, y: 64, width: 1440, height: 900 };
  const bounds = window?.getBounds?.() || fallbackWorkArea;
  const workArea = screen?.getDisplayMatching?.(bounds)?.workArea || fallbackWorkArea;
  const dimensions = compactPhoneWindowDimensions(workArea);
  const isFullScreen = Boolean(window?.isFullScreen?.());
  const offset = Number(windowIndex) * 48;
  const preferredRight = bounds.x + bounds.width - dimensions.windowWidth - 40 + offset;
  const preferredLeft = bounds.x + 40 + offset;
  const preferredX = bounds.width >= dimensions.windowWidth + 120 ? preferredRight : preferredLeft;
  const preferredY = bounds.y + 80 + Math.min(offset, Math.max(0, dimensions.windowHeight / 2));
  const maxX = workArea.x + Math.max(0, workArea.width - dimensions.windowWidth);
  const maxY = workArea.y + Math.max(0, workArea.height - dimensions.windowHeight);
  return {
    botAppBounds: bounds,
    workArea,
    botAppFullscreen: isFullScreen,
    sameSpace: "unknown",
    windowX: Math.round(clamp(preferredX, workArea.x, maxX)),
    windowY: Math.round(clamp(preferredY, workArea.y, maxY)),
    windowWidth: dimensions.windowWidth,
    windowHeight: dimensions.windowHeight,
  };
}

function buildScrcpyArgs(scrcpySerial, windowTitle, windowIndex = 0, placement = null) {
  const target = placement || botAppWindowContext(windowIndex);
  const args = [
    "-s", scrcpySerial,
    "--window-title", windowTitle,
    "--window-x", String(target.windowX),
    "--window-y", String(target.windowY),
    "--window-width", String(target.windowWidth),
    "--window-height", String(target.windowHeight),
  ];
  if (process.env.BOTAPP_SCRCPY_ALWAYS_ON_TOP === "1") {
    args.splice(4, 0, "--always-on-top");
  }
  return args;
}

function publicView(entry) {
  return {
    deviceSerial: entry.deviceSerial,
    deviceLabel: entry.deviceLabel,
    status: entry.status,
    pid: entry.process?.pid ?? null,
    windowTitle: entry.windowTitle,
    startedAt: entry.startedAt,
    lastError: entry.lastError ?? null,
    placement: entry.placement ?? null,
  };
}

function listOpenViews() {
  return [...openViews.values()].map(publicView);
}

function listOpenViewsResult() {
  return { ok: true, data: listOpenViews(), tools: localToolDiagnostics() };
}

function emitState() {
  const state = listOpenViews();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.state, state);
    }
  }
}

function escapeAppleScriptString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function runAppleScript(script) {
  try {
    return execFileSync("osascript", ["-e", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 3000,
    }).trim();
  } catch {
    return "";
  }
}

function focusScrcpyByPid(pid) {
  const unixId = Number(pid);
  if (!Number.isFinite(unixId) || unixId <= 0) return "";
  return runAppleScript([
    'tell application "System Events"',
    "  try",
    `    set targetProc to first process whose unix id is ${unixId}`,
    "    set frontmost of targetProc to true",
    '    return "process_pid"',
    "  end try",
    "end tell",
  ].join("\n"));
}

function focusScrcpyWindowByTitle(windowTitle) {
  const escapedTitle = escapeAppleScriptString(windowTitle);
  return runAppleScript([
    'tell application "System Events"',
    '  repeat with proc in (every process whose background only is false)',
    '    try',
    '      if name of proc contains "scrcpy" then',
    '        set frontmost of proc to true',
    '        repeat with win in windows of proc',
    '          set winName to name of win as text',
    `          if winName is "${escapedTitle}" then`,
    '            perform action "AXRaise" of win',
    '            try',
    '              set value of attribute "AXMain" of win to true',
    '            end try',
    '            return "window_title"',
    '          end if',
    '        end repeat',
    '      end if',
    '    end try',
    '  end repeat',
    'end tell',
  ].join("\n"));
}

async function bringScrcpyToFront(windowTitle, pid = null) {
  if (process.platform !== "darwin") {
    return { focusAttempted: false, focused: false, focusMethod: "unsupported_platform" };
  }

  await delay(FOCUS_ATTEMPT_DELAY_MS);
  const byPid = focusScrcpyByPid(pid);
  if (byPid === "process_pid") {
    return { focusAttempted: true, focused: true, focusMethod: byPid };
  }
  const byTitle = focusScrcpyWindowByTitle(windowTitle);
  if (byTitle === "window_title") {
    return { focusAttempted: true, focused: true, focusMethod: byTitle };
  }
  return {
    focusAttempted: true,
    focused: false,
    focusMethod: "none",
  };
}

function openViewResult(entry, focus, extra = {}) {
  const fullscreen = Boolean(entry?.placement?.botAppFullscreen || extra.botAppFullscreen);
  const userMessage = fullscreen
    ? "Phone view opened in another Space because BotApp is fullscreen. Use windowed mode to keep it near BotApp."
    : focus?.focused
    ? `${entry?.deviceLabel || "Phone"} phone view opened.`
    : "Phone view opened. If it is behind BotApp, use Mission Control or move BotApp aside.";
  return {
    ok: true,
    data: listOpenViews(),
    processAlive: true,
    focusAttempted: Boolean(focus?.focusAttempted),
    focused: Boolean(focus?.focused),
    focusMethod: focus?.focusMethod || "none",
    visibleFrontmost: Boolean(focus?.focused),
    sameSpace: entry?.placement?.sameSpace || extra.sameSpace || "unknown",
    botAppFullscreen: fullscreen,
    placement: entry?.placement || extra.placement || null,
    windowTitle: entry?.windowTitle || extra.windowTitle || null,
    command: entry?.command || extra.command || null,
    userMessage,
    tools: localToolDiagnostics(),
    ...extra,
  };
}

function waitForStartup(child, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (alive, exitCode = null, signal = null) => {
      if (settled) return;
      settled = true;
      child.removeListener("close", onClose);
      child.removeListener("error", onError);
      resolve({ alive, exitCode, signal });
    };
    const onClose = (code, signal) => finish(false, code, signal);
    const onError = () => finish(false, null, "spawn_error");
    child.once("close", onClose);
    child.once("error", onError);
    setTimeout(() => finish(!child.killed && child.exitCode == null), ms);
  });
}

async function focusDeviceView(deviceSerial) {
  const serial = safeSerial(deviceSerial);
  const entry = openViews.get(serial);
  if (!entry) {
    return { ok: false, error: "Phone view is not open.", reason: "not_open", data: listOpenViews() };
  }
  const focus = await bringScrcpyToFront(entry.windowTitle, entry.process?.pid ?? null);
  return openViewResult(entry, focus);
}

async function openDeviceView(input) {
  const deviceSerial = safeSerial(input?.deviceSerial);
  if (!deviceSerial) {
    return { ok: false, error: "Missing phone serial.", reason: "missing_serial", data: listOpenViews() };
  }
  if (openingDeviceViews.has(deviceSerial)) {
    return {
      ok: false,
      error: "Phone view is opening.",
      reason: "open_in_progress",
      data: listOpenViews(),
    };
  }
  if (closingDeviceViews.has(deviceSerial)) {
    return {
      ok: false,
      error: "Phone view is closing.",
      reason: "close_in_progress",
      data: listOpenViews(),
    };
  }

  const existing = openViews.get(deviceSerial);
  if (existing) {
    const focus = await bringScrcpyToFront(existing.windowTitle, existing.process?.pid ?? null);
    return openViewResult(existing, focus);
  }

  openingDeviceViews.add(deviceSerial);
  try {
    const scrcpyCommand = resolveScrcpyPath();
    if (!scrcpyCommand.ok) {
      return {
        ok: false,
        error: formatOpenError("scrcpy_not_found", ""),
        reason: "scrcpy_not_found",
        data: listOpenViews(),
        tools: localToolDiagnostics(),
      };
    }

    const scrcpySerial = resolveDeviceSerialForScrcpy(deviceSerial);
    const adb = readAdbDeviceState(scrcpySerial);
    if (!adb.ok || adb.state !== "device") {
      const reason = classifyScrcpyFailure("", null, adb.state);
      return {
        ok: false,
        error: formatOpenError(reason, ""),
        reason,
        data: listOpenViews(),
        tools: localToolDiagnostics(),
      };
    }

    const deviceLabel = safeLabel(input?.deviceLabel, deviceSerial);
    const windowTitle = windowTitleFor(deviceLabel, scrcpySerial);
    const placement = botAppWindowContext(input?.windowIndex ?? 0);
    const args = buildScrcpyArgs(scrcpySerial, windowTitle, input?.windowIndex ?? 0, placement);
    const stderrChunks = [];
    const child = spawn(scrcpyCommand.path, args, {
      detached: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        ADB: adb.adbPath,
      },
    });

    const entry = {
      deviceSerial,
      scrcpySerial,
      deviceLabel,
      process: child,
      status: "starting",
      windowTitle,
      placement,
      startedAt: new Date().toISOString(),
      lastError: null,
      command: `${scrcpyCommand.path} ${args.join(" ")}`,
    };

    child.stderr?.on("data", (chunk) => {
      stderrChunks.push(String(chunk));
      while (stderrChunks.join("").length > STDERR_TAIL_MAX * 2 && stderrChunks.length) {
        stderrChunks.shift();
      }
    });

    const startup = await waitForStartup(child, STARTUP_VERIFY_MS);
    const stderr = stderrChunks.join("").trim();

    if (!startup.alive) {
      const reason = classifyScrcpyFailure(stderr, startup.exitCode, adb.state);
      return {
        ok: false,
        error: formatOpenError(reason, stderr),
        reason,
        data: listOpenViews(),
      };
    }

    entry.status = "open";
    openViews.set(deviceSerial, entry);

    child.once("error", (error) => {
      entry.status = "failed";
      entry.lastError = error.message;
      openViews.delete(deviceSerial);
      emitState();
    });

    child.once("close", () => {
      openViews.delete(deviceSerial);
      emitState();
    });

    emitState();
    const focus = await bringScrcpyToFront(windowTitle, child.pid ?? null);
    return openViewResult(entry, focus, { windowTitle, command: entry.command });
  } finally {
    openingDeviceViews.delete(deviceSerial);
  }
}

function closeDeviceView(deviceSerial) {
  const serial = safeSerial(deviceSerial);
  if (closingDeviceViews.has(serial)) {
    return {
      ok: false,
      error: "Phone view is closing.",
      reason: "close_in_progress",
      data: listOpenViews(),
    };
  }
  const entry = openViews.get(serial);
  if (!entry) {
    return { ok: true, data: listOpenViews() };
  }

  closingDeviceViews.add(serial);
  try {
    if (entry.process?.kill) {
      entry.process.kill("SIGTERM");
    }
    openViews.delete(serial);
    emitState();
    return { ok: true, data: listOpenViews() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not close phone view.",
      reason: "close_failed",
      data: listOpenViews(),
    };
  } finally {
    closingDeviceViews.delete(serial);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selfTestDeviceSerials(value) {
  return String(value || "")
    .split(",")
    .map((item) => safeSerial(item))
    .filter(Boolean);
}

function logSelfTestStep(step, result) {
  const views = Array.isArray(result?.data) ? result.data : listOpenViews();
  const line = JSON.stringify({
    step,
    ok: Boolean(result?.ok),
    openCount: views.length,
    devices: views.map((view) => view.deviceSerial),
    error: result?.error || null,
    reason: result?.reason || null,
    command: result?.command || null,
    focusAttempted: result?.focusAttempted ?? null,
    focused: result?.focused ?? null,
    focusMethod: result?.focusMethod || null,
    processAlive: result?.processAlive ?? null,
    userMessage: result?.userMessage || null,
  });
  console.log("[BotApp device-view self-test]", line);
  if (process.env.BOTAPP_DEVICE_VIEW_SELF_TEST_LOG) {
    try {
      fs.appendFileSync(process.env.BOTAPP_DEVICE_VIEW_SELF_TEST_LOG, `${line}\n`);
    } catch {
      // Logging must never block the device-view flow.
    }
  }
}

async function runDeviceViewSelfTest(value = process.env.BOTAPP_DEVICE_VIEW_SELF_TEST) {
  const [firstDeviceSerial, secondDeviceSerial] = selfTestDeviceSerials(value);
  if (!firstDeviceSerial) {
    console.log("[BotApp device-view self-test]", JSON.stringify({
      step: "skipped",
      ok: false,
      openCount: listOpenViews().length,
      devices: [],
      error: "Set BOTAPP_DEVICE_VIEW_SELF_TEST to a comma-separated list of phone IDs.",
    }));
    return;
  }

  logSelfTestStep("before", { ok: true, data: listOpenViews() });
  logSelfTestStep("open:first", await openDeviceView({ deviceSerial: firstDeviceSerial, deviceLabel: firstDeviceSerial, windowIndex: 0 }));
  await delay(2500);

  logSelfTestStep("open:first-again", await openDeviceView({ deviceSerial: firstDeviceSerial, deviceLabel: firstDeviceSerial, windowIndex: 0 }));
  await delay(1500);

  if (secondDeviceSerial) {
    logSelfTestStep("open:second", await openDeviceView({ deviceSerial: secondDeviceSerial, deviceLabel: secondDeviceSerial, windowIndex: 1 }));
    await delay(2500);
  }

  logSelfTestStep("focus:first", await focusDeviceView(firstDeviceSerial));
  await delay(1000);

  logSelfTestStep("close:first", closeDeviceView(firstDeviceSerial));
  await delay(1500);

  if (secondDeviceSerial) {
    logSelfTestStep("close:second", closeDeviceView(secondDeviceSerial));
    await delay(1500);
  }

  logSelfTestStep("after", { ok: true, data: listOpenViews() });
}

function registerDeviceViewIpc() {
  ipcMain.handle(IPC_CHANNELS.list, () => listOpenViewsResult());
  ipcMain.handle(IPC_CHANNELS.open, async (_event, input) => openDeviceView(input));
  ipcMain.handle(IPC_CHANNELS.focus, async (_event, deviceSerial) => focusDeviceView(deviceSerial));
  ipcMain.handle(IPC_CHANNELS.close, (_event, deviceSerial) => closeDeviceView(deviceSerial));
}

function closeAllDeviceViews() {
  const targets = [...openViews.values()];
  if (targets.length === 0) {
    emitState();
    return { ok: true, data: listOpenViews() };
  }
  for (const entry of targets) {
    closeDeviceView(entry.deviceSerial);
  }
  emitState();
  return { ok: true, data: listOpenViews() };
}

module.exports = {
  IPC_CHANNELS,
  registerDeviceViewIpc,
  closeAllDeviceViews,
  runDeviceViewSelfTest,
  openDeviceView,
  windowTitleFor,
  buildScrcpyArgs,
  localToolDiagnostics,
};

if (require.main === module) {
  runDeviceViewSelfTest(process.argv[2])
    .then(() => {
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error("[BotApp device-view self-test]", error);
      process.exitCode = 1;
    });
}
