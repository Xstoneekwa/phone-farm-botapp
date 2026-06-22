import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  findOpenDeviceViewDeepLink,
  parseOpenDeviceViewDeepLink,
} from "../../electron/open-device-view-protocol.cjs";

const mainSource = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
const builderSource = readFileSync(new URL("../../electron-builder.json", import.meta.url), "utf8");

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
