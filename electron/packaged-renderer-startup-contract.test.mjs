import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./main.cjs", import.meta.url), "utf8");

test("operator window is requested before backend and runtime health awaits", () => {
  const operatorWindow = source.indexOf('writeStartupTrace("main_window_requested", "mode=operator")');
  const relayHealth = source.indexOf("const relay = await botappRelayHealth()", operatorWindow);
  const heartbeatEnsure = source.indexOf("deviceHeartbeat = await ensureDeviceHeartbeatAutostart()", operatorWindow);
  const dispatcherEnsure = source.indexOf("dispatcher = await ensureDispatcherAutostart()", operatorWindow);

  assert.ok(operatorWindow >= 0, "operator window trace must exist");
  assert.ok(relayHealth > operatorWindow, "relay health must not block window creation");
  assert.ok(heartbeatEnsure > operatorWindow, "heartbeat health must not block window creation");
  assert.ok(dispatcherEnsure > operatorWindow, "dispatcher health must not block window creation");
});

test("packaged renderer lifecycle is persisted without URLs or credentials", () => {
  for (const event of [
    "renderer_load_started",
    "renderer_dom_ready",
    "renderer_ready_to_show",
    "renderer_load_finished",
    "renderer_load_failed",
    "renderer_process_gone",
    "renderer_unresponsive",
  ]) {
    assert.match(source, new RegExp(`\\"${event}\\"`));
  }

  const failureHandler = source.slice(
    source.indexOf('mainWindow.webContents.on("did-fail-load"'),
    source.indexOf('mainWindow.webContents.on("render-process-gone"'),
  );
  assert.doesNotMatch(failureHandler, /validatedURL/);
  assert.doesNotMatch(failureHandler, /relayKey|credential|Authorization/);
});
