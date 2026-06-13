import type { ActivityLogEntry, ApiKeySummary, AppSettings, Device, NotificationItem, Target, WebhookSummary } from "../api/types";
import { buildDeviceProfileGroups, mockProfilesExpanded } from "./profile-mock-data";

export const mockProfiles = mockProfilesExpanded;

const latencies = [48, 42, 68, 67, 53, 59, 78, 55, 86, 79, 60, 68, 44, null, 65, 58, 49, 116, 70, 127, 59, null, 59, 60, 61, 68, null, null, 136, null, 60, 74, 84, 52, 71, 63, 57, 88, 92, 45, null];
const serialPrefixes = ["R38M", "R38H", "R38F", "R38N", "RF8H", "R38M", "R38H", "R38N"];

function fixtureSerial(index: number) {
  const prefix = serialPrefixes[(index - 1) % serialPrefixes.length];
  const seed = (4070000 + index * 7919).toString(36).toUpperCase().padStart(7, "0");
  return `${prefix}${seed}`.slice(0, 11);
}

function buildDevice(index: number): Device {
  const id = `phone_${String(index).padStart(2, "0")}`;
  const profileCount = [3, 3, 4, 3, 5, 4, 4, 6, 6, 2, 4, 5, 4, 4, 1, 3, 4, 5, 5, 5, 5, 4, 5, 4, 6, 2, 4, 4, 3, 4, 3, 3, 2, 6, 4, 5, 3, 4, 2, 4, 1][index - 1] ?? 3;
  const status = index === 41 ? "offline" : "connected";
  const viewAvailable = index <= 2 && status === "connected";
  return {
    id,
    name: `PHONE ${index}`,
    model: "Samsung A16",
    status,
    adbSerial: fixtureSerial(index),
    shortSerial: fixtureSerial(index),
    deviceKind: "physical_phone",
    pool: index % 5 === 0 ? "outreach_only" : "full_cycle",
    product: "a16nsxx",
    deviceCode: "a16",
    profileCount,
    latencyMs: status === "offline" ? null : latencies[index - 1] ?? null,
    appInstancesCount: profileCount,
    appInstancesAvailableCount: status === "offline" ? 0 : Math.max(0, profileCount - 1),
    appInstancesOccupiedCount: status === "offline" ? 0 : Math.min(1, profileCount),
    heartbeatStatus: status === "offline" ? "offline" : "connected",
    hostLabel: index <= 20 ? "mac-hub-a" : "mac-hub-b",
    hubLabel: index <= 20 ? "hub-a" : "hub-b",
    hubPort: String(index),
    viewAvailable,
    viewUnavailableReason: viewAvailable ? null : status === "offline" ? "Phone is offline." : "Add a local serial mapping to enable this phone view.",
    battery: status === "offline" ? 0 : 42 + ((index * 7) % 56),
    cloneCount: profileCount,
    activeSession: index === 1 ? { id: "sess_001", profileId: "prof_001", username: "rareparis.usa", state: "active_ui", startedAt: "10:04:22 2026-06-09" } : null,
    nextBufferEndsAt: null,
    lockReason: status === "offline" ? "last heartbeat missed" : null,
  };
}

export const mockDevices: Device[] = Array.from({ length: 41 }, (_item, index) => buildDevice(index + 1));

export const mockDeviceProfileGroups = buildDeviceProfileGroups(mockProfiles, mockDevices);

export const mockActivityLogs: ActivityLogEntry[] = [
  { id: "int_001", timestamp: "2026-06-11 10:32", level: "info", actor: "worker", event: "follow", target: "atelier_lumiere", detail: "Interaction found: @liam_bel_epee followed @atelier_lumiere from CT @architectes.paris. Evidence from interacted users and run summary.", domain: "targets", source: "worker", account: "liam_bel_epee", device: "PHONE 1", status: "success" },
  { id: "int_002", timestamp: "2026-06-11 09:58", level: "info", actor: "worker", event: "like", target: "studio_nord", detail: "Interaction found: @j_automatise_pour_toi liked @studio_nord from CT @renovation_lille. Evidence source is best-effort from action logs.", domain: "targets", source: "worker", account: "j_automatise_pour_toi", device: "PHONE 1", status: "success" },
  { id: "int_003", timestamp: "2026-06-10 14:32", level: "warning", actor: "operator", event: "unfollow", target: "old_fashion_ct", detail: "Interaction found: unfollow action for @old_fashion_ct. CT source @old_target_source is low quality and should be reviewed.", domain: "targets", source: "operator", account: "i_m_your_traker", device: "PHONE 2", status: "review" },
  { id: "int_004", timestamp: "2026-06-09 18:07", level: "info", actor: "worker", event: "story_view", target: "galerie_vintage", detail: "Interaction found: story view linked to CT @architectes.paris with medium confidence.", domain: "targets", source: "worker", account: "liam_bel_epee", device: "PHONE 1", status: "success" },
  { id: "int_005", timestamp: "2026-06-08 11:18", level: "info", actor: "worker", event: "dm", target: "maison_verte", detail: "Interaction found: welcome DM sent after followback, linked to CT @mode_paris_fr through derived projection.", domain: "targets", source: "worker", account: "test_account_ops", device: "PHONE 3", status: "success" },
  { id: "int_006", timestamp: "2026-06-05 16:44", level: "warning", actor: "system", event: "comment", target: "atelier_lumiere", detail: "Comment attempt failed for @atelier_lumiere. Reason: action blocked by account status.", domain: "targets", source: "system", account: "liam_bel_epee", device: "PHONE 1", status: "failed" },
];

export const mockTargets: Target[] = [
  { id: "ct_001", handle: "architectes.paris", source: "curated", qualityScore: 91, status: "approved", notes: "High match, active audience." },
  { id: "ct_002", handle: "renovation_lille", source: "import", qualityScore: 76, status: "review", notes: "Review overlap before activation." },
  { id: "ct_003", handle: "old_target_source", source: "legacy", qualityScore: 31, status: "archived", notes: "Archived locally." },
];

export const mockNotifications: NotificationItem[] = [
  { id: "ntf_001", severity: "critical", title: "Welcome real send disabled", message: "Ready config, but start is blocked by ops safety flag.", profileId: "prof_001", createdAt: "10:13:00 2026-06-09", acknowledged: false },
  { id: "ntf_002", severity: "warning", title: "Assignment window closed", message: "Profile is ready but cannot start outside its assigned window.", profileId: "prof_002", createdAt: "10:05:33 2026-06-09", acknowledged: false },
  { id: "ntf_003", severity: "info", title: "Local mode active", message: "Secure relay not connected. No backend, device, Instagram, Supabase, or ADB calls are enabled.", createdAt: "10:00:00 2026-06-09", acknowledged: true },
];

export const mockApiKeys: ApiKeySummary[] = [
  { id: "key_001", name: "Operator Dashboard Relay", prefix: "ak_live_••••9c2a", scopes: ["profile:read", "devices:read", "stats:read", "compass:read"], status: "active", createdAt: "2026-06-08 08:00", lastSeenAt: "09:44:12 2026-06-09", callCountToday: 146, productionCallCount: 153 },
  { id: "key_002", name: "Webhook Manager", prefix: "ak_test_••••41bf", scopes: ["profile:read", "webhooks:manage", "activity:read"], status: "revoked", createdAt: "2026-06-06 14:20", lastSeenAt: null, callCountToday: 0, productionCallCount: 12 },
];

export const mockWebhooks: WebhookSummary[] = [
  { id: "wh_001", url: "https://hooks.example.invalid/••••/slack-incidents", events: ["slack.incident", "credential.action_required", "account.blocked"], status: "active", lastDeliveryStatus: "ok", lastDeliveryAt: "2026-06-11 10:12", provider: "slack", latestError: null },
  { id: "wh_002", url: "https://hooks.example.invalid/••••/ops-discord", events: ["discord.incident", "device.offline", "run.failed"], status: "active", lastDeliveryStatus: "pending", lastDeliveryAt: null, provider: "discord", latestError: null },
  { id: "wh_003", url: "https://client.example.invalid/••••/compass", events: ["compass.critical_recommendation", "ct.quality_alert", "profile.targets.updated"], status: "disabled", lastDeliveryStatus: "failed", lastDeliveryAt: "2026-06-10 18:25", provider: "custom", latestError: "The read operation timed out." },
];

export const mockSettings: AppSettings = {
  business: { defaultPackage: "Growth", welcomeEnabledForPro: true, outreachRequiresAddon: true },
  admin: { appMode: "local-preview", apiBase: "Not connected", updatesChannel: "manual" },
  opsSafetyCaps: { effectiveFollowCap: "min(db_setting, env_hard_cap)", deviceLevelLock: true, cloneBufferMinutes: 10 },
  killSwitches: { startAllAccounts: false, realDeviceActions: false, realDmSend: false },
  runtimeState: { source: "local-client", polling: "disabled", websocket: "planned" },
};
