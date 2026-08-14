import type { BotProfile } from "../../api/types";
import type { BadgeTone } from "../../design/components";

function stableBlockCode(profile: BotProfile): string {
  return [
    profile.eligibilityDetail?.primary_block_reason,
    profile.eligibilityReason,
    profile.eligibilityDetail?.reason_label,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function hasActiveRuntime(profile: BotProfile): boolean {
  const requestStatus = String(profile.activeRunRequestStatus || "").trim().toLowerCase();
  const runStatus = String(profile.activeRunStatus || "").trim().toLowerCase();
  return (
    profile.status === "running"
    || ["pending", "queued", "claimed", "starting", "running", "stopping", "canceling"].includes(requestStatus)
    || ["pending", "running", "stopping"].includes(runStatus)
    || profile.runtimeIndicator?.state === "active"
  );
}

export function socialBlockLabel(reason: string): string {
  const normalized = reason.toLowerCase();
  if (normalized.includes("review_login_package_mismatch") || normalized.includes("identity_mismatch")) {
    return "social review: account mismatch";
  }
  if (normalized.includes("operator_review_required")) return "operator review required";
  if (normalized.includes("blocking_dashboard_action")) return "operator review required";
  if (normalized.includes("welcome_real_send_disabled")) return "growth blocked: Welcome DM disabled";
  if (normalized.includes("outreach_real_send_disabled")) return "growth blocked: Outreach DM disabled";
  if (normalized.includes("quota") || normalized.includes("cap")) return "growth blocked: quota";
  return "operator review";
}

export function canonicalConnectBadge(profile: BotProfile): { label: string; tone: BadgeTone } {
  if (profile.loginStatus === "connected") return { label: "connected", tone: "success" };
  if (profile.credentialStatus === "missing" || profile.loginStatus === "missing_credentials") {
    return { label: "missing credentials", tone: "warning" };
  }
  if (profile.credentialStatus === "needs_update" || profile.loginStatus === "password_invalid") {
    return { label: "update password", tone: "error" };
  }
  if (["needs_2fa", "challenge_required", "checkpoint"].includes(profile.loginStatus)) {
    return { label: "action required", tone: "warning" };
  }
  const canonicalConnectionRequired = ["unknown", "logged_out"].includes(profile.loginStatus)
    || profile.readiness === "needs_login";
  if (
    canonicalConnectionRequired
    && (
      profile.credentialStatus === "saved_pending_verification"
      || profile.credentialStatus === "active"
    )
  ) {
    return { label: "ready to connect", tone: "info" };
  }
  return { label: "login pending", tone: "neutral" };
}

export function socialBadge(profile: BotProfile): { label: string; tone: BadgeTone } {
  if (profile.commercialLifecycleStatus === "cancelled") {
    return { label: "cancelled", tone: "error" };
  }
  if (profile.commercialLifecycleStatus === "paused") {
    return { label: "paused", tone: "warning" };
  }

  if (hasActiveRuntime(profile)) {
    const staleReason = stableBlockCode(profile);
    if (staleReason && !staleReason.includes("already_running") && !staleReason.includes("active_run")) {
      console.info("[botapp] profiles_stale_badge_ignored", { profileId: profile.id, reason: staleReason });
    }
    return { label: "active", tone: "success" };
  }

  if (profile.loginStatus !== "connected") {
    return { label: "login required", tone: "warning" };
  }

  const code = stableBlockCode(profile);
  const runtimeStatus = String(profile.accountRuntimeStatus || "").trim().toLowerCase();
  if (
    runtimeStatus === "paused_manual_review"
    || code.includes("operator_review_required")
    || code.includes("blocking_dashboard_action")
  ) {
    return { label: "operator review required", tone: "warning" };
  }

  if (profile.readiness === "ready") {
    return { label: "growth ready", tone: "success" };
  }

  if (code.includes("device_locked_requires_operator") || code.includes("device_locked")) {
    return { label: "connected · device locked", tone: "warning" };
  }
  if (
    code.includes("preflight_blocked")
    || code.includes("late_preflight_blocked")
    || code.includes("actual_logged_in_username_not_detected")
    || code.includes("login_screen_detected")
    || code.includes("checkpoint")
    || code.includes("login_challenge")
  ) {
    return { label: "connected · preflight blocked", tone: "warning" };
  }
  if (
    code.includes("assignment_window_closed")
    || code.includes("outside_window")
    || code.includes("no_active_schedule_window")
  ) {
    return { label: "connected · waiting for slot", tone: "warning" };
  }
  if (code.includes("scheduler_launch_blocked")) {
    return { label: "connected · scheduler blocked", tone: "warning" };
  }
  if (
    code.includes("welcome_surface_unstable")
    || code.includes("followers_surface_missing_at_start")
    || code.includes("recovered_snapshot_rejected")
  ) {
    return { label: "operator review required", tone: "warning" };
  }
  if (code.includes("run_worker_failure") || code.includes("worker_exit_nonzero")) {
    return { label: "growth blocked: worker failure", tone: "warning" };
  }
  if (code.includes("account_session_running") || code.includes("active_run_exists")) {
    return { label: "connected · session running", tone: "info" };
  }
  if (code.includes("login")) return { label: "connected · status review", tone: "warning" };
  if (
    code.includes("needs_more_targets")
    || code.includes("target_accounts_missing")
    || code.includes("targeting_not_ready")
    || code.includes("ct_missing")
  ) return { label: "growth needs targets", tone: "warning" };
  if (code.includes("phone") || code.includes("device") || code.includes("assignment")) {
    return { label: "growth waiting device", tone: "warning" };
  }
  return { label: "growth status unavailable", tone: "info" };
}
