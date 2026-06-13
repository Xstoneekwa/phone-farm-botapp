import { useEffect, useMemo, useState } from "react";
import type { DeviceProfileGroup } from "../../../api/types";
import { Button, Drawer, Input } from "../../../design/components";
import { resolveAddProfileCredentialsState } from "../add-profile-credentials";

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
type ScheduleSlotOccupant = {
  assignment_id: string | null;
  account_id: string | null;
  username: string | null;
  status: string;
};
type BackendScheduleSlot = {
  slot_id: string;
  schedule_mode: "scheduled" | "manual_only" | string;
  label: string;
  local_label: string;
  starts_at: string;
  ends_at: string;
  runtime_mode: string;
  timezone: string;
  availability: "available" | "occupied" | "reserved" | "disabled" | string;
  available: boolean;
  reason: string;
  occupied_by: ScheduleSlotOccupant | null;
};
type ScheduleSlotsResponse = {
  device_id: string;
  app_instance_id: string | null;
  assignment_type: string;
  timezone: string;
  slots: BackendScheduleSlot[];
};
type AddProfileProgressStatus = "pending" | "running" | "done" | "failed" | "skipped" | "partial";
type AddProfileProgressStep = {
  id: "verify_username" | "save_credentials" | "create_account" | "assign_device" | "save_settings" | "sync_targets";
  label: string;
  subtitle: string;
  status: AddProfileProgressStatus;
};
type AddProfileProgressLog = {
  timestamp: string;
  phase: string;
  message: string;
};
type AddProfileSubmitResult = {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
  partial?: boolean;
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
    schedule_mode: "scheduled" as "scheduled" | "manual_only",
    starts_at: "",
    ends_at: "",
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

function progressTime() {
  return new Date().toLocaleTimeString();
}

function progressStatusLabel(status: AddProfileProgressStatus) {
  if (status === "done") return "Done";
  if (status === "partial") return "Partial";
  if (status === "running") return "Running...";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return "Pending";
}

function buildInitialAddProfileProgress(form: ReturnType<typeof defaultForm>, appLabel: string, slotLabel: string, credentialsRequested: boolean): AddProfileProgressStep[] {
  return [
    {
      id: "verify_username",
      label: "Verify username",
      subtitle: `@${form.username.trim().replace(/^@+/, "") || "instagram"} · backend verification required before create`,
      status: "done",
    },
    {
      id: "save_credentials",
      label: "Save credentials",
      subtitle: credentialsRequested ? "Vault-backed write-only credentials save." : "Manual login selected; credentials skipped.",
      status: credentialsRequested ? "running" : "skipped",
    },
    {
      id: "create_account",
      label: "Create account",
      subtitle: "POST /api/instagram-dashboard/accounts/create",
      status: "running",
    },
    {
      id: "assign_device",
      label: "Assign device/app instance",
      subtitle: appLabel || "Selected app instance",
      status: "pending",
    },
    {
      id: "save_settings",
      label: "Save settings",
      subtitle: slotLabel || "Runtime, package, schedule and metadata.",
      status: "pending",
    },
    {
      id: "sync_targets",
      label: "Sync targets/settings",
      subtitle: "Admin, client, database, and BotApp projections.",
      status: "pending",
    },
  ];
}

function copyableAddProfileLog(logs: AddProfileProgressLog[]) {
  return logs.map((entry) => `${entry.timestamp} · ${entry.phase} · ${entry.message}`).join("\n");
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

function readScheduleOccupant(value: unknown): ScheduleSlotOccupant | null {
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

function readScheduleSlot(value: unknown, timezone: string): BackendScheduleSlot {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const startsAt = readString(row, "starts_at");
  const endsAt = readString(row, "ends_at");
  const availability = readString(row, "availability", readBoolean(row, "available", false) ? "available" : "disabled");
  const label = readString(row, "label", readString(row, "local_label", `${startsAt} - ${endsAt}`));
  return {
    slot_id: readString(row, "slot_id", `${startsAt}:${endsAt}`),
    schedule_mode: readString(row, "schedule_mode", startsAt && endsAt ? "scheduled" : "manual_only"),
    label,
    local_label: readString(row, "local_label", label),
    starts_at: startsAt,
    ends_at: endsAt,
    runtime_mode: readString(row, "runtime_mode", readString(row, "slot_kind", "")),
    timezone: readString(row, "timezone", timezone),
    availability,
    available: availability === "available" && readBoolean(row, "available", availability === "available"),
    reason: readString(row, "reason", availability === "available" ? "free" : availability),
    occupied_by: readScheduleOccupant(row.occupied_by),
  };
}

function readScheduleSlotsResponse(value: Record<string, unknown>): ScheduleSlotsResponse {
  const timezone = readString(value, "timezone", "Europe/Paris");
  return {
    device_id: readString(value, "device_id"),
    app_instance_id: readString(value, "app_instance_id") || null,
    assignment_type: readString(value, "assignment_type"),
    timezone,
    slots: Array.isArray(value.slots) ? value.slots.map((slot) => readScheduleSlot(slot, timezone)).filter((slot) => slot.schedule_mode === "manual_only" || (slot.starts_at && slot.ends_at)) : [],
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
        const occupant = group.profiles.find((profile) => (profile.appInstanceIndex ?? profile.cloneIndex ?? profile.profileNumber) === index);
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

function isRelayAuthError(value: string) {
  return /relay authentication|relay auth|authentication required|relay_auth_|backend relay|relay key/i.test(value || "");
}

function relayFriendlyMessage(value: string, fallback: string) {
  const message = value || fallback;
  if (!isRelayAuthError(message)) return message;
  return `${message} Check the BotApp relay credential on the backend and in BotApp. Open Runtime Health > BotApp relay auth, then Retry.`;
}

export function AddProfileDrawer({
  groups,
  onClose,
  onSubmit,
}: {
  groups: DeviceProfileGroup[];
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>, mode: "dry_run" | "create") => Promise<AddProfileSubmitResult>;
}) {
  const [step, setStep] = useState<AddProfileStep>(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState(() => defaultForm(groups));
  const [setupDevices, setSetupDevices] = useState<BackendDevice[]>(() => fallbackDevicesFromGroups(groups));
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotsResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleReloadKey, setScheduleReloadKey] = useState(0);
  const [verification, setVerification] = useState<UsernameVerification | null>(null);
  const [isVerifyingUsername, setIsVerifyingUsername] = useState(false);
  const [submitState, setSubmitState] = useState<{ loading: boolean; message: string }>({ loading: false, message: "" });
  const [progressState, setProgressState] = useState<{
    title: string;
    status: AddProfileProgressStatus;
    steps: AddProfileProgressStep[];
    logs: AddProfileProgressLog[];
    message: string;
  } | null>(null);
  const selectedDevice = useMemo(() => setupDevices.find((device) => device.id === form.device_id) ?? setupDevices[0], [form.device_id, setupDevices]);
  const appInstances = selectedDevice?.app_instances ?? [];
  const selectedApp = appInstances.find((app) => app.app_instance_id === form.app_instance_id) ?? appInstances.find((app) => app.selectable);
  const selectedPackage = packageOptions.find((item) => item.value === form.commercial_package) ?? packageOptions[0];
  const selectedRuntime = runtimeOptions.find((item) => item.value === form.runtime_mode) ?? runtimeOptions[0];
  const selectedSlot = scheduleSlots?.slots.find((slot) => (
    form.schedule_mode === "manual_only"
      ? slot.schedule_mode === "manual_only"
      : slot.schedule_mode !== "manual_only" && slot.starts_at === form.starts_at && slot.ends_at === form.ends_at
  )) ?? null;
  const selectedAddons = addonOptions.filter((addon) => form.addons.includes(addon.value));
  const scheduleTimezone = scheduleSlots?.timezone || "Europe/Paris";
  const credentialsRequested = form.login_method === "credentials" && Boolean(form.password.trim());

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
          setSetupError(relayFriendlyMessage(result.error || "", "Device inventory unavailable."));
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

  useEffect(() => {
    if (step !== 4 || !form.device_id || !form.app_instance_id) return;
    let cancelled = false;
    const loadSlots = window.botappDesktop?.profiles?.scheduleSlots;
    if (!loadSlots) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setScheduleSlots(null);
        setScheduleError("Schedule slots unavailable from BotApp bridge.");
        setForm((current) => ({ ...current, starts_at: "", ends_at: "" }));
      });
      return () => { cancelled = true; };
    }
    void Promise.resolve().then(async () => {
      setScheduleLoading(true);
      setScheduleError("");
      try {
        const result = await loadSlots({
          device_id: form.device_id,
          app_instance_id: form.app_instance_id,
          runtime_mode: form.runtime_mode,
        });
        if (cancelled) return;
        if (!result.ok) {
          setScheduleSlots(null);
          setScheduleError(relayFriendlyMessage(result.error || "", "Could not load schedule slots."));
          setForm((current) => ({ ...current, starts_at: "", ends_at: "" }));
          return;
        }
        const slots = readScheduleSlotsResponse(result.data ?? {});
        setScheduleSlots(slots);
        setForm((current) => {
          const currentStillAvailable = slots.slots.some((slot) => slot.available && (
            current.schedule_mode === "manual_only"
              ? slot.schedule_mode === "manual_only"
              : slot.schedule_mode !== "manual_only" && slot.starts_at === current.starts_at && slot.ends_at === current.ends_at
          ));
          const firstAvailable = slots.slots.find((slot) => slot.available);
          return {
            ...current,
            schedule_mode: currentStillAvailable ? current.schedule_mode : firstAvailable?.schedule_mode === "manual_only" ? "manual_only" : "scheduled",
            starts_at: currentStillAvailable ? current.starts_at : firstAvailable?.starts_at || "",
            ends_at: currentStillAvailable ? current.ends_at : firstAvailable?.ends_at || "",
          };
        });
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [form.app_instance_id, form.device_id, form.runtime_mode, scheduleReloadKey, step]);

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(["device_id", "app_instance_id", "runtime_mode"].includes(String(key)) ? { schedule_mode: "scheduled" as const, starts_at: "", ends_at: "" } : {}),
    }));
    if (["device_id", "app_instance_id", "runtime_mode"].includes(String(key))) setScheduleSlots(null);
    if (key === "username") setVerification(null);
  }

  function selectDevice(device: BackendDevice) {
    const firstAvailable = bestDefaultAppInstance(device);
    setForm((current) => ({
      ...current,
      device_id: device.id,
      app_instance_id: firstAvailable?.app_instance_id ?? "",
      schedule_mode: "scheduled",
      starts_at: "",
      ends_at: "",
    }));
    setScheduleSlots(null);
  }

  function canMoveNext() {
    if (step === 0) return Boolean(selectedDevice);
    if (step === 1) return verification?.status === "found";
    if (step === 2) return Boolean(selectedApp?.selectable);
    if (step === 3) return Boolean(selectedPackage.selectable && form.runtime_mode);
    if (step === 4) return Boolean(selectedSlot?.available);
    return Boolean(selectedDevice && selectedApp && selectedSlot);
  }

  function createDisabledReason() {
    if (submitState.loading) return "submit_in_progress";
    if (isRelayAuthError(setupError) || isRelayAuthError(scheduleError)) return "relay_auth_failed";
    if (!window.botappDesktop?.profiles?.create) return "backend_create_unavailable";
    if (verification?.status !== "found") return "username_not_verified";
    if (!selectedDevice) return "missing_device";
    if (!selectedApp) return "missing_app_instance";
    if (!selectedApp.selectable) return "app_instance_unavailable";
    if (!selectedPackage.selectable) return "package_unavailable";
    if (!form.runtime_mode) return "missing_runtime_mode";
    if (!selectedSlot?.available) return "missing_schedule";
    return null;
  }

  function disabledReasonLabel(reason: string | null) {
    if (!reason) return "";
    return {
      submit_in_progress: "Cannot create yet: backend request is already running.",
      relay_auth_failed: "Backend relay auth failed. Check the BotApp relay credential on backend and BotApp.",
      backend_create_unavailable: "Cannot create yet: backend create endpoint unavailable.",
      username_not_verified: "Cannot create yet: username verification is missing.",
      missing_device: "Cannot create yet: device is missing.",
      missing_app_instance: "Cannot create yet: app instance is missing.",
      app_instance_unavailable: "Cannot create yet: selected app instance is unavailable.",
      package_unavailable: "Cannot create yet: selected package is unavailable.",
      missing_runtime_mode: "Cannot create yet: runtime mode is missing.",
      missing_schedule: "Cannot create yet: schedule selection is missing.",
    }[reason] ?? `Cannot create yet: ${reason}.`;
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
          reason: relayFriendlyMessage(result.error || "", "verification_failed"),
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
    const disabledReason = mode === "create" ? createDisabledReason() : null;
    if (disabledReason) {
      setSubmitState({ loading: false, message: disabledReasonLabel(disabledReason) });
      return;
    }
    const payload = {
      endpoint_contract: "/api/instagram-dashboard/accounts/create",
      mode: mode === "create" ? "backend_real_write" : "backend_dry_run",
      username: verification?.normalized_username || form.username.trim().toLowerCase(),
      login_method: credentialsRequested ? "credentials" : "manual",
      credential_status: credentialsRequested ? "pending_write_only" : "not_submitted",
      credentials_submitted: credentialsRequested,
      submit_credentials: credentialsRequested,
      password_status: credentialsRequested ? "write_only_pending" : "not_submitted",
      password: mode === "create" && credentialsRequested ? form.password : "",
      email: form.email.trim(),
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
      schedule_mode: form.schedule_mode,
      starts_at: form.schedule_mode === "scheduled" ? form.starts_at : null,
      ends_at: form.schedule_mode === "scheduled" ? form.ends_at : null,
      credentials_deferred: !credentialsRequested,
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
    const progressSteps = buildInitialAddProfileProgress(
      form,
      selectedApp?.label ?? "",
      form.schedule_mode === "manual_only" ? "Manual-only schedule" : selectedSlot?.label ?? selectedSlot?.local_label ?? "",
      credentialsRequested,
    );
    const progressTitle = mode === "create" ? "Add Profile · Instagram" : "Add Profile dry-run · Instagram";
    setProgressState({
      title: progressTitle,
      status: "running",
      steps: progressSteps,
      logs: [
        { timestamp: progressTime(), phase: "VERIFY", message: `Verified username @${verification?.normalized_username || form.username.trim().replace(/^@+/, "")}.` },
        { timestamp: progressTime(), phase: "REQUEST", message: mode === "create" ? "Starting backend account create." : "Starting backend create dry-run." },
      ],
      message: mode === "create" ? "Creating account through shared backend..." : "Validating create contract through shared backend...",
    });
    setSubmitState({ loading: true, message: mode === "create" ? "Creating account through shared backend..." : "Validating create contract through shared backend..." });
    const result = await onSubmit(payload, mode);
    setSubmitState({ loading: false, message: result.message });
    if (!result.ok) {
      setProgressState((current) => current ? {
        ...current,
        status: "failed",
        steps: current.steps.map((item) => item.status === "running" || item.id === "create_account" ? { ...item, status: "failed" } : item),
        logs: [
          ...current.logs,
          { timestamp: progressTime(), phase: "ERROR", message: result.message },
        ],
        message: result.message,
      } : current);
      if ((result as { partial?: boolean }).partial) {
        setShowConfirm(false);
        return;
      }
      if (/slot_no_longer_available|occupied_by_account|reserved_slot|assignment_failed|app_instance_already_reserved|manual_only_requires_app_instance|invalid_schedule_mode|assignment_validation_failed/i.test(result.message)) {
        setStep(4);
        setScheduleReloadKey((current) => current + 1);
      }
      return;
    }
    const account = (result.data?.account ?? {}) as Record<string, unknown>;
    const accountId = readString(account, "id", "created");
    const resolvedUsername = readString(account, "username", verification?.normalized_username || form.username);
    const credentialsState = resolveAddProfileCredentialsState(result.data, credentialsRequested, resolvedUsername);
    setProgressState((current) => current ? {
      ...current,
      status: credentialsState.globalStatus,
      steps: current.steps.map((item) => {
        if (item.id === "save_credentials") return { ...item, status: credentialsState.saveStepStatus };
        return { ...item, status: "done" };
      }),
      logs: [
        ...current.logs,
        { timestamp: progressTime(), phase: "PERSIST", message: `Created account ${accountId}.` },
        { timestamp: progressTime(), phase: "CREDENTIALS", message: credentialsState.credentialsLogMessage },
        { timestamp: progressTime(), phase: "SYNC", message: "Backend returned account setup confirmation." },
        { timestamp: progressTime(), phase: "DONE", message: credentialsState.globalStatus === "partial" ? `Add Profile partial for @${resolvedUsername}.` : `Add Profile complete for @${resolvedUsername}.` },
      ],
      message: credentialsState.footerMessage,
    } : current);
    setShowConfirm(false);
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
              <small>{form.login_method === "credentials" ? "Credentials will be securely saved during account creation. No login, provisioning, or run will start." : "No password collected; login remains a later manual step."}</small>
            </label>
            {form.login_method === "credentials" ? (
              <label className="settings-row-block">
                <span>Password · write-only</span>
                <input className="input" type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} autoComplete="new-password" />
                <small>Stored through the secure backend during Create. The password is never shown in review or returned by the API.</small>
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
            {scheduleLoading ? <div className="empty-state">Loading real schedule availability from shared backend...</div> : null}
            {scheduleError ? <div className="ig-profile-message">{scheduleError}</div> : null}
            {(scheduleSlots?.slots ?? []).map((slot) => (
              <button
                key={slot.slot_id}
                type="button"
                className={selectedSlot?.slot_id === slot.slot_id ? "add-profile-option active" : "add-profile-option"}
                disabled={!slot.available}
                onClick={() => setForm((current) => ({
                  ...current,
                  schedule_mode: slot.schedule_mode === "manual_only" ? "manual_only" : "scheduled",
                  starts_at: slot.schedule_mode === "manual_only" ? "" : slot.starts_at,
                  ends_at: slot.schedule_mode === "manual_only" ? "" : slot.ends_at,
                }))}
              >
                <strong>{slot.label || slot.local_label}</strong>
                <span>{slot.schedule_mode === "manual_only" ? "Manual-only · no scheduled window" : `${slot.runtime_mode || selectedRuntime.value} · ${scheduleTimezone}`}</span>
                <span>{slot.availability}{slot.occupied_by?.username ? ` · Occupied by @${slot.occupied_by.username}` : slot.occupied_by?.account_id ? ` · Occupied by ${shortAccountId(slot.occupied_by.account_id)}` : ""}</span>
                {!slot.available ? <em>{slot.reason}{slot.occupied_by?.status ? ` · ${slot.occupied_by.status}` : ""}</em> : <em>{slot.schedule_mode === "manual_only" ? "manual only" : "free"}</em>}
              </button>
            ))}
            {!scheduleLoading && scheduleSlots && !scheduleSlots.slots.some((slot) => slot.available) ? <div className="empty-state">No available schedule slot for this device/app instance.</div> : null}
            {!scheduleLoading && !scheduleSlots ? <div className="empty-state">Select a device and app instance to load schedule availability.</div> : null}
          </div>
        ) : null}

        {step === 5 ? (
          <dl className="add-profile-review">
            <div><dt>Username</dt><dd>{verification?.normalized_username || form.username || "-"} · {verification?.status || "pending_verification"}</dd></div>
            <div><dt>Email provided</dt><dd>{form.email.trim() ? "yes" : "no"}</dd></div>
            <div><dt>Device</dt><dd>{selectedDevice?.device_name || "-"} · {selectedDevice?.adb_serial_display || "serial masked"}</dd></div>
            <div><dt>App instance</dt><dd>{selectedApp?.label || "-"} · index {selectedApp?.instance_index ?? "-"}</dd></div>
            <div><dt>Credentials</dt><dd>{credentialsRequested ? "will be saved securely during creation" : "not submitted"}</dd></div>
            <div><dt>Package</dt><dd>{packageLabel(form.commercial_package)} · {selectedPackage.commercialCode}</dd></div>
            <div><dt>Runtime mode</dt><dd>{selectedRuntime.label}</dd></div>
            <div><dt>Add-ons</dt><dd>{selectedAddons.length ? selectedAddons.map((addon) => addon.label).join(", ") : "none"}</dd></div>
            <div><dt>Schedule</dt><dd>{form.schedule_mode === "manual_only" ? "Manual-only · no scheduled window" : `${selectedSlot?.label || selectedSlot?.local_label || "-"} · ${scheduleTimezone}`} · {selectedSlot?.reason || "not_selected"}</dd></div>
            <div><dt>Safety</dt><dd>No login / no provisioning / no run. Credentials save is Vault-backed and write-only.</dd></div>
            <div><dt>Submit contract</dt><dd>POST `/api/instagram-dashboard/accounts/create` through shared backend.</dd></div>
            {submitState.message ? <div><dt>Backend status</dt><dd>{submitState.message}</dd></div> : null}
          </dl>
        ) : null}
      </div>
    </Drawer>
    {showConfirm ? (
      <div className="add-profile-confirm-backdrop" role="presentation" onMouseDown={() => setShowConfirm(false)}>
        <section className="add-profile-confirm" role="dialog" aria-modal="true" aria-labelledby="add-profile-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
          <h3 id="add-profile-confirm-title">Create this profile?</h3>
          <p>Create account, settings, assignment, and optional credentials in one backend call. No login, provisioning, or run will start.</p>
          {credentialsRequested ? <p className="ig-profile-message">Credentials will be securely saved during account creation. Password remains write-only and is not returned.</p> : null}
          {submitState.message ? <p className="ig-profile-message">{submitState.message}</p> : null}
          <div className="add-profile-confirm-actions">
            <Button variant="ghost" onClick={() => setShowConfirm(false)} disabled={submitState.loading}>Cancel</Button>
            <Button onClick={() => void submitProfile("dry_run")} disabled={submitState.loading}>{submitState.loading ? "Working..." : "Dry-run"}</Button>
            <Button variant="primary" onClick={() => void submitProfile("create")} disabled={Boolean(createDisabledReason()) || submitState.loading}>{submitState.loading ? "Working..." : "Create in backend"}</Button>
          </div>
          {createDisabledReason() ? <p className="ig-profile-message">Create disabled: {createDisabledReason()} · {disabledReasonLabel(createDisabledReason())}</p> : null}
        </section>
      </div>
    ) : null}
    {progressState ? (
      <div className="account-progress-backdrop" role="presentation" onMouseDown={() => progressState.status !== "running" ? setProgressState(null) : undefined}>
        <section className="account-progress-modal" role="dialog" aria-modal="true" aria-labelledby="account-progress-title" onMouseDown={(event) => event.stopPropagation()}>
          <header className="account-progress-header">
            <div>
              <span>@{verification?.normalized_username || form.username.trim().replace(/^@+/, "")} · Instagram</span>
              <h3 id="account-progress-title">{progressState.title}</h3>
              <p>{selectedDevice?.device_name || "Selected phone"} · {selectedApp?.label || "Selected app"}</p>
            </div>
            <em className={`account-progress-status status-${progressState.status}`}>{progressStatusLabel(progressState.status)}</em>
          </header>

          <section className="account-progress-card" aria-label="Progress">
            <h4>Progress</h4>
            <div className="account-progress-steps">
              {progressState.steps.map((item) => (
                <div key={item.id} className={`account-progress-step status-${item.status}`}>
                  <span aria-hidden="true">{item.status === "done" ? "✓" : item.status === "failed" ? "!" : item.status === "running" ? "…" : "•"}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.subtitle}</small>
                  </div>
                  <em>{progressStatusLabel(item.status)}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="account-progress-log-card">
            <div className="account-progress-log-heading">
              <h4>Process log</h4>
              <Button variant="ghost" onClick={() => void navigator.clipboard?.writeText(copyableAddProfileLog(progressState.logs))}>Copy log</Button>
            </div>
            <pre>{copyableAddProfileLog(progressState.logs)}</pre>
          </section>

          {progressState.message ? <p className="ig-profile-message">{progressState.message}</p> : null}
          <div className="add-profile-confirm-actions">
            {progressState.status === "done" ? <Button variant="primary" onClick={onClose}>Close and return to Profiles</Button> : null}
            {progressState.status === "partial" ? (
              <>
                <Button variant="ghost" onClick={onClose}>Return to Profiles</Button>
                <Button variant="primary" onClick={onClose}>Go to Credentials</Button>
              </>
            ) : null}
            {progressState.status === "failed" ? <Button variant="ghost" onClick={() => setProgressState(null)}>Back to form</Button> : null}
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
