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
  BotAppSchedulerUpcomingWindow,
} from "../api/types";

/**
 * Refresh cadence for Daily runtime gate observability.
 * Heartbeat age is server-projected and should move every few seconds while
 * this view is open — 15s keeps the UI fresh without spamming the backend.
 */
export const SCHEDULER_REFRESH_INTERVAL_MS = 15_000;

/** Poll while the Scheduler route is mounted; window focus must not gate refresh. */
export function shouldPollScheduler(activeRoute: string) {
  return activeRoute === "scheduler";
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
  // CP4 preflight / keyguard
  device_locked: "device locked",
  device_locked_requires_operator: "secure lock requires operator",
  actual_logged_in_username_not_detected: "username not detected",
  login_screen_detected: "login screen detected",
  checkpoint: "checkpoint",
  login_challenge: "challenge",
  post_login_popup_detected: "post-login popup",
  late_preflight_blocked: "late preflight blocked",
  scheduler_launch_blocked: "scheduler launch blocked",
  // Explicit non-answer
  reason_unavailable: REASON_UNAVAILABLE_LABEL,
  unknown: REASON_UNAVAILABLE_LABEL,
};

export const RESUME_PLAN_MISSING_EXPLANATION =
  "Resume plan missing — old run cannot be resumed. Not a scheduled run failure.";

export const AUTO_RESTART_DECISIONS_NOTE =
  "These are resume decisions, not scheduled run attempts.";

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

/**
 * CP2 — 48h projection display helpers. Everything shown comes from the
 * backend read-model (derived daily recurrence); nothing is computed locally
 * beyond formatting.
 */
export function upcomingWindowBadge(window: BotAppSchedulerUpcomingWindow): { label: string; tone: SchedulerBadgeTone } {
  if (window.is_open) return { label: "open now", tone: "success" };
  if (window.stored_window_expired && !window.materialized) {
    // Real state, clearly surfaced: the stored dated window has expired and
    // the cron has not rolled it forward yet — never a silent "waiting".
    return { label: "awaiting roll-forward", tone: "warning" };
  }
  return { label: "planned", tone: "neutral" };
}

function dayKeyInTimezone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** "today" / "tomorrow" / "Jul 8" — computed in the window's own timezone. */
export function upcomingWindowDayLabel(window: BotAppSchedulerUpcomingWindow, now: Date): string {
  const starts = new Date(window.starts_at);
  if (!Number.isFinite(starts.getTime())) return "unknown day";
  const startKey = dayKeyInTimezone(starts, window.timezone);
  const todayKey = dayKeyInTimezone(now, window.timezone);
  const tomorrowKey = dayKeyInTimezone(new Date(now.getTime() + 86_400_000), window.timezone);
  if (startKey === todayKey) return "today";
  if (startKey === tomorrowKey) return "tomorrow";
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: window.timezone, month: "short", day: "numeric" }).format(starts);
  } catch {
    return startKey;
  }
}

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

export function isResumePlanMissingDecision(decision: BotAppSchedulerRecentDecision): boolean {
  const code = (decision.reason_code || "").trim();
  if (code === "resume_plan_missing") return true;
  return decision.reason.includes("resume_plan_missing");
}

export function decisionReasonDetail(decision: BotAppSchedulerRecentDecision): string | null {
  if (isResumePlanMissingDecision(decision)) return RESUME_PLAN_MISSING_EXPLANATION;
  return null;
}

const PIPELINE_STATUS_LABELS: Record<string, string> = {
  waiting_for_window: "Waiting for window",
  waiting_for_t10: "Waiting for T-10",
  preflight_due: "Preflight due",
  preflight_queued: "Preflight queued",
  preflight_claimed: "Preflight claimed",
  preflight_running: "Preflight running",
  preflight_ready: "Preflight ready",
  preflight_blocked: "Preflight blocked",
  preflight_expired: "Preflight expired",
  preflight_lease_unavailable: "Preflight lease unavailable",
  account_session_queued: "Account session queued",
  account_session_claimed: "Account session claimed",
  account_session_running: "Account session running",
  account_session_completed: "Account session completed",
  account_session_failed: "Account session failed",
  no_action: "No action",
};

export function pipelineStatusLabel(status: string): string {
  return PIPELINE_STATUS_LABELS[status] || status.replaceAll("_", " ");
}

export function pipelineStatusTone(status: string): SchedulerBadgeTone {
  if (status === "preflight_ready" || status === "account_session_completed") return "success";
  if (status.startsWith("account_session_running") || status.startsWith("preflight_running") || status === "account_session_claimed") return "info";
  if (status.includes("blocked") || status.includes("failed") || status.includes("expired") || status.includes("unavailable")) return "warning";
  return "neutral";
}

type PreflightProjection = {
  status?: string | null;
  reason_code?: string | null;
  screen_type?: string | null;
  detection_reason?: string | null;
  identity_guard_stage?: string | null;
  unlock_result?: string | null;
};

export function preflightBlockedOperatorLabel(preflight: PreflightProjection | null | undefined): string {
  if (!preflight) return "Preflight blocked";
  const reason = (preflight.reason_code || "").trim();
  if (reason === "device_locked") return "Preflight blocked · device locked";
  if (reason === "device_locked_requires_operator") return "Preflight blocked · secure lock requires operator";
  if (reason === "login_screen_detected") return "Preflight blocked · login screen detected";
  if (reason === "checkpoint") return "Preflight blocked · checkpoint";
  if (reason === "login_challenge") return "Preflight blocked · challenge";
  if (reason === "post_login_popup_detected") return "Preflight blocked · post-login popup";
  if (reason === "actual_logged_in_username_not_detected") return "Preflight blocked · username not detected";
  if (preflight.status === "preflight_ready") return "Preflight ready";
  if (preflight.status === "preflight_lease_unavailable") return "Preflight lease unavailable";
  if (reason) return `Preflight blocked · ${shortReasonLabel(reason)}`;
  return "Preflight blocked";
}

export function preflightKeyguardContext(preflight: PreflightProjection | null | undefined): string | null {
  if (!preflight) return null;
  const parts: string[] = [];
  if (preflight.screen_type === "device_keyguard") parts.push("Android lock screen detected");
  if (preflight.unlock_result === "secure_lock_required") {
    parts.push("PIN/password/pattern required — operator action needed");
  }
  return parts.length ? parts.join(" · ") : null;
}

export function yesNoLabel(value: boolean | null | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}
