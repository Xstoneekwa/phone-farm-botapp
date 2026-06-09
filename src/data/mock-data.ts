import type { ActivityLogEntry, ApiKeySummary, AppSettings, BotProfile, Device, DmTemplate, NotificationItem, Target, WebhookSummary } from "../api/types";

export const mockProfiles: BotProfile[] = [
  { id: "prof_001", username: "studio_lumiere", platform: "Instagram", package: "Pro", status: "running", deviceId: "phone_01", deviceName: "Phone 01", activeWindow: "09:00-12:00", followers: 18420, followsToday: 72, dmsToday: 8, readiness: "ready", eligibility: "can_start", eligibilityReason: "ready", runtimeLock: "device_level_lock" },
  { id: "prof_002", username: "atelier_malo", platform: "Instagram", package: "Growth", status: "ready", deviceId: "phone_02", deviceName: "Phone 02", activeWindow: "13:00-16:00", followers: 9210, followsToday: 41, dmsToday: 0, readiness: "ready", eligibility: "blocked_now", eligibilityReason: "assignment_window_closed", runtimeLock: "none" },
  { id: "prof_003", username: "cafe_central", platform: "Instagram", package: "Premium", status: "blocked", deviceId: "phone_01", deviceName: "Phone 01", activeWindow: "17:00-20:00", followers: 31780, followsToday: 0, dmsToday: 0, readiness: "needs_login", eligibility: "blocked_now", eligibilityReason: "login_verification_required", runtimeLock: "assignment_reserved" },
  { id: "prof_004", username: "runclub_paris", platform: "TikTok", package: "Growth", status: "paused", deviceId: "phone_03", deviceName: "Phone 03", activeWindow: "20:00-23:00", followers: 12880, followsToday: 18, dmsToday: 0, readiness: "ready", eligibility: "blocked_now", eligibilityReason: "phone_rest_active", runtimeLock: "none" },
];

export const mockDevices: Device[] = [
  { id: "phone_01", name: "Phone 01", model: "Samsung A52", status: "reserved", battery: 84, cloneCount: 3, activeSession: { id: "sess_001", profileId: "prof_001", username: "studio_lumiere", state: "active_ui", startedAt: "10:04:22 2026-06-09" }, nextBufferEndsAt: "10:18:00 2026-06-09", lockReason: "1 phone = 1 active UI session" },
  { id: "phone_02", name: "Phone 02", model: "Samsung A32", status: "online", battery: 67, cloneCount: 4, activeSession: null, nextBufferEndsAt: null, lockReason: null },
  { id: "phone_03", name: "Phone 03", model: "Pixel 6a", status: "maintenance", battery: 51, cloneCount: 2, activeSession: { id: "sess_002", profileId: "prof_004", username: "runclub_paris", state: "buffer", startedAt: "09:47:10 2026-06-09" }, nextBufferEndsAt: "10:22:00 2026-06-09", lockReason: "clone buffer active" },
  { id: "phone_04", name: "Phone 04", model: "Samsung S21", status: "offline", battery: 0, cloneCount: 1, activeSession: null, nextBufferEndsAt: null, lockReason: "last heartbeat missed" },
];

export const mockActivityLogs: ActivityLogEntry[] = [
  { id: "log_001", timestamp: "10:12:43 2026-06-09", level: "info", actor: "mock-operator", event: "profile.preview_start", target: "studio_lumiere", detail: "Mock only — no backend action executed. request_id=req_mock_001" },
  { id: "log_002", timestamp: "10:11:03 2026-06-09", level: "warning", actor: "system", event: "device.lock_reserved", target: "Phone 01", detail: "Device-level lock prevents multiple active UI sessions on one phone." },
  { id: "log_003", timestamp: "10:08:25 2026-06-09", level: "error", actor: "api-gateway", event: "webhook.delivery_failed", target: "webhook_prod", detail: "Webhook delivery failed in mock mode. Sensitive payload fields are omitted." },
  { id: "log_004", timestamp: "10:04:12 2026-06-09", level: "info", actor: "mock-client", event: "settings.loaded", target: "BotApp", detail: "Loaded local mock settings only." },
];

export const mockTargets: Target[] = [
  { id: "ct_001", handle: "architectes.paris", source: "curated", qualityScore: 91, status: "approved", notes: "High match, active audience." },
  { id: "ct_002", handle: "renovation_lille", source: "import", qualityScore: 76, status: "review", notes: "Review overlap before activation." },
  { id: "ct_003", handle: "old_target_source", source: "legacy", qualityScore: 31, status: "archived", notes: "Archived in mock only." },
];

export const mockDmTemplates: DmTemplate[] = [
  { id: "tpl_001", name: "Welcome Pro", type: "welcome", status: "active", body: "Bonjour {name}, merci pour le follow. Ravi de vous connecter ici.", sent: 128, replies: 19 },
  { id: "tpl_002", name: "Warm intro", type: "welcome", status: "draft", body: "Hello {username}, thanks for connecting.", sent: 0, replies: 0 },
  { id: "tpl_003", name: "Outreach Add-on", type: "outreach", status: "draft", body: "Mock draft only. Outreach remains add-on gated.", sent: 0, replies: 0 },
];

export const mockNotifications: NotificationItem[] = [
  { id: "ntf_001", severity: "critical", title: "Welcome real send disabled", message: "Ready config, but start is blocked by ops safety flag.", profileId: "prof_001", createdAt: "10:13:00 2026-06-09", acknowledged: false },
  { id: "ntf_002", severity: "warning", title: "Assignment window closed", message: "Profile is ready but cannot start outside its assigned window.", profileId: "prof_002", createdAt: "10:05:33 2026-06-09", acknowledged: false },
  { id: "ntf_003", severity: "info", title: "Mock mode active", message: "No backend, device, Instagram, Supabase, or ADB calls are enabled.", createdAt: "10:00:00 2026-06-09", acknowledged: true },
];

export const mockApiKeys: ApiKeySummary[] = [
  { id: "key_001", name: "Web App", prefix: "ak_live_••••••••", scopes: ["profile:read", "devices:read", "stats:read"], status: "active", lastSeenAt: "09:44:12 2026-06-09" },
  { id: "key_002", name: "Automation", prefix: "ak_test_••••••••", scopes: ["profile:read", "webhooks:manage"], status: "revoked", lastSeenAt: null },
];

export const mockWebhooks: WebhookSummary[] = [
  { id: "wh_001", url: "https://example.invalid/botapp/webhook", events: ["profile.started", "incident.created"], status: "active", lastDeliveryStatus: "ok" },
  { id: "wh_002", url: "https://automation.example.invalid/hooks/phone-farm", events: ["device.offline"], status: "disabled", lastDeliveryStatus: "failed" },
];

export const mockSettings: AppSettings = {
  business: { defaultPackage: "Growth", welcomeEnabledForPro: true, outreachRequiresAddon: true },
  admin: { appMode: "mock-first", apiBase: "Not connected", updatesChannel: "manual" },
  opsSafetyCaps: { effectiveFollowCap: "min(db_setting, env_hard_cap)", deviceLevelLock: true, cloneBufferMinutes: 10 },
  killSwitches: { startAllAccounts: false, realDeviceActions: false, realDmSend: false },
  runtimeState: { source: "mock-client", polling: "disabled", websocket: "planned" },
};
