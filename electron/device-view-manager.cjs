/* global module, setTimeout */

const electron = require("electron");
const { spawn, spawnSync, execFile, execFileSync } = require("node:child_process");
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
  probe: "botapp:device-views:probe",
};

const STARTUP_VERIFY_MS = 1800;
const STDERR_TAIL_MAX = 400;
const SCRCPY_WINDOW_ASPECT_RATIO = 9 / 16;
const SCRCPY_WINDOW_MIN_HEIGHT = 650;
const SCRCPY_WINDOW_MAX_HEIGHT = 720;
const FOCUS_ATTEMPT_DELAY_MS = 1000;
const CLOSE_WAIT_TIMEOUT_MS = 2500;
const NATIVE_PROBE_TIMEOUT_MS = 1000;
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

function deviceViewTrace(payload) {
  console.log("DEVICE_VIEW_TRACE", JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload,
  }));
}

function traceManagerEntry(functionName, deviceSerial) {
  const serial = safeSerial(deviceSerial);
  const entry = openViews.get(serial);
  deviceViewTrace({
    stage: "manager_entry",
    function: functionName,
    deviceSerial: serial,
    openViewsKeys: [...openViews.keys()],
    targetEntryExists: Boolean(entry),
    targetPid: entry?.process?.pid ?? null,
    targetWindowTitle: entry?.windowTitle ?? null,
  });
}

function emitState() {
  const state = listOpenViews();
  deviceViewTrace({
    stage: "state_emit",
    openViewSerials: state.map((view) => view.deviceSerial),
  });
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
  return runAppleScriptResult(script).stdout;
}

function runAppleScriptResult(script) {
  try {
    const output = execFileSync("osascript", ["-e", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 3000,
    });
    return {
      ok: true,
      stdout: String(output || "").trim(),
      stderr: "",
      status: 0,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || "").trim(),
      stderr: String(error?.stderr || error?.message || "").trim(),
      status: Number.isFinite(Number(error?.status)) ? Number(error.status) : 1,
    };
  }
}

function runAppleScriptResultAsync(script, timeoutMs = NATIVE_PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], {
      encoding: "utf8",
      timeout: timeoutMs,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || error?.stdout || "").trim(),
        stderr: String(stderr || error?.stderr || error?.message || "").trim(),
        status: error ? (Number.isFinite(Number(error.code)) ? Number(error.code) : 1) : 0,
      });
    });
  });
}

function isAccessibilityPermissionError(stderr = "") {
  const value = String(stderr || "").toLowerCase();
  return value.includes("not permitted") || value.includes("not authorized") || value.includes("not allowed") || value.includes("accessibility");
}

function isProcessAlive(processHandle) {
  if (!processHandle) return false;
  const processPid = Number(processHandle.pid);
  if (!Number.isFinite(processPid) || processPid <= 0) return false;
  if (processHandle.exitCode != null) return false;
  try {
    process.kill(processPid, 0);
    return true;
  } catch {
    return false;
  }
}

let nativeWindowProbeOverride = null;

function waitForProcessExit(child, timeoutMs = CLOSE_WAIT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!child || typeof child.once !== "function") {
      resolve({ terminated: false, reason: "no_child_process", exitCode: null, signal: null });
      return;
    }

    let settled = false;
    let timeoutHandle;
    const finalize = (terminated, reason, exitCode = null, signal = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      child.removeListener("close", onClose);
      child.removeListener("error", onError);
      resolve({ terminated, reason, exitCode, signal });
    };

    const onClose = (code, signal) => finalize(true, "closed", code, signal);
    const onError = () => finalize(false, "process_error", null, "spawn_error");
    timeoutHandle = setTimeout(() => {
      if (isProcessAlive(child)) {
        finalize(false, "close_timeout", child.exitCode || null, child.signalCode || null);
      } else {
        finalize(true, "already_exited", child.exitCode || null, child.signalCode || null);
      }
    }, timeoutMs);

    child.once("close", onClose);
    child.once("error", onError);
  });
}

async function queryScrcpyWindowsNative() {
  if (typeof nativeWindowProbeOverride === "function") {
    try {
      const overrideResult = await nativeWindowProbeOverride();
      if (overrideResult && typeof overrideResult === "object") {
        return {
          ok: Boolean(overrideResult.ok),
          reason: overrideResult.reason || null,
          reasonMessage: overrideResult.reasonMessage || null,
          windows: Array.isArray(overrideResult.windows) ? overrideResult.windows : [],
          ...(typeof overrideResult.permissionRequired === "boolean" ? { permissionRequired: overrideResult.permissionRequired } : {}),
        };
      }
      return {
        ok: false,
        reason: "native_window_probe_override_error",
        reasonMessage: "Native window probe override must return an object.",
        windows: [],
      };
    } catch (error) {
      return {
        ok: false,
        reason: "native_window_probe_override_error",
        reasonMessage: error instanceof Error ? error.message : "Native window probe override failed.",
        windows: [],
      };
    }
  }
  return queryScrcpyWindowsNativeInternal();
}

function mapNativeWindowLine(line) {
  const parts = String(line || "").split("|");
  const rawPid = Number(parts[0]);
  const rawWindowId = Number(parts[2]);
  if (!Number.isFinite(rawPid) || rawPid <= 0) return null;
  return {
    ownerPid: rawPid,
    ownerName: String(parts[1] || "").trim() || null,
    windowId: Number.isFinite(rawWindowId) && rawWindowId > 0 ? rawWindowId : null,
    windowTitle: String(parts.slice(3).join("|")).trim() || null,
  };
}

async function queryScrcpyWindowsNativeInternal() {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "unsupported_platform", windows: [] };
  }

  const script = [
    'set output to ""',
    'tell application "System Events"',
    '  repeat with proc in (every process whose background only is false)',
    '    if name of proc is "scrcpy" then',
    '      set procPid to unix id of proc',
    '      set procName to name of proc',
    '      repeat with win in windows of proc',
    '        try',
    '          set windowId to id of win',
    '          set windowName to name of win as text',
    '          set output to output & (procPid as text) & "|" & procName & "|" & (windowId as text) & "|" & windowName & "\n"',
    '        end try',
    '      end repeat',
    '    end if',
    '  end repeat',
    'end tell',
    'return output',
  ].join("\n");

  const result = await runAppleScriptResultAsync(script);
  if (!result.ok) {
    if (isAccessibilityPermissionError(result.stderr)) {
      return {
        ok: false,
        reason: "accessibility_permission_required",
        reasonMessage: "System Events accessibility permission is required.",
        windows: [],
      };
    }
    return {
      ok: false,
      reason: "native_window_probe_failed",
      reasonMessage: result.stderr || "Could not query native windows.",
      windows: [],
    };
  }

  return {
    ok: true,
    reason: null,
    reasonMessage: null,
    windows: String(result.stdout || "").split("\n").map(mapNativeWindowLine).filter(Boolean),
  };
}

function buildNativeWindowProbeFrom(entry, windows = []) {
  const requestedWindowTitle = entry?.windowTitle || null;
  const childPid = Number(entry?.process?.pid) || null;
  const processAlive = isProcessAlive(entry?.process);
  let match = null;
  if (requestedWindowTitle) {
    match = windows.find((candidate) => candidate?.windowTitle === requestedWindowTitle) || null;
  }
  if (!match && childPid) {
    match = windows.find((candidate) => candidate.ownerPid === childPid) || null;
  }
  return {
    deviceSerial: entry.deviceSerial,
    childPid,
    requestedWindowTitle,
    processAlive,
    nativeWindowOwnerPid: match?.ownerPid || null,
    nativeWindowId: match?.windowId || null,
    nativeWindowTitle: match?.windowTitle || null,
    nativeOwnerName: match?.ownerName || null,
  };
}

async function probeNativeDeviceViewsState() {
  if (process.platform !== "darwin") {
    return {
      ok: false,
      reason: "unsupported_platform",
      error: "Native probing is currently supported on macOS only.",
      data: [],
      method: "osascript",
      platform: process.platform,
    };
  }

  const query = await queryScrcpyWindowsNative();
  if (!query.ok) {
    return {
      ok: false,
      reason: query.reason,
      error: query.reasonMessage,
      data: [],
      method: "osascript",
      platform: process.platform,
      permissionRequired: query.reason === "accessibility_permission_required",
    };
  }

  return {
    ok: true,
    reason: null,
    error: null,
    data: [...openViews.values()].map((entry) => buildNativeWindowProbeFrom(entry, query.windows)),
    method: "osascript",
    platform: process.platform,
  };
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

async function bringScrcpyToFront(windowTitle, pid = null, context = {}) {
  deviceViewTrace({
    stage: "focus_called",
    origin: context.origin || "other",
    requestedSerial: context.deviceSerial || null,
    requestedPid: pid,
    requestedWindowTitle: windowTitle || null,
  });
  if (process.platform !== "darwin") {
    deviceViewTrace({
      stage: "focus_result",
      requestedSerial: context.deviceSerial || null,
      strategy: "other",
      result: "failure",
    });
    return { focusAttempted: false, focused: false, focusMethod: "unsupported_platform" };
  }

  await delay(FOCUS_ATTEMPT_DELAY_MS);
  const byPid = focusScrcpyByPid(pid);
  if (byPid === "process_pid") {
    deviceViewTrace({ stage: "focus_result", requestedSerial: context.deviceSerial || null, strategy: "pid", result: "success" });
    return { focusAttempted: true, focused: true, focusMethod: byPid };
  }
  const byTitle = focusScrcpyWindowByTitle(windowTitle);
  if (byTitle === "window_title") {
    deviceViewTrace({ stage: "focus_result", requestedSerial: context.deviceSerial || null, strategy: "title", result: "success" });
    return { focusAttempted: true, focused: true, focusMethod: byTitle };
  }
  deviceViewTrace({ stage: "focus_result", requestedSerial: context.deviceSerial || null, strategy: "other", result: "failure" });
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
  traceManagerEntry("focusDeviceView", serial);
  const entry = openViews.get(serial);
  if (!entry) {
    return { ok: false, error: "Phone view is not open.", reason: "not_open", data: listOpenViews() };
  }
  const focus = await bringScrcpyToFront(entry.windowTitle, entry.process?.pid ?? null, {
    origin: "explicit_focus",
    deviceSerial: serial,
  });
  return openViewResult(entry, focus);
}

async function openDeviceView(input) {
  const deviceSerial = safeSerial(input?.deviceSerial);
  traceManagerEntry("openDeviceView", deviceSerial);
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
    const focus = await bringScrcpyToFront(existing.windowTitle, existing.process?.pid ?? null, {
      origin: "open_existing",
      deviceSerial,
    });
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
    const focus = await bringScrcpyToFront(windowTitle, child.pid ?? null, {
      origin: "post_open",
      deviceSerial,
    });
    return openViewResult(entry, focus, { windowTitle, command: entry.command });
  } finally {
    openingDeviceViews.delete(deviceSerial);
  }
}

async function closeDeviceView(deviceSerial) {
  const serial = safeSerial(deviceSerial);
  traceManagerEntry("closeDeviceView", serial);
  if (!serial) {
    return {
      ok: false,
      error: "Missing phone serial.",
      reason: "missing_serial",
      data: listOpenViews(),
    };
  }
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
    return {
      ok: true,
      reason: "already_closed",
      data: listOpenViews(),
    };
  }

  if (!isProcessAlive(entry.process)) {
    openViews.delete(serial);
    emitState();
    return {
      ok: true,
      reason: "already_closed",
      processAlive: false,
      data: listOpenViews(),
    };
  }

  closingDeviceViews.add(serial);
  try {
    if (!entry.process?.kill) {
      throw new Error("No process handle to close phone view.");
    }
    const targetPid = entry.process?.pid ?? null;
    const closeStartedAtMs = Date.now();
    const closeSignalAt = new Date(closeStartedAtMs).toISOString();
    let processExitEventAt = null;
    let processCloseEventAt = null;
    let pidExitAt = null;
    let windowDisappearedAt = null;
    let nativeProbeStart = null;
    let nativeProbeEnd = null;
    let nativeProbeDurationMs = null;
    let maxEventLoopBlockMs = 0;
    let expectedEventLoopTick = Date.now() + 25;
    const eventLoopMonitor = setInterval(() => {
      const now = Date.now();
      maxEventLoopBlockMs = Math.max(maxEventLoopBlockMs, Math.max(0, now - expectedEventLoopTick));
      expectedEventLoopTick = now + 25;
    }, 25);
    eventLoopMonitor.unref?.();
    const onProcessExit = () => {
      processExitEventAt ||= new Date().toISOString();
      pidExitAt ||= processExitEventAt;
    };
    const onProcessClose = () => {
      processCloseEventAt ||= new Date().toISOString();
    };
    entry.process.once("exit", onProcessExit);
    entry.process.once("close", onProcessClose);
    let closeTimelineLogged = false;
    const logCloseTimeline = (result, nativeQuery = null) => {
      if (closeTimelineLogged) return;
      closeTimelineLogged = true;
      clearInterval(eventLoopMonitor);
      deviceViewTrace({
        stage: "close_timeline",
        targetSerial: serial,
        targetPid,
        CLOSE_SIGNAL_AT: closeSignalAt,
        WINDOW_DISAPPEARED_AT: windowDisappearedAt,
        PID_EXIT_AT: pidExitAt,
        PROCESS_EXIT_EVENT_AT: processExitEventAt,
        PROCESS_CLOSE_EVENT_AT: processCloseEventAt,
        NATIVE_PROBE_START: nativeProbeStart,
        NATIVE_PROBE_END: nativeProbeEnd,
        NATIVE_PROBE_DURATION_MS: nativeProbeDurationMs,
        TOTAL_CLOSE_DURATION_MS: Date.now() - closeStartedAtMs,
        MAIN_EVENT_LOOP_BLOCK_MS: Math.round(maxEventLoopBlockMs),
        childExitCode: entry.process?.exitCode ?? null,
        childKilled: Boolean(entry.process?.killed),
        pidAlive: isProcessAlive(entry.process),
        nativeProbeOk: nativeQuery?.ok ?? null,
        nativeProbeReason: nativeQuery?.reason || null,
        resultOk: Boolean(result?.ok),
        resultReason: result?.reason || null,
      });
    };
    deviceViewTrace({
      stage: "close_before_signal",
      targetSerial: serial,
      targetPid,
      pidAliveBefore: isProcessAlive(entry.process),
      openViewsKeys: [...openViews.keys()],
    });
    let signalSent = false;
    let signalError = null;
    try {
      signalSent = entry.process.kill("SIGTERM") !== false;
    } catch (error) {
      signalError = error instanceof Error ? error.message : "signal_failed";
      deviceViewTrace({
        stage: "close_signal",
        targetSerial: serial,
        targetPid,
        signalSent,
        signalType: "SIGTERM",
        signalError,
      });
      throw error;
    }
    deviceViewTrace({
      stage: "close_signal",
      targetSerial: serial,
      targetPid,
      signalSent,
      signalType: "SIGTERM",
      signalError,
    });
    const delayedNativeDiagnostic = new Promise((resolve) => setTimeout(async () => {
      const probeStartedMs = Date.now();
      nativeProbeStart = new Date(probeStartedMs).toISOString();
      const nativeQuery = await queryScrcpyWindowsNative();
      const probeEndedMs = Date.now();
      nativeProbeEnd = new Date(probeEndedMs).toISOString();
      nativeProbeDurationMs = probeEndedMs - probeStartedMs;
      const targetWindowPresent = nativeQuery.ok
        ? nativeQuery.windows.some((window) => window.ownerPid === targetPid)
        : null;
      if (targetWindowPresent === false) windowDisappearedAt ||= nativeProbeEnd;
      if (!isProcessAlive(entry.process)) pidExitAt ||= nativeProbeEnd;
      deviceViewTrace({
        stage: "close_delayed_diagnostic",
        targetSerial: serial,
        targetPid,
        pidAlive: isProcessAlive(entry.process),
        nativeProbeOk: nativeQuery.ok,
        nativeProbeReason: nativeQuery.reason || null,
        nativeProbeStart,
        nativeProbeEnd,
        nativeProbeDurationMs,
        nativeWindowWithTargetPidPresent: targetWindowPresent,
      });
      resolve(nativeQuery);
    }, 750));
    const closeResult = await waitForProcessExit(entry.process);
    const pidAliveAfterWait = isProcessAlive(entry.process);
    if (!pidAliveAfterWait) pidExitAt ||= new Date().toISOString();
    let nativeQueryForTimeout = await delayedNativeDiagnostic;
    let nativeWindowWithTargetPidPresent = false;
    if (closeResult.reason === "close_timeout" && targetPid) {
      const probeStartedMs = Date.now();
      nativeProbeStart = new Date(probeStartedMs).toISOString();
      nativeQueryForTimeout = await queryScrcpyWindowsNative();
      const probeEndedMs = Date.now();
      nativeProbeEnd = new Date(probeEndedMs).toISOString();
      nativeProbeDurationMs = probeEndedMs - probeStartedMs;
      nativeWindowWithTargetPidPresent = nativeQueryForTimeout.ok
        ? nativeQueryForTimeout.windows.some((window) => window.ownerPid === targetPid)
        : false;
      if (nativeQueryForTimeout.ok && !nativeWindowWithTargetPidPresent) windowDisappearedAt ||= nativeProbeEnd;
      if (!isProcessAlive(entry.process)) pidExitAt ||= nativeProbeEnd;
    } else if (nativeQueryForTimeout?.ok) {
      nativeWindowWithTargetPidPresent = nativeQueryForTimeout.windows.some((window) => window.ownerPid === targetPid);
    }
    const pidAliveAtDecision = isProcessAlive(entry.process);
    if (!pidAliveAtDecision) pidExitAt ||= new Date().toISOString();
    deviceViewTrace({
      stage: "close_wait_result",
      targetSerial: serial,
      targetPid,
      pidAliveAfterWait,
      pidAliveAtDecision,
      exitEventObserved: closeResult.reason === "closed",
      timeoutReached: closeResult.reason === "close_timeout",
      waitReason: closeResult.reason,
      nativeProbeOk: nativeQueryForTimeout ? nativeQueryForTimeout.ok : null,
      nativeProbeReason: nativeQueryForTimeout ? nativeQueryForTimeout.reason || null : null,
      nativeWindowWithTargetPidPresent,
    });
    if (!closeResult.terminated) {
      const canTreatAsClosed = closeResult.reason === "close_timeout" && (!pidAliveAtDecision
        || (nativeQueryForTimeout?.ok === true && !nativeWindowWithTargetPidPresent));
      if (canTreatAsClosed) {
        const entryDeleted = openViews.delete(serial);
        emitState();
        deviceViewTrace({
          stage: "close_registry_result",
          targetSerial: serial,
          entryDeleted,
          openViewsKeysAfter: [...openViews.keys()],
          fallbackCloseSuccess: true,
        });
        const result = {
          ok: true,
          reason: "closed",
          processAlive: false,
          data: listOpenViews(),
        };
        logCloseTimeline(result, nativeQueryForTimeout);
        return result;
      }
      deviceViewTrace({
        stage: "close_registry_result",
        targetSerial: serial,
        entryDeleted: false,
        openViewsKeysAfter: [...openViews.keys()],
      });
      const result = {
        ok: false,
        reason: closeResult.reason,
        error: `Phone view did not terminate in time (${closeResult.reason}).`,
        processAlive: isProcessAlive(entry.process),
        data: listOpenViews(),
      };
      logCloseTimeline(result, nativeQueryForTimeout);
      return result;
    }

    const entryDeleted = openViews.delete(serial);
    emitState();
    deviceViewTrace({
      stage: "close_registry_result",
      targetSerial: serial,
      entryDeleted,
      openViewsKeysAfter: [...openViews.keys()],
    });
    const result = {
      ok: true,
      reason: "closed",
      processAlive: false,
      data: listOpenViews(),
    };
    logCloseTimeline(result, nativeQueryForTimeout);
    return result;
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

  logSelfTestStep("close:first", await closeDeviceView(firstDeviceSerial));
  await delay(1500);

  if (secondDeviceSerial) {
    logSelfTestStep("close:second", await closeDeviceView(secondDeviceSerial));
    await delay(1500);
  }

  logSelfTestStep("after", { ok: true, data: listOpenViews() });
}

function registerDeviceViewIpc() {
  ipcMain.handle(IPC_CHANNELS.list, () => listOpenViewsResult());
  ipcMain.handle(IPC_CHANNELS.open, async (_event, input) => {
    deviceViewTrace({ stage: "ipc_main_received", channel: IPC_CHANNELS.open, operation: "open", deviceSerial: safeSerial(input?.deviceSerial) });
    return openDeviceView(input);
  });
  ipcMain.handle(IPC_CHANNELS.focus, async (_event, deviceSerial) => {
    deviceViewTrace({ stage: "ipc_main_received", channel: IPC_CHANNELS.focus, operation: "focus", deviceSerial: safeSerial(deviceSerial) });
    return focusDeviceView(deviceSerial);
  });
  ipcMain.handle(IPC_CHANNELS.close, (_event, deviceSerial) => {
    deviceViewTrace({ stage: "ipc_main_received", channel: IPC_CHANNELS.close, operation: "close", deviceSerial: safeSerial(deviceSerial) });
    return closeDeviceView(deviceSerial);
  });
  ipcMain.handle(IPC_CHANNELS.probe, () => probeNativeDeviceViewsState());
}

async function closeAllDeviceViews() {
  const targets = [...openViews.values()];
  if (targets.length === 0) {
    emitState();
    return { ok: true, data: listOpenViews() };
  }
  let hasFailure = false;
  let lastResult = null;
  for (const entry of targets) {
    const result = await closeDeviceView(entry.deviceSerial);
    if (!result.ok) {
      hasFailure = true;
    }
    if (result) {
      lastResult = result;
    }
  }
  emitState();
  if (hasFailure && lastResult) {
    return {
      ok: false,
      reason: "close_failed",
      error: "At least one phone view did not close in time.",
      data: listOpenViews(),
      processAlive: listOpenViews().some((view) => view.pid != null),
      ...(lastResult.tools ? { tools: lastResult.tools } : {}),
    };
  }
  return { ok: true, data: listOpenViews() };
}

module.exports = {
  IPC_CHANNELS,
  registerDeviceViewIpc,
  closeAllDeviceViews,
  runDeviceViewSelfTest,
  openDeviceView,
  closeDeviceView,
  windowTitleFor,
  buildScrcpyArgs,
  probeNativeDeviceViewsState,
  localToolDiagnostics,
};

if (process.env.BOTAPP_DEVICE_VIEW_TEST_HOOKS === "1") {
  module.exports.__testHooks = {
    resetState: () => {
      openViews.clear();
      openingDeviceViews.clear();
      closingDeviceViews.clear();
      nativeWindowProbeOverride = null;
    },
    setOpenView: (serial, processHandle, options = {}) => {
      const deviceSerial = safeSerial(serial);
      if (!deviceSerial) return;
      const entry = {
        deviceSerial,
        scrcpySerial: options.scrcpySerial || deviceSerial,
        deviceLabel: options.deviceLabel || deviceSerial,
        process: processHandle,
        status: options.status || "open",
        windowTitle: options.windowTitle || windowTitleFor(options.deviceLabel || deviceSerial, options.scrcpySerial || deviceSerial),
        startedAt: options.startedAt || new Date().toISOString(),
        lastError: null,
        placement: options.placement || null,
        command: options.command || null,
      };
      openViews.set(deviceSerial, entry);
      return publicView(entry);
    },
    listOpenViews: () => listOpenViews(),
    setOpenViews: (entries = []) => {
      openViews.clear();
      for (const item of entries) {
        module.exports.__testHooks.setOpenView(item.deviceSerial, item.process, item);
      }
    },
    setNativeWindowProbe: (probe) => {
      nativeWindowProbeOverride = probe || null;
    },
    removeView: (serial) => {
      openViews.delete(safeSerial(serial));
    },
  };
}

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
