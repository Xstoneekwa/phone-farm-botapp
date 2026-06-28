import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../electron/preload.cjs", import.meta.url), "utf8");
const devicesViewSource = readFileSync(new URL("./Devices.tsx", import.meta.url), "utf8");
const preflightRouteSource = readFileSync(
  new URL("../../../boost-ai-frontend/app/api/instagram-dashboard/devices/delete-phone-preflight/route.ts", import.meta.url),
  "utf8",
);

test("devices delete preflight uses authenticated relay endpoint registry", () => {
  assert.match(mainSource, /id:\s*"devices_delete_preflight"/);
  assert.match(mainSource, /\/api\/instagram-dashboard\/devices\/delete-phone-preflight/);
  assert.match(mainSource, /dashboardRequestResult\("POST",\s*"devices_delete_preflight"/);
  assert.match(mainSource, /ipcMain\.handle\("botapp:devices:delete-preflight"/);
});

test("devices delete preflight ipc is exposed through preload", () => {
  assert.match(preloadSource, /deletePreflight:\s*\(input\)\s*=>\s*ipcRenderer\.invoke\("botapp:devices:delete-preflight"/);
});

test("relay delete preflight route accepts BotApp relay auth not web session only", () => {
  assert.match(preflightRouteSource, /requireRelayOrAdmin\(request,\s*"Delete phone preflight"\)/);
  assert.doesNotMatch(preflightRouteSource, /requireInstagramAdmin\(\)/);
});

test("delete modal loads preflight through ipc and keeps final delete gated", () => {
  assert.match(devicesViewSource, /window\.botappDesktop\?\.devices\?\.deletePreflight/);
  assert.match(devicesViewSource, /canConfirmDeviceDelete/);
  assert.match(devicesViewSource, /preflightAligned/);
  assert.match(devicesViewSource, /disabled=\{!canDelete \|\| submitting\}/);
  assert.match(devicesViewSource, /if \(!canDelete \|\| submitting \|\| !preflightAligned\) return;/);
  assert.doesNotMatch(devicesViewSource, /deletePreflight[\s\S]{0,400}confirmDelete\(\)/);
});

test("devices delete relay calls include relay headers helper", () => {
  const deleteBlock = mainSource.slice(mainSource.indexOf("async function deviceDeletePreflight"));
  assert.match(deleteBlock.slice(0, 800), /dashboardRequestResult\("POST",\s*"devices_delete_preflight"/);
  assert.match(mainSource, /function relayHeaders/);
  assert.match(mainSource, /headers:\s*relayHeaders\(cfg\)/);
});

test("devices delete preflight refuses missing relay url before network call", () => {
  const deleteBlock = mainSource.slice(mainSource.indexOf("async function deviceDeletePreflight"));
  assert.match(deleteBlock.slice(0, 500), /if \(!cfg\.relayUrl\) return \{ ok: false/);
});
