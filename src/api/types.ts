export type ApiScope =
  | "profile:read"
  | "profile:write"
  | "settings:write"
  | "devices:read"
  | "activity:read"
  | "compass:read"
  | "credentials:manage"
  | "targets:manage"
  | "targets:write"
  | "templates:read"
  | "webhooks:manage"
  | "stats:read";

export type ApiSuccess<T> = { ok: true; data: T; request_id: string };
export type ApiFailure = { ok: false; error: { code: string; message: string }; request_id: string };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type BotAppRelayHealth = {
  ok: boolean;
  relay_authenticated: boolean;
  backend_configured: boolean;
  source: string;
  server_time: string | null;
  reason: "relay_auth_required" | "relay_auth_invalid" | "relay_auth_unconfigured" | "unreachable" | null;
  backend_key: {
    present: boolean;
    length: number;
    sha256_prefix: string | null;
    environment_scope: string;
  };
  provided_key: {
    present: boolean;
    length: number;
    sha256_prefix: string | null;
  };
  routes: Record<string, "ok" | "blocked" | "unknown">;
  route_paths?: Record<string, string>;
  message: string;
  checkedAt: string;
};

export type ProfileStatus = "running" | "ready" | "blocked" | "paused" | "archived" | "trashed";
export type DeviceStatus = "connected" | "online" | "reserved" | "offline" | "maintenance";
export type Severity = "info" | "warning" | "error" | "critical";

export type PhoneSession = {
  id: string;
  profileId: string;
  username: string;
  state: "active_ui" | "preflight_reserved" | "buffer" | "idle";
  startedAt: string;
};

export type ProfileToolbarAction =
  | "stats"
  | "logs"
  | "targets"
  | "play"
  | "auto_login"
  | "restore_login_screen"
  | "check_readiness"
  | "stop"
  | "settings"
  | "filters"
  | "assign_now"
  | "archive"
  | "delete"
  | "restore";

export type ProfileRequirementState = {
  enabled: boolean;
  reason:
    | "ready"
    | "already_connected"
    | "already_assigned"
    | "login_already_running"
    | "assignment_already_running"
    | "missing_credentials"
    | "credentials_inactive"
    | "password_needs_update"
    | "needs_2fa"
    | "checkpoint_required"
    | "assignment_missing"
    | "assignment_window_closed"
    | "schedule_gate_blocked"
    | "app_instance_missing"
    | "phone_rest_active"
    | "profile_not_ready"
    | "device_unavailable"
    | "no_assignment_slot"
    | "phone_unavailable"
    | "runtime_blocked"
    | "login_status_not_ready"
    | "status_blocked"
    | "eligibility_blocked";
  label: string;
  detail: string;
};

export type ProfileEligibility = {
  status: "can_start" | "blocked_now";
  primary_block_reason: string;
  reason_label: string;
  reason_description: string;
};

export type RunControlEligibilityProjection = {
  ok_to_start: boolean;
  eligibility_status: "ready" | "blocked";
  reason: string;
  primary_block_reason: string | null;
  reason_label: string;
  reason_description: string;
  message: string;
  requested_run_type: "account_session";
};

export type BotAppRunControlSource = "botapp" | "botapp_manual_play" | "botapp_manual_stop";

export type BotAppStartRunPayload = {
  account_id: string;
  device_id: string;
  requested_by: string | null;
  source: BotAppRunControlSource;
  requested_run_type: "account_session";
  trigger: "manual";
  reason: string;
  idempotency_key: string;
  metadata_safe: {
    account_username: string;
    device_label: string;
    timeslot: string;
    package_label: BotProfile["package"];
    eligibility_reason: string;
  };
};

export type BotAppStopRunPayload = {
  account_id: string;
  device_id: string;
  requested_by: string | null;
  source: BotAppRunControlSource;
  reason: string;
  run_request_id: string | null;
  current_run_id: string | null;
  idempotency_key: string;
  metadata_safe: {
    account_username: string;
    current_session: string;
    expected_effect: string;
  };
};

export type ProfileCredentialStatus = CredentialStatus;

export type ProfileLoginStatus =
  | "ready"
  | "connected"
  | "missing_credentials"
  | "challenge_required"
  | "needs_2fa"
  | "checkpoint"
  | "password_invalid"
  | "logged_out"
  | "unknown";

export type ProfileDashboardActionState =
  | "idle"
  | "pending"
  | "running"
  | "code_required"
  | "blocked"
  | "complete"
  | "failed";

export type ProfileAutoLoginRequirement = ProfileRequirementState;

export type ProfileAutoLoginPayload = {
  account_id: string;
  requested_run_type: "login_provisioning";
  trigger: "manual";
  source: "BotApp";
  idempotency_key: string;
};

export type ProfileRestoreLoginScreenPayload = {
  account_id: string;
  source: "BotApp";
  idempotency_key: string;
};

export type ProfileAutoLoginProgressStep = {
  id: "queued" | "claimed" | "worker" | "login" | "result";
  label: string;
  detail: string;
  status: "done" | "running" | "pending" | "failed" | "action_required" | "skipped";
};

export type ProfileAutoLoginProcessLogEntry = {
  id: string;
  timestamp: string;
  phase: "REQUEST" | "QUEUE" | "DISPATCHER" | "WORKER" | "LOGIN" | "ACTION" | "DONE" | "ERROR";
  message: string;
};

export type ProfileAutoLoginChallenge = {
  challenge_id: string;
  account_id: string;
  account_username: string;
  code_type: "2fa" | "sms" | "email" | "whatsapp" | "authenticator" | "checkpoint" | "confirmation";
  title: string;
  help_text: string;
};

export type ProfileAutoLoginCodePayload = {
  account_id: string;
  challenge_id: string;
  code: string;
  code_type: ProfileAutoLoginChallenge["code_type"];
  source: "BotApp";
  requested_by: string | null;
  idempotency_key: string;
};

export type ProfileAutoLoginFinalStatus =
  | "prepared"
  | "starting"
  | "queued"
  | "claimed"
  | "running"
  | "action_required"
  | "completed"
  | "blocked"
  | "stopped"
  | "failed";

export type ProfileAutoLoginState = {
  profileId: string;
  username: string;
  platform: BotProfile["platform"];
  deviceLabel: string;
  globalStatus: ProfileAutoLoginFinalStatus;
  payload: ProfileAutoLoginPayload;
  steps: ProfileAutoLoginProgressStep[];
  processLog: ProfileAutoLoginProcessLogEntry[];
  challenge: ProfileAutoLoginChallenge | null;
  requestId: string | null;
  requestStatus: string | null;
  runId: string | null;
  safeReason: string | null;
  nextAction: "open_phone" | "check_login" | "retry_auto_login" | "update_credentials" | "review_mismatch" | "none";
};

export type ProfileRunProgressSnapshot = {
  account_id: string;
  request_id: string | null;
  request_status: string | null;
  requested_run_type: string | null;
  run_id: string | null;
  run_status: string | null;
  status: "unknown" | "queued" | "claimed" | "running" | "action_required" | "connected" | "status_sync_missing" | "run_link_missing" | "completed" | "failed" | "stopped";
  reason: string | null;
  action_required: null | {
    id: string;
    action_type: string;
    status: string;
    title: string;
    message: string;
  };
  steps: Array<{
    id: string;
    label: string;
    subtitle: string;
    status: ProfileAutoLoginProgressStep["status"];
    started_at: string | null;
    completed_at: string | null;
    metadata_safe: Record<string, unknown>;
  }>;
  process_log: Array<{
    id: string;
    timestamp: string;
    phase: string;
    message: string;
  }>;
  generated_at: string;
  metadata_safe: Record<string, unknown>;
};

export type ProfileReadinessNowAudience = "admin" | "client";

export type ProfileReadinessNowStatus =
  | "ready"
  | "ready_to_connect"
  | "needs_credentials"
  | "needs_login_verification"
  | "waiting_scheduled_assignment"
  | "capacity_unavailable"
  | "retry_later"
  | "checking_connection";

export type ProfileReadinessNowClientStatus =
  | "connected_ready"
  | "ready_to_connect"
  | "checking_connection"
  | "action_required_2fa"
  | "action_required_checkpoint"
  | "update_password"
  | "capacity_unavailable"
  | "waiting_next_slot"
  | "try_again_later";

export type ProfileReadinessNowProjection = {
  audience: ProfileReadinessNowAudience;
  readiness_status: ProfileReadinessNowStatus;
  client_status: ProfileReadinessNowClientStatus;
  client_message: string;
  preflight_request_created: false;
  expected_preflight_request: boolean;
  idempotent: false;
  next_action: string;
  reason: string;
  assignment_status: "ready" | "missing" | "waiting_scheduled_assignment" | "blocked";
  phone_available: boolean | null;
  app_instance_available: boolean | null;
  run_request_status: "prepared" | "not_prepared";
};

export type ProfileReadinessNowPayload = {
  account_id: string;
  audience: ProfileReadinessNowAudience;
  requested_by: string | null;
  source: "BotApp";
  source_surface: "botapp_profiles_toolbar";
  requested_run_type: "login_provisioning";
  priority: 0;
  idempotency_key: string;
  metadata_safe: {
    account_username: string;
    platform: BotProfile["platform"];
    device_label: string;
    assignment_state: BotProfile["assignmentState"];
    credential_status: ProfileCredentialStatus;
    login_status: ProfileLoginStatus;
    readiness_status: BotProfile["readiness"];
    timeslot: string;
      expected_effect: "refresh_login_readiness_without_growth_session";
  };
};

export type ProfileReadinessNowState = {
  profileId: string;
  projection: ProfileReadinessNowProjection;
  payload: ProfileReadinessNowPayload;
  result: "prepared";
};

export type ProfileAssignNowRequirement = ProfileRequirementState;

export type ProfileAssignmentSlot = {
  starts_at: string;
  ends_at: string;
  slot_kind: string;
  slot_kind_label: string;
  available: boolean;
  reason: string | null;
};

export type ProfileAssignmentGate = {
  ok: boolean;
  reason: string;
  label: string;
  detail: string;
};

export type ProfileAssignmentCandidate = {
  account_id: string;
  account_username: string;
  platform: BotProfile["platform"];
  device_id: string;
  device_label: string;
  safe_device_serial: string;
  app_instance_label: string;
  clone_slot: string;
  current_slot: ProfileAssignmentSlot | null;
  candidate_slot: ProfileAssignmentSlot | null;
  schedule_gate: ProfileAssignmentGate;
  warnings: string[];
};

export type ProfileAssignNowPayload = {
  account_id: string;
  device_id: string;
  app_instance_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  slot_kind: string | null;
  runtime_profile: string;
  requested_by: string | null;
  source: "BotApp";
  idempotency_key: string;
  metadata_safe: {
    account_username: string;
    platform: BotProfile["platform"];
    device_label: string;
    safe_device_serial: string;
    app_instance_label: string;
    clone_slot: string;
    current_slot: string;
    candidate_slot: string;
    schedule_gate_reason: string;
    assignment_state: BotProfile["assignmentState"];
  };
};

export type ProfileAssignmentResult =
  | "prepared"
  | "assigned_now"
  | "assignment_repaired"
  | "already_assigned"
  | "capacity_unavailable"
  | "not_ready"
  | "active_run_exists"
  | "active_request_exists";

export type ProfileAssignNowState = {
  profileId: string;
  candidate: ProfileAssignmentCandidate;
  payload: ProfileAssignNowPayload;
  result: ProfileAssignmentResult;
};

export type ProfileLifecycleStatus = "active" | "archived" | "trashed" | "deleted";

export type ProfileLifecycleAction = "archive" | "trash" | "restore" | "permanent_delete";

export type ProfileLifecycleRetentionPolicy = {
  retentionDays: 30;
  archiveToTrashAfterDays: 30;
  trashToPermanentDeleteAfterDays: 30;
  restoreUntil: string | null;
  scheduledTrashAt: string | null;
  scheduledDeleteAt: string | null;
  permanentDeleteImplemented: boolean;
  trashStatus: "trashed";
};

export type ProfileArchivePayload = {
  account_id: string;
  action: "archive";
  requested_by: string | null;
  source: "BotApp";
  reason: string;
  idempotency_key: string;
  metadata_safe: {
    account_username: string;
    platform: BotProfile["platform"];
    current_status: ProfileLifecycleStatus;
    device_label: string;
    active_run_warning: boolean;
    scheduled_trash_at: string;
  };
};

export type ProfileDeletePayload = {
  account_id: string;
  action: "trash";
  requested_by: string | null;
  source: "BotApp";
  reason: string;
  restore_until: string;
  delete_after: string;
  idempotency_key: string;
  metadata_safe: {
    account_username: string;
    platform: BotProfile["platform"];
    current_status: ProfileLifecycleStatus;
    device_label: string;
    active_run_warning: boolean;
    trash_status: "trashed";
  };
};

export type ProfileRestorePayload = {
  account_id: string;
  action: "restore";
  requested_by: string | null;
  source: "BotApp";
  idempotency_key: string;
};

export type ProfileLifecycleResult =
  | "prepared"
  | "archived"
  | "trashed"
  | "restored"
  | "permanent_delete_pending"
  | "blocked";

export type ProfileArchiveState = {
  profileId: string;
  lifecycleStatus: ProfileLifecycleStatus;
  retentionPolicy: ProfileLifecycleRetentionPolicy;
  payload: ProfileArchivePayload;
  result: ProfileLifecycleResult;
};

export type ProfileDeleteState = {
  profileId: string;
  lifecycleStatus: ProfileLifecycleStatus;
  retentionPolicy: ProfileLifecycleRetentionPolicy;
  payload: ProfileDeletePayload;
  result: ProfileLifecycleResult;
};

export type ProfileCounters = {
  follow: { current: number; max: number };
  unfollow: { current: number; max: number };
  like: { current: number; max: number };
  comment: { current: number; max: number };
  dm: { current: number; max: number };
};

export type ProfileFollowerDelta3d = {
  value: number | null;
  currentFollowers: number | null;
  previousFollowers: number | null;
  from: string | null;
  to: string | null;
  source: string;
  freshness: string;
};

export type ProfileRunCounters = {
  follows: number;
  unfollows: number;
  likes: number;
  comments: number;
  dms: number;
  stories: number;
  interactionsTotal: number;
  source?: string;
  runId?: string | null;
};

export type ProfileRuntimeIndicator = {
  state: "idle" | "active" | "error";
  reason: string;
  lastRunId?: string | null;
  lastRunStatus?: string | null;
  lastRunExitCode?: number | null;
  lastRunFinishedAt?: string | null;
};

export type BotProfile = {
  id: string;
  username: string;
  displayName: string;
  platform: "Instagram" | "TikTok";
  package: "Growth" | "Pro" | "Premium";
  planType: "normal" | "dual" | "other";
  profileNumber: number;
  clientName: string;
  status: ProfileStatus;
  deviceId: string;
  deviceName: string;
  appInstanceId?: string;
  appInstanceLabel?: string | null;
  appInstanceIndex?: number | null;
  cloneIndex?: number | null;
  lifecycleStatus?: ProfileLifecycleStatus;
  archivedAt?: string | null;
  trashedAt?: string | null;
  scheduledTrashAt?: string | null;
  scheduledDeleteAt?: string | null;
  activeWindow: string;
  scheduleLabel?: string;
  followers: number;
  followerDelta: number;
  followerDelta3d?: ProfileFollowerDelta3d;
  interactionsToday?: number;
  currentRunCounters?: ProfileRunCounters;
  followsToday: number;
  dmsToday: number;
  counters: ProfileCounters;
  twoFactorEnabled: boolean;
  credentialStatus: CredentialStatus;
  loginStatus: ProfileLoginStatus;
  deviceAvailability: "available" | "reserved" | "offline" | "maintenance";
  assignmentState: "assigned" | "reserved" | "missing_slot" | "blocked";
  entitlements: string[];
  runtimeProfile: string;
  scheduleMode?: string | null;
  slotKind: string;
  autoLoginRequirement: ProfileRequirementState;
  restoreLoginScreenRequirement: ProfileRequirementState;
  refreshReadinessRequirement: ProfileRequirementState;
  assignNowRequirement: ProfileRequirementState;
  lastSessionAt: string | null;
  readiness: "ready" | "needs_login" | "needs_settings" | "blocked";
  eligibility: "can_start" | "blocked_now";
  eligibilityReason: string;
  eligibilityDetail: ProfileEligibility;
  runtimeLock: "none" | "device_level_lock" | "assignment_reserved";
  activeRunRequestId?: string | null;
  activeRunRequestStatus?: string | null;
  activeRunId?: string | null;
  activeRunStatus?: string | null;
  runtimeIndicator?: ProfileRuntimeIndicator;
};

export type BotAppClientAccountStatus = "active" | "pending" | "onboarding" | "paused" | "cancelled" | "unknown";
export type BotAppClientAccountLoginStatus = ProfileLoginStatus;
export type BotAppClientAccountCredentialStatus = CredentialStatus;
export type BotAppClientAccountReadiness = BotProfile["readiness"];
export type BotAppClientAccountEntitlement = string;

export type BotAppClientAccountAssignment = {
  deviceId: string;
  deviceName: string;
  deviceStatus: DeviceStatus;
  appInstanceLabel: string;
  packageName: string;
  assignmentStatus: BotProfile["assignmentState"];
  scheduleMode?: string | null;
  slotKind: string;
  activeWindow: string;
};

export type BotAppClientAccountAction =
  | "view_account"
  | "open_profile"
  | "open_targets"
  | "open_settings"
  | "check_readiness"
  | "auto_login"
  | "archive"
  | "trash"
  | "pause"
  | "cancel"
  | "mark_needs_assistance"
  | "request_password_update"
  | "reactivate"
  | "refresh";

export type BotAppClientAccount = {
  accountId: string;
  profileId: string;
  clientId: string;
  clientName: string;
  username: string;
  displayName: string;
  platform: BotProfile["platform"];
  createdAtLabel: string;
  accountStatus: BotAppClientAccountStatus;
  adminStatus: string;
  customerStatus: string;
  subscriptionStatus: string;
  lifecycleStatus: ProfileLifecycleStatus;
  loginStatus: BotAppClientAccountLoginStatus;
  credentialStatus: BotAppClientAccountCredentialStatus;
  credentialsConfigured: boolean;
  reauthRequired: boolean;
  twoFactorStatus: "enabled" | "disabled" | "code_required" | "unknown";
  readiness: BotAppClientAccountReadiness;
  eligibility: BotProfile["eligibility"];
  eligibilityReason: string;
  reasonLabel: string;
  packageLabel: BotProfile["package"];
  entitlementSummary: string;
  entitlements: BotAppClientAccountEntitlement[];
  assignment: BotAppClientAccountAssignment;
  lastActivityAt: string | null;
  targetsCount: number;
  needsMoreTargets: boolean;
  eligibleTargetCount: number;
  actionsNeeded: string[];
  clientContactEmailDisplay: string;
  clientContactEmailSource: string;
  clientContactEmailAvailable: boolean;
  safeEmailDisplay: string;
  sourceLabel: "supabase_projection:manage_overview" | "local projection";
  profileImageUrl: string | null;
  instagramVerificationStatus: "verified" | "pending" | "unknown";
  passwordStatus: "configured" | "missing" | "reauth_required" | "update_needed" | "unknown";
  twoFactorDisplay: "enabled" | "disabled" | "code required" | "pending action" | "checkpoint" | "blocked" | "unknown";
};

export type BotAppClientAccountsSummary = {
  total: number;
  active: number;
  pending: number;
  onboarding: number;
  paused: number;
  cancelled: number;
  needsAssistance: number;
  reauthRequired: number;
};

export type BotAppClientAccountsFilters = {
  query: string;
  status: "all" | BotAppClientAccountStatus | "needs-assistance";
};

export type BotAppClientAccountsOverview = {
  items: BotAppClientAccount[];
  summary: BotAppClientAccountsSummary;
  sourceStatus: {
    manageOverview: "connected" | "pending";
    credentialsActions: "connected" | "pending";
    statusMutations: "pending";
    botAppRelay: "pending";
  };
  relayPayload: BotAppClientAccountsRelayPayload;
};

export type BotAppClientAccountsRelayPayload = {
  action: "client_accounts_overview";
  source: "BotApp";
  requested_by: string | null;
  include: Array<"manage_overview" | "credentials_actions" | "readiness_projection" | "assignments" | "targets_summary">;
  metadata_safe: {
    expected_effect: "read_only_client_accounts_overview";
  };
};

export type PasswordUpdateRequestStatus = "pending" | "already_requested" | "accepted" | "failed";

export type ClientAccountNotificationPayload = {
  notification_type: "password_update_required";
  audience: "client";
  status: "pending";
  message: string;
  action_label: "Update password";
  action_deep_link: string;
};

export type ClientAccountEmailNotificationPayload = {
  email_template: "instagram_password_update_required";
  delivery_status: "pending_relay";
  include: Array<"client_name" | "username" | "client_action_link">;
};

export type ClientAccountPasswordUpdatePayload = {
  action: "request_password_update";
  account_id: string;
  client_id: string;
  username: string;
  requested_by: string | null;
  source: "BotApp";
  reason: "password_update_required";
  idempotency_key: string;
  notification: ClientAccountNotificationPayload;
  email: ClientAccountEmailNotificationPayload;
  metadata_safe: {
    source_surface: "client_accounts";
    expected_effect: "future_secure_relay_password_update_request";
  };
};

export type PasswordUpdateRequestResult = {
  status: PasswordUpdateRequestStatus;
  payload: ClientAccountPasswordUpdatePayload;
  message: string;
};

export type BotAppCredentialsActionType =
  | "submit_instagram_credentials"
  | "update_instagram_password"
  | "enter_email_verification_code"
  | "complete_two_factor"
  | "resolve_checkpoint"
  | "review_login_challenge"
  | "review_login_failure"
  | "review_account_mismatch"
  | "review_credentials"
  | "reconnect_instagram";

export type BotAppCredentialsActionStatus = "pending" | "acknowledged" | "pending_verification" | "code_submitted" | "resolved" | "dismissed";
export type BotAppCredentialsPriority = "critical" | "warning" | "info";
export type BotAppCredentialsAudience = "client" | "admin" | "ops";

export type BotAppCredentialsAction = {
  id: string;
  accountId: string;
  clientId: string;
  profileId: string;
  username: string;
  clientName: string;
  actionType: BotAppCredentialsActionType;
  title: string;
  description: string;
  status: BotAppCredentialsActionStatus;
  priority: BotAppCredentialsPriority;
  audience: BotAppCredentialsAudience;
  requiresClientAction: boolean;
  blockingCampaign: boolean;
  credentialStatus: string;
  loginStatus: string;
  provisioningStatus: string;
  sourceLabel: "account_dashboard_actions" | "derived from shared backend overview";
  assignedPhone: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  ageLabel: string;
  nextAction: string;
};

export type BotAppCredentialsFilter = "all" | "password" | "verification_code" | "credentials" | "needs_review" | "completed";

export type BotAppCredentialsOverview = {
  actions: BotAppCredentialsAction[];
  summary: {
    openActions: number;
    passwordUpdates: number;
    verificationCodes: number;
    needsReview: number;
    clientActionRequired: number;
  };
  relayPayload: BotAppCredentialsRelayPayload;
};

export type BotAppCredentialsRelayPayload = {
  action: "credentials_actions_overview";
  source: "BotApp";
  requested_by: string | null;
  include: Array<"account_dashboard_actions" | "account_credentials" | "client_instagram_accounts" | "manage_overview" | "radar_overview">;
  metadata_safe: {
    expected_effect: "read_only_credentials_actions_overview";
  };
};

export type BotAppCredentialsActionResult = {
  status: "prepared" | "disabled";
  action: BotAppCredentialsActionType | "refresh" | "open_account";
  payload: Record<string, unknown>;
};

export type DeviceProfileGroup = {
  deviceId: string;
  deviceLabel: string;
  deviceSerial: string;
  deviceSerialLabel: string;
  deviceStatus: DeviceStatus;
  phoneStatus: "active" | "inactive" | "idle" | "running";
  deviceView: {
    available: boolean;
    unavailableReason: string | null;
  };
  summary: { total: number; normal: number; dual: number; other: number };
  profiles: BotProfile[];
};

export type ProfileStatsRow = {
  sessionTime: string;
  sessionDate: string;
  followers: number;
  following: number;
  followBackEnabled: boolean;
  likeBackEnabled: boolean;
  follow: { current: number; target: number };
  unfollow: { current: number; target: number };
  like: { current: number; target: number };
  comment: { current: number; target: number };
  dm: { current: number; target: number };
  watch: number;
  totalInteractions: number;
};

export type ProfileLogLevel = "debug" | "info" | "success" | "warning" | "error";
export type ProfileLogPhase = "preflight" | "login" | "follow" | "mute" | "like" | "dm" | "unfollow" | "recovery" | "state_machine" | "api" | "device";
export type ProfileLogActionStatus = "started" | "skipped" | "succeeded" | "failed" | "recovered";
export type ProfileLogSource = "worker" | "botapp" | "dashboard" | "api" | "device";
export type ProfileLogExportFormat = "txt" | "json";
export type ProfileLogStreamState = "live" | "paused" | "disconnected";

export type ProfileLogEntry = {
  id: string;
  accountId: string;
  timestamp: string;
  level: ProfileLogLevel;
  phase: ProfileLogPhase;
  event: string;
  message: string;
  reason?: string;
  targetUsername?: string;
  actionStatus?: ProfileLogActionStatus;
  durationMs?: number;
  source: ProfileLogSource;
  runId?: string;
  requestId?: string;
};

export type ProfileTargetStatus = "pending_verification" | "valid" | "rejected" | "review" | "duplicate" | "active" | "archived" | "deleted";
export type ProfileTargetVerification = "pending" | "found" | "not_found" | "unavailable" | "rate_limited" | "provider_error";
export type ProfileTargetEligibility =
  | "unknown"
  | "eligible"
  | "rejected_low_followers"
  | "rejected_verified"
  | "rejected_private"
  | "rejected_not_found"
  | "review_provider_unavailable"
  | "review_username_changed";
export type ProfileTargetPerformance = "good" | "avg" | "bad" | "insufficient_data" | "pending" | "not_applicable";
export type ProfileTargetSource = "manual_single" | "manual_bulk" | "admin" | "client" | "botapp" | "automation" | "backend" | "future_discovery";
export type ProfileTargetListFilter = "all" | "active" | "pending" | "rejected" | "archived";
export type ProfileTargetExportFormat = "csv" | "json";

export type ProfileTarget = {
  id: string;
  accountId: string;
  username: string;
  canonicalUsername?: string | null;
  avatarUrl?: string | null;
  status: ProfileTargetStatus;
  verification: ProfileTargetVerification;
  verificationReason?: string | null;
  eligibility: ProfileTargetEligibility;
  followersCount: number | null;
  isVerified?: boolean | null;
  isPrivate?: boolean | null;
  providerCheckedAt?: string | null;
  lastVerifiedAt?: string | null;
  jobStatus?: string | null;
  jobProviderStatus?: string | null;
  jobNextAttemptAt?: string | null;
  jobLastErrorCode?: string | null;
  performance: ProfileTargetPerformance;
  followbackRatio: number | null;
  fbrMetricsReliable?: boolean;
  fbrPercent?: number | null;
  fbrLabel?: string | null;
  followbacksMetricsReliableAt?: string | null;
  followsSent: number | null;
  followbacks: number | null;
  lastUsedAt: string | null;
  lastSelectedAt?: string | null;
  lastSuccessfulCandidateAt?: string | null;
  lastExhaustedAt?: string | null;
  exhaustionReason?: string | null;
  cooldownUntil?: string | null;
  metricsUpdatedAt?: string | null;
  addedAt: string;
  source: ProfileTargetSource;
  batchId?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  reason?: string | null;
  syncStatus?: "synced" | "pending" | "failed" | "unknown";
};

export type ProfileTargetFilters = {
  query: string;
  listFilter: ProfileTargetListFilter;
};

export type ProfileTargetBulkImportResult = {
  totalSubmitted: number;
  acceptedForVerification: number;
  invalid: number;
  duplicates: number;
  alreadyExisting: number;
  normalizedUsernames: string[];
};

export type CredentialStatus = "active" | "missing" | "needs_update" | "saved_pending_verification";

export type ProfileAssignmentStatus = "assigned" | "pending" | "active" | "reserved" | "idle" | "blocked";

export type ProfileScheduleSlotReason =
  | "available"
  | "occupied"
  | "phone_rest"
  | "outreach_rest_reserved"
  | "no_clone_available"
  | "no_app_instance_available"
  | "current"
  | "current_conflict"
  | "manual_only"
  | null;

export type ProfileAvailableAssignmentSlot = {
  slotIndex: number;
  slotKind: string;
  slotKindLabel: string;
  localLabel: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
  selectable?: boolean;
  availability?: "available" | "current" | "conflict" | "occupied" | "blocked" | "manual_only";
  isCurrent?: boolean;
  isConflict?: boolean;
  reason: ProfileScheduleSlotReason;
  occupiedBy: string | null;
  scheduleMode?: "scheduled" | "manual_only";
};

export type ProfileScheduleGate = {
  ok: boolean;
  reason: string;
  windowActive: boolean;
  phoneRestActive: boolean;
  nextEligibleStartsAt: string | null;
  runStartGate: "ready" | "blocked";
  dispatcherGate: "ready" | "env_fallback" | "blocked";
  autoRestartGate: "ready" | "blocked";
};

export type ProfileScheduleRestWindow = {
  id: string;
  label: string;
  timezone: string;
  reason: string | null;
};

export type ProfileSettingsGeneral = {
  deviceId: string;
  deviceLabel: string;
  displayName: string;
  username: string;
  credentialStatus: CredentialStatus;
  credentialSource: "Vault" | "secure_backend" | "unknown";
  credentialUpdateRequired: boolean;
  twoFactorEnabled: boolean;
  commercialPackage: string;
  entitlements: string[];
  runtimeProfile: string;
  slotKind: string;
  readinessStatus: BotProfile["readiness"];
  eligibilityStatus: ProfileEligibility["status"];
  readinessReason: string;
  readinessNextAction: string;
  readinessRunRequestStatus: string;
  readinessPreflightCreated: boolean;
  assignmentStatus: string;
  scheduleMode?: string | null;
  currentSlot: string;
  safeMetadata: string;
};

export type ProfileSettingsSchedule = {
  currentSlot: string;
  businessWindow: string;
  businessTimezone: string;
  assignmentStatus: string;
  scheduleMode?: string | null;
  slotKind: string;
  runtimeProfile: string;
  assignedDevice: string;
  safeDeviceSerial: string;
  cloneSlot: string;
  apkClonerSlot: string;
  reservedState: ProfileAssignmentStatus;
  deviceLock: string;
  cloneBufferMinutes: number;
  phoneRest: string;
  scheduleSource: string;
  assignmentSource: string;
  appInstanceSummary: string;
  saveReady: boolean;
  availableSlots: ProfileAvailableAssignmentSlot[];
  restWindows: ProfileScheduleRestWindow[];
  gates: ProfileScheduleGate;
};

export type ProfileSettingsFollow = {
  timeslot: string;
  followEnabled: boolean;
  endIfLimitReached: boolean;
  endIfLimitType: string;
  turnOffFollow: boolean;
  followPerDay: number;
  muteAfterFollow: boolean;
  doFollowsFirst: boolean;
  maxFollowPerSession: number;
  packageFollowDayCap: number;
  packageFollowSessionCap: number;
  manualFollowDayCap: number;
  manualFollowSessionCap: number;
  adminOverrideActive: boolean;
  adminOverrideLabel: string;
  legacyFollowSessionCap: number | null;
  legacyFollowCapLabel: string;
  warmupEnabled: boolean;
  warmupApplied: boolean;
  warmupStatus: string;
  warmupDay: number;
  packageStartedAt: string;
  day1FollowCap: number;
  day2FollowCap: number;
  day3FollowCap: number;
  day4PlusFollowCap: number;
  effectiveWarmupCapToday: number;
  followDayRemaining: number;
  limitingReason: string;
  capSource: "package" | "manual" | "warmup" | "remaining_today" | "ops_safety" | "runtime";
  runtimeStatus: "active" | "read_only" | "needs_routing";
  effectiveFollowLimit: string;
  source: string;
};

export type ProfileSettingsDm = {
  welcomeDmEnabled: boolean;
  coldDmEnabled: boolean;
  aiCommentPrompt: string;
  welcomeDmBody: string;
  coldDmBody: string;
  templateName: string | null;
  outreachEnabled: boolean;
  welcomeEnabled: boolean;
  welcomeServiceActive: boolean;
  outreachServiceActive: boolean;
  welcomeEntitlementStatus: string;
  welcomeTemplateStatus: string;
  outreachTemplateStatus: string;
  welcomeRealSendStatus: string;
  outreachRealSendStatus: string;
  legacyDmGateStatus: string;
  saveReady: boolean;
  welcomeDisabledReason: string | null;
  outreachDisabledReason: string | null;
  welcomeSessionCap: number;
  welcomeDayCap: number;
  outreachSessionCap: number;
  outreachDayCap: number;
  outreachEntitlementStatus: string;
  safeDmLimit: number;
};

export type ProfileDmFeatureStatus = "active" | "inactive" | "blocked" | "missing";

export type ProfileDmEntitlement = {
  feature: "welcome" | "outreach";
  status: string;
  serviceActive: boolean;
  disabledReason: string | null;
};

export type ProfileDmMessage = {
  body: string;
  templateStatus: string;
  charCount: number;
  maxChars: number;
};

export type ProfileDmTemplate = {
  id: string | null;
  kind: "welcome" | "outreach";
  status: string;
  variables: string[];
};

export type ProfileDmTemplateAction = "insert_variable";

export type ProfileDmSavePayload = {
  account_id: string;
  source: "botapp";
  requested_by: string | null;
  idempotency_key: string;
  mock_only?: false;
  endpoint: "/api/instagram-dashboard/settings/dm";
  patch: {
    account_id: string;
    welcome_enabled: boolean;
    welcome_message: string;
    welcome_cap_session: number;
    welcome_cap_day: number;
    outreach_enabled: boolean;
    outreach_message: string;
    outreach_cap_session: number;
    outreach_cap_day: number;
  };
  metadata_safe: {
    account_username: string;
    welcome_template_status: string;
    outreach_template_status: string;
    welcome_real_send_status: string;
    outreach_real_send_status: string;
    sensitive_values_excluded: true;
  };
};

export type ProfileSettingsFollowback = {
  unfollowEnabled: boolean;
  unfollowMode: ProfileUnfollowMode;
  unfollowPerSession: number;
  unfollowPerDay: number;
  unfollowAfterDays: number;
  stopAfterUnfollowSkipped: number;
  unfollowSort: ProfileUnfollowMode;
  followbackRatioSummary: string;
  packageUnfollowDayCap: number;
  runtimeCapMode: "prod_normal" | "mini_run" | "incident_safety";
  runtimeSafetyCap: number | null;
  runtimeHardCap: number;
  runtimeCapSource: string;
  followEntitlementStatus: string;
  unfollowEntitlementStatus: string;
  handoffStatus: string;
  blockReason: string;
  safeCandidateStrategyStatus: string;
  doUnfollowFirstStatus: string;
  currentRuntimeMode: string;
  unfollowedToday: number;
  unfollowDayRemaining: number | null;
  limitingReason: string;
  effectiveUnfollowLimit: string;
};

export type ProfileUnfollowMode = "unfollow" | "unfollow-any" | "unfollow-non-followers";
export type ProfileUnfollowRuntimeCapMode = ProfileSettingsFollowback["runtimeCapMode"];

export type ProfileUnfollowLimit = {
  label: string;
  value: number;
  source: "account_setting" | "runtime" | "ops_safety" | "remaining_today" | "package" | "admin_override";
  readOnly: boolean;
};

export type ProfileUnfollowRuntimeSummary = {
  enabled: boolean;
  effectiveCap: number;
  remainingToday: number | null;
  limitingReason: string;
  blockReason: string;
};

export type ProfileUnfollowSafetyCap = {
  runtimeCapMode: ProfileUnfollowRuntimeCapMode;
  runtimeSafetyCap: number | null;
  runtimeHardCap: number;
  runtimeCapSource: string;
};

export type ProfileFollowbackRatioSummary = {
  label: string;
  followed: number;
  unfollowed: number;
  status: string;
};

export type ProfileUnfollowCandidateStrategy = {
  status: string;
  handoffStatus: string;
  mode: ProfileUnfollowMode;
};

export type ProfileFollowbackSavePayload = {
  account_id: string;
  source: "botapp";
  requested_by: string | null;
  idempotency_key: string;
  mock_only?: false;
  endpoint: "/api/instagram-dashboard/settings/unfollow";
  patch: {
    account_id: string;
    unfollow_enabled: boolean;
    unfollow_mode: ProfileUnfollowMode;
    unfollow_per_session_limit: number;
    unfollow_per_day_limit: number;
    unfollow_after_days: number;
    runtime_cap_mode: ProfileUnfollowRuntimeCapMode;
    runtime_safety_cap: number | null;
  };
  metadata_safe: {
    account_username: string;
    effective_unfollow_cap: string;
    runtime_cap_source: string;
    limiting_reason: string;
    sensitive_values_excluded: true;
  };
};

export type ProfileSettingsSources = {
  mainSource: string;
  sourceGroups: string[];
  targetAccountRefs: string[];
  totalTargetsCount: number;
  activeTargetsCount: number;
  eligibleTargetsCount: number;
  pendingTargetsCount: number;
  rejectedTargetsCount: number;
  archivedTargetsCount: number;
  maxFollowsPerTargetPerRun: number;
  maxTargetsPerRun: number;
  bounds: {
    maxFollowsPerTargetPerRun: { min: number; max: number };
    maxTargetsPerRun: { min: number; max: number };
  };
  sourceStatus: "account_setting" | "env_fallback" | "default" | "schema_pending";
  runtimeStatus: "active" | "schema_pending";
  saveReady: boolean;
  note: string;
  ctQualitySummary: string;
  followbackRatioByTarget: string;
  followsSentByTarget: string;
  insufficientDataTargets: number;
  pendingRuntimeTargets: number;
  recentlyExhaustedTargets: number;
  nextTargetProbable: string;
  sourceHealth: "healthy" | "review" | "blocked";
  adminSyncStatus: ProfileSourceSyncStatus;
  clientSyncStatus: ProfileSourceSyncStatus;
  botAppSyncStatus: ProfileSourceSyncStatus;
  lastRefreshLabel: string;
  syncReadiness: "ready" | "review" | "blocked";
};

export type ProfileSourceMode = "multi_target_rotation";
export type ProfileSourceStatus = ProfileSettingsSources["sourceStatus"];
export type ProfileSourceSyncStatus = "ready" | "review" | "blocked" | "schema_pending";

export type ProfileSourcePolicy = {
  mode: ProfileSourceMode;
  maxFollowsPerTargetPerRun: number;
  maxTargetsPerRun: number;
  source: ProfileSourceStatus;
  saveReady: boolean;
};

export type ProfileSourceSummary = {
  totalTargets: number;
  activeTargets: number;
  eligibleTargets: number;
  rejectedTargets: number;
  archivedTargets: number;
  sourceHealth: ProfileSettingsSources["sourceHealth"];
};

export type ProfileTargetSourceSummary = {
  ctQualitySummary: string;
  nextTargetProbable: string;
  followbackRatioByTarget: string;
};

export type ProfileSourceSavePayload = {
  account_id: string;
  source: "botapp";
  requested_by: string | null;
  idempotency_key: string;
  mock_only?: false;
  endpoint: "/api/instagram-dashboard/settings/follow-sources";
  patch: {
    account_id: string;
    max_follows_per_target_per_run: number;
    max_targets_per_run: number;
  };
  metadata_safe: {
    account_username: string;
    source_status: ProfileSourceStatus;
    runtime_status: ProfileSettingsSources["runtimeStatus"];
    target_summary: {
      active: number;
      eligible: number;
      rejected: number;
      archived: number;
    };
    sensitive_values_excluded: true;
  };
};

export type ProfileSettingsFilters = {
  skipPrivateProfiles: boolean;
  skipFollower: boolean;
  skipFollowing: boolean;
  skipNonBusiness: boolean;
  skipBusiness: boolean;
  followPrivate: boolean;
  followOnlyPrivate: boolean;
  dmPrivate: boolean;
  minFollowers: number | null;
  maxFollowers: number | null;
  minFollowing: number;
  maxFollowing: number;
  minPosts: number | null;
  blacklistedWords: string;
  mandatoryWords: string;
  runtimeReadyFields: string[];
  plannedFields: string[];
  runtimeStatus: "active";
  saveReady: boolean;
  sourceStatus: "account_setting" | "default" | "mock";
  templateName: string | null;
};

export type ProfileFilterNumericRange = {
  min: number | null;
  max: number | null;
};

export type ProfileFilterWordList = {
  raw: string;
  normalized: string[];
  readOnly: boolean;
};

export type ProfileFilterSourceStatus = ProfileSettingsFilters["sourceStatus"];

export type ProfileFilterRule = {
  key: string;
  label: string;
  runtimeReady: boolean;
  readOnly: boolean;
};

export type ProfileFilterValidation = {
  ok: boolean;
  reason: string | null;
};

export type ProfileFiltersSavePayload = {
  account_id: string;
  source: "botapp";
  requested_by: string | null;
  idempotency_key: string;
  mock_only?: false;
  endpoint: "/api/instagram-dashboard/settings/follow-filters";
  patch: {
    account_id: string;
    skip_private_profiles: boolean;
    min_followers: number | null;
    max_followers: number | null;
    min_posts: number | null;
  };
  metadata_safe: {
    account_username: string;
    runtime_ready_fields: string[];
    planned_fields: string[];
    source_status: ProfileFilterSourceStatus;
    sensitive_values_excluded: true;
  };
};

export type ProfileSettingsSaveMode = "general" | "settings" | "schedule" | "follow" | "dm" | "followback" | "sources" | "filters" | "template";

export type ProfileSettingsTemplate = {
  id: string;
  name: string;
  description: string;
  templateType: "settings" | "filters" | "full";
};

export type ProfileCredentialSafeStatus = {
  status: CredentialStatus;
  source: ProfileSettingsGeneral["credentialSource"];
  updateRequired: boolean;
  twoFactorEnabled: boolean;
};

export type ProfileSettingsPayload = {
  account_id: string;
  source: "botapp";
  mode: ProfileSettingsSaveMode;
  mock_only: true;
  settings: Partial<ProfileSettings>;
  template?: ProfileSettingsTemplate;
  metadata_safe: {
    account_username: string;
    tab: string;
    sensitive_values_excluded: true;
  };
};

export type ProfileScheduleAction = "save_schedule";

export type ProfileScheduleSavePayload = {
  account_id: string;
  device_id: string;
  app_instance_id?: string;
  schedule_mode?: "scheduled" | "manual_only";
  starts_at: string;
  ends_at: string;
  selected_slot_key: string;
  source: "botapp";
  requested_by: string | null;
  reason: "manual_schedule_assignment";
  action: ProfileScheduleAction;
  idempotency_key: string;
  mock_only?: boolean;
  metadata_safe: {
    account_username: string;
    device_label: string;
    slot_label: string;
    slot_kind: string;
    assignment_source: "manual_botapp";
    sensitive_values_excluded: true;
  };
};

export type ProfileFollowCapSource = ProfileSettingsFollow["capSource"];

export type ProfileFollowLimit = {
  label: string;
  value: number;
  source: ProfileFollowCapSource;
  readOnly: boolean;
};

export type ProfileFollowWarmupState = {
  enabled: boolean;
  status: string;
  day: number;
  day1Cap: number;
  day2Cap: number;
  day3Cap: number;
  day4PlusCap: number;
  effectiveCapToday: number;
};

export type ProfileFollowRuntimeSummary = {
  enabled: boolean;
  effectiveCapToday: number;
  followDayRemaining: number;
  limitingReason: string;
  runtimeStatus: ProfileSettingsFollow["runtimeStatus"];
};

export type ProfileFollowSafetyCap = {
  packageCap: number;
  manualDayCap: number;
  manualSessionCap: number;
  warmupCap: number;
  effectiveCap: number;
};

export type ProfileFollowSavePayload = {
  account_id: string;
  source: "botapp";
  requested_by: string | null;
  idempotency_key: string;
  mock_only?: false;
  endpoint: "/api/instagram-dashboard/settings";
  patch: {
    account_id: string;
    manual_follow_day_cap: number;
    manual_follow_session_cap: number;
    warmup_enabled: boolean;
    day_1_follow_cap: number;
    day_2_follow_cap: number;
    day_3_follow_cap: number;
    day_4_plus_follow_cap: number;
  };
  metadata_safe: {
    account_username: string;
    package_follow_day_cap: number;
    effective_follow_cap_today: number;
    admin_override_active: boolean;
    limiting_reason: string;
    sensitive_values_excluded: true;
  };
};

export type ProfileSettings = {
  general: ProfileSettingsGeneral;
  schedule: ProfileSettingsSchedule;
  follow: ProfileSettingsFollow;
  dm: ProfileSettingsDm;
  followback: ProfileSettingsFollowback;
  sources: ProfileSettingsSources;
  filters: ProfileSettingsFilters;
  advanced: {
    appMode: "da_normal" | "da_popup" | "da_no_popup";
    apkClonerSlot: string;
    turnOffLiking: boolean;
    startupTimeout: number | null;
    likePerDay: number;
    likesPerFollow: string;
    feedLikes: boolean;
    watchStories: boolean;
    aiCommentPerDay: number;
    aiCommentsPerFollow: number;
  };
};

export type ProfileFilters = ProfileSettingsFilters;

export type Device = {
  id: string;
  name: string;
  model: string;
  status: DeviceStatus;
  adbSerial: string;
  shortSerial: string;
  deviceKind: "physical_phone" | "emulator";
  pool: "full_cycle" | "outreach_only";
  product: string;
  deviceCode: string;
  profileCount: number;
  latencyMs: number | null;
  appInstancesCount: number;
  appInstancesAvailableCount: number;
  appInstancesOccupiedCount: number;
  heartbeatStatus: "connected" | "offline" | "unknown" | "stale";
  hostLabel: string | null;
  hubLabel: string | null;
  hubPort: string | null;
  viewAvailable: boolean;
  viewUnavailableReason: string | null;
  battery: number;
  cloneCount: number;
  activeSession: PhoneSession | null;
  nextBufferEndsAt: string | null;
  lockReason: string | null;
  backendStatus?: string;
  backendLastSeenAt?: string;
  localAdbStatus?: "device" | "offline" | "unauthorized" | "not_seen" | "adb_unavailable" | "unknown" | string;
  localAdbCheckedAt?: string;
  localAdbAvailable?: boolean;
  inventorySource?: string;
  appInstances?: Array<{
    appInstanceId: string;
    deviceId: string;
    instanceType: string;
    instanceIndex: number;
    label: string;
    packageName: string;
    status: string;
    availability: "available" | "occupied" | "reserved" | "disabled" | string;
    selectable: boolean;
    occupant: {
      assignmentId: string;
      accountId: string;
      username: string;
      status: string;
    } | null;
  }>;
};

export type BotAppDeviceStatus = DeviceStatus;
export type BotAppDeviceHealth = "connected" | "offline" | "warning" | "unknown";
export type BotAppDeviceLatency = number | null;
export type BotAppDeviceProfileCount = number;
export type BotAppDeviceAction = "add" | "open_all" | "close_all" | "restart_all" | "history" | "edit" | "delete" | "open_view" | "restart_phone";

export type BotAppAddPhonePayload = {
  action: "add_physical_phone";
  display_name: string;
  adb_serial: string;
  model: string | null;
  product: string | null;
  device: string | null;
  pool: "full_cycle" | "outreach_only";
  max_clones: number;
  hub_label: string | null;
  hub_port: string | null;
  host_label: string | null;
  packages_mode: "standard_instagram_4_packages";
  requested_by: string | null;
  source: "BotApp";
  metadata_safe: {
    expected_effect: "register_phone_inventory_only";
    app_instances_package_set: "standard_instagram_4_packages";
  };
};

export type BotAppRestartPhonePayload = {
  action: "restart_phone" | "restart_all_phones";
  device_ids: string[];
  requested_by: string | null;
  source: "BotApp";
  idempotency_key: string;
  metadata_safe: {
    device_labels: string[];
    connected_count: number;
    offline_skipped_count: number;
    expected_effect: "restart_phone_via_secure_device_control";
  };
};

export type BotAppDeviceHistoryEntry = {
  id: string;
  deviceId: string;
  timestamp: string;
  event: string;
  status: BotAppDeviceHealth;
  detail: string;
};

export type BotAppDeviceBulkActionResult = {
  requested: number;
  opened: number;
  skipped: number;
  failed: number;
  message: string;
};

export type ActivityLogEntry = {
  id: string;
  timestamp: string;
  level: Severity;
  actor: string;
  event: string;
  target: string;
  detail: string;
  domain?: "settings" | "targets" | "lifecycle" | "device" | "credentials" | "run" | "account" | "system";
  source?: "operator" | "system" | "relay" | "worker" | "device";
  account?: string | null;
  device?: string | null;
  status?: "success" | "failed" | "pending" | "accepted" | "review" | "blocked";
};

export type BotAppActivityInvestigationMode = "search_by_ct" | "search_by_account" | "recent_interactions" | "disputes_evidence";
export type BotAppInteractionActionType = "follow" | "unfollow" | "like" | "comment" | "dm" | "story_view" | "profile_visit" | "followback" | "unknown";
export type BotAppInteractionStatus = "success" | "failed" | "pending" | "not_found" | "unknown";
export type BotAppInteractionConfidence = "high" | "medium" | "best_effort" | "unknown";

export type BotAppInteractionEvidence = {
  evidenceSource:
    | "ig_interacted_users"
    | "ig_interaction_events"
    | "ig_action_logs"
    | "ig_runs"
    | "ct_target_audit_events"
    | "activity_log_interaction_evidence_admin_v1"
    | "derived_projection";
  evidenceSourceTable?: "ig_interacted_users" | "ig_interaction_events" | "derived_projection";
  evidenceSummary: string;
  sourceRef: string | null;
  confidence: BotAppInteractionConfidence;
  metadataSafe: Record<string, string | number | boolean | null>;
};

export type BotAppCtSourceSummary = {
  ctId: string;
  ctUsername: string;
  source: string;
  qualityStatus: "approved" | "review" | "low_quality" | "archived" | "unknown";
  interactionsCount: number;
  lastInteractionAt: string | null;
};

export type BotAppInteractionRecord = {
  id: string;
  sourceRecordId?: string;
  accountId: string;
  clientId: string;
  clientAccountUsername: string;
  ct: BotAppCtSourceSummary;
  interactedUsername: string;
  actionType: BotAppInteractionActionType;
  actionStatus: BotAppInteractionStatus;
  occurredAt: string;
  periodBucket: "24h" | "7d" | "30d";
  runId: string | null;
  requestId: string | null;
  deviceIdSafe: string | null;
  safeDeviceLabel?: string | null;
  result: string;
  reason: string | null;
  evidence: BotAppInteractionEvidence;
};

export type BotAppInteractionEvidenceProjectionRow = {
  source_record_id: string;
  evidence_source_table: "ig_interacted_users" | "ig_interaction_events";
  account_id: string;
  client_id: string | null;
  client_account_username: string | null;
  ct_id: string | null;
  ct_username: string | null;
  interacted_username: string;
  action_type: BotAppInteractionActionType | string;
  action_status: BotAppInteractionStatus | string;
  occurred_at: string;
  run_id: string | null;
  request_id: string | null;
  safe_device_label: string | null;
  evidence_source: BotAppInteractionEvidence["evidenceSource"] | string;
  evidence_confidence: BotAppInteractionConfidence | string;
  evidence_summary: string;
  metadata_safe: Record<string, string | number | boolean | null>;
};

export type BotAppInteractionSearchQuery = {
  mode: BotAppActivityInvestigationMode;
  query: string;
  period: "24h" | "7d" | "30d";
  actionType: BotAppInteractionActionType | "all";
  clientAccountUsername: string | "all";
};

export type BotAppInteractionSearchResult = {
  status: "found" | "not_found";
  query: BotAppInteractionSearchQuery;
  records: BotAppInteractionRecord[];
  summary: string;
};

export type BotAppCtRemovalPayload = {
  action: "archive_ct_from_campaign";
  account_id: string;
  client_id: string;
  ct_id: string;
  ct_username: string;
  source: "BotApp";
  requested_by: string | null;
  idempotency_key: string;
  metadata_safe: {
    reason: "operator_marked_low_quality" | "client_dispute" | "not_relevant";
    evidence_record_id: string;
    expected_effect: "future_secure_relay_archive_ct";
  };
};

export type BotAppActivityLogRelayPayload = {
  action: "interaction_investigation_search";
  source: "BotApp";
  requested_by: string | null;
  query: BotAppInteractionSearchQuery;
  include: Array<"ig_interacted_users" | "ig_interaction_events" | "ig_targets" | "ct_target_audit_events" | "ig_action_logs" | "ig_runs" | "account_run_requests" | "activity_log_interaction_evidence_admin_v1">;
  metadata_safe: {
    expected_effect: "read_only_interaction_investigation";
  };
};

export type BotAppClientSafeInteractionRecord = Pick<
  BotAppInteractionRecord,
  "clientAccountUsername" | "interactedUsername" | "actionType" | "actionStatus" | "occurredAt" | "result" | "reason"
> & {
  ctUsername: string;
  evidenceSummary: string;
  confidence: BotAppInteractionConfidence;
};

export type CompassSeverity = "critical" | "warning" | "info" | "positive";
export type CompassConfidence = "high" | "medium" | "best_effort";
export type CompassAiConfidence = "high" | "medium" | "low";
export type CompassInsightCategory =
  | "credentials"
  | "devices"
  | "activity_quality"
  | "targets"
  | "quota"
  | "inactive"
  | "growth"
  | "assignment"
  | "readiness"
  | "global";
export type CompassActionTargetTab = "credentials" | "devices" | "activity" | "targets" | "account" | "profiles" | "compass";
export type CompassAiProvider = "openai" | "claude" | "comparison" | "none";

export type CompassActionTarget = {
  targetTab: CompassActionTargetTab;
  label: string;
  context: {
    accountId?: string;
    profileId?: string;
    username?: string;
    clientId?: string;
    deviceId?: string;
    ctId?: string;
    problemId?: string;
    filter?: string;
  };
};

export type CompassAiTargetTab = "credentials" | "devices" | "activity_log" | "targets" | "client_accounts" | "profiles" | "compass";
export type CompassAiHealthAssessment = "good" | "watch" | "risk" | "critical";
export type CompassAiStatus = "rules_only" | "ai_enabled" | "ai_unavailable" | "invalid_ai_output" | "relay_pending";
export type CompassAiActionType = "open_tab" | "open_account" | "open_problem_group" | "prepare_request" | "archive_ct_review";
export type CompassAiRecommendationType =
  | "credential_blocker"
  | "device_blocker"
  | "ct_quality"
  | "activity_evidence"
  | "quota_pacing_internal"
  | "growth_trend_internal"
  | "package_entitlement"
  | "operational_risk";
export type CompassAiSourceFact =
  | "credential_blockers"
  | "account_dashboard_actions"
  | "login_actions"
  | "devices_status"
  | "compass_rules"
  | "activity_log_evidence"
  | "ct_quality_alerts"
  | "target_account_status"
  | "interaction_counters"
  | "quota_pacing"
  | "growth_trend"
  | "failed_interactions"
  | "account_status"
  | "package_entitlement"
  | "safe_run_evidence";
export type CompassInternalSignalKind =
  | "inactive_accounts"
  | "under_quota"
  | "growth_down"
  | "credential_blocker"
  | "device_blocker"
  | "ct_quality";

export type CompassAffectedAccount = {
  accountId: string;
  profileId: string;
  username: string;
  clientName: string;
  deviceId: string | null;
  deviceName: string | null;
  packageLabel: BotProfile["package"];
  reason: string;
  target: CompassActionTarget;
};

export type CompassEvidence = {
  source:
    | "profiles_projection"
    | "client_accounts_overview"
    | "credentials_actions"
    | "devices_overview"
    | "activity_log_interaction_evidence"
    | "targets_projection"
    | "runs_projection"
    | "derived_rules";
  label: string;
  value: string | number | boolean | null;
  confidence: CompassConfidence;
};

export type CompassRecommendation = {
  id: string;
  severity: CompassSeverity;
  title: string;
  impactEstimate: string;
  cause: string;
  recommendedAction: string;
  confidence: CompassConfidence;
  clientVisible: boolean;
  clientRawVisible: boolean;
  clientRecommendationInput: boolean;
  adminSummary: string;
  clientSummary: string | null;
  technicalReason: string | null;
  clientSafeReason: string | null;
  target: CompassActionTarget;
  affectedAccounts: CompassAffectedAccount[];
  evidence: CompassEvidence[];
};

export type CompassInsight = {
  id: string;
  category: CompassInsightCategory;
  severity: CompassSeverity;
  title: string;
  summary: string;
  sinceLabel: string;
  impact: string;
  cause: string;
  clientVisible: boolean;
  clientRawVisible: boolean;
  clientRecommendationInput: boolean;
  adminSummary: string;
  clientSummary: string | null;
  technicalReason: string | null;
  clientSafeReason: string | null;
  recommendedAction: string;
  targetTab: CompassActionTargetTab;
  confidence: CompassConfidence;
  affectedAccounts: CompassAffectedAccount[];
  evidence: CompassEvidence[];
  recommendations: CompassRecommendation[];
};

export type CompassInternalSignal = {
  id: string;
  signal: CompassInternalSignalKind;
  title: string;
  summary: string;
  count: number;
  severity: CompassSeverity;
  adminVisible: true;
  clientRawVisible: false;
  clientRecommendationInput: true;
  target: CompassActionTarget;
  affectedAccounts: CompassAffectedAccount[];
  evidence: CompassEvidence[];
};

export type CompassClientSafeRecommendation = Pick<
  CompassRecommendation,
  "id" | "severity" | "title" | "clientSummary" | "clientSafeReason" | "recommendedAction" | "confidence" | "clientRecommendationInput"
> & {
  affectedAccounts: Array<Pick<CompassAffectedAccount, "username" | "clientName" | "reason">>;
};

export type CompassAiAffectedAccount = {
  accountId: string;
  username: string;
  clientId: string;
  reason: string;
  target: CompassActionTarget;
};

export type CompassAiRecommendedAction = {
  label: string;
  target: CompassActionTarget;
  actionType: CompassAiActionType;
};

export type CompassAiEvidence = {
  source: string;
  summary: string;
  confidence: CompassAiConfidence;
};

export type CompassAiRecommendation = {
  id: string;
  severity: CompassSeverity;
  confidence: CompassAiConfidence;
  title: string;
  summary: string;
  recommendationType: CompassAiRecommendationType;
  adminSummary: string;
  clientSummary: string;
  clientVisible: boolean;
  clientRawVisible: boolean;
  clientRecommendationInput: boolean;
  technicalReason: string;
  clientSafeReason: string;
  affectedAccounts: CompassAiAffectedAccount[];
  recommendedActions: CompassAiRecommendedAction[];
  evidence: CompassAiEvidence[];
  sourceFacts: CompassAiSourceFact[];
  target: CompassActionTarget;
  recommendedAction: string;
  whyThisMatters: string;
  whatNotToAssume: string;
};

export type CompassAiInternalSignal = {
  signal: CompassInternalSignalKind;
  adminVisible: true;
  clientRawVisible: false;
  clientRecommendationInput: true;
  count: number;
  summary: string;
};

export type CompassAiAnalysis = {
  analysisId: string;
  period: "24h" | "7d" | "30d";
  overallSummary: string;
  healthAssessment: CompassAiHealthAssessment;
  recommendations: CompassAiRecommendation[];
  internalSignals: CompassAiInternalSignal[];
  filteredRecommendationsCount?: number;
  filteredReasons?: string[];
};

export type CompassAiAdvisor = {
  status: CompassAiStatus;
  provider: CompassAiProvider;
  model: string | null;
  lastAnalyzedAt: string | null;
  period: "24h" | "7d" | "30d";
  summary: string;
  healthAssessment: CompassAiHealthAssessment;
  analysis: CompassAiAnalysis | null;
  providerErrorCode?: string | null;
  relayTarget: "/api/instagram-dashboard/compass/analyze";
  serverSideOnly: true;
};

export type CompassAiRuntimeMode = "relay" | "local_runtime" | "rules_only";

export type CompassAiRuntimeStatus = {
  mode: CompassAiRuntimeMode;
  status: "ready" | "relay_missing" | "key_missing" | "unavailable" | "error";
  provider: "OpenAI";
  model: string;
  relayUrlConfigured: boolean;
  relayOrigin: string | null;
  relayKeyConfigured: boolean;
  serverKeyStatus: "configured" | "missing" | "unknown";
  lastConnectionTestAt: string | null;
  lastAnalysisAt: string | null;
  lastSafeError: string | null;
  lastProviderErrorCode: string | null;
  message: string;
};

export type TargetingAiRuntimeStatus = {
  status: "ready" | "relay_missing" | "unavailable";
  message: string;
  relayUrlConfigured: boolean;
  openaiKeyConfigured: boolean;
  searchapiKeyConfigured: boolean;
  config: {
    enabled: boolean;
    provider: string;
    model: string;
    promptVersion: string;
    promptSource: "code_default" | "db_custom";
    systemPrompt: string;
    userPromptTemplate: string;
    maxGptCandidates: number;
    maxDisplayedResults: number;
    minFollowers: number;
    maxFollowers: number;
    minEligibleTarget: number;
    allowVerified: boolean;
    secondPassEnabled: boolean;
    temperature: number;
    searchapiConcurrency: number;
    maxSearchapiChecks: number;
    editable: boolean;
    backendPending: boolean;
    defaultSystemPrompt: string;
    defaultUserPromptTemplate: string;
    lastUpdated: string | null;
    updatedBy: string | null;
  } | null;
  lastCheckedAt: string;
};

export type TargetingAiSaveResult = {
  ok: boolean;
  runtime: TargetingAiRuntimeStatus;
  error?: string;
  field?: string | null;
  data?: Record<string, unknown>;
};

export type TargetingAiTestResult = {
  ok: boolean;
  error?: string;
  data?: {
    dry_run?: boolean;
    niche?: string;
    location_label?: string | null;
    prompt_version?: string;
    prompt_source?: "code_default" | "db_custom";
    model?: string;
    provider?: string;
    gpt_candidates_count?: number;
    error_code?: string | null;
    latency_ms?: number;
  };
};

export type CompassAiRuntimeAnalyzeRequest = {
  period: "24h" | "7d" | "30d";
  snapshot: CompassAiAnalysisPayload;
};

export type CompassAiRuntimeAnalyzeResult = {
  ok: boolean;
  advisor: CompassAiAdvisor;
  runtime: CompassAiRuntimeStatus;
  error?: string;
};

export type CompassAnalyzeResult = {
  advisor: CompassAiAdvisor;
  runtime: CompassAiRuntimeStatus;
};

export type CompassAiAnalysisPayload = {
  provider: CompassAiProvider;
  mode: "rules_only" | "server_side_openai";
  facts: {
    generatedAt: string;
    insights: CompassInsight[];
    recommendations: CompassRecommendation[];
    internalSignals: CompassInternalSignal[];
  };
  outputContract: {
    format: "json";
    mustNotInventFacts: true;
    allowedFields: Array<"priority" | "explanation" | "recommended_order" | "risk_notes">;
  };
};

export type CompassProblemGroup = {
  id: string;
  title: string;
  severity: CompassSeverity;
  count: number;
  targetTab: CompassActionTargetTab;
  affectedAccounts: CompassAffectedAccount[];
};

export type CompassTrendMetric = {
  label: string;
  value: string;
  detail: string;
  tone: CompassSeverity;
};

export type CompassOverview = {
  generatedAt: string;
  healthScore: number;
  summary: {
    totalAccounts: number;
    workingAccounts: number;
    blockedAccounts: number;
    underQuotaAccounts: number;
    inactiveAccounts: number;
    clientVisibleRecommendations: number;
  };
  trends: CompassTrendMetric[];
  insights: CompassInsight[];
  problemGroups: CompassProblemGroup[];
  recommendations: CompassRecommendation[];
  internalSignals: CompassInternalSignal[];
  clientSafePreview: CompassClientSafeRecommendation[];
  aiAdvisor: CompassAiAdvisor;
  aiAnalysisPayload: CompassAiAnalysisPayload;
  relayPayload: {
    action: "compass_overview";
    source: "BotApp";
    requested_by: string | null;
    include: Array<
      | "client_accounts_overview"
      | "credentials_actions"
      | "devices_overview"
      | "activity_log_interaction_evidence_admin_v1"
      | "targets"
      | "runs_eligibility"
      | "account_run_requests"
      | "ig_runs"
      | "incidents"
    >;
    metadata_safe: {
      expected_effect: "read_only_compass_decision_overview";
      ai_provider: CompassAiProvider;
    };
  };
};

export type Target = {
  id: string;
  handle: string;
  source: string;
  qualityScore: number;
  status: "approved" | "review" | "archived";
  notes: string;
};

export type NotificationItem = {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  profileId?: string;
  createdAt: string;
  acknowledged: boolean;
};

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  status: "active" | "revoked";
  createdAt: string;
  lastSeenAt: string | null;
  callCountToday: number;
  productionCallCount: number;
};

export type WebhookSummary = {
  id: string;
  url: string;
  events: WebhookEvent[];
  status: "active" | "disabled";
  lastDeliveryStatus: "ok" | "failed" | "pending" | "not_sent";
  lastDeliveryAt: string | null;
  provider: "slack" | "discord" | "custom";
  latestError: string | null;
};

export type IntegrationStatus = "connected" | "running" | "disconnected" | "stopped" | "missing_key" | "unavailable" | "configured" | "pending";
export type WebhookEvent =
  | "slack.incident"
  | "discord.incident"
  | "compass.critical_recommendation"
  | "device.offline"
  | "credential.action_required"
  | "account.blocked"
  | "run.failed"
  | "ct.quality_alert"
  | "profile.created"
  | "profile.updated"
  | "profile.archived"
  | "profile.targets.updated"
  | "profile.session_status.changed";

export type BotAppRuntimeIntegrationStatus = {
  localGateway: {
    status: IntegrationStatus;
    mode: "development" | "packaged" | "browser";
    transport: "electron_ipc" | "http";
    port: number | null;
    lastHealthCheck: string;
  };
  secureRelay: {
    status: IntegrationStatus;
    baseUrl: string;
    lastHealthCheck: string | null;
  };
  dashboardBackend: {
    status: IntegrationStatus;
    baseUrl: string;
    lastHealthCheck: string | null;
  };
  compassAi: {
    status: IntegrationStatus;
    mode: CompassAiRuntimeMode;
    provider: "OpenAI";
    model: string;
    relayKeyConfigured: boolean;
    serverKeyStatus: "configured" | "missing" | "unknown";
    relayUrlConfigured: boolean;
    relayOrigin: string | null;
    lastTestAt: string | null;
    lastAnalysisAt: string | null;
    lastSafeError: string | null;
    lastProviderErrorCode: string | null;
    relayEndpoint: "/api/instagram-dashboard/compass/analyze";
  };
  environment: "local" | "development" | "production";
};

export type BotAppDispatcherStatus = "running" | "paused" | "stopped" | "unhealthy" | "starting" | "unknown";

export type BotAppDispatcherHealth = {
  ok: boolean;
  status: BotAppDispatcherStatus;
  dispatcher_id: string;
  worker_id: string;
  paused: boolean;
  processRunning: boolean;
  pid: number | null;
  processCount: number;
  consumerPids?: number[];
  duplicateProcess: boolean;
  launchdLoaded: boolean;
  launchEnabled: boolean;
  healthOnly: boolean;
  allowExistingQueue: boolean;
  heartbeatAge: number | null;
  lastSeenAt: string | null;
  preflightOk: boolean;
  preflight: Record<string, unknown> | null;
  queueActiveCount: number | null;
  lastError: string | null;
  logsPath: string | null;
  supabaseRestStatus: "ok" | "failed" | "unknown";
  deviceCountOnline: number | null;
  checkedAt: string;
  message: string;
  action?: "status" | "pause" | "resume" | "restart" | "stop" | "logs" | "fix-duplicate";
};

export type BotAppEndpointStatus =
  | "untested"
  | "connected"
  | "failing"
  | "auth_protected"
  | "not_deployed"
  | "planned"
  | "wiring_missing";

export type BotAppBackendEndpoint = {
  id: string;
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  usedBy: string[];
  purpose: string;
  authRequired: boolean;
  status: "active" | "planned" | "wiring_missing";
  lastTestAt: string | null;
  lastStatusCode: number | null;
  lastSafeError: string | null;
  testStatus: BotAppEndpointStatus;
};

export type BotAppEndpointTestResult = {
  id: string;
  ok: boolean;
  status: BotAppEndpointStatus;
  lastTestAt: string;
  lastStatusCode: number | null;
  lastSafeError: string | null;
};

export type BotAppConnectionProfile = {
  generatedAt: string;
  relayOrigin: string | null;
  endpoints: Array<Pick<BotAppBackendEndpoint, "id" | "name" | "method" | "path" | "usedBy" | "purpose" | "authRequired" | "status">>;
};

export type AppSettings = {
  business: Record<string, string | boolean | number>;
  admin: Record<string, string | boolean | number>;
  opsSafetyCaps: Record<string, string | boolean | number>;
  killSwitches: Record<string, boolean>;
  runtimeState: Record<string, string | boolean | number>;
};

export type AutoRestartMode = "disabled" | "dry_run" | "active" | "backend_pending";
export type AutoRestartStatus = "enabled" | "disabled" | "backend_pending" | "unavailable";
export type AutoRestartSafetyStatus = "safe" | "watch" | "blocked" | "backend_pending";
export type AutoRestartControlAction =
  | "refresh_overview"
  | "dry_run_preview"
  | "enable_auto_restart"
  | "disable_auto_restart"
  | "restart_eligible_sessions"
  | "resume_quota_paused"
  | "pause_device_rest"
  | "resume_phone"
  | "open_affected_accounts"
  | "open_device"
  | "open_compass_issue"
  | "open_credentials"
  | "open_activity_log"
  | "view_safety_gates"
  | "view_candidates"
  | "export_preview"
  | "copy_safe_summary";

export type AutoRestartQuotaResume = {
  pausedDueToQuota: number;
  eligibleToResume: number;
  remainingDailyQuota: {
    follows: number | null;
    unfollows: number | null;
    dms: number | null;
  };
  resumeBlockedReason: string | null;
  lastSuccessfulAction: string | null;
  nextResumeWindow: string | null;
};

export type AutoRestartDeviceRest = {
  deviceId: string;
  deviceLabel: string;
  status: "active" | "resting" | "offline" | "unknown";
  reason: string;
  nextRestWindow: string | null;
  highVolumePackageProtection: boolean;
};

export type AutoRestartAccount = {
  accountId: string;
  username: string;
  clientName: string;
  packageLabel: string;
  status: string;
  quotaStatus: string;
  resumeEligibility: "eligible" | "blocked" | "unknown";
  assignedDevice: string;
  lastRun: string | null;
  nextAction: string;
  blockingReason: string | null;
};

export type AutoRestartSafetyRule = {
  id: string;
  label: string;
  detail: string;
  status: AutoRestartSafetyStatus;
};

export type AutoRestartRuleSettings = {
  enabled: boolean;
  restartYellowAccounts: boolean;
  restartRedAccounts: boolean;
  respectFixedBlackouts: boolean;
  respectSixHourWindow: boolean;
  checkEveryMinutes: number;
  maxRestartsPerAccountPerDay: number;
  maxRestartsPerAccountPerWindow: number;
  writable: boolean;
};

export type AutoRestartQuotaCandidate = {
  accountId: string;
  username: string;
  packageLabel: string;
  phoneName: string;
  followRemaining: number;
  unfollowRemaining: number;
  welcomeRemaining: number;
  outreachRemaining: number;
  plannedRunType: string;
  decision: string;
  reason: string;
};

export type AutoRestartDecisionItem = {
  id: string;
  account: string;
  decisionTime: string | null;
  action: string;
  reason: string;
  requestId: string | null;
};

export type AutoRestartControl = {
  action: AutoRestartControlAction;
  label: string;
  detail: string;
  requestId: string;
  dryRun: true;
  confirmationRequired: boolean;
  impact: string;
  affectedAccountsCount: number;
  affectedDevicesCount: number;
  targetAccountId?: string;
  targetDeviceId?: string;
  backendStatus: "relay_ready" | "backend_pending";
};

export type AutoRestartOverview = {
  status: AutoRestartStatus;
  enabled: boolean;
  mode: AutoRestartMode;
  lastRestartAt: string | null;
  nextEligibleRestartAt: string | null;
  activeAccountsAffected: number;
  safetyStatus: AutoRestartSafetyStatus;
  backendSyncStatus: "backend_pending" | "relay_ready";
  sourceSummary: string;
  sessionResume: AutoRestartQuotaResume;
  businessSessionWindow: {
    status: "in_window" | "outside_window" | "not_configured" | "backend_pending";
    currentStart: string | null;
    currentEnd: string | null;
    timeRemaining: string | null;
    preventOverrun: boolean;
    timezone: string;
    packageRelation: string;
  };
  phoneRest: {
    phonesResting: number;
    phonesActive: number;
    nextRestWindow: string | null;
    reason: string;
    devices: AutoRestartDeviceRest[];
  };
  affectedAccounts: AutoRestartAccount[];
  controls: AutoRestartControl[];
  safetyRules: AutoRestartSafetyRule[];
  rules: AutoRestartRuleSettings;
  quotaCandidates: AutoRestartQuotaCandidate[];
  decisions: AutoRestartDecisionItem[];
};

export type ActionPreview = {
  action: string;
  target: string;
  dry_run: true;
  message: string;
};

export type BotAppEmailTemplateCategory =
  | "account_paused"
  | "account_canceled"
  | "needs_assistance"
  | "needs_more_target_accounts";

export type BotAppEmailTemplateRow = {
  id: string;
  category: BotAppEmailTemplateCategory;
  categoryLabel: string;
  version: number;
  status: "active" | "retired";
  subject: string;
  bodyText: string;
  bodyHtml: string;
  allowedVariables: string[];
  configured: boolean;
  fromEmail: "growth@boostmybusinesses.com";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type BotAppEmailTemplatesProjection = {
  featureAvailable: boolean;
  fromEmail: string;
  supportEmail?: string;
  categories: BotAppEmailTemplateCategory[];
  templates: BotAppEmailTemplateRow[];
};

export type BotAppEmailHistoryListItem = {
  id: string;
  createdAt: string;
  clientName: string | null;
  instagramUsername: string | null;
  category: BotAppEmailTemplateCategory;
  categoryLabel: string;
  recipientEmail: string;
  fromEmail: "growth@boostmybusinesses.com";
  trigger: "manual" | "automatic" | "reminder" | "manual_test" | "automatic_initial" | "automatic_reminder";
  triggerLabel?: string;
  reminderIndex: number | null;
  intentStatus: string;
  deliveryStatus: string | null;
  templateVersion: number | null;
  intentKind?: "client" | "test";
  isTestDelivery?: boolean;
  deliveryBadgeLabel?: string | null;
};

export type BotAppEmailHistoryProjection = {
  featureAvailable: boolean;
  fromEmail: "growth@boostmybusinesses.com";
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  items: BotAppEmailHistoryListItem[];
};

export type BotAppEmailTestDeliveryStatus = {
  clientSendingEnabled: boolean;
  testSendingEnabled: boolean;
  testRecipientConfigured: boolean;
  testRecipientMasked: string | null;
  providerReady: boolean;
  testSchemaReady: boolean;
  canSendTest: boolean;
  disabledReason: string | null;
  readinessLabel: string | null;
  lockedFromEmail: string;
  supportEmail?: string;
};

export type BotAppEmailDeliverySettingsProjection = {
  schemaReady: boolean;
  settings: {
    activeFromEmail: string;
    supportEmail: string;
    configVersion: number;
    source: "legacy_default" | "database";
    updatedAt: string | null;
  };
  senderSync: {
    status: "not_configured" | "not_refreshed" | "ready" | "stale" | "no_confirmed_senders";
    message: string;
    lastRefreshedAt: string | null;
    confirmedSenders: Array<{ email: string; name: string | null }>;
  };
  uxState:
    | "schema_migration_pending"
    | "sender_sync_unavailable"
    | "no_confirmed_senders"
    | "ready";
  supportEmailEditable: boolean;
  senderChangeAllowed: boolean;
  accountTokenConfigured: boolean;
};

export type BotAppEmailDeliverySettingsAudit = {
  schemaReady: boolean;
  items: Array<{
    changedAt: string;
    changedBy: string | null;
    previousActiveFromEmail: string;
    newActiveFromEmail: string;
    previousSupportEmail: string;
    newSupportEmail: string;
    previousConfigVersion: number;
    newConfigVersion: number;
  }>;
};

export type BotAppNeedsMoreTargetsLifecycleDecision =
  | "would_open_episode"
  | "would_keep_active"
  | "would_resolve_episode"
  | "no_action";

export type BotAppNeedsMoreTargetsDeliveryState =
  | "delivery_ready"
  | "blocked_missing_client_email"
  | "blocked_canceled_account"
  | "blocked_inactive_signal"
  | "blocked_target_count_above_threshold";

export type BotAppNeedsMoreTargetsPreviewAccountRow = {
  instagramUsername: string | null;
  clientLabel: string | null;
  clientEmailMasked: string | null;
  needsMoreSignalActive: boolean;
  eligibleTargetCount: number;
  threshold: number;
  accountStatus: "active" | "canceled";
  episodeState: "none" | "active" | "resolved" | "canceled";
  lifecycleDecision: BotAppNeedsMoreTargetsLifecycleDecision;
  deliveryState: BotAppNeedsMoreTargetsDeliveryState;
  nextDueAt: string | null;
  nextReminderIndex: number | null;
  reason: string;
};

export type BotAppNeedsMoreTargetsLifecyclePreview = {
  previewedAt: string;
  readOnly: true;
  mutationExecuted: false;
  sequenceSchemaReady: boolean;
  accountsAnalyzed: number;
  summary: {
    wouldOpenEpisode: number;
    activeEpisodes: number;
    blockedMissingClientEmail: number;
    resolvedOrAboveThreshold: number;
    canceled: number;
    noAction: number;
    wouldKeepActive: number;
    wouldResolveEpisode: number;
  };
  items: BotAppNeedsMoreTargetsPreviewAccountRow[];
};

export type BotAppAccountLifecyclePreviewDecision =
  | "would_open_episode_on_future_transition"
  | "would_keep_active"
  | "would_resolve_episode"
  | "legacy_state_no_backfill"
  | "no_action";

export type BotAppAccountLifecycleDeliveryState =
  | "delivery_ready"
  | "blocked_missing_client_email"
  | "blocked_canceled_account"
  | "blocked_missing_transition_evidence";

export type BotAppAccountLifecyclePreviewRow = {
  instagramUsername: string | null;
  clientLabel: string | null;
  clientEmailMasked: string | null;
  category: "account_paused" | "account_canceled" | "needs_assistance";
  categoryLabel: string;
  currentStateActive: boolean;
  canonicalSource: string;
  transitionAt: string | null;
  episodeState: "none" | "active" | "resolved" | "canceled";
  lifecycleDecision: BotAppAccountLifecyclePreviewDecision;
  deliveryState: BotAppAccountLifecycleDeliveryState;
  reason: string;
};

export type BotAppAccountLifecyclePreview = {
  previewedAt: string;
  readOnly: true;
  mutationExecuted: false;
  lifecycleSchemaReady: boolean;
  automationWatermarkConfigured: boolean;
  accountsAnalyzed: number;
  summary: {
    accountsAnalyzed: number;
    pausedRows: number;
    canceledRows: number;
    needsAssistanceRows: number;
    wouldOpenOnFutureTransition: number;
    activeEpisodes: number;
    legacyStatesNoBackfill: number;
    blockedMissingClientEmail: number;
    blockedMissingTransitionEvidence: number;
  };
  items: BotAppAccountLifecyclePreviewRow[];
};

export type BotAppEmailHistoryDetail = BotAppEmailHistoryListItem & {
  scheduledFor: string | null;
  sentAt: string | null;
  resolvedAt: string | null;
  snapshotSubject: string;
  snapshotBodyText: string;
  snapshotBodyHtml: string;
  sourceNotificationId: string | null;
  sourceActionId: string | null;
  providerMessageId: string | null;
  lastErrorRedacted: string | null;
  timeline: Array<{
    status: string;
    occurredAt: string;
    provider: string | null;
    providerMessageId: string | null;
    lastErrorRedacted: string | null;
  }>;
};

export type BotAppClient = {
  listProfiles(): Promise<ApiResult<BotProfile[]>>;
  getProfileDetail(profileId: string): Promise<ApiResult<BotProfile>>;
  listDeviceProfileGroups(): Promise<ApiResult<DeviceProfileGroup[]>>;
  getProfileStats(profileId: string): Promise<ApiResult<ProfileStatsRow[]>>;
  getProfileLogs(profileId: string): Promise<ApiResult<ProfileLogEntry[]>>;
  getProfileTargets(profileId: string): Promise<ApiResult<ProfileTarget[]>>;
  getProfileSettings(profileId: string): Promise<ApiResult<ProfileSettings>>;
  getProfileFilters(profileId: string): Promise<ApiResult<ProfileFilters>>;
  listClientAccounts(): Promise<ApiResult<BotAppClientAccountsOverview>>;
  listCredentialsActions(): Promise<ApiResult<BotAppCredentialsOverview>>;
  listCompass(): Promise<ApiResult<CompassOverview>>;
  analyzeCompass(overview: CompassOverview, period: "24h" | "7d" | "30d"): Promise<ApiResult<CompassAiAdvisor>>;
  listAutoRestart(): Promise<ApiResult<AutoRestartOverview>>;
  listDevices(): Promise<ApiResult<Device[]>>;
  listNotifications(): Promise<ApiResult<NotificationItem[]>>;
  listActivityLogs(): Promise<ApiResult<ActivityLogEntry[]>>;
  listTargets(): Promise<ApiResult<Target[]>>;
  listApiKeys(): Promise<ApiResult<ApiKeySummary[]>>;
  listWebhooks(): Promise<ApiResult<WebhookSummary[]>>;
  listSettings(): Promise<ApiResult<AppSettings>>;
  previewAction(action: string, target: string): Promise<ApiResult<ActionPreview>>;
};
