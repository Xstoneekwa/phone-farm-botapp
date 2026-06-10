/* global module, setTimeout */

const electron = require("electron");
const { spawn, spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");

const isElectronRuntime = typeof electron !== "string";
const BrowserWindow = isElectronRuntime ? electron.BrowserWindow : { getAllWindows: () => [] };
const ipcMain = isElectronRuntime ? electron.ipcMain : { handle: () => undefined };

const IPC_CHANNELS = {
  open: "botapp:device-views:open",
  focus: "botapp:device-views:focus",
  close: "botapp:device-views:close",
  list: "botapp:device-views:list",
  state: "botapp:device-views:state",
};

const openViews = new Map();

function scrcpyCandidates() {
  return [
    process.env.BOTAPP_SCRCPY_PATH,
    "scrcpy",
    "/opt/homebrew/bin/scrcpy",
    "/usr/local/bin/scrcpy",
  ].filter(Boolean);
}

function resolveScrcpyCommand() {
  for (const candidate of scrcpyCandidates()) {
    if (candidate.includes("/") && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8", stdio: "pipe" });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

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

function windowTitleFor(deviceLabel, deviceSerial) {
  return `BotApp Phone View - ${safeLabel(deviceLabel, deviceSerial)} - ${deviceSerial}`;
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
  };
}

function listOpenViews() {
  return [...openViews.values()].map(publicView);
}

function emitState() {
  const state = listOpenViews();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.state, state);
    }
  }
}

function focusScrcpyWindow(windowTitle) {
  if (process.platform !== "darwin") return false;
  try {
    execFileSync("osascript", [
      "-e",
      [
        'tell application "System Events"',
        '  set scrcpyProcesses to every process whose name contains "scrcpy"',
        "  repeat with proc in scrcpyProcesses",
        "    set frontmost of proc to true",
        "    repeat with win in windows of proc",
        `      if name of win is "${windowTitle.replaceAll('"', '\\"')}" then`,
        "        perform action \"AXRaise\" of win",
        "        return",
        "      end if",
        "    end repeat",
        "  end repeat",
        "end tell",
      ].join("\n"),
    ], { stdio: "ignore", timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

function focusDeviceView(deviceSerial) {
  const serial = safeSerial(deviceSerial);
  const entry = openViews.get(serial);
  if (!entry) {
    return { ok: false, error: "Phone view is not open.", data: listOpenViews() };
  }
  focusScrcpyWindow(entry.windowTitle);
  return { ok: true, data: listOpenViews() };
}

function openDeviceView(input) {
  const deviceSerial = safeSerial(input?.deviceSerial);
  if (!deviceSerial) {
    return { ok: false, error: "Missing phone serial.", data: listOpenViews() };
  }

  const existing = openViews.get(deviceSerial);
  if (existing) {
    focusScrcpyWindow(existing.windowTitle);
    return { ok: true, data: listOpenViews() };
  }

  const scrcpyCommand = resolveScrcpyCommand();
  if (!scrcpyCommand) {
    return {
      ok: false,
      error: "scrcpy is not installed or not available in PATH.",
      data: listOpenViews(),
    };
  }

  const deviceLabel = safeLabel(input?.deviceLabel, deviceSerial);
  const windowTitle = windowTitleFor(deviceLabel, deviceSerial);
  const scrcpySerial = resolveDeviceSerialForScrcpy(deviceSerial);
  const child = spawn(scrcpyCommand, ["--serial", scrcpySerial, "--window-title", windowTitle], {
    detached: false,
    stdio: "ignore",
  });

  const entry = {
    deviceSerial,
    scrcpySerial,
    deviceLabel,
    process: child,
    status: "open",
    windowTitle,
    startedAt: new Date().toISOString(),
    lastError: null,
  };
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
  return { ok: true, data: listOpenViews() };
}

function closeDeviceView(deviceSerial) {
  const serial = safeSerial(deviceSerial);
  const entry = openViews.get(serial);
  if (!entry) {
    return { ok: true, data: listOpenViews() };
  }

  entry.process.kill("SIGTERM");
  openViews.delete(serial);
  emitState();
  return { ok: true, data: listOpenViews() };
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
  logSelfTestStep("open:first", openDeviceView({ deviceSerial: firstDeviceSerial, deviceLabel: firstDeviceSerial }));
  await delay(2500);

  logSelfTestStep("open:first-again", openDeviceView({ deviceSerial: firstDeviceSerial, deviceLabel: firstDeviceSerial }));
  await delay(1500);

  if (secondDeviceSerial) {
    logSelfTestStep("open:second", openDeviceView({ deviceSerial: secondDeviceSerial, deviceLabel: secondDeviceSerial }));
    await delay(2500);
  }

  logSelfTestStep("focus:first", focusDeviceView(firstDeviceSerial));
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
  ipcMain.handle(IPC_CHANNELS.list, () => ({ ok: true, data: listOpenViews() }));
  ipcMain.handle(IPC_CHANNELS.open, (_event, input) => openDeviceView(input));
  ipcMain.handle(IPC_CHANNELS.focus, (_event, deviceSerial) => focusDeviceView(deviceSerial));
  ipcMain.handle(IPC_CHANNELS.close, (_event, deviceSerial) => closeDeviceView(deviceSerial));
}

function closeAllDeviceViews() {
  for (const entry of openViews.values()) {
    entry.process.kill("SIGTERM");
  }
  openViews.clear();
  emitState();
}

module.exports = {
  IPC_CHANNELS,
  registerDeviceViewIpc,
  closeAllDeviceViews,
  runDeviceViewSelfTest,
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
