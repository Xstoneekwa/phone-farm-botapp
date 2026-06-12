import { useEffect, useMemo, useState } from "react";
import type { DeviceProfileGroup } from "../../../api/types";
import { Button, Drawer, Input } from "../../../design/components";

type AddProfileStep = 0 | 1 | 2 | 3 | 4 | 5;
type LoginMethod = "manual" | "credentials";
type RuntimeMode = "safe_setup" | "follow_only_test" | "full_cycle" | "outreach_only";
type CommercialPackage = "growth" | "pro" | "premium" | "custom" | "internal_test";
type UsernameVerification = {
  status: string;
  normalized_username: string | null;
  verification_status: string;
  provider: string;
  reason: string;
  followers_count?: number | null;
  is_private?: boolean | null;
  is_verified?: boolean | null;
};
type BackendAppOccupant = {
  assignment_id: string | null;
  account_id: string | null;
  username: string | null;
  status: string;
};
type BackendAppInstance = {
  app_instance_id: string;
  device_id: string;
  instance_type: string;
  instance_index: number;
  label: string;
  package_name: string;
  status: string;
  availability: "available" | "occupied" | "reserved" | "disabled" | string;
  current_account_id: string | null;
  occupant: BackendAppOccupant | null;
  usable_for_auto_login: boolean;
  is_launchable: boolean;
  selectable: boolean;
};
type BackendDevice = {
  id: string;
  device_name: string;
  adb_serial_display: string;
  status: string;
  heartbeat_status?: string | null;
  app_instances_available_count: number;
  app_instances_occupied_count: number;
  app_instances: BackendAppInstance[];
  displayed_in_add_profile?: boolean;
  display_reason?: string;
};

const steps = ["Device", "Account", "App Instance", "Package & Add-ons", "Schedule", "Review"];

const packageOptions: Array<{ value: CommercialPackage; label: string; detail: string; commercialCode: string; selectable: boolean }> = [
  { value: "growth", label: "Growth", detail: "Production Growth package. Full-cycle ready; Outreach remains optional.", commercialCode: "growth", selectable: true },
  { value: "pro", label: "Pro", detail: "Production Pro package with Welcome enabled by default. Outreach remains optional.", commercialCode: "pro", selectable: true },
  { value: "premium", label: "Premium", detail: "Production Premium package with advanced targeting defaults. Outreach remains optional.", commercialCode: "premium", selectable: true },
  { value: "custom", label: "Custom", detail: "Operator-defined package; uses Pro defaults until Custom wiring ships.", commercialCode: "pro", selectable: true },
  { value: "internal_test", label: "Internal Test", detail: "Admin/test accounts. No auto-run.", commercialCode: "internal_test", selectable: true },
];

const runtimeOptions: Array<{ value: RuntimeMode; label: string; detail: string }> = [
  { value: "safe_setup", label: "Safe Setup", detail: "Assignment + settings only. No run/login." },
  { value: "follow_only_test", label: "Follow Only Test", detail: "Internal low-cap test profile." },
  { value: "full_cycle", label: "Full Cycle", detail: "Full-cycle schedule slots. No auto-run from Add Profile." },
  { value: "outreach_only", label: "Outreach Only", detail: "Outreach schedule profile. No auto-run from Add Profile." },
];

const addonOptions = [
  { value: "extra_ct_research", label: "Extra CT research", wired: false },
  { value: "extra_outreach_volume", label: "Extra outreach volume", wired: true },
  { value: "priority_warmup", label: "Priority warmup", wired: false },
  { value: "advanced_reporting", label: "Advanced reporting", wired: false },
  { value: "manual_ops_support", label: "Manual ops support", wired: false },
  { value: "custom_package_addon", label: "Custom package add-on", wired: false },
];

const slotOptions = [
  { label: "09:00-12:00", starts_at: "09:00", ends_at: "12:00", kind: "full_cycle", available: true },
  { label: "13:00-16:00", starts_at: "13:00", ends_at: "16:00", kind: "full_cycle", available: true },
  { label: "17:00-20:00", starts_at: "17:00", ends_at: "20:00", kind: "full_cycle", available: true },
  { label: "20:00-23:00", starts_at: "20:00", ends_at: "23:00", kind: "outreach_only", available: true },
];

function defaultForm(groups: DeviceProfileGroup[]) {
  const firstGroup = groups[0];
  return {
    device_id: firstGroup?.deviceId ?? "",
    app_instance_id: "",
    username: "",
    password: "",
    email: "",
    display_name: "",
    internal_label: "",
    notes: "",
    login_method: "manual" as LoginMethod,
    commercial_package: "growth" as CommercialPackage,
    addons: [] as string[],
    runtime_mode: "safe_setup" as RuntimeMode,
    starts_at: slotOptions[0].starts_at,
    ends_at: slotOptions[0].ends_at,
  };
}

function packageLabel(value: CommercialPackage) {
  return packageOptions.find((item) => item.value === value)?.label ?? value;
}

function readString(row: Record<string, unknown>, key: string, fallback = "") {
  const value = row[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function readNumber(row: Record<string, unknown>, key: string, fallback = 0) {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readBoolean(row: Record<string, unknown>, key: string, fallback = false) {
  const value = row[key];
  return typeof value === "boolean" ? value : fallback;
}

function readOccupant(value: unknown): BackendAppOccupant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const accountId = readString(row, "account_id");
  return {
    assignment_id: readString(row, "assignment_id") || null,
    account_id: accountId || null,
    username: readString(row, "username") || null,
    status: readString(row, "status", "unknown"),
  };
}

function accountFallbacksFromGroups(groups: DeviceProfileGroup[]) {
  const fallback = new Map<string, BackendAppOccupant>();
  for (const group of groups) {
    for (const profile of group.profiles) {
      fallback.set(profile.id, {
        assignment_id: null,
        account_id: profile.id,
        username: profile.username,
        status: profile.assignmentState,
      });
    }
  }
  return fallback;
}

function readBackendAppInstance(value: unknown, accountFallbacks: Map<string, BackendAppOccupant>): BackendAppInstance {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const instanceType = readString(row, "instance_type", "clone");
  const instanceIndex = readNumber(row, "instance_index", 0);
  const currentAccountId = readString(row, "current_account_id");
  const occupant = readOccupant(row.occupant) ?? (currentAccountId ? accountFallbacks.get(currentAccountId) ?? null : null);
  const status = readString(row, "status", "unknown");
  const availability = readString(row, "availability", occupant ? "occupied" : status);
  return {
    app_instance_id: readString(row, "app_instance_id"),
    device_id: readString(row, "device_id"),
    instance_type: instanceType,
    instance_index: instanceIndex,
    label: readString(row, "label", instanceType === "primary_app" ? "Primary app" : `Clone ${instanceIndex}`),
    package_name: readString(row, "package_name"),
    status,
    availability,
    current_account_id: currentAccountId || occupant?.account_id || null,
    occupant,
    usable_for_auto_login: readBoolean(row, "usable_for_auto_login", false),
    is_launchable: readBoolean(row, "is_launchable", false),
    selectable: readBoolean(row, "selectable", false) && availability === "available" && !occupant,
  };
}

function readBackendDevice(value: Record<string, unknown>, accountFallbacks: Map<string, BackendAppOccupant>): BackendDevice {
  const appInstances = Array.isArray(value.app_instances) ? value.app_instances.map((app) => readBackendAppInstance(app, accountFallbacks)) : [];
  return {
    id: readString(value, "id"),
    device_name: readString(value, "device_name", readString(value, "phone_name", "Unknown phone")),
    adb_serial_display: readString(value, "adb_serial_display") || maskSerial(readString(value, "adb_serial")),
    status: readString(value, "status", "unknown"),
    heartbeat_status: readString(value, "heartbeat_status", "unknown"),
    app_instances_available_count: readNumber(value, "app_instances_available_count", appInstances.filter((app) => app.selectable).length),
    app_instances_occupied_count: readNumber(value, "app_instances_occupied_count", appInstances.filter((app) => Boolean(app.occupant)).length),
    app_instances: appInstances,
    displayed_in_add_profile: true,
    display_reason: "shared_backend_inventory",
  };
}

function fallbackDevicesFromGroups(groups: DeviceProfileGroup[]): BackendDevice[] {
  return groups
    .filter((group) => group.deviceId !== "unassigned-live-profiles")
    .map((group) => {
      const apps = [1, 2, 3].map((index): BackendAppInstance => {
        const occupant = group.profiles.find((profile) => profile.profileNumber === index);
        return {
          app_instance_id: `${group.deviceId}:clone_${index}`,
          device_id: group.deviceId,
          instance_type: "clone",
          instance_index: index,
          label: `Clone ${index}`,
          package_name: "com.instagram.android",
          status: occupant ? "occupied" : "available",
          availability: occupant ? "occupied" : "available",
          current_account_id: occupant?.id ?? null,
          occupant: occupant ? { assignment_id: null, account_id: occupant.id, username: occupant.username, status: occupant.assignmentState } : null,
          usable_for_auto_login: true,
          is_launchable: true,
          selectable: !occupant,
        };
      });
      return {
        id: group.deviceId,
        device_name: group.deviceLabel,
        adb_serial_display: group.deviceSerialLabel || maskSerial(group.deviceSerial),
        status: group.deviceStatus,
        heartbeat_status: group.phoneStatus,
        app_instances_available_count: apps.filter((app) => app.selectable).length,
        app_instances_occupied_count: apps.filter((app) => Boolean(app.occupant)).length,
        app_instances: apps,
        displayed_in_add_profile: true,
        display_reason: "local_profile_group_fallback",
      };
    });
}

function bestDefaultAppInstance(device: BackendDevice | undefined) {
  const instances = device?.app_instances ?? [];
  return (
    instances.find((app) => app.selectable && app.instance_type === "primary_app") ||
    instances.find((app) => app.selectable && app.instance_type === "clone" && app.instance_index === 1) ||
    instances.find((app) => app.selectable)
  );
}

function ensureFormDeviceSelection<T extends ReturnType<typeof defaultForm>>(current: T, devices: BackendDevice[]): T {
  const selectedDevice = devices.find((device) => device.id === current.device_id) ?? devices[0];
  const selectedAppStillAvailable = selectedDevice?.app_instances.some((app) => app.app_instance_id === current.app_instance_id && app.selectable);
  return {
    ...current,
    device_id: selectedDevice?.id ?? "",
    app_instance_id: selectedAppStillAvailable ? current.app_instance_id : bestDefaultAppInstance(selectedDevice)?.app_instance_id ?? "",
  };
}

function appDisabledReason(app: BackendAppInstance) {
  if (app.availability === "disabled") return "Disabled or unavailable";
  if (!app.is_launchable) return "Not launchable";
  if (!app.usable_for_auto_login) return "Not usable for auto login";
  if (app.status !== "available") return app.status;
  return "Unavailable";
}

function shortAccountId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "unknown";
}

function maskSerial(value: string) {
  if (!value) return "";
  return value.length <= 4 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function AddProfileDrawer({
  groups,
  onClose,
  onSubmit,
}: {
  groups: DeviceProfileGroup[];
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>, mode: "dry_run" | "create") => Promise<{ ok: boolean; message: string }>;
}) {
  const [step, setStep] = useState<AddProfileStep>(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState(() => defaultForm(groups));
  const [setupDevices, setSetupDevices] = useState<BackendDevice[]>(() => fallbackDevicesFromGroups(groups));
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [verification, setVerification] = useState<UsernameVerification | null>(null);
  const [isVerifyingUsername, setIsVerifyingUsername] = useState(false);
  const [submitState, setSubmitState] = useState<{ loading: boolean; message: string }>({ loading: false, message: "" });
  const selectedDevice = useMemo(() => setupDevices.find((device) => device.id === form.device_id) ?? setupDevices[0], [form.device_id, setupDevices]);
  const appInstances = selectedDevice?.app_instances ?? [];
  const selectedApp = appInstances.find((app) => app.app_instance_id === form.app_instance_id) ?? appInstances.find((app) => app.selectable);
  const selectedPackage = packageOptions.find((item) => item.value === form.commercial_package) ?? packageOptions[0];
  const selectedRuntime = runtimeOptions.find((item) => item.value === form.runtime_mode) ?? runtimeOptions[0];
  const selectedSlot = slotOptions.find((slot) => slot.starts_at === form.starts_at && slot.ends_at === form.ends_at);
  const selectedAddons = addonOptions.filter((addon) => form.addons.includes(addon.value));

  useEffect(() => {
    let cancelled = false;
    const listDevices = window.botappDesktop?.devices?.list;
    if (!listDevices) {
      const fallback = fallbackDevicesFromGroups(groups);
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setSetupDevices(fallback);
        setForm((current) => ensureFormDeviceSelection(current, fallback));
      });
      return;
    }
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setSetupLoading(true);
      setSetupError("");
      try {
        const result = await listDevices({ format: "raw" });
        if (cancelled) return;
        if (!result.ok) {
          const fallback = fallbackDevicesFromGroups(groups);
          setSetupDevices(fallback);
          setSetupError(result.error || "Device inventory unavailable.");
          setForm((current) => ensureFormDeviceSelection(current, fallback));
          return;
        }
        const accountFallbacks = accountFallbacksFromGroups(groups);
        const devices = (result.data ?? []).map((device) => readBackendDevice(device, accountFallbacks)).filter((device) => device.id);
        setSetupDevices(devices);
        setForm((current) => ensureFormDeviceSelection(current, devices));
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [groups]);

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "username") setVerification(null);
  }

  function selectDevice(device: BackendDevice) {
    const firstAvailable = bestDefaultAppInstance(device);
    setForm((current) => ({
      ...current,
      device_id: device.id,
      app_instance_id: firstAvailable?.app_instance_id ?? "",
    }));
  }

  function canMoveNext() {
    if (step === 0) return Boolean(selectedDevice);
    if (step === 1) return verification?.status === "found" && (form.login_method !== "credentials" || Boolean(form.password.trim()));
    if (step === 2) return Boolean(selectedApp?.selectable);
    if (step === 3) return Boolean(selectedPackage.selectable && form.runtime_mode);
    if (step === 4) return Boolean(selectedSlot?.available);
    return Boolean(selectedDevice && selectedApp && selectedSlot);
  }

  async function verifyUsername() {
    const username = form.username.trim().replace(/^@/, "");
    if (!username) return;
    setIsVerifyingUsername(true);
    setVerification(null);
    try {
      const verify = window.botappDesktop?.profiles?.verifyUsername;
      if (!verify) {
        setVerification({
          status: "error",
          normalized_username: null,
          verification_status: "unavailable",
          provider: "botapp_ipc",
          reason: "verification_relay_unavailable",
        });
        return;
      }
      const result = await verify({ username });
      if (!result.ok) {
        setVerification({
          status: "error",
          normalized_username: null,
          verification_status: "error",
          provider: "backend_relay",
          reason: result.error || "verification_failed",
        });
        return;
      }
      const data = (result.data ?? {}) as Record<string, unknown>;
      setVerification({
        status: String(data.status || "error"),
        normalized_username: String(data.normalized_username || data.username || username).toLowerCase(),
        verification_status: String(data.verification_status || data.status || "error"),
        provider: String(data.provider || "unknown"),
        reason: String(data.reason || data.status || "unknown"),
        followers_count: typeof data.followers_count === "number" ? data.followers_count : null,
        is_private: typeof data.is_private === "boolean" ? data.is_private : null,
        is_verified: typeof data.is_verified === "boolean" ? data.is_verified : null,
      });
    } finally {
      setIsVerifyingUsername(false);
    }
  }

  async function submitProfile(mode: "dry_run" | "create") {
    if (mode === "create" && form.login_method !== "manual") {
      setSubmitState({ loading: false, message: "Backend create from BotApp is manual-login only; credentials are not submitted from BotApp yet." });
      return;
    }
    const payload = {
      endpoint_contract: "/api/instagram-dashboard/accounts/create",
      mode: mode === "create" ? "backend_real_write" : "backend_dry_run",
      username: verification?.normalized_username || form.username.trim().toLowerCase(),
      login_method: form.login_method,
      password: mode === "dry_run" && form.login_method === "credentials" ? form.password : "",
      password_status: form.login_method === "credentials" ? (mode === "dry_run" ? "write_only_dry_run" : "blocked_from_botapp_real_write") : "not_submitted",
      email: mode === "dry_run" ? form.email.trim() : "",
      email_present: Boolean(form.email.trim()),
      display_name: form.display_name.trim(),
      internal_label: form.internal_label.trim(),
      notes: form.notes.trim(),
      device_id: form.device_id,
      app_instance_id: form.app_instance_id,
      clone_mode: selectedApp ? selectedApp.instance_type === "primary_app" ? "primary_app" : `clone_${selectedApp.instance_index}` : "",
      template_mode: "default",
      template_id: "",
      commercial_package: form.commercial_package,
      commercial_package_code: selectedPackage.commercialCode,
      addons: form.addons,
      runtime_mode: form.runtime_mode,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
      automation: {
        provisioning_started: false,
        login_started: false,
        run_started: false,
      },
      provisioning_enabled: false,
      login_enabled: false,
      start_run: false,
      sync_targets: ["admin_client", "client_app", "database", "botapp"],
    };
    setSubmitState({ loading: true, message: mode === "create" ? "Creating account through shared backend..." : "Validating create contract through shared backend..." });
    const result = await onSubmit(payload, mode);
    setSubmitState({ loading: false, message: result.message });
    if (!result.ok) return;
    setShowConfirm(false);
    onClose();
  }

  return (
    <>
    <Drawer
      title="Add Profile"
      subtitle="New Instagram Account"
      wide
      onClose={onClose}
      footer={<div className="drawer-footer-left">
        <Button variant="ghost" onClick={step === 0 ? onClose : () => setStep((current) => (current - 1) as AddProfileStep)}>{step === 0 ? "Cancel" : "Previous"}</Button>
        {step < 5 ? <Button onClick={() => setStep((current) => (current + 1) as AddProfileStep)} disabled={!canMoveNext()}>Next</Button> : <Button onClick={() => setShowConfirm(true)} disabled={!canMoveNext() || submitState.loading}>Create Profile</Button>}
      </div>}
    >
      <div className="add-profile-flow">
        <div className="add-profile-steps" aria-label="Add Profile progress">
          {steps.map((label, index) => <span key={label} className={index <= step ? "active" : ""}>{label}</span>)}
        </div>

        {step === 0 ? (
          <div className="add-profile-options">
            {setupLoading ? <div className="empty-state">Loading device inventory from shared backend...</div> : null}
            {setupError ? <div className="ig-profile-message">{setupError}</div> : null}
            {setupDevices.map((device) => (
              <button key={device.id} type="button" className={device.id === form.device_id ? "add-profile-option active" : "add-profile-option"} onClick={() => selectDevice(device)}>
                <strong>{device.device_name}</strong>
                <span>{device.adb_serial_display || "serial masked"} · {device.status || "unknown"} · heartbeat {device.heartbeat_status || "unknown"}</span>
                <span>{device.app_instances_available_count} free app instances · {device.app_instances_occupied_count} occupied</span>
              </button>
            ))}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="settings-grid">
            <label className="settings-row-block">
              <span>Instagram username</span>
              <div className="add-profile-inline">
                <Input value={form.username} onChange={(value) => updateField("username", value)} placeholder="username" />
                <Button variant="ghost" onClick={() => void verifyUsername()} disabled={!form.username.trim() || isVerifyingUsername}>{isVerifyingUsername ? "Verifying..." : "Verify"}</Button>
              </div>
            </label>
            <label className="settings-row-block">
              <span>Login method</span>
              <select className="input" value={form.login_method} onChange={(event) => updateField("login_method", event.target.value as LoginMethod)}>
                <option value="manual">manual</option>
                <option value="credentials">credentials</option>
              </select>
              <small>{form.login_method === "credentials" ? "Password is write-only and never shown in review." : "No password collected; login remains a later manual step."}</small>
            </label>
            {form.login_method === "credentials" ? (
              <label className="settings-row-block">
                <span>Password (write-only)</span>
                <input className="input" type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} autoComplete="new-password" />
                <small>Credential will be submitted securely through a future server API, not stored in BotApp.</small>
              </label>
            ) : null}
            <label className="settings-row-block"><span>Email optional</span><Input value={form.email} onChange={(value) => updateField("email", value)} /></label>
            <label className="settings-row-block"><span>Display name optional</span><Input value={form.display_name} onChange={(value) => updateField("display_name", value)} /></label>
            <label className="settings-row-block"><span>Internal label optional</span><Input value={form.internal_label} onChange={(value) => updateField("internal_label", value)} /></label>
            <label className="settings-row-block full"><span>Notes optional</span><textarea className="input settings-textarea" value={form.notes} onChange={(event) => updateField("notes", event.target.value)} /></label>
            {verification ? (
              <div className="settings-card full">
                <strong>{verification.normalized_username || form.username}</strong>
                <span>{verification.status} · {verification.reason}</span>
                <small>
                  {verification.status === "found"
                    ? `Provider ${verification.provider} confirmed the username${verification.followers_count != null ? ` · ${verification.followers_count} followers` : ""}.`
                    : verification.status === "provider_not_configured"
                      ? "Verification provider is not configured server-side."
                      : verification.status === "not_found"
                        ? "Username was not found by the configured provider."
                        : `Verification failed with status ${verification.verification_status}.`}
                </small>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="add-profile-options">
            {appInstances.map((app) => (
              <button key={app.app_instance_id} type="button" className={app.app_instance_id === form.app_instance_id ? "add-profile-option active" : "add-profile-option"} onClick={() => updateField("app_instance_id", app.app_instance_id)} disabled={!app.selectable}>
                <strong>{app.label}</strong>
                <span>{app.instance_type === "primary_app" ? "primary app" : `clone ${app.instance_index}`} · {app.package_name || "package unknown"}</span>
                <span>{app.availability}{app.occupant?.username ? ` · occupied by @${app.occupant.username}` : app.occupant?.account_id ? ` · occupied by ${shortAccountId(app.occupant.account_id)}` : ""}</span>
                {app.occupant ? <em>account {shortAccountId(app.occupant.account_id)} · assignment {app.occupant.status}</em> : null}
                {!app.selectable && !app.occupant ? <em>{appDisabledReason(app)}</em> : null}
              </button>
            ))}
            {!appInstances.some((app) => app.selectable) ? <div className="empty-state">No available app instance on this device.</div> : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="add-profile-package-step">
            <section className="drawer-section"><h4>Package</h4><div className="add-profile-options">{packageOptions.map((item) => (
              <button key={item.value} type="button" className={form.commercial_package === item.value ? "add-profile-option active" : "add-profile-option"} disabled={!item.selectable} onClick={() => updateField("commercial_package", item.value)}>
                <strong>{item.label}</strong><span>{item.detail}</span>
              </button>
            ))}</div></section>
            <section className="drawer-section"><h4>Runtime mode</h4><div className="add-profile-options">{runtimeOptions.map((item) => (
              <button key={item.value} type="button" className={form.runtime_mode === item.value ? "add-profile-option active" : "add-profile-option"} onClick={() => updateField("runtime_mode", item.value)}>
                <strong>{item.label}</strong><span>{item.detail}</span>
              </button>
            ))}</div></section>
            <section className="drawer-section"><h4>Add-ons</h4><div className="add-profile-options">{addonOptions.map((item) => (
              <button key={item.value} type="button" className={form.addons.includes(item.value) ? "add-profile-option active" : "add-profile-option"} disabled={!item.wired} onClick={() => setForm((current) => ({ ...current, addons: current.addons.includes(item.value) ? current.addons.filter((addon) => addon !== item.value) : [...current.addons, item.value] }))}>
                <strong>{item.label}</strong><span>{item.wired ? "Included when selected" : "Planned · not wired yet"}</span>
              </button>
            ))}</div></section>
            <p className="ig-profile-message">No package or add-on launches login, provisioning, runner, DM, follow, or unfollow.</p>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="add-profile-options">
            {slotOptions.map((slot) => (
              <button key={slot.label} type="button" className={form.starts_at === slot.starts_at && form.ends_at === slot.ends_at ? "add-profile-option active" : "add-profile-option"} disabled={!slot.available} onClick={() => setForm((current) => ({ ...current, starts_at: slot.starts_at, ends_at: slot.ends_at }))}>
                <strong>{slot.label}</strong>
                <span>{slot.kind} · Europe/Paris</span>
                <span>{slot.available ? "available" : "unavailable"}</span>
              </button>
            ))}
          </div>
        ) : null}

        {step === 5 ? (
          <dl className="add-profile-review">
            <div><dt>Username</dt><dd>{verification?.normalized_username || form.username || "-"} · {verification?.status || "pending_verification"}</dd></div>
            <div><dt>Device</dt><dd>{selectedDevice?.device_name || "-"} · {selectedDevice?.adb_serial_display || "serial masked"}</dd></div>
            <div><dt>App instance</dt><dd>{selectedApp?.label || "-"} · index {selectedApp?.instance_index ?? "-"}</dd></div>
            <div><dt>Login method</dt><dd>{form.login_method} · {form.login_method === "credentials" ? "Credential will be submitted securely" : "credentials not submitted"}</dd></div>
            <div><dt>Package</dt><dd>{packageLabel(form.commercial_package)} · {selectedPackage.commercialCode}</dd></div>
            <div><dt>Runtime mode</dt><dd>{selectedRuntime.label}</dd></div>
            <div><dt>Add-ons</dt><dd>{selectedAddons.length ? selectedAddons.map((addon) => addon.label).join(", ") : "none"}</dd></div>
            <div><dt>Schedule</dt><dd>{selectedSlot?.label || "-"} · visible later in Schedule drawer</dd></div>
            <div><dt>Safety</dt><dd>Create writes backend records only. It does not log in, provision a phone, start a worker, or start a run.</dd></div>
            <div><dt>Submit contract</dt><dd>POST `/api/instagram-dashboard/accounts/create` through shared backend. Credentials real-write from BotApp is blocked.</dd></div>
            {submitState.message ? <div><dt>Backend status</dt><dd>{submitState.message}</dd></div> : null}
          </dl>
        ) : null}
      </div>
    </Drawer>
    {showConfirm ? (
      <div className="add-profile-confirm-backdrop" role="presentation" onMouseDown={() => setShowConfirm(false)}>
        <section className="add-profile-confirm" role="dialog" aria-modal="true" aria-labelledby="add-profile-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
          <h3 id="add-profile-confirm-title">Create this profile?</h3>
          <p>This can validate the contract in dry-run mode or create the account through the shared backend only. It will not log in, provision a phone, start a worker, or start a run.</p>
          {form.login_method !== "manual" ? <p className="ig-profile-message">Create in backend is manual-login only from BotApp; credentials are not submitted in this step.</p> : null}
          <div className="add-profile-confirm-actions">
            <Button variant="ghost" onClick={() => setShowConfirm(false)} disabled={submitState.loading}>Cancel</Button>
            <Button onClick={() => void submitProfile("dry_run")} disabled={submitState.loading}>{submitState.loading ? "Working..." : "Dry-run"}</Button>
            <Button variant="primary" onClick={() => void submitProfile("create")} disabled={submitState.loading || form.login_method !== "manual"}>{submitState.loading ? "Working..." : "Create in backend"}</Button>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
