import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
const menuSource = readFileSync(new URL("../views/client-accounts/AccountStatusActionMenu.tsx", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../electron/preload.cjs", import.meta.url), "utf8");

test("BotApp relay registers needs more targets endpoint and ipc bridge", () => {
  assert.match(mainSource, /client_accounts_needs_more_targets/);
  assert.match(mainSource, /client-accounts\/needs-more-targets/);
  assert.match(mainSource, /performClientAccountNeedsMoreTargetsAction/);
  assert.match(mainSource, /botapp:client-accounts:needs-more-targets/);
  assert.match(mainSource, /overlayClientAccountNeedsMoreTargets/);
  assert.match(mainSource, /needs_more_target_accounts_signal_only/);
  assert.doesNotMatch(mainSource, /start_run:\s*true[\s\S]*needs_more_targets/);
});

test("BotApp client accounts menu keeps lifecycle actions and adds needs more targets", () => {
  assert.match(menuSource, /buildLifecycleAvailability/);
  assert.match(menuSource, /applyNeedsMoreTargetsAction/);
  assert.match(menuSource, /needsMoreTargetsAvailability\.label/);
  assert.match(menuSource, /runNeedsMoreTargetsAction/);
});

test("BotApp preload exposes needs more targets ipc without touching lifecycle bridge", () => {
  assert.match(preloadSource, /applyNeedsMoreTargets/);
  assert.match(preloadSource, /botapp:client-accounts:needs-more-targets/);
  assert.match(preloadSource, /applyStatus/);
});
