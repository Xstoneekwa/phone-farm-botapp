import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";

import {
  findOpenDeviceViewDeepLink,
  parseOpenDeviceViewDeepLink,
} from "../../electron/open-device-view-protocol.cjs";

process.env.BOTAPP_DEVICE_VIEW_TEST_HOOKS = "1";
const { closeDeviceView, __testHooks } = createRequire(import.meta.url)("../../electron/device-view-manager.cjs");

const mainSource = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
const builderSource = readFileSync(new URL("../../electron-builder.json", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("../../electron/device-view-manager.cjs", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../electron/preload.cjs", import.meta.url), "utf8");
const devicesSource = readFileSync(new URL("./Devices.tsx", import.meta.url), "utf8");
const profilesSource = readFileSync(new URL("./profiles/ProfilesView.tsx", import.meta.url), "utf8");

function extractFunctionSource(source, name) {
  const marker = `async function ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const nextMarker = source.indexOf("\n  async function ", start + marker.length);
  const end = nextMarker === -1 ? source.length : nextMarker;
  return source.slice(start, end);
}

test("parseOpenDeviceViewDeepLink accepts scoped open-device-view intents", () => {
  const parsed = parseOpenDeviceViewDeepLink("botapp://open-device-view?intent=abc.def");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.intent, "abc.def");
});

test("parseOpenDeviceViewDeepLink rejects unsupported botapp hosts", () => {
  const parsed = parseOpenDeviceViewDeepLink("botapp://start-run?account=1");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "unsupported_botapp_link");
});

test("findOpenDeviceViewDeepLink extracts cold-start argv links", () => {
  const link = findOpenDeviceViewDeepLink([
    "/Applications/BotApp.app/Contents/MacOS/BotApp",
    "botapp://open-device-view?intent=signed.token",
  ]);
  assert.equal(link, "botapp://open-device-view?intent=signed.token");
});

test("electron-builder declares macOS botapp protocol handler", () => {
  const config = JSON.parse(builderSource);
  assert.equal(config.mac.protocols[0].schemes[0], "botapp");
  assert.equal(config.mac.extendInfo.CFBundleURLTypes[0].CFBundleURLSchemes[0], "botapp");
});

test("main process wires single-instance and open-url deep link handlers", () => {
  const openDeviceBlock = mainSource.slice(
    mainSource.indexOf("async function openDeviceViewFromClientIntent"),
    mainSource.indexOf("function registerRuntimeIpc"),
  );
  assert.match(mainSource, /requestSingleInstanceLock/);
  assert.match(mainSource, /second-instance/);
  assert.match(mainSource, /open-url/);
  assert.match(mainSource, /botapp:connect:open-device-view/);
  assert.match(openDeviceBlock, /botapp_open_device_view/);
  assert.match(openDeviceBlock, /openDeviceView\(/);
  assert.doesNotMatch(openDeviceBlock, /runs\/start|assignments\/now|login_provisioning|profiles:auto-login/);
});

test("Phone View second-click trace spans renderer, preload, IPC, manager, close, focus, and state", () => {
  assert.match(devicesSource, /stage: "renderer_eye_click"/);
  assert.match(devicesSource, /stage: "renderer_openPhoneView"/);
  assert.match(devicesSource, /stage: "renderer_ipc_result"/);
  assert.match(devicesSource, /stage: "renderer_state_received"/);
  assert.match(preloadSource, /stage: "preload_request"/);
  assert.match(managerSource, /stage: "ipc_main_received"/);
  assert.match(managerSource, /stage: "manager_entry"/);
  assert.match(managerSource, /stage: "close_signal"/);
  assert.match(managerSource, /stage: "close_wait_result"/);
  assert.match(managerSource, /stage: "close_delayed_diagnostic"/);
  assert.match(managerSource, /stage: "focus_called"/);
  assert.match(managerSource, /stage: "focus_result"/);
  assert.match(managerSource, /stage: "state_emit"/);
  assert.match(managerSource, /stage: "close_timeline"/);
  assert.match(managerSource, /MAIN_EVENT_LOOP_BLOCK_MS/);
  assert.match(managerSource, /execFile\("osascript"/);
});

test("Profiles phone-view eye handler uses close when already open and open when closed", () => {
  const handler = extractFunctionSource(profilesSource, "handlePhoneView");
  assert.ok(handler.length > 0);
  assert.match(handler, /const wasOpen = openDeviceViews\.some\(\(view\) => view\.deviceSerial === group\.deviceSerial\);/);
  assert.match(handler, /stage: "renderer_eye_click"/);
  assert.match(handler, /stage: "renderer_openPhoneView"/);
  assert.match(handler, /if \(wasOpen\)\s*\{[\s\S]*?const result = await closeDeviceView\(group\.deviceSerial\);/);
  assert.match(handler, /const result = await openDeviceView\(\{\s*deviceSerial: group\.deviceSerial,\s*deviceLabel: group\.deviceLabel,[\s\S]*?\}\);/);
  assert.match(profilesSource, /"Close phone view"/);
  assert.match(profilesSource, /"Open phone view"/);
  assert.match(profilesSource, /aria-label=\{isViewOpen \? "Close phone view" : "Open phone view"\}/);
});

test("Devices phone-view eye handler uses close when already open and open when closed", () => {
  const handler = extractFunctionSource(devicesSource, "openPhoneView");
  assert.ok(handler.length > 0);
  assert.match(handler, /const viewIsOpen = isViewOpen\(openViews, device\);/);
  assert.match(handler, /const operation = viewIsOpen \? "close" : "open";/);
  assert.match(handler, /if \(viewIsOpen\)\s*\{[\s\S]*?const result = await closeDeviceView\(serial\);/);
  assert.match(handler, /const result = await openDeviceView\(\{\s*deviceSerial: serial, deviceLabel: device\.name\s*\}\);/);
  assert.doesNotMatch(handler, /focusDeviceView\(/);
});

function makeFakeProcess(options = {}) {
  const {
    shouldClose = true,
    onKill,
    pid = process.pid,
  } = options;
  class FakeProcess extends EventEmitter {
    pid = pid;
    killed = false;
    exitCode = null;
    signalCode = null;
    shouldClose = true;
    onKill;
    constructor() {
      super();
      this.shouldClose = shouldClose;
      this.onKill = onKill;
    }
    kill(signal) {
      this.killed = true;
      this.signalCode = signal || null;
      if (this.onKill) this.onKill(signal);
      if (this.shouldClose && !this.exitCode) {
        this.exitCode = 0;
        queueMicrotask(() => this.emit("close", 0, signal || null));
      }
    }
  }
  return new FakeProcess();
}

async function withProcessKillStub(overrideKill, callback) {
  const originalProcessKill = process.kill;
  process.kill = (pid, signal) => overrideKill(pid, signal, originalProcessKill);
  try {
    return await callback();
  } finally {
    process.kill = originalProcessKill;
    __testHooks.setNativeWindowProbe(null);
  }
}

test("closeDeviceView closes only requested serial", async () => {
  __testHooks.resetState();
  const processA = makeFakeProcess();
  const processB = makeFakeProcess();
  __testHooks.setOpenViews([
    { deviceSerial: "A", process: processA, windowTitle: "BotApp Phone View · A · 0000" },
    { deviceSerial: "B", process: processB, windowTitle: "BotApp Phone View · B · 1111" },
  ]);

  const result = await closeDeviceView("A");
  assert.equal(result.ok, true);
  assert.equal(result.reason, "closed");
  assert.equal(processA.killed, true);
  assert.equal(processB.killed, false);
  const remaining = __testHooks.listOpenViews().map((view) => view.deviceSerial);
  assert.deepEqual(remaining, ["B"]);
});

test("closeDeviceView does not remove other serials", async () => {
  __testHooks.resetState();
  const processA = makeFakeProcess();
  const processB = makeFakeProcess();
  __testHooks.setOpenViews([
    { deviceSerial: "A", process: processA, windowTitle: "BotApp Phone View · A · 0000" },
    { deviceSerial: "B", process: processB, windowTitle: "BotApp Phone View · B · 1111" },
  ]);

  const result = await closeDeviceView("A");
  assert.equal(result.ok, true);
  assert.equal(__testHooks.listOpenViews().some((view) => view.deviceSerial === "B"), true);
  assert.equal(__testHooks.listOpenViews().some((view) => view.deviceSerial === "A"), false);
});

test("closeDeviceView handles timeout without dropping state", async () => {
  __testHooks.resetState();
  const stubborn = new (class extends EventEmitter {
    constructor() {
      super();
      this.pid = process.pid;
      this.killed = false;
      this.exitCode = null;
      this.signalCode = null;
    }
    kill(signal) {
      this.killed = true;
      this.signalCode = signal || null;
    }
  })();

  __testHooks.setOpenViews([{ deviceSerial: "T", process: stubborn, windowTitle: "BotApp Phone View · T · 1234" }]);
  const result = await closeDeviceView("T");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "close_timeout");
  assert.equal(__testHooks.listOpenViews().length, 1);
});

test("closeDeviceView treats non-close timeout with native window absent as success", async () => {
  __testHooks.resetState();
  const targetPid = process.pid + 10000;
  const stubborn = makeFakeProcess({ shouldClose: false });
  stubborn.pid = targetPid;

  __testHooks.setOpenViews([{ deviceSerial: "T", process: stubborn, windowTitle: "BotApp Phone View · T · 1234" }]);
  __testHooks.setNativeWindowProbe(() => ({ ok: true, reason: null, windows: [] }));
  const result = await withProcessKillStub((...args) => {
    const [pid, , originalKill] = args;
    if (pid === targetPid) return;
    return originalKill.call(process, pid);
  }, () => closeDeviceView("T"));

  assert.equal(result.ok, true);
  assert.equal(result.reason, "closed");
  assert.equal(__testHooks.listOpenViews().length, 0);
});

test("closeDeviceView keeps timeout when native window remains present for live pid", async () => {
  __testHooks.resetState();
  const targetPid = process.pid + 10001;
  const stubborn = makeFakeProcess({ shouldClose: false });
  stubborn.pid = targetPid;

  __testHooks.setOpenViews([{ deviceSerial: "T", process: stubborn, windowTitle: "BotApp Phone View · T · 1234" }]);
  __testHooks.setNativeWindowProbe(() => ({
    ok: true,
    reason: null,
    windows: [{ ownerPid: targetPid, windowTitle: "BotApp Phone View · T · 1234", windowId: 1, ownerName: "scrcpy" }],
  }));
  const result = await withProcessKillStub((...args) => {
    const [pid, , originalKill] = args;
    if (pid === targetPid) return;
    return originalKill.call(process, pid);
  }, () => closeDeviceView("T"));

  assert.equal(result.ok, false);
  assert.equal(result.reason, "close_timeout");
  assert.equal(__testHooks.listOpenViews().length, 1);
});

test("closeDeviceView treats process death without close event as success", async () => {
  __testHooks.resetState();
  let killed = false;
  const targetPid = process.pid + 10002;
  const processHandle = makeFakeProcess({
    shouldClose: false,
    onKill: () => {
      processHandle.exitCode = 9;
      killed = true;
    },
  });
  processHandle.pid = targetPid;

  __testHooks.setOpenViews([{ deviceSerial: "T", process: processHandle, windowTitle: "BotApp Phone View · T · 1234" }]);
  const result = await withProcessKillStub((...args) => {
    const [pid, , originalKill] = args;
    if (pid === targetPid) return;
    return originalKill.call(process, pid);
  }, () => closeDeviceView("T"));

  assert.equal(result.ok, true);
  assert.equal(result.reason, "closed");
  assert.equal(killed, true);
  assert.equal(__testHooks.listOpenViews().length, 0);
});

test("closeDeviceView reconciles delayed PID death after the initial timeout", async () => {
  __testHooks.resetState();
  const targetPid = process.pid + 10004;
  let alive = true;
  const processHandle = makeFakeProcess({
    shouldClose: false,
    onKill: () => {
      setTimeout(() => {
        alive = false;
      }, 2700);
    },
  });
  processHandle.pid = targetPid;

  __testHooks.setOpenViews([{ deviceSerial: "T", process: processHandle, windowTitle: "BotApp Phone View · T · 1234" }]);
  __testHooks.setNativeWindowProbe(() => ({ ok: false, reason: "native_window_probe_failed", windows: [] }));
  const result = await withProcessKillStub((...args) => {
    const [pid, , originalKill] = args;
    if (pid === targetPid) {
      if (alive) return;
      const error = new Error("No such process");
      error.code = "ESRCH";
      throw error;
    }
    return originalKill.call(process, pid);
  }, () => closeDeviceView("T"));

  assert.equal(result.ok, true);
  assert.equal(result.reason, "closed");
  assert.equal(__testHooks.listOpenViews().length, 0);
});

test("closeDeviceView native probe is asynchronous and does not block the event loop", async () => {
  __testHooks.resetState();
  const targetPid = process.pid + 10003;
  const stubborn = makeFakeProcess({ shouldClose: false });
  stubborn.pid = targetPid;
  let eventLoopAdvanced = false;

  __testHooks.setOpenViews([{ deviceSerial: "T", process: stubborn, windowTitle: "BotApp Phone View · T · 1234" }]);
  __testHooks.setNativeWindowProbe(() => new Promise((resolve) => {
    setTimeout(() => resolve({ ok: true, reason: null, windows: [] }), 50);
  }));
  setTimeout(() => {
    eventLoopAdvanced = true;
  }, 10);

  const result = await withProcessKillStub((...args) => {
    const [pid, , originalKill] = args;
    if (pid === targetPid) return;
    return originalKill.call(process, pid);
  }, () => closeDeviceView("T"));

  assert.equal(result.ok, true);
  assert.equal(eventLoopAdvanced, true);
});

test("closeDeviceView is idempotent when process already dead", async () => {
  __testHooks.resetState();
  const dead = makeFakeProcess();
  dead.exitCode = 9;
  dead.killed = true;
  __testHooks.setOpenViews([{ deviceSerial: "D", process: dead, windowTitle: "BotApp Phone View · D · 2222" }]);

  const result = await closeDeviceView("D");
  assert.equal(result.ok, true);
  assert.equal(result.reason, "already_closed");
  assert.equal(__testHooks.listOpenViews().length, 0);
});

test("double close is deterministic", async () => {
  __testHooks.resetState();
  const process = makeFakeProcess();
  __testHooks.setOpenViews([{ deviceSerial: "X", process, windowTitle: "BotApp Phone View · X · 3333" }]);

  const [first, second] = await Promise.all([closeDeviceView("X"), closeDeviceView("X")]);
  assert.equal(first.ok || second.ok, true);
  assert.equal(first.reason === "close_in_progress" || second.reason === "close_in_progress", true);
});
