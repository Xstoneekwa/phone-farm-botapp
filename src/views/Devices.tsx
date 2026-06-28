import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BotAppAddPhonePayload, BotAppDeviceHistoryEntry, BotAppRestartPhonePayload, Device } from "../api/types";
import type { DeviceViewResult, DeviceViewState, LocalToolDiagnostics } from "../desktop/device-views";
import { closeAllDeviceViews, closeDeviceView, focusDeviceView, listOpenDeviceViews, openDeviceView, subscribeDeviceViewState } from "../desktop/device-views";
import {
  buildHeartbeatDiagnostic,
  projectBackendHeartbeat,
  summarizeBackendHeartbeats,
} from "./device-backend-heartbeat";
import "./devices.css";

type DevicePanel = "add" | "history" | "edit" | "delete" | null;
type ConfirmState =
  | { kind: "restart_all"; devices: Device[] }
  | { kind: "restart_phone"; device: Device }
  | null;

const packagesMode = "standard_instagram_4_packages" as const;

function deviceIdempotencyKey(action: string, ids: string[]) {
  return `botapp:devices:${action}:${ids.join("-")}:preview`;
}

function isConnectedDevice(device: Device) {
  return device.localAdbStatus === "device" || device.status === "connected" || device.status === "online" || device.status === "reserved";
}

function connectedDevices(devices: Device[]) {
  return devices.filter(isConnectedDevice);
}

function restartPayload(devices: Device[], action: "restart_phone" | "restart_all_phones"): BotAppRestartPhonePayload {
  const connected = connectedDevices(devices);
  return {
    action,
    device_ids: connected.map((device) => device.id),
    requested_by: null,
    source: "BotApp",
    idempotency_key: deviceIdempotencyKey(action, connected.map((device) => device.id)),
    metadata_safe: {
      device_labels: connected.map((device) => device.name),
      connected_count: connected.length,
      offline_skipped_count: devices.length - connected.length,
      expected_effect: "restart_phone_via_secure_device_control",
    },
  };
}

function addPhonePayload(form: AddPhoneFormState): BotAppAddPhonePayload {
  return {
    action: "add_physical_phone",
    display_name: form.displayName.trim(),
    adb_serial: form.adbSerial.trim(),
    model: form.model.trim() || null,
    product: form.product.trim() || null,
    device: form.device.trim() || null,
    pool: form.pool,
    max_clones: Math.max(3, Math.min(16, Number(form.maxClones) || 3)),
    hub_label: form.hubLabel.trim() || null,
    hub_port: form.hubPort.trim() || null,
    host_label: form.hostLabel.trim() || null,
    packages_mode: packagesMode,
    requested_by: null,
    source: "BotApp",
    metadata_safe: {
      expected_effect: "register_phone_inventory_only",
      app_instances_package_set: packagesMode,
    },
  };
}

function statusLabel(device: Device) {
  if (device.localAdbStatus === "device") return "Connected";
  if (device.localAdbStatus === "adb_unavailable") return "ADB unavailable";
  if (device.localAdbStatus === "not_seen") return "Not seen locally";
  if (device.status === "offline") return "Offline";
  if (device.status === "maintenance") return "Inactive";
  return "Backend ready";
}

function statusClass(device: Device) {
  return isConnectedDevice(device) ? "connected" : "offline";
}

function latencyLabel(device: Device) {
  return typeof device.latencyMs === "number" ? `${device.latencyMs}ms` : "";
}

function isViewOpen(openViews: DeviceViewState[], device: Device) {
  return openViews.some((view) => view.deviceSerial === deviceViewSerial(device));
}

function deviceViewSerial(device: Device) {
  return device.adbSerial || device.id;
}

function formatViewFailure(deviceName: string, result: DeviceViewResult) {
  const reason = result.reason ? ` (${result.reason})` : "";
  const detail = result.error ? `: ${result.error}` : "";
  return `Failed to open ${deviceName} phone view${reason}${detail}`;
}

function formatViewOpened(deviceName: string, result: DeviceViewResult) {
  if (result.userMessage) return result.userMessage;
  if (result.botAppFullscreen) {
    return `${deviceName} phone view opened in another Space because BotApp is fullscreen. Use windowed mode to keep it above BotApp.`;
  }
  if (result.visibleFrontmost === false || result.focused === false) {
    return `${deviceName} phone view opened, but macOS placed it outside BotApp. Check the Phone View window or exit fullscreen.`;
  }
  return `${deviceName} phone view opened.`;
}

function formatViewFocused(deviceName: string, result: DeviceViewResult) {
  if (result.userMessage) return result.userMessage;
  if (result.botAppFullscreen) {
    return `${deviceName} phone view opened in another Space because BotApp is fullscreen. Use windowed mode to keep it above BotApp.`;
  }
  if (result.visibleFrontmost === false || result.focused === false) {
    return `${deviceName} phone view is open, but macOS placed it outside BotApp. Check the Phone View window or exit fullscreen.`;
  }
  return `${deviceName} phone view focused.`;
}

function formatToolPath(path: string | null) {
  return path || "missing";
}

function localToolsMessage(tools: LocalToolDiagnostics | null) {
  if (!tools) return null;
  if (!tools.adb.found) return "ADB not found by BotApp. Set ADB env or install Android platform-tools.";
  if (!tools.scrcpy.found) return "scrcpy not found by BotApp. Install scrcpy or set SCRCPY env.";
  return `Local tools: ADB ${formatToolPath(tools.adb.path)} · scrcpy ${formatToolPath(tools.scrcpy.path)}`;
}

function historyFor(devices: Device[]): BotAppDeviceHistoryEntry[] {
  return devices.slice(0, 12).map((device, index) => ({
    id: `device-history-${device.id}`,
    deviceId: device.id,
    timestamp: `2026-06-10 ${String(18 - Math.floor(index / 2)).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}:00`,
    event: device.status === "offline" ? "heartbeat.offline" : index % 3 === 0 ? "view.ready" : "heartbeat.connected",
    status: device.status === "offline" ? "offline" : "connected",
    detail: device.status === "offline" ? `${device.name} skipped by phone-view bulk actions.` : `${device.name} inventory heartbeat projected as connected.`,
  }));
}

type AddPhoneFormState = {
  displayName: string;
  adbSerial: string;
  pool: "full_cycle" | "outreach_only";
  model: string;
  product: string;
  device: string;
  maxClones: string;
  hubLabel: string;
  hubPort: string;
  hostLabel: string;
};

const initialAddPhoneForm: AddPhoneFormState = {
  displayName: "",
  adbSerial: "",
  pool: "full_cycle",
  model: "",
  product: "",
  device: "",
  maxClones: "3",
  hubLabel: "",
  hubPort: "",
  hostLabel: "",
};

const HEARTBEAT_RECOVERY_BUSY_STAGES = new Set([
  "service_verifying",
  "waiting_heartbeat",
  "service_restart",
  "recovery_in_progress",
]);

export function Devices({ devices, onAction, onRefresh }: { devices: Device[]; onAction: (action: string, target: string, danger?: boolean) => void; onRefresh?: () => Promise<void> | void }) {
  const [openViews, setOpenViews] = useState<DeviceViewState[]>([]);
  const [panel, setPanel] = useState<DevicePanel>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [message, setMessage] = useState("");
  const [localTools, setLocalTools] = useState<LocalToolDiagnostics | null>(null);
  const [heartbeatRestartStage, setHeartbeatRestartStage] = useState<string | null>(null);
  const [lastPublisherResult, setLastPublisherResult] = useState<Record<string, unknown> | null>(null);
  const canRestartHeartbeats = typeof window.botappDesktop?.devices?.restartHeartbeatPublisher === "function";

  useEffect(() => {
    let cancelled = false;
    void listOpenDeviceViews().then((result) => {
      if (!cancelled && result.ok) {
        setOpenViews(result.data);
        if (result.tools) setLocalTools(result.tools);
      }
    });
    const unsubscribe = subscribeDeviceViewState((state) => {
      if (!cancelled) setOpenViews(state);
    });
    const unsubscribeRecovery = window.botappDesktop?.devices?.subscribeHeartbeatRecovery?.((result) => {
      if (cancelled) return;
      setLastPublisherResult(result as Record<string, unknown>);
      const stage = String(result?.stage || "");
      if (stage) setHeartbeatRestartStage(stage);
      if (result?.message) setMessage(String(result.message));
      if (stage === "heartbeat_received" && result?.ok) {
        void onRefresh?.();
      }
      if (stage === "heartbeat_timeout" || stage === "service_failed") {
        void onRefresh?.();
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeRecovery?.();
    };
  }, [onRefresh]);

  const savedCount = devices.length;
  const activeCount = connectedDevices(devices).length;
  const offlineCount = devices.filter((device) => device.status === "offline").length;
  const viewReadyDevices = devices.filter((device) => device.viewAvailable && device.status !== "offline");
  const history = useMemo(() => historyFor(devices), [devices]);
  const toolsMessage = localToolsMessage(localTools);
  void onAction;

  async function openPhoneView(device: Device) {
    setMessage("");
    if (!device.viewAvailable) {
      setMessage(device.viewUnavailableReason || "Phone view is unavailable.");
      return;
    }
    const serial = deviceViewSerial(device);
    if (isViewOpen(openViews, device)) {
      setMessage(`Focusing ${device.name} phone view...`);
      const result = await focusDeviceView(serial);
      if (result.ok) {
        setOpenViews(result.data);
        if (result.tools) setLocalTools(result.tools);
        setMessage(formatViewFocused(device.name, result));
        return;
      }
      if (result.tools) setLocalTools(result.tools);
      setMessage(formatViewFailure(device.name, result));
      return;
    }

    setMessage(`Opening ${device.name} phone view...`);
    const result = await openDeviceView({ deviceSerial: serial, deviceLabel: device.name });
    if (result.ok) {
      setOpenViews(result.data);
      if (result.tools) setLocalTools(result.tools);
      setMessage(formatViewOpened(device.name, result));
      return;
    }
    if (result.tools) setLocalTools(result.tools);
    setMessage(formatViewFailure(device.name, result));
  }

  async function openAll() {
    setMessage("Opening all local ADB phone views...");
    let opened = 0;
    let frontmost = 0;
    let failed = 0;
    let fullscreenDetected = false;
    const openable = viewReadyDevices.filter((device) => device.localAdbStatus === "device");
    const skipped = devices.length - openable.length;
    for (const device of openable) {
      if (isViewOpen(openViews, device)) {
        opened += 1;
        continue;
      }
      const result = await openDeviceView({
        deviceSerial: deviceViewSerial(device),
        deviceLabel: device.name,
        windowIndex: opened,
      });
      if (result.ok) {
        opened += 1;
        if (result.botAppFullscreen) fullscreenDetected = true;
        setOpenViews(result.data);
        if (result.tools) setLocalTools(result.tools);
      } else {
        if (result.tools) setLocalTools(result.tools);
        failed += 1;
      }
    }
    if (openable.length > 0) {
      const refocus = await focusDeviceView(deviceViewSerial(openable[openable.length - 1]));
      if (refocus.ok) {
        if (refocus.visibleFrontmost || refocus.focused) frontmost = 1;
        if (refocus.botAppFullscreen) fullscreenDetected = true;
        if (refocus.tools) setLocalTools(refocus.tools);
      }
    }
    const sameSpace = fullscreenDetected ? "failed_fullscreen" : "unknown";
    const summary = `Open All summary: opened ${opened}, frontmost ${frontmost}/${opened}, same_space ${sameSpace}, skipped ${skipped}, failed ${failed}.`;
    if (failed > 0) {
      setMessage(`Some phone views failed. ${summary}`);
      return;
    }
    if (fullscreenDetected) {
      setMessage(`Phone views opened in another Space because BotApp is fullscreen. Use windowed mode to keep them above BotApp. ${summary}`);
      return;
    }
    if (frontmost < 1 && opened > 0) {
      setMessage(`Phone views opened, but macOS placed them outside BotApp. Check the Phone View windows or exit fullscreen. ${summary}`);
      return;
    }
    setMessage(summary);
  }

  async function closeAll() {
    setMessage("");
    const result = await closeAllDeviceViews(openViews.map((view) => view.deviceSerial));
    if (result.ok) {
      setOpenViews(result.data);
      if (result.tools) setLocalTools(result.tools);
      setMessage("All open phone views closed.");
      return;
    }
    setMessage(result.error || "Could not close phone views.");
  }

  async function closeOne(device: Device) {
    const result = await closeDeviceView(deviceViewSerial(device));
    if (result.ok) {
      setOpenViews(result.data);
      setMessage(`${device.name} phone view closed.`);
    }
  }

  function openPanel(nextPanel: DevicePanel, device?: Device) {
    setSelectedDevice(device ?? devices[0] ?? null);
    setPanel(nextPanel);
  }

  function confirmRestart() {
    if (!confirmState) return;
    const targetDevices = confirmState.kind === "restart_all" ? confirmState.devices : [confirmState.device];
    const payload = restartPayload(targetDevices, confirmState.kind === "restart_all" ? "restart_all_phones" : "restart_phone");
    void payload;
    setMessage(`${confirmState.kind === "restart_all" ? "Restart All" : "Restart phone"} is not available from BotApp yet. No phone was restarted.`);
    setConfirmState(null);
  }

  async function refreshDevices() {
    setMessage("");
    if (!onRefresh) {
      setMessage("Refresh is unavailable in this runtime.");
      return;
    }
    await onRefresh();
    setMessage("Devices refreshed from shared backend and local ADB check.");
  }

  async function restartHeartbeats() {
    if (!canRestartHeartbeats || (heartbeatRestartStage && HEARTBEAT_RECOVERY_BUSY_STAGES.has(heartbeatRestartStage))) return;
    setMessage("Vérification du service…");
    setHeartbeatRestartStage("service_verifying");
    const result = await window.botappDesktop!.devices!.restartHeartbeatPublisher!();
    if (result?.message) setMessage(String(result.message));
    if (result?.stage) setHeartbeatRestartStage(String(result.stage));
    if (result?.started === false) return;
  }

  async function copyHeartbeatDiagnostic() {
    const diagnostic = buildHeartbeatDiagnostic(devices, lastPublisherResult);
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
      setMessage("Diagnostic copié.");
    } catch {
      setMessage("Impossible de copier le diagnostic.");
    }
  }

  return (
    <div className="devices-screen">
      <header className="devices-header">
        <div>
          <h2>Devices</h2>
          <div className="devices-counts">
            <span>{savedCount} saved</span>
            <span className="active">{activeCount} active</span>
            <span className="offline">{offlineCount} offline</span>
          </div>
          <BackendHeartbeatSummary devices={devices} />
        </div>
      </header>

      <div className="devices-layout">
        <section className="devices-card" aria-label="Saved phones">
          <div className="devices-list">
            {devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                heartbeatPending={Boolean(heartbeatRestartStage && HEARTBEAT_RECOVERY_BUSY_STAGES.has(heartbeatRestartStage))}
                isOpen={isViewOpen(openViews, device)}
                onOpen={() => void openPhoneView(device)}
                onClose={() => void closeOne(device)}
                onRestart={() => setConfirmState({ kind: "restart_phone", device })}
              />
            ))}
          </div>
        </section>

        <aside className="devices-actions-panel" aria-label="Device actions">
          <button type="button" className="device-action add" onClick={() => openPanel("add")}>+ Add</button>
          <button type="button" className="device-action" onClick={() => void refreshDevices()}>Refresh</button>
          {canRestartHeartbeats ? (
            <button type="button" className="device-action device-action-heartbeat" onClick={() => void restartHeartbeats()} disabled={Boolean(heartbeatRestartStage && HEARTBEAT_RECOVERY_BUSY_STAGES.has(heartbeatRestartStage))}>
              Relancer les heartbeats
            </button>
          ) : null}
          <button type="button" className="device-action" onClick={() => void openAll()}>Open All</button>
          <button type="button" className="device-action" onClick={() => void closeAll()}>Close All</button>
          <button type="button" className="device-action" onClick={() => setConfirmState({ kind: "restart_all", devices })}>Restart All</button>
          <button type="button" className="device-action" onClick={() => openPanel("history")}>History</button>
          <button type="button" className="device-action" onClick={() => openPanel("edit")}>Edit</button>
          <button type="button" className="device-action danger" onClick={() => openPanel("delete")}>Delete</button>
          <span className="devices-actions-footer">{savedCount} devices saved</span>
        </aside>
      </div>

      {message ? <div className="devices-message">{message}</div> : null}
      {heartbeatRestartStage === "service_verifying" ? <div className="devices-message devices-message-heartbeat">Vérification du service…</div> : null}
      {heartbeatRestartStage === "waiting_heartbeat" ? <div className="devices-message devices-message-heartbeat">Attente d'un heartbeat récent…</div> : null}
      {heartbeatRestartStage === "heartbeat_timeout" || heartbeatRestartStage === "service_failed" ? (
        <div className="devices-heartbeat-diagnostic-actions">
          <button type="button" className="device-action" onClick={() => void copyHeartbeatDiagnostic()}>Copier le diagnostic</button>
        </div>
      ) : null}
      {toolsMessage ? <div className="devices-message">{toolsMessage}</div> : null}

      {panel === "add" ? <AddPhoneDrawer onClose={() => setPanel(null)} onPrepared={() => setMessage("Add phone is backend_pending from BotApp. No fake phone was created.")} /> : null}
      {panel === "history" ? <HistoryDrawer history={history} onClose={() => setPanel(null)} /> : null}
      {panel === "edit" && selectedDevice ? <EditDeviceDrawer device={selectedDevice} onClose={() => setPanel(null)} onPrepared={() => setMessage("Edit device payload prepared for secure relay.")} /> : null}
      {panel === "delete" && selectedDevice ? <DeleteDeviceModal device={selectedDevice} onClose={() => setPanel(null)} onPrepared={() => setMessage("Delete device payload prepared for secure relay.")} /> : null}
      {confirmState ? <RestartModal confirmState={confirmState} onClose={() => setConfirmState(null)} onConfirm={confirmRestart} /> : null}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.7 8s2.2-4 6.3-4 6.3 4 6.3 4-2.2 4-6.3 4-6.3-4-6.3-4z" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}

function AndroidIcon() {
  return <span className="device-android-icon" aria-hidden="true"><span /></span>;
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M12.5 5.2A4.7 4.7 0 0 0 4 4.4L2.8 5.8M3.5 10.8a4.7 4.7 0 0 0 8.5.8l1.2-1.4" />
      <path d="M2.8 2.8v3h3M13.2 13.2v-3h-3" />
    </svg>
  );
}

function BackendHeartbeatSummary({ devices }: { devices: Device[] }) {
  const summary = useMemo(() => summarizeBackendHeartbeats(devices), [devices]);
  if (!summary.totalPhysical) return null;
  return (
    <div className={`devices-backend-heartbeat-summary ${summary.globalReady ? "ready" : "blocked"}`}>
      <span>Heartbeats backend : {summary.active} actifs / {summary.expired} expirés / {summary.unknown} inconnus</span>
      <strong>{summary.globalLabelFr}</strong>
    </div>
  );
}

function BackendHeartbeatIndicator({ device, pending }: { device: Device; pending?: boolean }) {
  const projection = useMemo(() => projectBackendHeartbeat(device, { pending }), [device, pending]);
  if (!projection) return null;
  return (
    <div className={`devices-backend-heartbeat-indicator state-${projection.label}`}>
      <div className="devices-backend-heartbeat-line">
        <span>Heartbeat backend : <strong>{projection.labelFr}</strong></span>
        {projection.relativeFr ? <span title={projection.preciseAt}>Dernier signal {projection.relativeFr}</span> : null}
      </div>
      <div className="devices-backend-heartbeat-line">
        <span>{projection.consequenceFr}</span>
      </div>
      {projection.explanationFr ? <p className="devices-backend-heartbeat-help">{projection.explanationFr}</p> : null}
    </div>
  );
}

function DeviceRow({
  device,
  heartbeatPending,
  isOpen,
  onOpen,
  onClose,
  onRestart,
}: {
  device: Device;
  heartbeatPending?: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRestart: () => void;
}) {
  const appInstances = device.appInstances ?? [];
  const occupied = appInstances.filter((app) => app.occupant);
  const available = appInstances.filter((app) => app.selectable);
  return (
    <article className={`device-row status-${statusClass(device)}`}>
      <div className="device-row-main">
        <button
          type="button"
          className={`device-eye${isOpen ? " is-open" : ""}`}
          aria-label={isOpen ? `Close ${device.name} view` : `Open ${device.name} view`}
          title={device.viewAvailable ? isOpen ? "Close phone view" : "Open phone view" : device.viewUnavailableReason || "Phone view unavailable"}
          disabled={!device.viewAvailable}
          onClick={isOpen ? onClose : onOpen}
        >
          <EyeIcon />
        </button>
        <div className="device-name-block">
          <strong>{device.name}</strong>
          <span>{device.shortSerial}</span>
        </div>
        <span className="device-profile-count" title="App instances"><AndroidIcon />{device.appInstancesCount}</span>
        <span className="device-latency">{latencyLabel(device)}</span>
        <span className={`device-status-pill ${statusClass(device)}`}>
          <span />{statusLabel(device)}
        </span>
        <button type="button" className="device-row-restart" aria-label={`Restart ${device.name}`} onClick={onRestart}>
          <RefreshIcon />
        </button>
      </div>

      <div className="device-meta-grid">
        <span>Backend <strong>{device.backendStatus || device.status}</strong></span>
        <span>Local ADB <strong>{device.localAdbStatus || "unknown"}</strong></span>
        <span>Last seen <strong>{device.backendLastSeenAt ? new Date(device.backendLastSeenAt).toLocaleString() : "unknown"}</strong></span>
        <span>Source <strong>{device.inventorySource || "shared backend API"}</strong></span>
        <span>Free <strong>{device.appInstancesAvailableCount}</strong></span>
        <span>Occupied <strong>{device.appInstancesOccupiedCount}</strong></span>
      </div>
      <BackendHeartbeatIndicator device={device} pending={heartbeatPending} />
      {device.viewUnavailableReason ? <p className="device-warning">{device.viewUnavailableReason}</p> : null}
      {appInstances.length ? (
        <div className="device-app-instances">
          {appInstances.map((app) => (
            <div key={app.appInstanceId || `${app.instanceType}:${app.instanceIndex}`} className={`device-app-instance ${app.selectable ? "available" : app.occupant ? "occupied" : "disabled"}`}>
              <strong>{app.label}</strong>
              <span>{app.instanceType === "primary_app" ? "primary" : `clone ${app.instanceIndex}`} · {app.packageName || "package unknown"}</span>
              <span>{app.availability}{app.occupant?.username ? ` · @${app.occupant.username}` : app.occupant?.accountId ? ` · ${app.occupant.accountId.slice(0, 8)}` : ""}</span>
              {app.occupant ? <em>{app.occupant.status} · {app.occupant.accountId.slice(0, 8)}</em> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="device-warning">No app instances returned by shared backend.</p>
      )}
      <div className="device-clone-summary">
        <span>{available.length} selectable</span>
        <span>{occupied.length} occupied</span>
      </div>
    </article>
  );
}

function DrawerShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="devices-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="devices-drawer" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>Device inventory</span>
            <h3>{title}</h3>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <div className="devices-drawer-body">{children}</div>
      </aside>
    </div>
  );
}

function AddPhoneDrawer({ onClose, onPrepared }: { onClose: () => void; onPrepared: () => void }) {
  const [form, setForm] = useState<AddPhoneFormState>(initialAddPhoneForm);
  const payload = addPhonePayload(form);
  const canSubmit = form.displayName.trim().length >= 2 && Boolean(form.adbSerial.trim());

  function update<K extends keyof AddPhoneFormState>(key: K, value: AddPhoneFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <DrawerShell title="Add phone" onClose={onClose}>
      <div className="devices-form-grid">
        <label><span>Display name</span><input value={form.displayName} maxLength={80} placeholder="Samsung A16-03" onChange={(event) => update("displayName", event.target.value)} /></label>
        <label><span>ADB serial</span><input value={form.adbSerial} maxLength={120} placeholder="YOUR_ADB_SERIAL" onChange={(event) => update("adbSerial", event.target.value)} /></label>
        <label><span>Pool</span><select value={form.pool} onChange={(event) => update("pool", event.target.value as AddPhoneFormState["pool"])}><option value="full_cycle">full_cycle</option><option value="outreach_only">outreach_only</option></select></label>
        <label><span>Model</span><input value={form.model} maxLength={80} placeholder="SM-A165F" onChange={(event) => update("model", event.target.value)} /></label>
        <label><span>Product</span><input value={form.product} maxLength={80} placeholder="a16nsxx" onChange={(event) => update("product", event.target.value)} /></label>
        <label><span>Device</span><input value={form.device} maxLength={80} placeholder="a16" onChange={(event) => update("device", event.target.value)} /></label>
        <label><span>Max clones</span><input value={form.maxClones} min={3} max={16} type="number" onChange={(event) => update("maxClones", event.target.value)} /></label>
        <label><span>Hub label</span><input value={form.hubLabel} maxLength={80} placeholder="hub-a" onChange={(event) => update("hubLabel", event.target.value)} /></label>
        <label><span>Hub port</span><input value={form.hubPort} maxLength={80} placeholder="1" onChange={(event) => update("hubPort", event.target.value)} /></label>
        <label className="full"><span>Host label</span><input value={form.hostLabel} maxLength={80} placeholder="prod-mac-hub-01" onChange={(event) => update("hostLabel", event.target.value)} /></label>
      </div>
      <div className="devices-safe-note">
        <strong>Add phone does</strong>
        <span>Registers phone inventory and standard Instagram app instance intent for the future secure relay.</span>
        <strong>Add phone does not</strong>
        <span>Detect devices automatically, create Android clones, assign accounts, start runs, login, provision, or accept credentials.</span>
      </div>
      <pre className="devices-payload-preview">{JSON.stringify(payload, null, 2)}</pre>
      <footer className="devices-drawer-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" disabled={!canSubmit} onClick={() => { onPrepared(); onClose(); }}>Add phone</button>
      </footer>
    </DrawerShell>
  );
}

function HistoryDrawer({ history, onClose }: { history: BotAppDeviceHistoryEntry[]; onClose: () => void }) {
  return (
    <DrawerShell title="Device history" onClose={onClose}>
      <div className="device-history-list">
        {history.map((entry) => (
          <div key={entry.id} className={`device-history-entry ${entry.status}`}>
            <span>{entry.timestamp}</span>
            <strong>{entry.event}</strong>
            <p>{entry.detail}</p>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

function EditDeviceDrawer({ device, onClose, onPrepared }: { device: Device; onClose: () => void; onPrepared: () => void }) {
  const payload = {
    action: "update_phone_metadata",
    device_id: device.id,
    display_name: device.name,
    pool: device.pool,
    hub_label: device.hubLabel,
    hub_port: device.hubPort,
    host_label: device.hostLabel,
    source: "BotApp",
  };
  return (
    <DrawerShell title="Edit device" onClose={onClose}>
      <div className="devices-form-grid">
        <label><span>Display name</span><input defaultValue={device.name} /></label>
        <label><span>Pool</span><select defaultValue={device.pool}><option value="full_cycle">full_cycle</option><option value="outreach_only">outreach_only</option></select></label>
        <label><span>Hub label</span><input defaultValue={device.hubLabel ?? ""} /></label>
        <label><span>Hub port</span><input defaultValue={device.hubPort ?? ""} /></label>
        <label className="full"><span>Host label</span><input defaultValue={device.hostLabel ?? ""} /></label>
      </div>
      <pre className="devices-payload-preview">{JSON.stringify(payload, null, 2)}</pre>
      <footer className="devices-drawer-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" onClick={() => { onPrepared(); onClose(); }}>Save changes</button>
      </footer>
    </DrawerShell>
  );
}

function DeleteDeviceModal({ device, onClose, onPrepared }: { device: Device; onClose: () => void; onPrepared: () => void }) {
  return (
    <div className="devices-modal-backdrop" role="dialog" aria-modal="true" aria-label="Delete device">
      <div className="devices-modal">
        <h3>Delete device?</h3>
        <p><strong>{device.name}</strong> will be removed from the future phone inventory only after the secure relay validates there are no active assignments, phone views, or runtime locks.</p>
        <p className="devices-warning">This is a prepared danger action. No phone is removed from inventory from this screen.</p>
        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="danger" onClick={() => { onPrepared(); onClose(); }}>Delete</button>
        </footer>
      </div>
    </div>
  );
}

function RestartModal({ confirmState, onClose, onConfirm }: { confirmState: NonNullable<ConfirmState>; onClose: () => void; onConfirm: () => void }) {
  const devices = confirmState.kind === "restart_all" ? confirmState.devices : [confirmState.device];
  const payload = restartPayload(devices, confirmState.kind === "restart_all" ? "restart_all_phones" : "restart_phone");
  return (
    <div className="devices-modal-backdrop" role="dialog" aria-modal="true" aria-label={confirmState.kind === "restart_all" ? "Restart all phones" : "Restart phone"}>
      <div className="devices-modal">
        <h3>{confirmState.kind === "restart_all" ? "Restart all phones?" : "Restart phone?"}</h3>
        <div className="devices-restart-summary">
          <span>Connected phones <strong>{payload.metadata_safe.connected_count}</strong></span>
          <span>Offline phones skipped <strong>{payload.metadata_safe.offline_skipped_count}</strong></span>
        </div>
        <p>This future action must run through the secure device-control relay. BotApp does not reboot phones directly.</p>
        <pre className="devices-payload-preview">{JSON.stringify(payload, null, 2)}</pre>
        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="danger" onClick={onConfirm}>Confirm restart</button>
        </footer>
      </div>
    </div>
  );
}
