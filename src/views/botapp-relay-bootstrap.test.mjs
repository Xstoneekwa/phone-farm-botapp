import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("relay credential store uses secure storage module", () => {
  const main = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
  const store = readFileSync(new URL("../../electron/relay-credential-store.cjs", import.meta.url), "utf8");
  assert.match(main, /relay-credential-store\.cjs/);
  assert.match(main, /bootstrapRelayConfig/);
  assert.match(main, /saveRelayKeyToSecureStore/);
  assert.match(main, /readDisabledRuntimeConfigBackup/);
  assert.match(store, /safeStorage/);
});

test("userData path is canonicalized before app ready", () => {
  const main = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
  const readyIndex = main.indexOf("app.whenReady()");
  const setPathIndex = main.indexOf('app.setPath("userData", canonicalUserDataDir())');
  assert.ok(setPathIndex >= 0, "expected app.setPath for canonical userData");
  assert.ok(readyIndex >= 0, "expected app.whenReady handler");
  assert.ok(setPathIndex < readyIndex, "userData must be set before app ready on macOS");
});

test("repair and dispatcher ensure IPC are exposed to renderer", () => {
  const preload = readFileSync(new URL("../../electron/preload.cjs", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  assert.match(preload, /botapp:relay:repair/);
  assert.match(preload, /botapp:dispatcher:ensure/);
  assert.match(appSource, /Repair connection/);
  assert.match(appSource, /BotApp connection: operational/);
  assert.match(appSource, /Start dispatcher/);
});

test("dispatcher autostart uses install and resume allowlist", () => {
  const main = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
  assert.match(main, /ensureDispatcherAutostart/);
  assert.match(main, /runDispatcherWrapper\("install"/);
  assert.match(main, /runDispatcherWrapper\("resume"/);
  assert.match(main, /"install"/);
});

test("runtime controls use canonical controller without legacy worker fallback", () => {
  const main = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
  assert.match(main, /phonefarm-runtime\/bin\/phonefarm-runtimectl/);
  assert.match(main, /spawnSync\(dispatcherWrapperPath, \["dispatcher", command/);
  assert.match(main, /spawnSync\(deviceHeartbeatServiceWrapperPath, \["heartbeat", command/);
  assert.doesNotMatch(main, /\/Users\/admin\/instagram-worker-python/);
  assert.doesNotMatch(main, /BOTAPP_DISPATCHER_WRAPPER_PATH/);
});

test("runtime health exposes relay repair action", () => {
  const runtime = readFileSync(new URL("./RuntimeHealth.tsx", import.meta.url), "utf8");
  assert.match(runtime, /relay\?\.repair/);
  assert.match(runtime, /Réparer la connexion/);
});
