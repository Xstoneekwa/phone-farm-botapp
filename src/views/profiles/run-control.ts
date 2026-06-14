import type {
  BotAppStartRunPayload,
  BotAppStopRunPayload,
  BotProfile,
  RunControlEligibilityProjection,
} from "../../api/types";

const START_PENDING_REASONS = new Set(["already_requested"]);
const STOPPABLE_REASONS = new Set(["already_running", "already_requested"]);

export function projectRunEligibility(profile: BotProfile): RunControlEligibilityProjection {
  const okToStart = profile.eligibility === "can_start";
  return {
    ok_to_start: okToStart,
    eligibility_status: okToStart ? "ready" : "blocked",
    reason: okToStart ? "ready" : profile.eligibilityDetail.primary_block_reason || profile.eligibilityReason || "eligibility_blocked",
    primary_block_reason: okToStart ? null : profile.eligibilityDetail.primary_block_reason || profile.eligibilityReason || "eligibility_blocked",
    reason_label: okToStart ? "Ready" : profile.eligibilityDetail.reason_label,
    reason_description: okToStart
      ? "Account settings and run eligibility are ready for this manual run."
      : profile.eligibilityDetail.reason_description,
    message: okToStart ? "Manual run is ready." : profile.eligibilityDetail.reason_label,
    requested_run_type: "account_session",
  };
}

export function isStartDisabled(profile: BotProfile) {
  return !projectRunEligibility(profile).ok_to_start;
}

export function startDisabledReason(profile: BotProfile) {
  const eligibility = projectRunEligibility(profile);
  if (eligibility.ok_to_start) return null;
  if (START_PENDING_REASONS.has(eligibility.reason)) return "A manual run is already requested for this account.";
  return eligibility.message || "Manual run eligibility is blocked.";
}

export function isStopEnabled(profile: BotProfile) {
  const eligibility = projectRunEligibility(profile);
  return profile.status === "running" || STOPPABLE_REASONS.has(eligibility.reason);
}

export function stopDisabledReason(profile: BotProfile) {
  if (isStopEnabled(profile)) return null;
  return "No active run or run request is known for this account.";
}

export function mockRunRequestId(profile: BotProfile) {
  const eligibility = projectRunEligibility(profile);
  if (eligibility.reason === "already_requested" || profile.status === "running") {
    return `req_${profile.id}`;
  }
  return null;
}

export function mockCurrentRunId(profile: BotProfile) {
  return profile.status === "running" ? `run_${profile.id}` : null;
}

function idempotencyKey(prefix: "start" | "stop", profile: BotProfile) {
  return `botapp:${prefix}:${profile.id}:manual`;
}

export function buildStartPayload(profile: BotProfile): BotAppStartRunPayload {
  const eligibility = projectRunEligibility(profile);
  return {
    account_id: profile.id,
    device_id: profile.deviceId,
    requested_by: null,
    source: "botapp_manual_play",
    requested_run_type: "account_session",
    trigger: "manual",
    reason: eligibility.reason,
    idempotency_key: idempotencyKey("start", profile),
    metadata_safe: {
      account_username: profile.username,
      device_label: profile.deviceName,
      timeslot: profile.activeWindow,
      package_label: profile.package,
      eligibility_reason: eligibility.reason,
    },
  };
}

export function buildStopPayload(profile: BotProfile, reason: string): BotAppStopRunPayload {
  const cleanReason = reason.trim().slice(0, 160) || "manual_stop";
  return {
    account_id: profile.id,
    device_id: profile.deviceId,
    requested_by: null,
    source: "botapp_manual_stop",
    reason: cleanReason,
    run_request_id: mockRunRequestId(profile),
    current_run_id: mockCurrentRunId(profile),
    idempotency_key: idempotencyKey("stop", profile),
    metadata_safe: {
      account_username: profile.username,
      current_session: profile.lastSessionAt ?? "No active session timestamp available",
      expected_effect: "Cancel active account_run_requests and request stop/reconcile active ig_runs through a future secure BotApp relay.",
    },
  };
}
