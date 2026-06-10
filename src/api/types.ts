export type ApiScope =
  | "profile:read"
  | "profile:write"
  | "settings:write"
  | "devices:read"
  | "targets:write"
  | "templates:read"
  | "webhooks:manage"
  | "stats:read";

export type ApiSuccess<T> = { ok: true; data: T; request_id: string };
export type ApiFailure = { ok: false; error: { code: string; message: string }; request_id: string };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type ProfileStatus = "running" | "ready" | "blocked" | "paused" | "archived";
export type DeviceStatus = "online" | "reserved" | "offline" | "maintenance";
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
  | "stop"
  | "view"
  | "settings"
  | "filters"
  | "assign_now"
  | "archive"
  | "delete";

export type ProfileRequirementState = {
  enabled: boolean;
  reason:
    | "ready"
    | "missing_credentials"
    | "assignment_window_closed"
    | "device_unavailable"
    | "no_assignment_slot"
    | "runtime_blocked"
    | "login_status_not_ready"
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

export type ProfileCounters = {
  follow: { current: number; max: number };
  unfollow: { current: number; max: number };
  like: { current: number; max: number };
  comment: { current: number; max: number };
  dm: { current: number; max: number };
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
  activeWindow: string;
  followers: number;
  followerDelta: number;
  followsToday: number;
  dmsToday: number;
  counters: ProfileCounters;
  twoFactorEnabled: boolean;
  credentialStatus: CredentialStatus;
  loginStatus: "ready" | "missing_credentials" | "challenge_required" | "unknown";
  deviceAvailability: "available" | "reserved" | "offline" | "maintenance";
  assignmentState: "assigned" | "reserved" | "missing_slot" | "blocked";
  entitlements: string[];
  runtimeProfile: string;
  slotKind: string;
  autoLoginRequirement: ProfileRequirementState;
  assignNowRequirement: ProfileRequirementState;
  lastSessionAt: string | null;
  readiness: "ready" | "needs_login" | "needs_settings" | "blocked";
  eligibility: "can_start" | "blocked_now";
  eligibilityReason: string;
  eligibilityDetail: ProfileEligibility;
  runtimeLock: "none" | "device_level_lock" | "assignment_reserved";
};

export type DeviceProfileGroup = {
  deviceId: string;
  deviceLabel: string;
  deviceSerial: string;
  phoneStatus: "active" | "inactive" | "idle" | "running";
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
export type ProfileLogStreamState = "mock_live" | "paused" | "disconnected";

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
  performance: ProfileTargetPerformance;
  followbackRatio: number | null;
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

export type CredentialStatus = "active" | "missing" | "needs_update";

export type ProfileSettingsGeneral = {
  deviceId: string;
  deviceLabel: string;
  displayName: string;
  username: string;
  credentialStatus: CredentialStatus;
  credentialSource: "Vault" | "secure_backend" | "unknown";
  twoFactorEnabled: boolean;
  commercialPackage: string;
  entitlements: string[];
  runtimeProfile: string;
  slotKind: string;
  readinessStatus: BotProfile["readiness"];
  eligibilityStatus: ProfileEligibility["status"];
  assignmentStatus: string;
};

export type ProfileSettingsSchedule = {
  currentSlot: string;
  businessWindow: string;
  assignmentStatus: string;
  slotKind: string;
  deviceLock: string;
  cloneBufferMinutes: number;
  phoneRest: string;
  scheduleSource: string;
};

export type ProfileSettingsFollow = {
  timeslot: string;
  endIfLimitReached: boolean;
  endIfLimitType: string;
  turnOffFollow: boolean;
  followPerDay: number;
  muteAfterFollow: boolean;
  doFollowsFirst: boolean;
  maxFollowPerSession: number;
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
  safeDmLimit: number;
};

export type ProfileSettingsFollowback = {
  unfollowPerDay: number;
  unfollowAfterDays: number;
  stopAfterUnfollowSkipped: number;
  unfollowSort: string;
  followbackRatioSummary: string;
  effectiveUnfollowLimit: string;
};

export type ProfileSettingsSources = {
  mainSource: string;
  sourceGroups: string[];
  targetAccountRefs: string[];
  ctQualitySummary: string;
  syncReadiness: "ready" | "review" | "blocked";
};

export type ProfileSettingsFilters = {
  skipFollower: boolean;
  skipFollowing: boolean;
  skipNonBusiness: boolean;
  skipBusiness: boolean;
  followPrivate: boolean;
  followOnlyPrivate: boolean;
  dmPrivate: boolean;
  minFollowers: number;
  maxFollowers: number;
  minFollowing: number;
  maxFollowing: number;
  minPosts: number;
  blacklistedWords: string;
  mandatoryWords: string;
  templateName: string | null;
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
  battery: number;
  cloneCount: number;
  activeSession: PhoneSession | null;
  nextBufferEndsAt: string | null;
  lockReason: string | null;
};

export type ActivityLogEntry = {
  id: string;
  timestamp: string;
  level: Severity;
  actor: string;
  event: string;
  target: string;
  detail: string;
};

export type Target = {
  id: string;
  handle: string;
  source: string;
  qualityScore: number;
  status: "approved" | "review" | "archived";
  notes: string;
};

export type DmTemplate = {
  id: string;
  name: string;
  type: "welcome" | "outreach";
  status: "active" | "draft";
  body: string;
  sent: number;
  replies: number;
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
  lastSeenAt: string | null;
};

export type WebhookSummary = {
  id: string;
  url: string;
  events: string[];
  status: "active" | "disabled";
  lastDeliveryStatus: "ok" | "failed" | "pending";
};

export type AppSettings = {
  business: Record<string, string | boolean | number>;
  admin: Record<string, string | boolean | number>;
  opsSafetyCaps: Record<string, string | boolean | number>;
  killSwitches: Record<string, boolean>;
  runtimeState: Record<string, string | boolean | number>;
};

export type ActionPreview = {
  action: string;
  target: string;
  dry_run: true;
  message: string;
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
  listDevices(): Promise<ApiResult<Device[]>>;
  listNotifications(): Promise<ApiResult<NotificationItem[]>>;
  listActivityLogs(): Promise<ApiResult<ActivityLogEntry[]>>;
  listTargets(): Promise<ApiResult<Target[]>>;
  listDmTemplates(): Promise<ApiResult<DmTemplate[]>>;
  listApiKeys(): Promise<ApiResult<ApiKeySummary[]>>;
  listWebhooks(): Promise<ApiResult<WebhookSummary[]>>;
  listSettings(): Promise<ApiResult<AppSettings>>;
  previewAction(action: string, target: string): Promise<ApiResult<ActionPreview>>;
};
