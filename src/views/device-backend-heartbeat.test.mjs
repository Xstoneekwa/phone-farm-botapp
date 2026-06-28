import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ASSIGNMENT_HEARTBEAT_STALE_MS,
  buildHeartbeatDiagnostic,
  formatRelativeTimeFr,
  isAssignmentHeartbeatLive,
  isDeviceLiveAssignmentCapacity,
  projectBackendHeartbeat,
  summarizeBackendHeartbeats,
} from "./device-backend-heartbeat.ts";

const now = new Date("2026-06-28T20:00:00.000Z");

function physicalDevice(overrides = {}) {
  return {
    id: "phone-1",
    name: "Samsung A16-01",
    model: "Samsung A16",
    status: "connected",
    adbSerial: "RFGL001",
    shortSerial: "RFGL…001",
    deviceKind: "physical_phone",
    pool: "full_cycle",
    product: "a16nsxx",
    deviceCode: "a16",
    profileCount: 4,
    latencyMs: null,
    appInstancesCount: 4,
    appInstancesAvailableCount: 2,
    appInstancesOccupiedCount: 2,
    heartbeatStatus: "connected",
    hostLabel: null,
    hubLabel: null,
    hubPort: null,
    viewAvailable: true,
    viewUnavailableReason: null,
    battery: 0,
    cloneCount: 4,
    activeSession: null,
    nextBufferEndsAt: null,
    lockReason: null,
    backendStatus: "available",
    backendLastSeenAt: new Date(now.getTime() - 18_000).toISOString(),
    backendHeartbeatDbStatus: "online",
    localAdbStatus: "device",
    ...overrides,
  };
}

test("assignment heartbeat live uses online status and 15 minute threshold", () => {
  const fresh = new Date(now.getTime() - 60_000).toISOString();
  const stale = new Date(now.getTime() - ASSIGNMENT_HEARTBEAT_STALE_MS - 1000).toISOString();
  assert.equal(isAssignmentHeartbeatLive("online", fresh, now), true);
  assert.equal(isAssignmentHeartbeatLive("online", stale, now), false);
  assert.equal(isAssignmentHeartbeatLive("stale", fresh, now), false);
  assert.equal(isAssignmentHeartbeatLive("offline", fresh, now), false);
});

test("adb connected with fresh backend heartbeat is active and assignable", () => {
  const projection = projectBackendHeartbeat(physicalDevice(), { now });
  assert.equal(projection?.labelFr, "Actif");
  assert.equal(projection?.assignable, true);
  assert.equal(projection?.consequenceFr, "Prêt pour une nouvelle assignation");
});

test("adb connected with expired backend heartbeat is not assignable and explains operator action", () => {
  const projection = projectBackendHeartbeat(
    physicalDevice({
      backendLastSeenAt: new Date(now.getTime() - ASSIGNMENT_HEARTBEAT_STALE_MS - 60_000).toISOString(),
      backendHeartbeatDbStatus: "stale",
      heartbeatStatus: "stale",
    }),
    { now },
  );
  assert.equal(projection?.labelFr, "Expiré");
  assert.equal(projection?.assignable, false);
  assert.match(projection?.explanationFr || "", /connecté à ce Mac/);
  assert.match(projection?.explanationFr || "", /Relancez les heartbeats/);
});

test("adb absent with fresh backend heartbeat keeps distinct non-misleading states", () => {
  const projection = projectBackendHeartbeat(
    physicalDevice({
      localAdbStatus: "not_seen",
      status: "maintenance",
    }),
    { now },
  );
  assert.equal(projection?.labelFr, "Actif");
  assert.equal(projection?.assignable, true);
});

test("missing heartbeat data stays unknown", () => {
  const projection = projectBackendHeartbeat(
    physicalDevice({
      backendLastSeenAt: "",
      backendHeartbeatDbStatus: "unknown",
      heartbeatStatus: "unknown",
    }),
    { now },
  );
  assert.equal(projection?.labelFr, "Inconnu");
  assert.equal(projection?.consequenceFr, "État backend indisponible");
});

test("summary counts physical phones only", () => {
  const summary = summarizeBackendHeartbeats(
    [
      physicalDevice(),
      physicalDevice({
        id: "phone-2",
        name: "Samsung A16-02",
        backendLastSeenAt: new Date(now.getTime() - ASSIGNMENT_HEARTBEAT_STALE_MS - 1000).toISOString(),
        backendHeartbeatDbStatus: "stale",
      }),
      physicalDevice({ id: "emu-1", deviceKind: "emulator", name: "Emulator" }),
    ],
    now,
  );
  assert.equal(summary.totalPhysical, 2);
  assert.equal(summary.active, 1);
  assert.equal(summary.expired, 1);
  assert.equal(summary.assignableCapacityCount, 1);
  assert.equal(summary.globalReady, true);
  assert.match(summary.globalLabelFr, /Assignations prêtes/);
});

test("two adb phones ready and one offline inventory does not block globally", () => {
  const summary = summarizeBackendHeartbeats(
    [
      physicalDevice({ id: "phone-1", name: "Samsung A16-01" }),
      physicalDevice({ id: "phone-2", name: "Samsung A16-02" }),
      physicalDevice({
        id: "phone-legacy",
        name: "Entry 2C Physical Outreach Phone",
        localAdbStatus: "not_seen",
        backendLastSeenAt: "",
        backendHeartbeatDbStatus: "unknown",
        heartbeatStatus: "unknown",
      }),
    ],
    now,
  );
  assert.equal(summary.assignableCapacityCount, 2);
  assert.equal(summary.globalReady, true);
  assert.match(summary.globalLabelFr, /2 Samsung actifs/);
  assert.equal(summary.secondaryAlertFr, "1 téléphone inventorié n'est pas connecté localement");
});

test("zero assignable capacity keeps global block honest", () => {
  const summary = summarizeBackendHeartbeats(
    [
      physicalDevice({
        backendLastSeenAt: new Date(now.getTime() - ASSIGNMENT_HEARTBEAT_STALE_MS - 1000).toISOString(),
        backendHeartbeatDbStatus: "stale",
      }),
      physicalDevice({
        id: "phone-legacy",
        name: "Entry 2C Physical Outreach Phone",
        localAdbStatus: "not_seen",
        backendLastSeenAt: "",
        backendHeartbeatDbStatus: "unknown",
      }),
    ],
    now,
  );
  assert.equal(summary.assignableCapacityCount, 0);
  assert.equal(summary.globalReady, false);
  assert.match(summary.globalLabelFr, /Assignations bloquées/);
});

test("live assignment capacity requires adb, heartbeat, inventory status and selectable clone", () => {
  assert.equal(isDeviceLiveAssignmentCapacity(physicalDevice(), now), true);
  assert.equal(isDeviceLiveAssignmentCapacity(physicalDevice({ localAdbStatus: "not_seen" }), now), false);
  assert.equal(isDeviceLiveAssignmentCapacity(physicalDevice({ appInstancesAvailableCount: 0, appInstances: [] }), now), false);
});

test("devices view wires backend heartbeat summary and restart action additively", () => {
  const devicesView = readFileSync(new URL("./Devices.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./devices.css", import.meta.url), "utf8");
  assert.match(devicesView, /BackendHeartbeatSummary/);
  assert.match(devicesView, /BackendHeartbeatIndicator/);
  assert.match(devicesView, /Relancer les heartbeats/);
  assert.match(devicesView, /device-backend-heartbeat/);
  assert.match(devicesView, /devices-delete-preflight/);
  assert.match(devicesView, /releasedAssignmentsInfoFr/);
  assert.match(devicesView, /deletePreflight/);
  assert.doesNotMatch(devicesView, /device_heartbeats/);
  assert.match(css, /\.devices-backend-heartbeat-summary/);
  assert.match(css, /\.devices-backend-heartbeat-secondary/);
  assert.match(css, /\.devices-backend-heartbeat-indicator/);
});

test("restart heartbeat IPC uses async non-blocking recovery supervisor", () => {
  const mainSource = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
  const preloadSource = readFileSync(new URL("../../electron/preload.cjs", import.meta.url), "utf8");
  const devicesView = readFileSync(new URL("./Devices.tsx", import.meta.url), "utf8");
  const runtimeHealthSource = readFileSync(new URL("./RuntimeHealth.tsx", import.meta.url), "utf8");
  assert.match(mainSource, /startDeviceHeartbeatRecovery/);
  assert.match(mainSource, /runDeviceHeartbeatWrapperAsync/);
  assert.match(mainSource, /runDeviceHeartbeatRecoveryJob/);
  assert.match(mainSource, /botapp:devices:heartbeat-recovery/);
  assert.match(mainSource, /adbPresentPhysicalHeartbeatDevices/);
  assert.match(mainSource, /offline_excluded_count/);
  assert.match(mainSource, /botapp:devices:delete-preflight/);
  assert.match(mainSource, /botapp:devices:delete/);
  assert.match(mainSource, /device_heartbeat_service\.sh/);
  assert.match(mainSource, /ensureDeviceHeartbeatAutostart/);
  assert.match(preloadSource, /restartHeartbeatPublisher/);
  assert.match(preloadSource, /subscribeHeartbeatRecovery/);
  assert.match(devicesView, /subscribeHeartbeatRecovery/);
  assert.match(devicesView, /service_verifying/);
  assert.match(devicesView, /waiting_heartbeat/);
  assert.match(runtimeHealthSource, /Device heartbeat service/);
  assert.doesNotMatch(mainSource, /async function restartDeviceHeartbeatPublisher/);
  const recoveryBlock = mainSource.slice(mainSource.indexOf("async function runDeviceHeartbeatRecoveryJob"));
  assert.doesNotMatch(recoveryBlock.slice(0, 4000), /spawnSync\(/);
  assert.match(recoveryBlock.slice(0, 4000), /runDeviceHeartbeatWrapperAsync/);
  assert.match(recoveryBlock.slice(0, 4000), /fetchPhysicalDeviceHeartbeatSnapshot/);
  assert.match(recoveryBlock.slice(0, 6000), /adbPresentPhysicalHeartbeatDevices/);
  assert.doesNotMatch(recoveryBlock.slice(0, 6000), /physical\.every\(isPhysicalDeviceAssignmentHeartbeatLive\)/);
  assert.doesNotMatch(mainSource, /restart_all_phones/);
});

test("diagnostic copy stays redacted", () => {
  const diagnostic = buildHeartbeatDiagnostic(
    [physicalDevice({ backendLastSeenAt: new Date(now.getTime() - ASSIGNMENT_HEARTBEAT_STALE_MS - 1000).toISOString(), backendHeartbeatDbStatus: "stale" })],
    { ok: false, stage: "heartbeat_timeout", published_count: 2, error: "timeout" },
  );
  const serialized = JSON.stringify(diagnostic);
  assert.doesNotMatch(serialized, /SUPABASE|service_role|token|password|secret|device_heartbeats/i);
  assert.equal(diagnostic.devices[0].label, "Samsung A16-01");
});

test("relative time formatting is readable in french", () => {
  assert.equal(formatRelativeTimeFr(new Date(now.getTime() - 18_000).toISOString(), now), "il y a 18 s");
  assert.equal(formatRelativeTimeFr(new Date(now.getTime() - 4 * 60_000).toISOString(), now), "il y a 4 min");
  assert.equal(formatRelativeTimeFr(new Date(now.getTime() - 2 * 60 * 60_000).toISOString(), now), "il y a 2 h");
});
