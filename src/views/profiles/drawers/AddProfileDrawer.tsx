import { useMemo, useState } from "react";
import type { DeviceProfileGroup } from "../../../api/types";
import { Button, Drawer, Input } from "../../../design/components";

type AddProfileStep = 0 | 1 | 2 | 3 | 4 | 5;
type LoginMethod = "manual" | "credentials";
type RuntimeMode = "safe_setup" | "follow_only_test" | "full_cycle" | "outreach_only";
type CommercialPackage = "growth" | "pro" | "premium" | "custom" | "internal_test";

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
    app_instance_id: firstGroup ? `${firstGroup.deviceId}:clone_1` : "",
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

function appInstancesForGroup(group: DeviceProfileGroup | undefined) {
  if (!group) return [];
  return [1, 2, 3].map((index) => {
    const occupied = group.profiles.some((profile) => profile.profileNumber === index);
    return {
      app_instance_id: `${group.deviceId}:clone_${index}`,
      label: `Clone ${index}`,
      instance_index: index,
      package_name: "com.instagram.android",
      status: occupied ? "occupied" : "available",
      selectable: !occupied,
      disabledReason: occupied ? "Occupied by existing profile" : "",
    };
  });
}

export function AddProfileDrawer({
  groups,
  onClose,
  onSubmitMock,
}: {
  groups: DeviceProfileGroup[];
  onClose: () => void;
  onSubmitMock: (payload: Record<string, unknown>) => void;
}) {
  const [step, setStep] = useState<AddProfileStep>(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState(() => defaultForm(groups));
  const [verification, setVerification] = useState<{ status: string; canonical_username: string | null; reason: string } | null>(null);
  const selectedGroup = useMemo(() => groups.find((group) => group.deviceId === form.device_id) ?? groups[0], [form.device_id, groups]);
  const appInstances = useMemo(() => appInstancesForGroup(selectedGroup), [selectedGroup]);
  const selectedApp = appInstances.find((app) => app.app_instance_id === form.app_instance_id) ?? appInstances.find((app) => app.selectable);
  const selectedPackage = packageOptions.find((item) => item.value === form.commercial_package) ?? packageOptions[0];
  const selectedRuntime = runtimeOptions.find((item) => item.value === form.runtime_mode) ?? runtimeOptions[0];
  const selectedSlot = slotOptions.find((slot) => slot.starts_at === form.starts_at && slot.ends_at === form.ends_at);
  const selectedAddons = addonOptions.filter((addon) => form.addons.includes(addon.value));

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "username") setVerification(null);
  }

  function selectDevice(group: DeviceProfileGroup) {
    const firstAvailable = appInstancesForGroup(group).find((app) => app.selectable);
    setForm((current) => ({
      ...current,
      device_id: group.deviceId,
      app_instance_id: firstAvailable?.app_instance_id ?? "",
    }));
  }

  function canMoveNext() {
    if (step === 0) return Boolean(selectedGroup);
    if (step === 1) return Boolean(form.username.trim()) && (form.login_method !== "credentials" || Boolean(form.password.trim()));
    if (step === 2) return Boolean(selectedApp?.selectable);
    if (step === 3) return Boolean(selectedPackage.selectable && form.runtime_mode);
    if (step === 4) return Boolean(selectedSlot?.available);
    return Boolean(selectedGroup && selectedApp && selectedSlot);
  }

  function verifyUsername() {
    const username = form.username.trim().replace(/^@/, "");
    if (!username) return;
    const valid = /^[a-z0-9._]{2,30}$/i.test(username);
    setVerification({
      status: valid ? "pending_verification" : "invalid_format",
      canonical_username: valid ? username.toLowerCase() : null,
      reason: valid ? "provider_not_configured" : "invalid_format",
    });
  }

  function submitMock() {
    const payload = {
      endpoint_contract: "/api/instagram-dashboard/accounts/create",
      mode: "mock_only",
      username: verification?.canonical_username || form.username.trim().toLowerCase(),
      login_method: form.login_method,
      password_status: form.login_method === "credentials" ? "write_only_pending_secure_submit" : "not_submitted",
      email_present: Boolean(form.email.trim()),
      display_name: form.display_name.trim(),
      internal_label: form.internal_label.trim(),
      notes_present: Boolean(form.notes.trim()),
      device_id: form.device_id,
      app_instance_id: form.app_instance_id,
      clone_mode: selectedApp ? `clone_${selectedApp.instance_index}` : "",
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
      sync_targets: ["admin_dashboard", "client_dashboard", "database", "botapp"],
    };
    setShowConfirm(false);
    onSubmitMock(payload);
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
        {step < 5 ? <Button onClick={() => setStep((current) => (current + 1) as AddProfileStep)} disabled={!canMoveNext()}>Next</Button> : <Button onClick={() => setShowConfirm(true)} disabled={!canMoveNext()}>Create Profile</Button>}
      </div>}
    >
      <div className="add-profile-flow">
        <div className="add-profile-steps" aria-label="Add Profile progress">
          {steps.map((label, index) => <span key={label} className={index <= step ? "active" : ""}>{label}</span>)}
        </div>

        {step === 0 ? (
          <div className="add-profile-options">
            {groups.map((group) => (
              <button key={group.deviceId} type="button" className={group.deviceId === form.device_id ? "add-profile-option active" : "add-profile-option"} onClick={() => selectDevice(group)}>
                <strong>{group.deviceLabel}</strong>
                <span>{group.deviceSerial} · {group.phoneStatus} · {group.profiles.length} assigned profiles</span>
                <span>{Math.max(0, 3 - group.profiles.length)} free app instances · {group.profiles.length} occupied</span>
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
                <Button variant="ghost" onClick={verifyUsername} disabled={!form.username.trim()}>Verify</Button>
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
            {verification ? <div className="settings-card full"><strong>{verification.canonical_username || form.username}</strong><span>{verification.status} · {verification.reason}</span></div> : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="add-profile-options">
            {appInstances.map((app) => (
              <button key={app.app_instance_id} type="button" className={app.app_instance_id === form.app_instance_id ? "add-profile-option active" : "add-profile-option"} onClick={() => updateField("app_instance_id", app.app_instance_id)} disabled={!app.selectable}>
                <strong>{app.label}</strong>
                <span>index {app.instance_index} · {app.package_name}</span>
                <span>{app.status}</span>
                {app.disabledReason ? <em>{app.disabledReason}</em> : null}
              </button>
            ))}
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
            <div><dt>Username</dt><dd>{verification?.canonical_username || form.username || "-"} · {verification?.status || "pending_verification"}</dd></div>
            <div><dt>Device</dt><dd>{selectedGroup?.deviceLabel || "-"} · {selectedGroup?.deviceSerial || "serial unknown"}</dd></div>
            <div><dt>App instance</dt><dd>{selectedApp?.label || "-"} · index {selectedApp?.instance_index ?? "-"}</dd></div>
            <div><dt>Login method</dt><dd>{form.login_method} · {form.login_method === "credentials" ? "Credential will be submitted securely" : "credentials not submitted"}</dd></div>
            <div><dt>Package</dt><dd>{packageLabel(form.commercial_package)} · {selectedPackage.commercialCode}</dd></div>
            <div><dt>Runtime mode</dt><dd>{selectedRuntime.label}</dd></div>
            <div><dt>Add-ons</dt><dd>{selectedAddons.length ? selectedAddons.map((addon) => addon.label).join(", ") : "none"}</dd></div>
            <div><dt>Schedule</dt><dd>{selectedSlot?.label || "-"} · visible later in Schedule drawer</dd></div>
            <div><dt>Safety</dt><dd>No Supabase, Instagram, ADB, worker, provisioning, login, or run is called from this preview.</dd></div>
            <div><dt>Future submit contract</dt><dd>POST `/api/instagram-dashboard/accounts/create` through a secure server API only.</dd></div>
          </dl>
        ) : null}
      </div>
    </Drawer>
    {showConfirm ? (
      <div className="add-profile-confirm-backdrop" role="presentation" onMouseDown={() => setShowConfirm(false)}>
        <section className="add-profile-confirm" role="dialog" aria-modal="true" aria-labelledby="add-profile-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
          <h3 id="add-profile-confirm-title">Create this profile?</h3>
          <p>This prepares the admin create contract only. It does not launch login, provisioning, or a run, and no backend mutation is executed.</p>
          <div className="add-profile-confirm-actions">
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={submitMock}>Create Profile</Button>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
