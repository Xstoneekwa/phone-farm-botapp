import { useEffect, useState } from "react";
import { mockClient } from "../../../api/mock-client";
import type {
  BotProfile,
  ProfileDmSavePayload,
  ProfileFollowbackSavePayload,
  ProfileFollowSavePayload,
  ProfileAvailableAssignmentSlot,
  ProfileScheduleSavePayload,
  ProfileSettings,
  ProfileSourceSavePayload,
} from "../../../api/types";
import { Badge, Button, Drawer } from "../../../design/components";
import { FilterSettingsPanel, filtersValidationError, sameFiltersDraft } from "./FilterSettingsPanel";

const tabs = ["General", "Schedule", "Follow", "DM", "Followback", "Sources", "Filters"] as const;
type SettingsTab = (typeof tabs)[number];
const DM_MAX_CHARS = 900;
const WELCOME_DAY_CAP_MAX = 10;
const OUTREACH_DAY_CAP_MAX = 30;
const DM_TEMPLATE_VARIABLES = ["{username}", "{{username}}", "{name}", "{{name}}", "{account_username}", "{{account_username}}"];
const DM_TEMPLATE_TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g;
const DM_SUPPORTED_VARIABLES = new Set(["username", "name", "account_username"]);

function previewPayload(payload: unknown) {
  return JSON.stringify(payload, (key, value) => key === "mock_only" ? undefined : value, 2);
}

function credentialLabel(status: ProfileSettings["general"]["credentialStatus"]) {
  if (status === "active") return "Credential status: active";
  if (status === "missing") return "Credential status: missing";
  return "Credential status: needs update";
}

function Field({ label, value, mono = false }: { label: string; value: string | number | boolean | string[]; mono?: boolean }) {
  return <div className="settings-field"><span>{label}</span><strong className={mono ? "mono" : ""}>{Array.isArray(value) ? value.join(", ") : String(value)}</strong></div>;
}

function ToggleLine({ label, checked }: { label: string; checked: boolean }) {
  return <label className="checkbox-row"><input type="checkbox" checked={checked} readOnly /> {label}</label>;
}

function EditableToggleLine({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="checkbox-row"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} /> {label}</label>;
}

function NumberField({
  label,
  value,
  min = 0,
  max,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="settings-edit-field">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="settings-edit-field settings-edit-field-full">
      <span>{label}</span>
      <textarea className="input settings-textarea" value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  optionLabels = {},
  disabledOptions = [],
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  optionLabels?: Partial<Record<T, string>>;
  disabledOptions?: T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="settings-edit-field">
      <span>{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.currentTarget.value as T)}>
        {options.map((option) => <option key={option} value={option} disabled={disabledOptions.includes(option)}>{optionLabels[option] ?? option}</option>)}
      </select>
    </label>
  );
}

function statusTone(status: string): "neutral" | "success" | "warning" {
  if (/ready|active|assigned|reserved|safe|synced/i.test(status)) return "success";
  if (/missing|blocked|review|pending|disabled/i.test(status)) return "warning";
  return "neutral";
}

function Section({
  title,
  badge,
  tone = "neutral",
  children,
  full = false,
}: {
  title: string;
  badge: string;
  tone?: "neutral" | "success" | "warning" | "info";
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <section className={`settings-card${full ? " full" : ""}`}>
      <header>
        <h4>{title}</h4>
        <Badge tone={tone}>{badge}</Badge>
      </header>
      {children}
    </section>
  );
}

function scheduleSlotKey(slot: Pick<ProfileAvailableAssignmentSlot, "startsAt" | "endsAt">) {
  return `${slot.startsAt}|${slot.endsAt}`;
}

function scheduleSlotReasonLabel(slot: ProfileAvailableAssignmentSlot) {
  if (slot.reason === "current") return "Current slot";
  if (slot.available) return "Available";
  if (slot.reason === "occupied") return slot.occupiedBy ? `Occupied by @${slot.occupiedBy}` : "Occupied";
  if (slot.reason === "phone_rest") return "Fixed blackout";
  if (slot.reason === "outreach_rest_reserved") return "Outreach rest reserved";
  if (slot.reason === "no_app_instance_available") return "No app instance available";
  if (slot.reason === "no_clone_available") return "No clone available";
  return "Unavailable";
}

function scheduleGateStatusLabel(status: string, reason: string) {
  if (status === "ready") return "Window open now";
  if (status === "env_fallback") return `env fallback - ${reason || "unknown"}`;
  return status === "blocked" ? `blocked - ${reason || "unknown"}` : status;
}

function scheduleNextEligibleLabel(settings: ProfileSettings["schedule"]) {
  if (settings.gates.ok) return "Window open now";
  if (settings.gates.nextEligibleStartsAt) return settings.gates.nextEligibleStartsAt;
  if (settings.gates.reason === "assignment_missing") return "Select a slot first";
  return "None";
}

function buildScheduleSavePayload(
  profile: BotProfile,
  settings: ProfileSettings,
  selectedSlot: ProfileAvailableAssignmentSlot | null,
): ProfileScheduleSavePayload | null {
  if (!selectedSlot) return null;
  return {
    account_id: profile.id,
    device_id: profile.deviceId,
    starts_at: selectedSlot.startsAt,
    ends_at: selectedSlot.endsAt,
    selected_slot_key: scheduleSlotKey(selectedSlot),
    source: "botapp",
    requested_by: null,
    reason: "manual_schedule_assignment",
    action: "save_schedule",
    idempotency_key: `botapp:schedule:${profile.id}:${selectedSlot.slotIndex}:preview`,
    mock_only: true,
    metadata_safe: {
      account_username: profile.username,
      device_label: settings.schedule.assignedDevice,
      slot_label: selectedSlot.localLabel,
      slot_kind: selectedSlot.slotKind,
      assignment_source: "manual_botapp",
      sensitive_values_excluded: true,
    },
  };
}

function SchedulePayloadPreview({ payload }: { payload: ProfileScheduleSavePayload | null }) {
  return (
    <section className="settings-card full settings-payload-card">
      <header>
        <h4>Future assignment payload</h4>
        <Badge tone="warning">Prepared</Badge>
      </header>
      <p className="muted">Matches the admin Schedule PATCH shape for a future secure relay. No assignment is sent from BotApp.</p>
      <pre className="payload-preview">{previewPayload(payload ?? { blocked: "Select an available slot first" })}</pre>
    </section>
  );
}

function sameFollowDraft(left: ProfileSettings["follow"], right: ProfileSettings["follow"]) {
  return (
    left.manualFollowDayCap === right.manualFollowDayCap &&
    left.manualFollowSessionCap === right.manualFollowSessionCap &&
    left.warmupEnabled === right.warmupEnabled &&
    left.day1FollowCap === right.day1FollowCap &&
    left.day2FollowCap === right.day2FollowCap &&
    left.day3FollowCap === right.day3FollowCap &&
    left.day4PlusFollowCap === right.day4PlusFollowCap
  );
}

function followValidationError(follow: ProfileSettings["follow"]) {
  const whole = [
    ["Manual follow cap/day", follow.manualFollowDayCap],
    ["Manual follow cap/session", follow.manualFollowSessionCap],
    ["Day 1 follow cap", follow.day1FollowCap],
    ["Day 2 follow cap", follow.day2FollowCap],
    ["Day 3 follow cap", follow.day3FollowCap],
    ["Day 4+ follow cap", follow.day4PlusFollowCap],
  ] as const;
  for (const [label, value] of whole) {
    if (!Number.isInteger(value) || value < 0) return `${label} must be a whole number greater than or equal to 0.`;
  }
  if (follow.day1FollowCap > 10) return "Day 1 follow cap must be between 0 and 10.";
  if (follow.day2FollowCap > 20) return "Day 2 follow cap must be between 0 and 20.";
  if (follow.day3FollowCap > 40) return "Day 3 follow cap must be between 0 and 40.";
  if (follow.day4PlusFollowCap > follow.packageFollowDayCap) return `Day 4+ follow cap cannot exceed package cap (${follow.packageFollowDayCap}).`;
  return "";
}

function buildFollowSavePayload(
  profile: BotProfile,
  follow: ProfileSettings["follow"],
): ProfileFollowSavePayload {
  return {
    account_id: profile.id,
    source: "botapp",
    requested_by: null,
    idempotency_key: `botapp:follow:${profile.id}:preview`,
    mock_only: true,
    endpoint: "/api/instagram-dashboard/settings",
    patch: {
      account_id: profile.id,
      manual_follow_day_cap: follow.manualFollowDayCap,
      manual_follow_session_cap: follow.manualFollowSessionCap,
      warmup_enabled: follow.warmupEnabled,
      day_1_follow_cap: follow.day1FollowCap,
      day_2_follow_cap: follow.day2FollowCap,
      day_3_follow_cap: follow.day3FollowCap,
      day_4_plus_follow_cap: follow.day4PlusFollowCap,
    },
    metadata_safe: {
      account_username: profile.username,
      package_follow_day_cap: follow.packageFollowDayCap,
      effective_follow_cap_today: Number.parseInt(follow.effectiveFollowLimit.replace(/\D+/g, ""), 10) || follow.effectiveWarmupCapToday,
      limiting_reason: follow.limitingReason,
      sensitive_values_excluded: true,
    },
  };
}

function FollowPayloadPreview({ payload }: { payload: ProfileFollowSavePayload }) {
  return (
    <section className="settings-card full settings-payload-card">
      <header>
        <h4>Future Follow payload</h4>
        <Badge tone="warning">Prepared</Badge>
      </header>
      <p className="muted">Matches the admin draft/warmup save path for a future secure relay. BotApp does not patch the admin API directly.</p>
      <pre className="payload-preview">{previewPayload(payload)}</pre>
    </section>
  );
}

function normalizeDmMessage(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function dmLineCount(value: string) {
  return normalizeDmMessage(value) ? normalizeDmMessage(value).split("\n").length : 0;
}

function appendDmVariable(value: string, token: string) {
  const current = normalizeDmMessage(value);
  return current ? `${current} ${token}` : token;
}

function unsupportedDmVariables(value: string) {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of value.matchAll(DM_TEMPLATE_TOKEN_RE)) {
    const name = String(match[1] || match[2] || "").trim();
    if (!name || DM_SUPPORTED_VARIABLES.has(name) || seen.has(name)) continue;
    seen.add(name);
    found.push(match[0]);
  }
  return found;
}

function renderDmPreview(value: string) {
  const samples: Record<string, string> = {
    username: "justperfect.eu",
    name: "Marie",
    account_username: "j_automatise_pour_toi",
  };
  return normalizeDmMessage(value).replace(DM_TEMPLATE_TOKEN_RE, (match, a, b) => {
    const name = String(a || b || "").trim();
    return samples[name] ?? match;
  });
}

function sameDmDraft(left: ProfileSettings["dm"], right: ProfileSettings["dm"]) {
  return (
    left.welcomeDmEnabled === right.welcomeDmEnabled &&
    left.welcomeDmBody === right.welcomeDmBody &&
    left.welcomeSessionCap === right.welcomeSessionCap &&
    left.welcomeDayCap === right.welcomeDayCap &&
    left.coldDmEnabled === right.coldDmEnabled &&
    left.coldDmBody === right.coldDmBody &&
    left.outreachSessionCap === right.outreachSessionCap &&
    left.outreachDayCap === right.outreachDayCap
  );
}

function dmValidationError(dm: ProfileSettings["dm"]) {
  const welcomeMessage = normalizeDmMessage(dm.welcomeDmBody);
  const outreachMessage = normalizeDmMessage(dm.coldDmBody);
  if (dm.welcomeDmEnabled && !dm.welcomeServiceActive) return "Welcome service is not active for this account.";
  if (dm.coldDmEnabled && !dm.outreachServiceActive) return "Outreach service is not active for this account.";
  if (dm.welcomeDmEnabled && !welcomeMessage) return "Welcome message is required";
  if (dm.coldDmEnabled && !outreachMessage) return "Outreach message is required";
  if (welcomeMessage.length > DM_MAX_CHARS) return `Welcome message cannot exceed ${DM_MAX_CHARS} characters.`;
  if (outreachMessage.length > DM_MAX_CHARS) return `Outreach message cannot exceed ${DM_MAX_CHARS} characters.`;
  if (unsupportedDmVariables(welcomeMessage).length) return `Unsupported Welcome variable: ${unsupportedDmVariables(welcomeMessage).join(", ")}`;
  if (unsupportedDmVariables(outreachMessage).length) return `Unsupported Outreach variable: ${unsupportedDmVariables(outreachMessage).join(", ")}`;
  if (dm.welcomeDmEnabled && dm.welcomeSessionCap < 1) return "Welcome cap must be at least 1";
  if (dm.welcomeDmEnabled && dm.welcomeDayCap < 1) return "Welcome day cap must be at least 1";
  if (dm.welcomeDayCap > WELCOME_DAY_CAP_MAX) return `welcome_daily_cap_exceeded: Welcome day cap cannot exceed ${WELCOME_DAY_CAP_MAX}`;
  if (dm.welcomeDmEnabled && dm.welcomeSessionCap > dm.welcomeDayCap) return "session_cap_exceeds_day_cap: Welcome session cap cannot exceed Welcome day cap";
  if (dm.coldDmEnabled && (dm.outreachSessionCap < 1 || dm.outreachDayCap < 1)) return "Outreach caps must be at least 1";
  if (dm.outreachDayCap > OUTREACH_DAY_CAP_MAX) return `outreach_daily_cap_exceeded: Outreach day cap cannot exceed ${OUTREACH_DAY_CAP_MAX}`;
  if (dm.coldDmEnabled && dm.outreachSessionCap > dm.outreachDayCap) return "session_cap_exceeds_day_cap: Outreach session cap cannot exceed Outreach day cap";
  return "";
}

function buildDmSavePayload(profile: BotProfile, dm: ProfileSettings["dm"]): ProfileDmSavePayload {
  return {
    account_id: profile.id,
    source: "botapp",
    requested_by: null,
    idempotency_key: `botapp:dm:${profile.id}:preview`,
    mock_only: true,
    endpoint: "/api/instagram-dashboard/settings/dm",
    patch: {
      account_id: profile.id,
      welcome_enabled: dm.welcomeDmEnabled,
      welcome_message: normalizeDmMessage(dm.welcomeDmBody),
      welcome_cap_session: dm.welcomeSessionCap,
      welcome_cap_day: dm.welcomeDayCap,
      outreach_enabled: dm.coldDmEnabled,
      outreach_message: normalizeDmMessage(dm.coldDmBody),
      outreach_cap_session: dm.outreachSessionCap,
      outreach_cap_day: dm.outreachDayCap,
    },
    metadata_safe: {
      account_username: profile.username,
      welcome_template_status: dm.welcomeTemplateStatus,
      outreach_template_status: dm.outreachTemplateStatus,
      welcome_real_send_status: dm.welcomeRealSendStatus,
      outreach_real_send_status: dm.outreachRealSendStatus,
      sensitive_values_excluded: true,
    },
  };
}

function DmVariableChips({ disabled, onInsert }: { disabled: boolean; onInsert: (token: string) => void }) {
  return (
    <div className="dm-variable-panel">
      <span>Variables disponibles</span>
      <div>
        {DM_TEMPLATE_VARIABLES.map((token) => <button key={token} type="button" disabled={disabled} onClick={() => onInsert(token)}>{token}</button>)}
      </div>
      <small>Preview uses sample data. Backend falls back from display name to username when needed.</small>
    </div>
  );
}

function DmPreview({ label, value }: { label: "Welcome" | "Outreach"; value: string }) {
  const normalized = normalizeDmMessage(value);
  const unsupported = unsupportedDmVariables(normalized);
  return (
    <div className="dm-preview">
      <div className="dm-preview-head"><span>{label} Instagram preview</span><span>{normalized.length}/{DM_MAX_CHARS} chars · {dmLineCount(normalized)} lines</span></div>
      <div className={normalized ? "dm-preview-body" : "dm-preview-body empty"}>{renderDmPreview(normalized) || "Message preview will appear here."}</div>
      {unsupported.length ? <div className="dm-preview-warning">Unsupported variable: {unsupported.join(", ")}</div> : null}
    </div>
  );
}

function DmPayloadPreview({ payload }: { payload: ProfileDmSavePayload }) {
  return (
    <section className="settings-card full settings-payload-card">
      <header>
        <h4>Future DM payload</h4>
        <Badge tone="warning">Prepared</Badge>
      </header>
      <p className="muted">Matches the admin DM domain save path for a future secure relay. BotApp does not send messages or patch the admin API directly.</p>
      <pre className="payload-preview">{previewPayload(payload)}</pre>
    </section>
  );
}

function sameFollowbackDraft(left: ProfileSettings["followback"], right: ProfileSettings["followback"]) {
  return (
    left.unfollowEnabled === right.unfollowEnabled &&
    left.unfollowMode === right.unfollowMode &&
    left.unfollowPerSession === right.unfollowPerSession &&
    left.unfollowPerDay === right.unfollowPerDay &&
    left.unfollowAfterDays === right.unfollowAfterDays &&
    left.runtimeCapMode === right.runtimeCapMode &&
    left.runtimeSafetyCap === right.runtimeSafetyCap
  );
}

function followbackValidationError(followback: ProfileSettings["followback"]) {
  const integers = [
    ["Unfollow cap/session", followback.unfollowPerSession],
    ["Unfollow cap/day", followback.unfollowPerDay],
    ["Unfollow delay days", followback.unfollowAfterDays],
  ] as const;
  for (const [label, value] of integers) {
    if (!Number.isInteger(value) || value < 0) return `${label} must be a whole number greater than or equal to 0.`;
  }
  if (followback.runtimeSafetyCap !== null && (!Number.isInteger(followback.runtimeSafetyCap) || followback.runtimeSafetyCap < 0)) {
    return "Runtime safety cap must be empty or a whole number greater than or equal to 0.";
  }
  if (followback.unfollowMode === "unfollow-non-followers") return "unfollow_non_followers_planned";
  if (followback.unfollowMode !== "unfollow" && followback.unfollowMode !== "unfollow-any") return "unfollow_mode_not_supported";
  if (!["prod_normal", "mini_run", "incident_safety"].includes(followback.runtimeCapMode)) return "runtime_cap_mode_not_supported";
  if (followback.unfollowEnabled && (followback.unfollowPerSession < 1 || followback.unfollowPerDay < 1)) return "unfollow_cap_unproven";
  if (followback.unfollowEnabled && followback.runtimeCapMode !== "prod_normal" && (!followback.runtimeSafetyCap || followback.runtimeSafetyCap < 1)) return "unfollow_cap_unproven";
  if (followback.unfollowEnabled && followback.unfollowPerSession > followback.unfollowPerDay) return "session_cap_exceeds_day_cap";
  return "";
}

function buildFollowbackSavePayload(
  profile: BotProfile,
  followback: ProfileSettings["followback"],
): ProfileFollowbackSavePayload {
  return {
    account_id: profile.id,
    source: "botapp",
    requested_by: null,
    idempotency_key: `botapp:unfollow:${profile.id}:preview`,
    mock_only: true,
    endpoint: "/api/instagram-dashboard/settings/unfollow",
    patch: {
      account_id: profile.id,
      unfollow_enabled: followback.unfollowEnabled,
      unfollow_mode: followback.unfollowMode,
      unfollow_per_session_limit: followback.unfollowPerSession,
      unfollow_per_day_limit: followback.unfollowPerDay,
      unfollow_after_days: followback.unfollowAfterDays,
      runtime_cap_mode: followback.runtimeCapMode,
      runtime_safety_cap: followback.runtimeCapMode === "prod_normal" ? null : followback.runtimeSafetyCap,
    },
    metadata_safe: {
      account_username: profile.username,
      effective_unfollow_cap: followback.effectiveUnfollowLimit,
      runtime_cap_source: followback.runtimeCapSource,
      limiting_reason: followback.limitingReason,
      sensitive_values_excluded: true,
    },
  };
}

function FollowbackPayloadPreview({ payload }: { payload: ProfileFollowbackSavePayload }) {
  return (
    <section className="settings-card full settings-payload-card">
      <header>
        <h4>Future Unfollow payload</h4>
        <Badge tone="warning">Prepared</Badge>
      </header>
      <p className="muted">Matches the admin Followback / Unfollow PATCH path for a future secure relay. BotApp does not start runs or perform Unfollow actions.</p>
      <pre className="payload-preview">{previewPayload(payload)}</pre>
    </section>
  );
}

function sameSourcesDraft(left: ProfileSettings["sources"], right: ProfileSettings["sources"]) {
  return (
    left.maxFollowsPerTargetPerRun === right.maxFollowsPerTargetPerRun &&
    left.maxTargetsPerRun === right.maxTargetsPerRun
  );
}

function sourcesValidationError(sources: ProfileSettings["sources"]) {
  const checks = [
    ["Max follows per target per run", sources.maxFollowsPerTargetPerRun, sources.bounds.maxFollowsPerTargetPerRun],
    ["Max targets per run", sources.maxTargetsPerRun, sources.bounds.maxTargetsPerRun],
  ] as const;
  for (const [label, value, bounds] of checks) {
    if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      return `${label} must be a whole number from ${bounds.min} to ${bounds.max}.`;
    }
  }
  if (!sources.saveReady) return "Follow source settings are unavailable until the account_follow_source_settings migration is applied.";
  return "";
}

function buildSourcesSavePayload(
  profile: BotProfile,
  sources: ProfileSettings["sources"],
): ProfileSourceSavePayload {
  return {
    account_id: profile.id,
    source: "botapp",
    requested_by: null,
    idempotency_key: `botapp:sources:${profile.id}:preview`,
    mock_only: true,
    endpoint: "/api/instagram-dashboard/settings/follow-sources",
    patch: {
      account_id: profile.id,
      max_follows_per_target_per_run: sources.maxFollowsPerTargetPerRun,
      max_targets_per_run: sources.maxTargetsPerRun,
    },
    metadata_safe: {
      account_username: profile.username,
      source_status: sources.sourceStatus,
      runtime_status: sources.runtimeStatus,
      target_summary: {
        active: sources.activeTargetsCount,
        eligible: sources.eligibleTargetsCount,
        rejected: sources.rejectedTargetsCount,
        archived: sources.archivedTargetsCount,
      },
      sensitive_values_excluded: true,
    },
  };
}

function SourcesPayloadPreview({ payload }: { payload: ProfileSourceSavePayload }) {
  return (
    <section className="settings-card full settings-payload-card">
      <header>
        <h4>Future Sources payload</h4>
        <Badge tone="warning">Prepared</Badge>
      </header>
      <p className="muted">Matches the admin Follow source rotation PATCH path. BotApp does not validate CTs or mutate source rows directly.</p>
      <pre className="payload-preview">{previewPayload(payload)}</pre>
    </section>
  );
}

export function SettingsDrawer({
  profile,
  onClose,
  onConfirm,
  onOpenTargets,
}: {
  profile: BotProfile;
  onClose: () => void;
  onConfirm: () => void;
  onOpenTargets?: () => void;
}) {
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("General");
  const [selectedScheduleSlotKey, setSelectedScheduleSlotKey] = useState("");
  const [followDraft, setFollowDraft] = useState<ProfileSettings["follow"] | null>(null);
  const [dmDraft, setDmDraft] = useState<ProfileSettings["dm"] | null>(null);
  const [followbackDraft, setFollowbackDraft] = useState<ProfileSettings["followback"] | null>(null);
  const [sourcesDraft, setSourcesDraft] = useState<ProfileSettings["sources"] | null>(null);
  const [filtersDraft, setFiltersDraft] = useState<ProfileSettings["filters"] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void mockClient.getProfileSettings(profile.id).then((result) => {
      if (!cancelled && result.ok) {
        setSettings(result.data);
        setFollowDraft(result.data.follow);
        setDmDraft(result.data.dm);
        setFollowbackDraft(result.data.followback);
        setSourcesDraft(result.data.sources);
        setFiltersDraft(result.data.filters);
        const currentSlot = result.data.schedule.availableSlots.find((slot) => slot.reason === "current" || slot.occupiedBy === profile.username);
        setSelectedScheduleSlotKey(currentSlot ? scheduleSlotKey(currentSlot) : "");
      }
    });
    return () => { cancelled = true; };
  }, [profile.id, profile.username]);

  if (!settings) return <Drawer title="Settings" subtitle={profile.username} wide onClose={onClose}><div className="empty-state">Loading settings...</div></Drawer>;

  const selectedScheduleSlot = settings.schedule.availableSlots.find((slot) => scheduleSlotKey(slot) === selectedScheduleSlotKey) ?? null;
  const currentScheduleSlotKey = settings.schedule.availableSlots.find((slot) => slot.reason === "current" || slot.occupiedBy === profile.username);
  const scheduleSelectionChanged = selectedScheduleSlotKey !== (currentScheduleSlotKey ? scheduleSlotKey(currentScheduleSlotKey) : "");
  const schedulePayload = buildScheduleSavePayload(profile, settings, selectedScheduleSlot);
  const showSaveAction = activeTab !== "General";
  const actionLabel = activeTab === "DM" ? "Save DM settings" : activeTab === "Schedule" ? "Save Schedule" : `Save ${activeTab}`;
  const scheduleSaveDisabled = !selectedScheduleSlot || !selectedScheduleSlot.available || !scheduleSelectionChanged;
  const follow = followDraft ?? settings.follow;
  const followDirty = !sameFollowDraft(follow, settings.follow);
  const followError = followValidationError(follow);
  const followPayload = buildFollowSavePayload(profile, follow);
  const followSaveDisabled = !followDirty || Boolean(followError);
  const dm = dmDraft ?? settings.dm;
  const dmDirty = !sameDmDraft(dm, settings.dm);
  const dmError = dmValidationError(dm);
  const dmPayload = buildDmSavePayload(profile, dm);
  const dmSaveDisabled = !dmDirty || Boolean(dmError) || !dm.saveReady;
  const followback = followbackDraft ?? settings.followback;
  const followbackDirty = !sameFollowbackDraft(followback, settings.followback);
  const followbackError = followbackValidationError(followback);
  const followbackPayload = buildFollowbackSavePayload(profile, followback);
  const followbackSaveDisabled = !followbackDirty || Boolean(followbackError);
  const sources = sourcesDraft ?? settings.sources;
  const sourcesDirty = !sameSourcesDraft(sources, settings.sources);
  const sourcesError = sourcesValidationError(sources);
  const sourcesPayload = buildSourcesSavePayload(profile, sources);
  const sourcesSaveDisabled = !sourcesDirty || Boolean(sourcesError) || !sources.saveReady;
  const filters = filtersDraft ?? settings.filters;
  const filtersDirty = !sameFiltersDraft(filters, settings.filters);
  const filtersError = filtersValidationError(filters);
  const filtersSaveDisabled = !filtersDirty || Boolean(filtersError) || !filters.saveReady;

  return (
    <Drawer
      title="Settings"
      subtitle={profile.username}
      wide
      panelClassName="drawer-panel-settings"
      onClose={onClose}
      footer={showSaveAction ? <>
        <div className="drawer-footer-left" />
        <Button
          onClick={onConfirm}
          disabled={(activeTab === "Schedule" && scheduleSaveDisabled) || (activeTab === "Follow" && followSaveDisabled) || (activeTab === "DM" && dmSaveDisabled) || (activeTab === "Followback" && followbackSaveDisabled) || (activeTab === "Sources" && sourcesSaveDisabled) || (activeTab === "Filters" && filtersSaveDisabled)}
        >
          {actionLabel}
        </Button>
      </> : undefined}
    >
      <div className="settings-tabs" role="tablist" aria-label="Profile settings sections">
        {tabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
      </div>

      {activeTab === "General" ? <div className="settings-grid">
        <Section title="General summary" badge="Read-only" full><p className="muted">General is a compact status summary. Operational changes live in Schedule, Follow, DM, Followback, Sources, Filters, Credentials, and the account action menu.</p></Section>
        <Section title="Account identity" badge="Read-only"><Field label="Username" value={settings.general.username} mono /><Field label="Display name" value={settings.general.displayName || "Not available"} /></Section>
        <Section title="Credentials" badge="Safe" tone="warning"><Field label="Credential status" value={credentialLabel(settings.general.credentialStatus)} /><Field label="Credential source" value={settings.general.credentialSource} /><ToggleLine label="2FA enabled" checked={settings.general.twoFactorEnabled} /><ToggleLine label="Update required" checked={settings.general.credentialUpdateRequired} /><Button variant="ghost" onClick={onConfirm}>Update credentials</Button></Section>
        <Section title="Package and runtime" badge="Runtime summary" tone="info"><Field label="Commercial package" value={settings.general.commercialPackage} /><Field label="Add-ons / entitlements" value={settings.general.entitlements} /><Field label="Runtime profile" value={settings.general.runtimeProfile} mono /><Field label="Slot kind" value={settings.general.slotKind} mono /></Section>
        <Section title="Status" badge="Read-only"><Field label="Readiness status" value={settings.general.readinessStatus} /><Field label="Eligibility status" value={settings.general.eligibilityStatus} /><Field label="Assignment status" value={settings.general.assignmentStatus} /><Field label="Current slot" value={settings.general.currentSlot} mono /></Section>
        <Section title="Safe account metadata" badge="No secrets" tone="warning" full><Field label="Device assignment" value={`${settings.general.deviceLabel} · ${settings.general.deviceId}`} mono /><Field label="Safety rule" value={settings.general.safeMetadata} /></Section>
      </div> : null}

      {activeTab === "Schedule" ? <div className="settings-grid">
        <Section title="Current assignment" badge={settings.schedule.gates.ok ? "In window" : "Outside window"} tone={settings.schedule.gates.ok ? "success" : "warning"}><p className="muted">Full-cycle accounts use 6-hour slots. Outreach-only accounts use 40-minute slots.</p><Field label="Phone / device" value={settings.schedule.assignedDevice} /><Field label="Safe device serial" value={settings.schedule.safeDeviceSerial} mono /><Field label="Runtime profile" value={settings.schedule.runtimeProfile} mono /><Field label="Slot kind" value={settings.schedule.slotKind} mono /><Field label="Current slot" value={settings.schedule.currentSlot} mono /><Field label="Assignment status" value={settings.schedule.assignmentStatus} /><Field label="Assignment source" value={settings.schedule.assignmentSource} /><Field label="Device timezone" value={settings.schedule.businessTimezone} /></Section>
        <Section title="Device reservation" badge={settings.schedule.reservedState} tone={statusTone(settings.schedule.reservedState)}><Field label="Clone slot" value={settings.schedule.cloneSlot} /><Field label="APK cloner slot" value={settings.schedule.apkClonerSlot} /><Field label="App instances" value={settings.schedule.appInstanceSummary} /><Field label="One phone / one session" value={settings.schedule.deviceLock} /><Field label="Clone/session buffer" value={`${settings.schedule.cloneBufferMinutes} min`} /><Field label="Phone rest" value={settings.schedule.phoneRest} /><Field label="Schedule source" value={settings.schedule.scheduleSource} /></Section>
        <Section title="Select slot" badge={settings.schedule.saveReady ? "Save ready" : "Blocked"} tone={settings.schedule.saveReady ? "success" : "warning"} full><p className="muted">Only available slots can be saved. Disabled rows mirror admin reasons like occupied slot, fixed blackout, or unavailable app instance.</p><label className="settings-select-field"><span>Available slot</span><select className="input" value={selectedScheduleSlotKey} onChange={(event) => setSelectedScheduleSlotKey(event.target.value)} disabled={!settings.schedule.saveReady}><option value="">Select a slot</option>{settings.schedule.availableSlots.map((slot) => <option key={scheduleSlotKey(slot)} value={scheduleSlotKey(slot)} disabled={!slot.available}>{slot.localLabel} - {scheduleSlotReasonLabel(slot)}</option>)}</select></label><div className="schedule-slot-list">{settings.schedule.availableSlots.map((slot) => <div key={`${slot.slotIndex}-${slot.startsAt}`} className={`schedule-slot-row${slot.available ? " available" : " blocked"}`}><strong>{slot.localLabel}</strong><span>{slot.slotKindLabel}</span><em>{scheduleSlotReasonLabel(slot)}</em></div>)}</div></Section>
        <Section title="Fixed blackout windows" badge={settings.schedule.restWindows.length ? "Active blackout" : "No blackout"} tone={settings.schedule.restWindows.length ? "warning" : "success"}>{settings.schedule.restWindows.length ? <ul className="settings-list">{settings.schedule.restWindows.map((window) => <li key={window.id}>{window.label} ({window.timezone}){window.reason ? ` - ${window.reason}` : ""}</li>)}</ul> : <p className="muted">No active fixed blackout windows configured for this device.</p>}</Section>
        <Section title="Schedule gates" badge="Runtime" tone="info"><Field label="/runs/start" value={scheduleGateStatusLabel(settings.schedule.gates.runStartGate, settings.schedule.gates.reason)} /><Field label="Dispatcher" value={scheduleGateStatusLabel(settings.schedule.gates.dispatcherGate, settings.schedule.gates.reason)} /><Field label="Auto Restart" value={scheduleGateStatusLabel(settings.schedule.gates.autoRestartGate, settings.schedule.gates.reason)} /><Field label="Gate reason" value={settings.schedule.gates.reason || "assignment_missing"} /><Field label="Window active" value={settings.schedule.gates.windowActive} /><Field label="Phone rest active" value={settings.schedule.gates.phoneRestActive} /><Field label="Next eligible slot" value={scheduleNextEligibleLabel(settings.schedule)} /></Section>
        <SchedulePayloadPreview payload={schedulePayload} />
      </div> : null}

      {activeTab === "Follow" ? <div className="settings-grid">
        <Section title="Follow summary" badge={follow.runtimeStatus} tone={statusTone(follow.runtimeStatus)}><Field label="Follow enabled" value={follow.followEnabled ? "enabled" : "disabled"} /><Field label="Effective follow cap today" value={follow.effectiveFollowLimit} mono /><Field label="Followed today" value={profile.counters.follow.current} /><Field label="Remaining today" value={follow.followDayRemaining} /><Field label="Limiting reason" value={follow.limitingReason} /><Field label="Applied cap source" value={follow.capSource} /></Section>
        <Section title="Limits" badge="Editable admin caps" tone="info"><Field label="Commercial package" value={settings.general.commercialPackage} /><Field label="Package follow cap/day" value={follow.packageFollowDayCap} /><NumberField label="Manual follow cap/day" value={follow.manualFollowDayCap} onChange={(value) => setFollowDraft({ ...follow, manualFollowDayCap: value })} /><NumberField label="Manual follow cap/session" value={follow.manualFollowSessionCap} onChange={(value) => setFollowDraft({ ...follow, manualFollowSessionCap: value })} /><Field label="Source of truth" value="package summary + account settings + warmup projection" /></Section>
        <Section title="Warmup" badge={follow.warmupStatus} tone={statusTone(follow.warmupStatus)}><EditableToggleLine label="Warmup enabled" checked={follow.warmupEnabled} onChange={(checked) => setFollowDraft({ ...follow, warmupEnabled: checked })} /><Field label="Warmup day" value={follow.warmupDay} /><Field label="Package/service start date" value={follow.packageStartedAt || "Pending operator start date"} /><NumberField label="Day 1 follow cap" value={follow.day1FollowCap} max={10} onChange={(value) => setFollowDraft({ ...follow, day1FollowCap: value })} /><NumberField label="Day 2 follow cap" value={follow.day2FollowCap} max={20} onChange={(value) => setFollowDraft({ ...follow, day2FollowCap: value })} /><NumberField label="Day 3 follow cap" value={follow.day3FollowCap} max={40} onChange={(value) => setFollowDraft({ ...follow, day3FollowCap: value })} /><NumberField label="Day 4+ follow cap" value={follow.day4PlusFollowCap} max={follow.packageFollowDayCap} onChange={(value) => setFollowDraft({ ...follow, day4PlusFollowCap: value })} /><Field label="Effective warmup cap today" value={follow.effectiveWarmupCapToday} /></Section>
        <Section title="Legacy behavior preview" badge="Not Follow save" tone="warning"><p className="muted">These toggles exist in legacy settings/runtime defaults, but they are not part of the visible admin Follow save grid audited for this tab.</p><ToggleLine label="Do follows first" checked={follow.doFollowsFirst} /><ToggleLine label="Mute after follow" checked={follow.muteAfterFollow} /><ToggleLine label="End if limit reached" checked={follow.endIfLimitReached} /><ToggleLine label="Turn off follow" checked={follow.turnOffFollow} /></Section>
        <Section title="Safety / validation" badge={followError ? "Blocked" : followDirty ? "Ready" : "No changes"} tone={followError ? "warning" : followDirty ? "success" : "neutral"} full><Field label="Validation" value={followError || "Follow draft is valid."} /><Field label="Save state" value={followDirty ? "Changed from loaded settings" : "No changes"} /><Field label="Admin endpoint" value="/api/instagram-dashboard/settings" mono /></Section>
        <FollowPayloadPreview payload={followPayload} />
      </div> : null}

      {activeTab === "DM" ? <div className="settings-grid">
        <Section title="DM summary" badge={dmError ? "Blocked" : dmDirty ? "Ready" : "No changes"} tone={dmError ? "warning" : dmDirty ? "success" : "neutral"} full>
          <Field label="Welcome service" value={dm.welcomeServiceActive ? "Service active" : dm.welcomeDisabledReason || "Service inactive"} />
          <Field label="Outreach service" value={dm.outreachServiceActive ? "Service active" : dm.outreachDisabledReason || "Service inactive"} />
          <Field label="Welcome entitlement" value={dm.welcomeEntitlementStatus} />
          <Field label="Outreach entitlement" value={dm.outreachEntitlementStatus} />
          <Field label="Legacy DM gate" value={dm.legacyDmGateStatus} />
          <Field label="Validation" value={dmError || "DM draft is valid."} />
        </Section>
        <Section title="Welcome DM" badge={dm.welcomeServiceActive ? "Service active" : "Service inactive"} tone={dm.welcomeServiceActive ? "success" : "warning"}>
          {!dm.welcomeServiceActive && dm.welcomeDisabledReason ? <p className="muted">{dm.welcomeDisabledReason}</p> : null}
          <EditableToggleLine label="Welcome DM enabled" checked={dm.welcomeDmEnabled} disabled={!dm.welcomeServiceActive} onChange={(checked) => setDmDraft({ ...dm, welcomeDmEnabled: checked })} />
          <NumberField label="Welcome cap/session" value={dm.welcomeSessionCap} disabled={!dm.welcomeServiceActive} onChange={(value) => setDmDraft({ ...dm, welcomeSessionCap: value })} />
          <NumberField label="Welcome day cap" value={dm.welcomeDayCap} max={WELCOME_DAY_CAP_MAX} disabled={!dm.welcomeServiceActive} onChange={(value) => setDmDraft({ ...dm, welcomeDayCap: value })} />
          <Field label="Template status" value={dm.welcomeTemplateStatus} />
          <Field label="Real-send status" value={dm.welcomeRealSendStatus} />
        </Section>
        <Section title="Welcome message" badge={`${normalizeDmMessage(dm.welcomeDmBody).length}/${DM_MAX_CHARS}`} tone="info" full>
          <TextAreaField label="Welcome DM message" value={dm.welcomeDmBody} disabled={!dm.welcomeServiceActive} onChange={(value) => setDmDraft({ ...dm, welcomeDmBody: value })} />
          <DmVariableChips disabled={!dm.welcomeServiceActive} onInsert={(token) => setDmDraft({ ...dm, welcomeDmBody: appendDmVariable(dm.welcomeDmBody, token) })} />
          <DmPreview label="Welcome" value={dm.welcomeDmBody} />
        </Section>
        <Section title="Cold DM Outreach" badge={dm.outreachServiceActive ? "Service active" : "Service inactive"} tone={dm.outreachServiceActive ? "success" : "warning"}>
          {!dm.outreachServiceActive && dm.outreachDisabledReason ? <p className="muted">{dm.outreachDisabledReason}</p> : null}
          <EditableToggleLine label="Outreach enabled" checked={dm.coldDmEnabled} disabled={!dm.outreachServiceActive} onChange={(checked) => setDmDraft({ ...dm, coldDmEnabled: checked })} />
          <NumberField label="Outreach session cap" value={dm.outreachSessionCap} disabled={!dm.outreachServiceActive} onChange={(value) => setDmDraft({ ...dm, outreachSessionCap: value })} />
          <NumberField label="Outreach day cap" value={dm.outreachDayCap} max={OUTREACH_DAY_CAP_MAX} disabled={!dm.outreachServiceActive} onChange={(value) => setDmDraft({ ...dm, outreachDayCap: value })} />
          <Field label="Entitlement" value={dm.outreachEntitlementStatus} />
          <Field label="Template status" value={dm.outreachTemplateStatus} />
          <Field label="Real-send status" value={dm.outreachRealSendStatus} />
        </Section>
        <Section title="Outreach message" badge={`${normalizeDmMessage(dm.coldDmBody).length}/${DM_MAX_CHARS}`} tone="info" full>
          <TextAreaField label="Outreach DM message" value={dm.coldDmBody} disabled={!dm.outreachServiceActive} onChange={(value) => setDmDraft({ ...dm, coldDmBody: value })} />
          <DmVariableChips disabled={!dm.outreachServiceActive} onInsert={(token) => setDmDraft({ ...dm, coldDmBody: appendDmVariable(dm.coldDmBody, token) })} />
          <DmPreview label="Outreach" value={dm.coldDmBody} />
        </Section>
        <Section title="AI / prompt" badge="Read-only" tone="warning" full><p className="muted">The audited admin DM panel does not expose a separate AI comment save flow in this tab. BotApp keeps the legacy prompt visible as read-only context only.</p><textarea className="input settings-textarea" readOnly value={dm.aiCommentPrompt} /></Section>
        <DmPayloadPreview payload={dmPayload} />
      </div> : null}

      {activeTab === "Followback" ? <div className="settings-grid">
        <Section title="Followback summary" badge={followback.limitingReason} tone={statusTone(followback.limitingReason)} full>
          <Field label="Unfollow enabled" value={followback.unfollowEnabled ? "enabled" : "disabled"} />
          <Field label="Effective cap now" value={followback.effectiveUnfollowLimit} mono />
          <Field label="Unfollowed today" value={followback.unfollowedToday} />
          <Field label="Remaining today" value={followback.unfollowDayRemaining ?? "Unknown"} />
          <Field label="Followback ratio summary" value={followback.followbackRatioSummary} />
          <Field label="Block reason" value={followback.blockReason || "None"} />
        </Section>
        <Section title="Unfollow limits" badge="Editable admin caps" tone="info">
          <EditableToggleLine label="Unfollow enabled" checked={followback.unfollowEnabled} onChange={(checked) => setFollowbackDraft({ ...followback, unfollowEnabled: checked })} />
          <NumberField label="Unfollow cap/session" value={followback.unfollowPerSession} onChange={(value) => setFollowbackDraft({ ...followback, unfollowPerSession: value })} />
          <NumberField label="Unfollow cap/day" value={followback.unfollowPerDay} onChange={(value) => setFollowbackDraft({ ...followback, unfollowPerDay: value })} />
          <Field label="Package unfollow cap/day" value={followback.packageUnfollowDayCap} />
          <Field label="Runtime cap source" value={followback.runtimeCapSource} />
        </Section>
        <Section title="Delay / strategy" badge={followback.currentRuntimeMode} tone="info">
          <NumberField label="Unfollow delay days" value={followback.unfollowAfterDays} onChange={(value) => setFollowbackDraft({ ...followback, unfollowAfterDays: value })} />
          <SelectField
            label="Unfollow mode"
            value={followback.unfollowMode}
            options={["unfollow", "unfollow-any", "unfollow-non-followers"]}
            disabledOptions={["unfollow-non-followers"]}
            optionLabels={{ unfollow: "Standard Unfollow · Default", "unfollow-any": "Unfollow any", "unfollow-non-followers": "Unfollow non-followers · Coming later" }}
            onChange={(value) => setFollowbackDraft({ ...followback, unfollowMode: value, unfollowSort: value })}
          />
          <Field label="Safe candidate strategy" value={followback.safeCandidateStrategyStatus} />
          <Field label="Handoff status" value={followback.handoffStatus} />
        </Section>
        <Section title="Safety / source of truth" badge={followbackError ? "Blocked" : followbackDirty ? "Ready" : "No changes"} tone={followbackError ? "warning" : followbackDirty ? "success" : "neutral"}>
          <SelectField
            label="Runtime cap mode"
            value={followback.runtimeCapMode}
            options={["prod_normal", "mini_run", "incident_safety"]}
            optionLabels={{ prod_normal: "Production normal", mini_run: "Mini run", incident_safety: "Incident safety" }}
            onChange={(value) => setFollowbackDraft({ ...followback, runtimeCapMode: value, runtimeSafetyCap: value === "prod_normal" ? null : followback.runtimeSafetyCap ?? 1 })}
          />
          <NumberField label="Runtime safety cap" value={followback.runtimeSafetyCap ?? 0} disabled={followback.runtimeCapMode === "prod_normal"} onChange={(value) => setFollowbackDraft({ ...followback, runtimeSafetyCap: value })} />
          <Field label="Runtime hard cap" value={followback.runtimeHardCap || "not active"} />
          <Field label="Follow entitlement" value={followback.followEntitlementStatus} />
          <Field label="Unfollow entitlement" value={followback.unfollowEntitlementStatus} />
          <Field label="Validation" value={followbackError || "Followback draft is valid."} />
        </Section>
        <FollowbackPayloadPreview payload={followbackPayload} />
      </div> : null}

      {activeTab === "Sources" ? <div className="settings-grid">
        <Section title="Sources summary" badge={sources.sourceHealth} tone={sources.sourceHealth === "healthy" ? "success" : sources.sourceHealth === "review" ? "warning" : "neutral"} full>
          <Field label="Current Follow runtime" value={sources.mainSource} />
          <Field label="Next target probable" value={sources.nextTargetProbable} mono />
          <Field label="Active targets" value={sources.activeTargetsCount} />
          <Field label="Eligible targets" value={sources.eligibleTargetsCount} />
          <Field label="Rejected / archived" value={`${sources.rejectedTargetsCount} rejected · ${sources.archivedTargetsCount} archived`} />
          <Field label="Source note" value={sources.note} />
        </Section>
        <Section title="Source policy" badge={sources.saveReady ? "Save ready" : "Schema pending"} tone={sources.saveReady ? "success" : "warning"}>
          <p className="muted">Per-run controls only. Global Follow caps still apply.</p>
          <NumberField label="Max follows per target per run" value={sources.maxFollowsPerTargetPerRun} min={sources.bounds.maxFollowsPerTargetPerRun.min} max={sources.bounds.maxFollowsPerTargetPerRun.max} disabled={!sources.saveReady} onChange={(value) => setSourcesDraft({ ...sources, maxFollowsPerTargetPerRun: value })} />
          <NumberField label="Max targets per run" value={sources.maxTargetsPerRun} min={sources.bounds.maxTargetsPerRun.min} max={sources.bounds.maxTargetsPerRun.max} disabled={!sources.saveReady} onChange={(value) => setSourcesDraft({ ...sources, maxTargetsPerRun: value })} />
          <Field label="Rotation settings source" value={sources.sourceStatus.replaceAll("_", " ")} />
          <Field label="Runtime status" value={sources.runtimeStatus} />
        </Section>
        <Section title="Target accounts / Sources" badge="Managed in Targets" tone="info">
          <Field label="Total target accounts" value={sources.totalTargetsCount} />
          <Field label="Pending / queued" value={sources.pendingTargetsCount} />
          <Field label="Source groups" value={sources.sourceGroups} />
          <Field label="Target account refs" value={sources.targetAccountRefs} />
          <Field label="CT quality summary" value={sources.ctQualitySummary} />
          <Button variant="ghost" onClick={onOpenTargets ?? onConfirm}>Open Targets drawer</Button>
        </Section>
        <Section title="Followback ratio / Target performance" badge="Read-only metrics" tone="info">
          <Field label="Followback ratio by target" value={sources.followbackRatioByTarget} />
          <Field label="Follows sent by target" value={sources.followsSentByTarget} />
          <Field label="Insufficient data" value={sources.insufficientDataTargets || "none"} />
          <Field label="Pending runtime data" value={sources.pendingRuntimeTargets || "none"} />
          <Field label="Recently exhausted" value={sources.recentlyExhaustedTargets || "none"} />
        </Section>
        <Section title="Sync / readiness" badge={sources.syncReadiness} tone={sources.syncReadiness === "ready" ? "success" : "warning"} full>
          <Field label="Admin sync" value={sources.adminSyncStatus} />
          <Field label="Client sync" value={sources.clientSyncStatus} />
          <Field label="BotApp sync" value={sources.botAppSyncStatus} />
          <Field label="Last refresh" value={sources.lastRefreshLabel} />
          <Field label="Validation" value={sourcesError || "Sources draft is valid."} />
        </Section>
        <SourcesPayloadPreview payload={sourcesPayload} />
      </div> : null}

      {activeTab === "Filters" ? <FilterSettingsPanel profile={profile} filters={filters} validationError={filtersError} onChange={setFiltersDraft} /> : null}
    </Drawer>
  );
}
