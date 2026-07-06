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
 * Canonical exclusion reasons → short operator labels. Unknown reasons fall
 * back to the raw canonical string so nothing is hidden or invented.
 */
const REASON_SHORT_LABELS: Record<string, string> = {
  scheduler_disabled: "scheduler disabled",
  manual_only_requires_manual_trigger: "manual only",
  outside_schedule_window: "outside window",
  outside_assignment_window: "outside window",
  no_active_schedule_window: "outside window",
  readiness_blocked: "readiness blocked",
  readiness_not_ready: "readiness blocked",
  cap_reached: "cap reached",
  max_restarts_day: "daily cap reached",
  max_restarts_window: "window cap reached",
  max_attempts_reached: "attempt cap reached",
  no_eligible_targets: "no targets",
  no_eligible_accounts: "no eligible accounts",
  assignment_pending: "assignment to verify",
  assignment_unhealthy: "assignment to verify",
  restart_delay_pending: "restart delay pending",
  restart_red_disabled: "risk policy (red)",
  restart_yellow_disabled: "risk policy (yellow)",
  resume_runtime_not_supported: "resume not supported",
  device_lock_held: "device busy",
  eligible: "eligible",
};

export function shortReasonLabel(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) return "unknown";
  // A blocked decision can carry a comma-joined reason list; keep it short.
  const first = normalized.split(",")[0].trim();
  return REASON_SHORT_LABELS[first] ?? first;
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
