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

export function socialBlockLabel(reason: string): string {
  const normalized = reason.toLowerCase();
  if (normalized.includes("review_login_package_mismatch") || normalized.includes("identity_mismatch")) {
    return "social review: account mismatch";
  }
  if (normalized.includes("blocking_dashboard_action")) return "social review required";
  if (normalized.includes("welcome_real_send_disabled")) return "growth blocked: Welcome DM disabled";
  if (normalized.includes("outreach_real_send_disabled")) return "growth blocked: Outreach DM disabled";
  if (normalized.includes("quota") || normalized.includes("cap")) return "growth blocked: quota";
  return "social blocked: reason required";
}

export function socialBadge(profile: BotProfile): { label: string; tone: BadgeTone } {
  if (profile.loginStatus !== "connected") {
    const reason = stableBlockCode(profile);
    if (reason.includes("login")) return { label: "social needs login", tone: "warning" };
    return { label: "social needs login", tone: "warning" };
  }

  if (profile.eligibility === "can_start") {
    return { label: "growth ready", tone: "success" };
  }

  const code = stableBlockCode(profile);
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
  if (code.includes("account_session_running") || code.includes("active_run_exists")) {
    return { label: "connected · session running", tone: "info" };
  }
  if (code.includes("login")) return { label: "social needs login", tone: "warning" };
  if (code.includes("target") || code.includes("ct")) return { label: "growth needs targets", tone: "warning" };
  if (code.includes("phone") || code.includes("device") || code.includes("assignment")) {
    return { label: "growth waiting device", tone: "warning" };
  }
  return { label: socialBlockLabel(code), tone: "warning" };
}
