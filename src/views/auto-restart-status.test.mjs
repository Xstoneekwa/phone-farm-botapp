import assert from "node:assert/strict";
import test from "node:test";
import { buildAutoRestartOverview } from "../data/auto-restart-data.ts";
import { projectAutoRestartTruth, runtimeControlDisabled } from "./auto-restart-status.ts";

const relayOk = { ok: true, relay_authenticated: true };
const dispatcherOk = { status: "running", processRunning: true };

test("backend pending is blocked, not presented as active", () => {
  const overview = buildAutoRestartOverview();
  const truth = projectAutoRestartTruth({
    overview,
    relayHealth: relayOk,
    dispatcherHealth: dispatcherOk,
  });
  assert.equal(truth.schedulerExecutable, false);
  assert.equal(truth.operationalState, "blocked");
  assert.equal(truth.autoRestartTitle, "Blocked");
});

test("ready overview does not show permanent preview-only mode", () => {
  const overview = {
    ...buildAutoRestartOverview(),
    enabled: true,
    mode: "dry_run",
    operationalState: "ready",
    backendSyncStatus: "relay_ready",
    sourceSummary: "Ready to activate.",
  };
  const truth = projectAutoRestartTruth({
    overview,
    relayHealth: relayOk,
    dispatcherHealth: dispatcherOk,
  });
  assert.equal(truth.operationalState, "ready");
  assert.equal(truth.autoRestartTitle, "Ready to activate");
});

test("runtime controls stay disabled until scheduler is executable", () => {
  const overview = buildAutoRestartOverview();
  const truth = projectAutoRestartTruth({
    overview,
    relayHealth: relayOk,
    dispatcherHealth: dispatcherOk,
  });
  const runtimeControl = overview.controls.find((row) => row.action === "restart_eligible_sessions");
  assert.ok(runtimeControl);
  assert.equal(runtimeControlDisabled(runtimeControl, truth), true);
});
