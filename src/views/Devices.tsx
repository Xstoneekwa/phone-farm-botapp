import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BotAppAddPhonePayload, BotAppDeviceHistoryEntry, BotAppRestartPhonePayload, Device } from "../api/types";
import type { DeviceViewState } from "../desktop/device-views";
import { closeAllDeviceViews, closeDeviceView, focusDeviceView, listOpenDeviceViews, openDeviceView, subscribeDeviceViewState } from "../desktop/device-views";
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

function connectedDevices(devices: Device[]) {
  return devices.filter((device) => device.status === "connected" || device.status === "online" || device.status === "reserved");
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
  return device.status === "offline" ? "Offline" : "Connected";
}

function statusClass(device: Device) {
  return device.status === "offline" ? "offline" : "connected";
}

function latencyLabel(device: Device) {
  return typeof device.latencyMs === "number" ? `${device.latencyMs}ms` : "";
}

function isViewOpen(openViews: DeviceViewState[], device: Device) {
  return openViews.some((view) => view.deviceSerial === device.id);
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

export function Devices({ devices, onAction }: { devices: Device[]; onAction: (action: string, target: string, danger?: boolean) => void }) {
  const [openViews, setOpenViews] = useState<DeviceViewState[]>([]);
  const [panel, setPanel] = useState<DevicePanel>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listOpenDeviceViews().then((result) => {
      if (!cancelled && result.ok) setOpenViews(result.data);
    });
    const unsubscribe = subscribeDeviceViewState((state) => {
      if (!cancelled) setOpenViews(state);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const savedCount = devices.length;
  const activeCount = connectedDevices(devices).length;
  const offlineCount = devices.filter((device) => device.status === "offline").length;
  const viewReadyDevices = devices.filter((device) => device.viewAvailable && device.status !== "offline");
  const history = useMemo(() => historyFor(devices), [devices]);
  void onAction;

  async function openPhoneView(device: Device) {
    setMessage("");
    if (!device.viewAvailable) {
      setMessage(device.viewUnavailableReason || "Phone view is unavailable.");
      return;
    }
    const result = isViewOpen(openViews, device)
      ? await focusDeviceView(device.id)
      : await openDeviceView({ deviceSerial: device.id, deviceLabel: device.name });
    if (result.ok) {
      setOpenViews(result.data);
      setMessage(isViewOpen(openViews, device) ? `${device.name} phone view focused.` : `${device.name} phone view opened.`);
      return;
    }
    setMessage(result.error || `Could not open ${device.name}.`);
  }

  async function openAll() {
    setMessage("");
    let opened = 0;
    let failed = 0;
    for (const device of viewReadyDevices) {
      if (isViewOpen(openViews, device)) continue;
      const result = await openDeviceView({ deviceSerial: device.id, deviceLabel: device.name });
      if (result.ok) {
        opened += 1;
        setOpenViews(result.data);
      } else {
        failed += 1;
      }
    }
    const skipped = devices.length - viewReadyDevices.length;
    setMessage(`Open All prepared ${viewReadyDevices.length} mapped phone view(s). Opened ${opened}; skipped ${skipped}; failed ${failed}.`);
  }

  async function closeAll() {
    setMessage("");
    const result = await closeAllDeviceViews(openViews.map((view) => view.deviceSerial));
    if (result.ok) {
      setOpenViews(result.data);
      setMessage("All open phone views closed.");
      return;
    }
    setMessage(result.error || "Could not close phone views.");
  }

  async function closeOne(device: Device) {
    const result = await closeDeviceView(device.id);
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
    setMessage(`${confirmState.kind === "restart_all" ? "Restart All" : "Restart phone"} payload prepared for secure relay.`);
    setConfirmState(null);
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
        </div>
      </header>

      <div className="devices-layout">
        <section className="devices-card" aria-label="Saved phones">
          <div className="devices-list">
            {devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
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

      {panel === "add" ? <AddPhoneDrawer onClose={() => setPanel(null)} onPrepared={() => setMessage("Add phone payload prepared for secure relay.")} /> : null}
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

function DeviceRow({
  device,
  isOpen,
  onOpen,
  onClose,
  onRestart,
}: {
  device: Device;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRestart: () => void;
}) {
  return (
    <article className={`device-row status-${statusClass(device)}`}>
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
      <span className="device-profile-count"><AndroidIcon />{device.profileCount}</span>
      <span className="device-latency">{latencyLabel(device)}</span>
      <span className={`device-status-pill ${statusClass(device)}`}>
        <span />{statusLabel(device)}
      </span>
      <button type="button" className="device-row-restart" aria-label={`Restart ${device.name}`} onClick={onRestart}>
        <RefreshIcon />
      </button>
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
