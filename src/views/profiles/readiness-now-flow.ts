import type {
  BotProfile,
  ProfileReadinessNowClientStatus,
  ProfileReadinessNowPayload,
  ProfileReadinessNowProjection,
  ProfileReadinessNowState,
  ProfileReadinessNowStatus,
} from "../../api/types";

function idempotencyKey(profile: BotProfile) {
  return `botapp:readiness-now:${profile.id}:preview`;
}

function clientMessage(status: ProfileReadinessNowClientStatus) {
  return {
    connected_ready: "Connected",
    checking_connection: "Checking connection",
    action_required_2fa: "2FA required",
    action_required_checkpoint: "Checkpoint required",
    update_password: "Update password",
    capacity_unavailable: "No phone slot available now",
    waiting_next_slot: "Waiting for next slot",
    try_again_later: "Try again later",
  }[status];
}

function projection(input: {
  readinessStatus: ProfileReadinessNowStatus;
  clientStatus: ProfileReadinessNowClientStatus;
  reason: string;
  nextAction: string;
  assignmentStatus: ProfileReadinessNowProjection["assignment_status"];
  phoneAvailable: boolean | null;
  appInstanceAvailable: boolean | null;
  expectedPreflightRequest?: boolean;
}): ProfileReadinessNowProjection {
  const expectedPreflightRequest = input.expectedPreflightRequest ?? false;
  return {
    audience: "admin",
    readiness_status: input.readinessStatus,
    client_status: input.clientStatus,
    client_message: clientMessage(input.clientStatus),
    preflight_request_created: false,
    expected_preflight_request: expectedPreflightRequest,
    idempotent: false,
    next_action: input.nextAction,
    reason: input.reason,
    assignment_status: input.assignmentStatus,
    phone_available: input.phoneAvailable,
    app_instance_available: input.appInstanceAvailable,
    run_request_status: expectedPreflightRequest ? "prepared" : "not_prepared",
  };
}

export function buildReadinessNowProjection(profile: BotProfile): ProfileReadinessNowProjection {
  if (profile.status === "archived" || profile.status === "paused" || profile.status === "blocked") {
    return projection({
      readinessStatus: "retry_later",
      clientStatus: "try_again_later",
      reason: "account_lifecycle_blocked",
      nextAction: "review_account",
      assignmentStatus: "blocked",
      phoneAvailable: null,
      appInstanceAvailable: null,
    });
  }

  if (profile.credentialStatus === "missing" || profile.loginStatus === "missing_credentials") {
    return projection({
      readinessStatus: "needs_credentials",
      clientStatus: "update_password",
      reason: "credentials_missing_or_inactive",
      nextAction: "submit_or_update_credentials",
      assignmentStatus: "missing",
      phoneAvailable: null,
      appInstanceAvailable: null,
    });
  }

  if (profile.credentialStatus === "needs_update" || profile.loginStatus === "password_invalid") {
    return projection({
      readinessStatus: "needs_credentials",
      clientStatus: "update_password",
      reason: profile.loginStatus === "password_invalid" ? "login_status_password_invalid" : "credentials_reauth_required",
      nextAction: "update_password",
      assignmentStatus: "missing",
      phoneAvailable: null,
      appInstanceAvailable: null,
    });
  }

  if (profile.loginStatus === "needs_2fa") {
    return projection({
      readinessStatus: "needs_login_verification",
      clientStatus: "action_required_2fa",
      reason: "login_status_needs_2fa",
      nextAction: "submit_2fa_code",
      assignmentStatus: "ready",
      phoneAvailable: null,
      appInstanceAvailable: null,
    });
  }

  if (profile.loginStatus === "checkpoint" || profile.loginStatus === "challenge_required") {
    return projection({
      readinessStatus: "needs_login_verification",
      clientStatus: "action_required_checkpoint",
      reason: "login_status_checkpoint",
      nextAction: "complete_checkpoint",
      assignmentStatus: "ready",
      phoneAvailable: null,
      appInstanceAvailable: null,
    });
  }

  if (profile.loginStatus === "connected" && profile.readiness === "ready") {
    return projection({
      readinessStatus: "ready",
      clientStatus: "connected_ready",
      reason: "already_connected_ready",
      nextAction: "none",
      assignmentStatus: "ready",
      phoneAvailable: null,
      appInstanceAvailable: null,
    });
  }

  if (profile.assignmentState === "missing_slot") {
    return projection({
      readinessStatus: "waiting_scheduled_assignment",
      clientStatus: "waiting_next_slot",
      reason: "waiting_scheduled_assignment",
      nextAction: "wait_for_scheduler_assignment",
      assignmentStatus: "waiting_scheduled_assignment",
      phoneAvailable: false,
      appInstanceAvailable: false,
    });
  }

  if (profile.deviceAvailability === "offline" || profile.deviceAvailability === "maintenance" || profile.assignmentState === "blocked") {
    return projection({
      readinessStatus: "capacity_unavailable",
      clientStatus: "capacity_unavailable",
      reason: "phone_or_app_unavailable",
      nextAction: "try_again_later",
      assignmentStatus: "blocked",
      phoneAvailable: false,
      appInstanceAvailable: false,
    });
  }

  if (profile.runtimeLock !== "none" || profile.status === "running") {
    return projection({
      readinessStatus: "retry_later",
      clientStatus: "try_again_later",
      reason: profile.runtimeLock !== "none" ? "skipped_phone_busy" : "account_busy",
      nextAction: "try_again_later",
      assignmentStatus: "ready",
      phoneAvailable: true,
      appInstanceAvailable: true,
    });
  }

  return projection({
    readinessStatus: "checking_connection",
    clientStatus: "checking_connection",
    reason: "login_preflight_now_queued",
    nextAction: "monitor_preflight",
    assignmentStatus: "ready",
    phoneAvailable: true,
    appInstanceAvailable: true,
    expectedPreflightRequest: true,
  });
}

export function buildReadinessNowPayload(profile: BotProfile): ProfileReadinessNowPayload {
  return {
    account_id: profile.id,
    audience: "admin",
    requested_by: null,
    source: "BotApp",
    source_surface: "botapp_profiles_toolbar",
    requested_run_type: "login_provisioning",
    priority: 0,
    idempotency_key: idempotencyKey(profile),
    metadata_safe: {
      account_username: profile.username,
      platform: profile.platform,
      device_label: profile.deviceName,
      assignment_state: profile.assignmentState,
      credential_status: profile.credentialStatus,
      login_status: profile.loginStatus,
      readiness_status: profile.readiness,
      timeslot: profile.activeWindow,
      expected_effect: "check_login_readiness_without_growth_session",
    },
  };
}

export function createReadinessNowState(profile: BotProfile): ProfileReadinessNowState {
  return {
    profileId: profile.id,
    projection: buildReadinessNowProjection(profile),
    payload: buildReadinessNowPayload(profile),
    result: "prepared",
  };
}
