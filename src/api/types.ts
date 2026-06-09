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

export type BotProfile = {
  id: string;
  username: string;
  platform: "Instagram" | "TikTok";
  package: "Growth" | "Pro" | "Premium";
  status: ProfileStatus;
  deviceId: string;
  deviceName: string;
  activeWindow: string;
  followers: number;
  followsToday: number;
  dmsToday: number;
  readiness: "ready" | "needs_login" | "needs_settings" | "blocked";
  eligibility: "can_start" | "blocked_now";
  eligibilityReason: string;
  runtimeLock: "none" | "device_level_lock" | "assignment_reserved";
};

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
