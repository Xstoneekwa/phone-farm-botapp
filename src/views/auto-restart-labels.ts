import type { AutoRestartControl, AutoRestartControlAction } from "../api/types";
import type { AutoRestartTruth } from "./auto-restart-status";

const CONTROL_LABELS: Partial<Record<AutoRestartControlAction, string>> = {
  enable_auto_restart: "Enable Auto Restart",
  disable_auto_restart: "Disable Auto Restart",
  restart_eligible_sessions: "Restart eligible sessions",
  resume_quota_paused: "Resume quota-paused accounts",
  pause_device_rest: "Pause phone rest",
  resume_phone: "Resume phone",
  open_affected_accounts: "Open affected accounts",
  open_device: "Open devices",
  open_compass_issue: "Open Compass",
  open_credentials: "Open credentials",
  open_activity_log: "Open activity log",
  view_safety_gates: "View safety gates",
  view_candidates: "View candidates",
  export_preview: "Export preview",
  refresh_overview: "Refresh overview",
  dry_run_preview: "Run dry-run check",
};

const DEVICE_REST_REASONS: Record<string, string> = {
  no_rest_configured: "No rest configured",
  no_rest_blocker: "No rest blocker",
};

export function controlLabel(control: AutoRestartControl) {
  return CONTROL_LABELS[control.action] ?? control.label;
}

/** @deprecated Use controlLabel */
export const frenchControlLabel = controlLabel;

export function deviceStatusLabel(status: string) {
  if (status === "resting") return "resting";
  if (status === "active") return "active";
  if (status === "offline") return "offline";
  return status;
}

/** @deprecated Use deviceStatusLabel */
export const frenchDeviceStatus = deviceStatusLabel;

export function humanizeDeviceRestReason(reason: string, _isPreview = false) {
  const normalized = String(reason || "").trim().toLowerCase();
  if (!normalized) return "No rest configured";
  const mapped = DEVICE_REST_REASONS[normalized];
  if (mapped) return mapped;
  if (/^no[_\s-]?rest/i.test(normalized)) return "No rest configured";
  return reason;
}

export function formatUnavailableValue() {
  return {
    primary: "Unavailable",
    secondary: "Scheduler is not connected to runtime yet.",
  };
}

export function formatAutoRestartDisplayValue(
  value: string | number | null,
  _truth: AutoRestartTruth,
  _options: { previewMetric?: boolean } = {},
) {
  if (value === null || value === "") return formatUnavailableValue();
  return { primary: String(value), secondary: null as string | null };
}

export function formatBlockedCandidatesReason(reason: string | null, _truth: AutoRestartTruth) {
  if (!reason) return null;
  return reason;
}

export function safetyStatusLabel(status: string) {
  if (status === "watch") return "watch";
  if (status === "safe") return "safe";
  if (status === "blocked") return "blocked";
  if (status === "backend_pending") return "backend pending";
  return status.replaceAll("_", " ");
}

/** @deprecated Use safetyStatusLabel */
export const frenchSafetyStatus = safetyStatusLabel;
