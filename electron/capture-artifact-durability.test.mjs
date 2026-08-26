import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function source(relativePath) {
  return readFileSync(join(__dirname, relativePath), "utf8");
}

test("integration capture verifies PNG durability before saved log", () => {
  const main = source("main.cjs");
  const helperIndex = main.indexOf("async function captureVerifiedPng");
  const captureIndex = main.indexOf("const artifact = await captureVerifiedPng");
  const metaIndex = main.indexOf("writeCaptureStepMeta(outDir, step.file");
  const logIndex = main.indexOf("console.log(`[BotApp integration capture] saved ${step.file}`)");

  assert.ok(helperIndex > -1, "captureVerifiedPng helper is required");
  assert.ok(captureIndex > helperIndex, "capture loop must call captureVerifiedPng");
  assert.ok(metaIndex > captureIndex, "metadata is written after verified PNG");
  assert.ok(logIndex > metaIndex, "saved log is emitted after verified PNG and metadata");
  assert.match(main, /fs\.statSync\(resolvedTarget\)/);
  assert.match(main, /stats\.size <= 0/);
  assert.match(main, /crypto\.createHash\("sha256"\)/);
  assert.match(main, /pngPath: artifact\.path/);
  assert.match(main, /pngSizeBytes: artifact\.size/);
  assert.match(main, /sha256: artifact\.sha256/);
});

test("integration rehearsal validates steps without writing PNG artifacts", () => {
  const main = source("main.cjs");
  const rehearsalIndex = main.indexOf("function captureRehearsalOnlyMode");
  const branchIndex = main.indexOf("if (rehearsalOnly)");
  const pngIndex = main.indexOf("const artifact = await captureVerifiedPng");

  assert.ok(rehearsalIndex > -1, "rehearsal mode helper is required");
  assert.ok(branchIndex > rehearsalIndex, "rehearsal branch must exist in capture loop");
  assert.ok(branchIndex < pngIndex, "rehearsal branch must run before PNG capture");
  assert.match(main, /BOTAPP_INTEGRATION_CAPTURE_REHEARSAL_ONLY/);
  assert.match(main, /BOTAPP_CAPTURE_REHEARSAL_REPORT/);
  assert.match(main, /mode: "capture-rehearsal"/);
});

test("drawer and action captures wait for semantic proof before screenshots", () => {
  const main = source("main.cjs");
  const waitIndex = main.indexOf("async function waitForDrawerLoaded");
  const actionProofIndex = main.indexOf("async function waitForActionProof");
  const captureIndex = main.indexOf("const artifact = await captureVerifiedPng");

  assert.ok(waitIndex > -1, "drawer wait helper exists");
  assert.ok(actionProofIndex > waitIndex, "action proof helper exists after drawer readiness");
  assert.ok(actionProofIndex < captureIndex, "action proof is available before PNG capture");
  assert.match(main, /incident-drawer-detail-ready/);
  assert.match(main, /Loading incident detail/);
  assert.match(main, /Refusing drawer capture while incident detail is loading/);
  assert.match(main, /botapp-incident-action-proof/);
  assert.match(main, /waitForActionButtonEnabled/);
  assert.match(main, /expectedAction/);
  assert.match(main, /assertionCompletedBeforeScreenshotAt/);
});

test("notification test captures wait for Slack and Discord loopback proof", () => {
  const main = source("main.cjs");

  assert.match(main, /waitForNotificationProof/);
  assert.match(main, /waitForNotificationButtonEnabled/);
  assert.match(main, /testNotificationChannels/);
  assert.match(main, /notificationOutboxItemCount/);
  assert.match(main, /local loopback/i);
  assert.match(main, /botapp-incident-notification-' \+ channel \+ '-proof/);
  assert.match(main, /attempt < 3/);
  assert.match(main, /waitForNotificationProof\(mainWindow, \[channel\]/);
});

test("operator notification settings preserve write-only drafts and reject unavailable tests", () => {
  const main = source("main.cjs");
  const renderer = readFileSync(join(__dirname, "../src/views/IncidentNotificationsSettings.tsx"), "utf8");

  assert.match(main, /dashboardRequestResult\("PATCH", "incidents_notification_settings_patch"/);
  assert.match(main, /dashboardRequestResult\("POST", "incidents_notification_test"/);
  assert.match(main, /unavailable\|not_configured\|disabled\|failed/i);
  assert.match(renderer, /function unwrapPayload/);
  assert.doesNotMatch(renderer, /setDrafts\(\{ slack: "", discord: "" \}\)/);
  assert.match(renderer, /setDrafts\(\(current\) => \(\{ \.\.\.current, \[channel\]: "" \}\)\)/);
  assert.match(renderer, /const canTest = Boolean\(row\?\.configured && row\.enabled\)/);
  assert.match(renderer, /Configure and enable this channel before testing/);
  assert.match(renderer, /message\.tone/);
});

test("device badge rehearsal waits for real devices projection before clicking", () => {
  const main = source("main.cjs");

  assert.match(main, /waitForDevicesIncidentBadgeSurface/);
  assert.match(main, /devicesDataCount/);
  assert.match(main, /deviceIncidentBadgeCount/);
  assert.match(main, /capture_click_target_missing/);
  assert.match(main, /Devices incident badge surface incomplete/);
});

test("runtime host-bound capture rejects stale screenshot ownership", () => {
  const main = source("main.cjs");

  assert.match(main, /function captureOwnership\(mainWindow\)/);
  assert.match(main, /captureSessionId/);
  assert.match(main, /webContentsId: mainWindow\.webContents\.id/);
  assert.match(main, /processId: typeof mainWindow\.webContents\.getOSProcessId/);
  assert.match(main, /function sameCaptureSource\(before, after\)/);
  assert.match(main, /before\.webContentsId === after\.webContentsId/);
  assert.match(main, /capture_webcontents_ownership_changed/);
  assert.match(main, /Page\.captureScreenshot/);
  assert.match(main, /screenshotSource: "webContents\.debugger\.Page\.captureScreenshot"/);
  assert.doesNotMatch(main, /webContents\.capturePage\(\)/);
});
