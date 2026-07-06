/**
 * Pure helpers for the Scheduler view.
 *
 * The BotApp Scheduler view is observability only: every displayed value
 * comes from the backend read-model (`scheduler_status` relay endpoint) and
 * every mutation goes through the canonical auto-restart settings endpoint.
 * No eligibility, slot, cap or readiness rule is ever computed here.
 */

import type {
  BotAppSchedulerBackendMode,
  BotAppSchedulerDailyEngine,
  BotAppSchedulerEngineStatus,
  BotAppSchedulerRecentDecision,
} from "../api/types";

/**
 * Refresh cadence: the canonical tick runs every `check_every_minutes`
 * (minutes), so one fetch per minute while the view is visible is more than
 * enough and never aggressive.
 */
export const SCHEDULER_REFRESH_INTERVAL_MS = 60_000;

export function shouldPollScheduler(activeRoute: string, visibilityState: string) {
  return activeRoute === "scheduler" && visibilityState === "visible";
}

export type SchedulerBadgeTone = "success" | "warning" | "error" | "info" | "neutral";

export const engineBadgeCopy: Record<BotAppSchedulerEngineStatus, { label: string; tone: SchedulerBadgeTone }> = {
  running: { label: "Running", tone: "success" },
  degraded: { label: "Degraded", tone: "warning" },
  unknown: { label: "Unknown", tone: "neutral" },
};

export const backendModeCopy: Record<BotAppSchedulerBackendMode, { label: string; tone: SchedulerBadgeTone }> = {
  enabled: { label: "ON", tone: "success" },
  disabled_by_config: { label: "OFF", tone: "neutral" },
};

/**
 * CP1 — canonical reason codes → short operator labels, mirroring the backend
 * nomenclature (lib/instagram-dashboard/scheduler-reasons.ts). Reasons the
 * backend cannot explain surface as "reason unavailable" — never invented.
 * Unknown-but-real canonical codes pass through unchanged so nothing is hidden.
 */
export const REASON_UNAVAILABLE_LABEL = "reason unavailable";

const REASON_SHORT_LABELS: Record<string, string> = {
  // Engine / toggle states
  scheduler_disabled: "scheduler disabled",
  technical_disabled: "daily cron disabled (env)",
  dry_run: "dry run",
  settings_patch: "configuration updated",
  scheduler_disabled_race_rejected: "rejected: scheduler turned OFF",
  // Resume engine (Auto Restart)
  resume_plan_missing: "resume plan missing",
  no_recent_run: "no recent run",
  resume_runtime_not_supported: "resume not supported",
  restart_not_allowed: "restart not allowed",
  restart_delay_pending: "restart delay pending",
  max_attempts_reached: "attempt cap reached",
  max_restarts_day: "daily cap reached",
  max_restarts_window: "window cap reached",
  restart_red_disabled: "risk policy (red)",
  restart_yellow_disabled: "risk policy (yellow)",
  // Runtime / infrastructure
  botapp_runtime_unavailable: "BotApp runtime unavailable",
  dispatcher_unavailable: "dispatcher unavailable",
  device_heartbeat_stale: "phone heartbeat stale",
  device_unavailable: "phone unavailable",
  device_lock_held: "phone busy (lock held)",
  phone_busy: "phone busy",
  phone_rest_active: "phone rest active",
  // Account state
  active_run_exists: "run already active",
  active_request_exists: "run already requested",
  assignment_window_closed: "outside window",
  outside_schedule_window: "outside window",
  outside_assignment_window: "outside window",
  no_active_schedule_window: "outside window",
  assignment_missing: "no assignment",
  manual_only_requires_manual_trigger: "manual only",
  no_eligible_targets: "no targets",
  no_eligible_accounts: "no eligible accounts",
  assignment_pending: "assignment to verify",
  assignment_unhealthy: "assignment to verify",
  assignment_or_device_pending: "assignment to verify",
  readiness_blocked: "readiness blocked",
  readiness_not_ready: "readiness blocked",
  login_not_connected: "login not connected",
  quota_reached: "quota reached",
  cap_reached: "quota reached",
  open_incident_blocked: "open incident",
  eligible: "eligible",
  // Technical errors (distinct from business blocks)
  enqueue_failed: "enqueue failed",
  unexpected_tick_error: "unexpected tick error",
  tick_failed: "tick failed",
  eligibility_query_failed: "eligibility read failed",
  // Explicit non-answer
  reason_unavailable: REASON_UNAVAILABLE_LABEL,
  unknown: REASON_UNAVAILABLE_LABEL,
};

export function shortReasonLabel(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) return REASON_UNAVAILABLE_LABEL;
  // A blocked decision can carry a comma-joined reason list; keep it short.
  const first = normalized.split(",")[0].trim();
  return REASON_SHORT_LABELS[first] ?? first;
}

/**
 * Preferred label source: the stable backend `reason_code` (CP1). Falls back
 * to the raw reason for older backend payloads without the field.
 */
export function decisionReasonLabel(decision: BotAppSchedulerRecentDecision): string {
  const code = (decision.reason_code || "").trim();
  if (code) return REASON_SHORT_LABELS[code] ?? code;
  return shortReasonLabel(decision.reason);
}

/** True when the row is a global ON/OFF configuration event, not an account decision. */
export function isSchedulerConfigDecision(decision: BotAppSchedulerRecentDecision): boolean {
  if (decision.event === "scheduler_config") return true;
  // Older backend payloads: settings events have no account and a settings action.
  return !decision.account_id && decision.action === "auto_restart_settings_updated";
}

/** Row title: config events get an explicit label instead of "unknown account". */
export function decisionRowLabel(decision: BotAppSchedulerRecentDecision): string {
  if (isSchedulerConfigDecision(decision)) {
    if (decision.config_enabled === true) return "Scheduler configuration — ON";
    if (decision.config_enabled === false) return "Scheduler configuration — OFF";
    return "Scheduler configuration";
  }
  return decision.username || decision.account_id || "unknown account";
}

/** CP1 — daily engine (schedule-session cron) state → operator copy. */
export const dailyEngineCopy: Record<BotAppSchedulerDailyEngine["state"], { label: string; tone: SchedulerBadgeTone }> = {
  technical_disabled: { label: "Daily engine: disabled (env)", tone: "neutral" },
  dry_run: { label: "Daily engine: dry run", tone: "warning" },
  scheduler_disabled: { label: "Daily engine: gated by toggle", tone: "neutral" },
  active: { label: "Daily engine: active", tone: "success" },
};

export function decisionTone(decision: string): SchedulerBadgeTone {
  const normalized = decision.trim().toLowerCase();
  if (normalized === "enqueued") return "success";
  if (normalized === "blocked") return "warning";
  if (normalized === "disabled") return "neutral";
  return "info";
}

export function formatTimestamp(value: string | null): string {
  if (!value) return "never observed";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "never observed";
  return date.toLocaleString();
}

export function formatTickInterval(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds}s`;
}

/** A decision row is clickable only when a real account exists behind it. */
export function decisionNavigationAccountId(decision: BotAppSchedulerRecentDecision): string | null {
  return decision.account_id || null;
}
