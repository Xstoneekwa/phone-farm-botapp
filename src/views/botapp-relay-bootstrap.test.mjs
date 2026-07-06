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
  assert.match(main, /runDispatcherWrapperAsync\("install"/);
  assert.match(main, /runDispatcherWrapperAsync\("resume"/);
  assert.match(main, /"install"/);
});

test("runtime controls use canonical controller without legacy worker fallback", () => {
  const main = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../../electron/runtime-controller.cjs", import.meta.url), "utf8");
  assert.match(controller, /phonefarm-runtime\/bin\/phonefarm-runtimectl/);
  assert.match(main, /const dispatcherWrapperPath = runtimeControllerPath/);
  assert.match(main, /const deviceHeartbeatServiceWrapperPath = runtimeControllerPath/);
  // The async bridge is the only runtime control path (no blocking spawnSync).
  assert.match(main, /runDispatcherWrapperAsync\(/);
  assert.doesNotMatch(main, /spawnSync\(dispatcherWrapperPath/);
  assert.doesNotMatch(main, /\/Users\/admin\/instagram-worker-python/);
  assert.doesNotMatch(main, /BOTAPP_DISPATCHER_WRAPPER_PATH/);
  // The legacy worker root stays an explicit guard in the controller module.
  assert.match(controller, /LEGACY_WORKER_ROOT/);
});

test("runtime health exposes relay repair action", () => {
  const runtime = readFileSync(new URL("./RuntimeHealth.tsx", import.meta.url), "utf8");
  assert.match(runtime, /relay\?\.repair/);
  assert.match(runtime, /Réparer la connexion/);
});
