import { useEffect, useMemo, useState } from "react";
import type { BotAppDispatcherHealth, BotProfile, DeviceProfileGroup, ProfileAutoLoginState, ProfileToolbarAction } from "../../api/types";
import { Badge, Button, Card, Modal, type BadgeTone } from "../../design/components";
import type { DeviceViewState } from "../../desktop/device-views";
import { focusDeviceView, listOpenDeviceViews, openDeviceView, subscribeDeviceViewState } from "../../desktop/device-views";
import { ProfileToolbar } from "./ProfileToolbar";
import { StatsDrawer } from "./drawers/StatsDrawer";
import { LogsDrawer } from "./drawers/LogsDrawer";
import { TargetsDrawer } from "./drawers/TargetsDrawer";
import { SettingsDrawer } from "./drawers/SettingsDrawer";
import { FiltersDrawer } from "./drawers/FiltersDrawer";
import { AddProfileDrawer } from "./drawers/AddProfileDrawer";
import { resolveAddProfileCredentialsState } from "./add-profile-credentials";
import { AutoLoginFlowModal } from "./AutoLoginFlowModal";
import { buildAssignNowPayload, createAssignNowState } from "./assign-now-flow";
import { autoLoginLogEntry, autoLoginStateFromStartResult, buildAutoLoginPayload, createAutoLoginStartingState, mergeAutoLoginProgressSnapshot, sanitizeAutoLoginText } from "./auto-login-flow";
import { createArchiveState, createDeleteState, lifecycleWarning } from "./lifecycle-flow";
import { buildReadinessNowPayload, createReadinessNowState } from "./readiness-now-flow";
import { buildRestoreLoginScreenPayload } from "./restore-login-screen-flow";
import { buildStartPayload, buildStopPayload, displayCounterMetrics, displayRunCounters, resolveDeviceRuntimeStatus, runtimeIndicatorState } from "./run-control";
import { mergeGroupedProfiles } from "./profiles-live-merge";
import { socialBadge, socialBlockLabel } from "./profile-growth-badge";
import "./profiles.css";

type DrawerKind = "stats" | "logs" | "targets" | "settings" | "filters";
type ConfirmKind = "play" | "auto_login" | "restore_login_screen" | "check_readiness" | "assign_now" | "archive" | "delete" | "restore" | "stop";
type LifecycleFilter = "active" | "archived" | "bin";

function PlatformLogo({ platform }: { platform: BotProfile["platform"] }) {
  const label = platform === "Instagram" ? "Instagram" : "TikTok";
  if (platform === "Instagram") {
    return (
      <span className="platform-logo platform-logo-instagram" aria-label={label} title={label}>
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <rect x="3" y="3" width="12" height="12" rx="4" />
          <circle cx="9" cy="9" r="3" />
          <circle cx="12.8" cy="5.3" r="0.9" />
        </svg>
      </span>
    );
  }
  return (
    <span className="platform-logo platform-logo-tiktok" aria-label={label} title={label}>
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <path d="M10.6 3.2c.5 2 1.8 3.2 3.6 3.4v2.5c-1.3 0-2.4-.4-3.3-1.1v4.2c0 2.2-1.5 3.8-3.7 3.8-2 0-3.5-1.3-3.5-3.2 0-2 1.6-3.3 3.7-3.3.3 0 .6 0 .8.1v2.5a2 2 0 0 0-.8-.2c-.7 0-1.2.4-1.2 1s.5 1 1.1 1c.8 0 1.2-.5 1.2-1.5V3.2h2.1z" />
      </svg>
    </span>
  );
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function normalizePlatform(value: string | undefined) {
  return /tiktok/i.test(String(value || "")) ? "TikTok" : "Instagram";
}

function profileLifecycle(profile: BotProfile): LifecycleFilter {
  if (
    profile.lifecycleStatus === "trashed"
    || profile.lifecycleStatus === "deleted"
    || profile.status === "trashed"
    || profile.trashedAt
  ) return "bin";
  if (
    profile.lifecycleStatus === "archived"
    || profile.status === "archived"
    || profile.archivedAt
  ) return "archived";
  return "active";
}

function appInstanceTag(profile: BotProfile) {
  const index = profile.appInstanceIndex ?? profile.cloneIndex;
  if (typeof index !== "number" || !Number.isFinite(index) || index < 0) return "";
  if (index === 0) return "P";
  return String(index);
}

function formatRestoreDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function buildFallbackGroups(profiles: BotProfile[]): DeviceProfileGroup[] {
  if (!profiles.length) return [];
  return [{
    deviceId: "unassigned-live-profiles",
    deviceLabel: "Unassigned / backend profiles",
    deviceSerial: "",
    deviceSerialLabel: "No device",
    deviceStatus: "maintenance",
    phoneStatus: "idle",
    deviceView: {
      available: false,
      unavailableReason: "No ADB serial is attached to this backend account row.",
    },
    summary: {
      total: profiles.length,
      normal: profiles.filter((profile) => profile.planType === "normal").length,
      dual: profiles.filter((profile) => profile.planType === "dual").length,
      other: profiles.filter((profile) => profile.planType === "other").length,
    },
    profiles,
  }];
}

function mergeProfileGroups(groups: DeviceProfileGroup[], profiles: BotProfile[]) {
  const refreshedGroups = mergeGroupedProfiles(groups, profiles);
  const groupedCount = refreshedGroups.reduce((total, group) => total + group.profiles.length, 0);
  if (groupedCount >= profiles.length) return refreshedGroups;
  const groupedIds = new Set(refreshedGroups.flatMap((group) => group.profiles.map((profile) => profile.id)));
  const missing = profiles.filter((profile) => !groupedIds.has(profile.id));
  if (!missing.length) return refreshedGroups;
  const unassigned = refreshedGroups.find((group) => group.deviceId === "unassigned-live-profiles");
  if (unassigned) {
    return refreshedGroups.map((group) => group.deviceId === "unassigned-live-profiles"
      ? { ...group, profiles: [...group.profiles, ...missing], summary: { ...group.summary, total: group.profiles.length + missing.length } }
      : group);
  }
  return [...refreshedGroups, ...buildFallbackGroups(missing)];
}

function profileMatchesSearch(profile: BotProfile, group: DeviceProfileGroup, query: string) {
  const platformShort = profile.platform === "Instagram" ? "ig" : "tt";
  const groupText = [
    group.deviceLabel,
    group.deviceSerial,
    group.phoneStatus,
    group.deviceId,
  ].join(" ");
  const profileText = [
    profile.username,
    profile.displayName,
    profile.clientName,
    profile.package,
    profile.activeWindow,
    profile.deviceName,
    profile.platform,
    platformShort,
    profile.status,
    profile.readiness,
    profile.eligibility,
    profile.eligibilityDetail.reason_label,
    appInstanceTag(profile),
    profile.appInstanceLabel,
    profile.lifecycleStatus,
  ].join(" ");
  return normalizeSearch(`${groupText} ${profileText}`).includes(query);
}

function groupMatchesSearch(group: DeviceProfileGroup, query: string) {
  return normalizeSearch([
    group.deviceLabel,
    group.deviceSerial,
    group.phoneStatus,
    group.deviceId,
  ].join(" ")).includes(query);
}

function summarizeProfiles(profiles: BotProfile[]): DeviceProfileGroup["summary"] {
  return {
    total: profiles.length,
    normal: profiles.filter((profile) => profile.planType === "normal").length,
    dual: profiles.filter((profile) => profile.planType === "dual").length,
    other: profiles.filter((profile) => profile.planType === "other").length,
  };
}

function phoneGroupSummaryLabel(group: DeviceProfileGroup) {
  const total = group.summary.total;
  const running = group.profiles.filter((profile) => runtimeIndicatorState(profile) === "active").length;
  if (running > 0) return `${total} profiles · ${running} active`;
  if (group.phoneStatus === "running" || group.phoneStatus === "active") return `${total} profiles · ready`;
  return `${total} profiles · idle`;
}

function phoneStatusTone(status: DeviceProfileGroup["phoneStatus"]) {
  if (status === "running" || status === "active") return "success" as const;
  if (status === "inactive") return "neutral" as const;
  return "warning" as const;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.7 8s2.2-4 6.3-4 6.3 4 6.3 4-2.2 4-6.3 4-6.3-4-6.3-4z" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}

function AndroidViewIcon() {
  return (
    <span className="phone-view-android" aria-hidden="true">
      <span />
    </span>
  );
}

function phoneViewTooltip(group: DeviceProfileGroup, isOpen: boolean) {
  if (!group.deviceView.available) return group.deviceView.unavailableReason || "Phone unavailable.";
  return isOpen ? "Focus phone view" : "Open phone view";
}

function CounterMetric({ current, max, label }: { current: number; max: number; label: string }) {
  return (
    <span>
      <strong className="counter-current">{Number.isFinite(current) ? current : "—"}</strong>
      {Number.isFinite(max) ? <><span className="counter-cap">/{max}</span> {label}</> : <> {label}</>}
    </span>
  );
}

function followerDeltaLabel(value: number | null) {
  if (value === null) return "—";
  if (value > 0) return `+${value}`;
  return String(value);
}

function followerDeltaTone(value: number | null) {
  if (value === null) return "unknown";
  if (value > 0) return "up";
  if (value === 0) return "zero";
  return "down";
}

function connectBadge(profile: BotProfile): { label: string; tone: BadgeTone } {
  if (profile.loginStatus === "connected") return { label: "connected", tone: "success" };
  if (profile.credentialStatus === "saved_pending_verification") return { label: "ready to connect", tone: "info" };
  if (profile.credentialStatus === "active" && profile.autoLoginRequirement.enabled) return { label: "ready to connect", tone: "info" };
  if (profile.credentialStatus === "missing" || profile.loginStatus === "missing_credentials") return { label: "missing credentials", tone: "warning" };
  if (profile.credentialStatus === "needs_update" || profile.loginStatus === "password_invalid") return { label: "update password", tone: "error" };
  if (profile.loginStatus === "needs_2fa" || profile.loginStatus === "challenge_required" || profile.loginStatus === "checkpoint") return { label: "action required", tone: "warning" };
  if (profile.loginStatus === "logged_out" || profile.readiness === "needs_login") return { label: "login pending", tone: "warning" };
  return { label: "login pending", tone: "neutral" };
}

export { socialBadge, socialBlockLabel } from "./profile-growth-badge";

function AccountRow({
  profile,
  onSelect,
  onToolbar,
}: {
  profile: BotProfile;
  onSelect: (id: string) => void;
  onToolbar: (profile: BotProfile, action: ProfileToolbarAction) => void;
}) {
  const followerDelta3dValue = profile.followerDelta3d?.value ?? null;
  const displayCounters = displayRunCounters(profile);
  const counterMetrics = displayCounterMetrics(profile);
  const interactionsToday = displayCounters.total;
  const loginBadge = connectBadge(profile);
  const growthBadge = socialBadge(profile);
  const instanceTag = appInstanceTag(profile);
  const lifecycle = profileLifecycle(profile);
  const restoreDate = formatRestoreDate(profile.scheduledDeleteAt || profile.scheduledTrashAt);
  const runtimeState = runtimeIndicatorState(profile);
  const runtimeTitle = runtimeState === "active"
    ? "Runtime active: queued, claimed, running, stopping, or canceling."
    : runtimeState === "error"
      ? `Last run abnormal: ${profile.runtimeIndicator?.reason || "abnormal_run"}`
      : "Runtime idle: no active run and last run normal.";
  return (
    <div className="profile-account-row">
      <span className={`profile-dot runtime-${runtimeState}`} title={runtimeTitle} aria-label={runtimeTitle} />

      <div className="profile-name-cell">
        <button className="link-button profile-username" onClick={() => onSelect(profile.id)}>{profile.username}</button>
        <div className="profile-badges">
          <Badge tone={loginBadge.tone}>{loginBadge.label}</Badge>
          <Badge tone={growthBadge.tone}>{growthBadge.label}</Badge>
          {lifecycle === "archived" ? <Badge tone="warning">Archived</Badge> : null}
          {lifecycle === "bin" ? <Badge tone="error">In Bin</Badge> : null}
          {restoreDate ? <Badge tone="neutral">Restore until {restoreDate}</Badge> : null}
        </div>
      </div>

      <div className="profile-client-cell">
        <div className="profile-platform-index">
          <PlatformLogo platform={profile.platform} />
          <span className="profile-index mono" title={profile.appInstanceLabel ?? "No app instance"}>{instanceTag || "—"}</span>
        </div>
        <div className="profile-owner-cell">
          <strong title={profile.displayName}>{profile.displayName}</strong>
          <span title={profile.package || "Package unknown"}>{profile.package || "Package unknown"}</span>
        </div>
      </div>

      <div className="profile-session">
        <span className={`session-dot ${profile.lastSessionAt ? "ok" : "idle"}`} />
        <span className="mono">{profile.lastSessionAt ?? "No session yet"}</span>
      </div>

      <span className="timeslot-pill mono">{profile.activeWindow}</span>

      <div className="profile-counters mono">
        {counterMetrics.map((metric) => (
          <CounterMetric key={metric.key} current={metric.current} max={metric.max} label={metric.label} />
        ))}
      </div>

      <div className="profile-row-metrics">
        <span
          className={`delta-pill ${followerDeltaTone(followerDelta3dValue)}`}
          title={`Followers gain 3d · ${profile.followerDelta3d?.source ?? "pending"}`}
        >
          {followerDeltaLabel(followerDelta3dValue)}
        </span>
        <span
          className={`interactions-today ${interactionsToday > 0 ? "active" : "zero"}`}
          title={displayCounters.mode === "run" ? "Interactions in current run" : "Interactions today"}
        >
          {interactionsToday}
        </span>
      </div>

      <ProfileToolbar profile={profile} onAction={(action) => onToolbar(profile, action)} />
    </div>
  );
}

export function ProfilesView({
  profiles,
  groups,
  dispatcherHealth,
  syncError,
  profilesMeta,
  loading,
  onRefresh,
  onSelect,
  onAction,
  onMockSubmit,
}: {
  profiles: BotProfile[];
  groups: DeviceProfileGroup[];
  dispatcherHealth: BotAppDispatcherHealth | null;
  syncError: string | null;
  profilesMeta: { source: string; accountsCount: number; counts: Record<string, number> } | null;
  loading: boolean;
  onRefresh: () => Promise<void> | void;
  onSelect: (id: string) => void;
  onAction: (action: string, target: string, danger?: boolean) => void;
  onMockSubmit: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [platformFilter, setPlatformFilter] = useState<"All" | "Instagram" | "TikTok">("All");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [drawer, setDrawer] = useState<{ kind: DrawerKind; profile: BotProfile } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: ConfirmKind; profile: BotProfile } | null>(null);
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [stopReason, setStopReason] = useState("");
  const [openDeviceViews, setOpenDeviceViews] = useState<DeviceViewState[]>([]);
  const [phoneViewMessage, setPhoneViewMessage] = useState("");
  const [autoLoginFlow, setAutoLoginFlow] = useState<{ profile: BotProfile; state: ProfileAutoLoginState } | null>(null);
  const [optimisticRunControls, setOptimisticRunControls] = useState<Record<string, {
    requestId: string | null;
    requestStatus: string;
    runId: string | null;
    runStatus: string | null;
    expiresAt: number;
  }>>({});
  const dispatcherBlocksAutoLogin = Boolean(dispatcherHealth && dispatcherHealth.status !== "running");

  useEffect(() => {
    let cancelled = false;
    void listOpenDeviceViews().then((result) => {
      if (!cancelled && result.ok) setOpenDeviceViews(result.data);
    });
    const unsubscribe = subscribeDeviceViewState((state) => {
      if (!cancelled) setOpenDeviceViews(state);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const liveProfiles = useMemo<BotProfile[]>(() => profiles.map((profile): BotProfile => {
    const optimistic = optimisticRunControls[profile.id];
    if (!optimistic || optimistic.expiresAt <= Date.now()) return profile;
    if (profile.activeRunRequestStatus || profile.activeRunStatus || profile.status === "running") return profile;
    return {
      ...profile,
      status: "running" as const,
      activeRunRequestId: optimistic.requestId,
      activeRunRequestStatus: optimistic.requestStatus,
      activeRunId: optimistic.runId,
      activeRunStatus: optimistic.runStatus,
      currentRunCounters: profile.currentRunCounters || {
        follows: 0,
        unfollows: 0,
        likes: 0,
        comments: 0,
        dms: 0,
        stories: 0,
        interactionsTotal: 0,
        source: "botapp_optimistic",
        runId: optimistic.runId,
      },
      runtimeIndicator: {
        state: "active",
        reason: "botapp_optimistic_queued",
        lastRunId: profile.runtimeIndicator?.lastRunId || null,
      },
      eligibility: "blocked_now" as const,
      eligibilityReason: "already_requested",
      eligibilityDetail: {
        ...profile.eligibilityDetail,
        status: "blocked_now",
        primary_block_reason: "already_requested",
        reason_label: "Run requested",
        reason_description: "A manual run has been queued and is waiting for the runtime projection.",
      },
    } as BotProfile;
  }), [profiles, optimisticRunControls]);

  useEffect(() => {
    setOptimisticRunControls((current) => {
      let changed = false;
      const next = { ...current };
      const now = Date.now();
      for (const profile of profiles) {
        if (
          next[profile.id]
          && (next[profile.id].expiresAt <= now || profile.activeRunRequestStatus || profile.activeRunStatus || profile.status === "running")
        ) {
          delete next[profile.id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [profiles]);

  useEffect(() => {
    if (!Object.keys(optimisticRunControls).length) return;
    const interval = window.setInterval(() => {
      void onRefresh();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [optimisticRunControls, onRefresh]);

  const displayGroups = useMemo(() => {
    if (groups.length) return mergeProfileGroups(groups, liveProfiles);
    return buildFallbackGroups(liveProfiles);
  }, [groups, liveProfiles]);

  const filteredGroups = useMemo(() => {
    const query = normalizeSearch(searchTerm);
    return displayGroups
      .map((group) => ({
        ...group,
        profiles: group.profiles.filter((profile) => {
          const platformMatches = platformFilter === "All" || normalizePlatform(profile.platform) === platformFilter;
          const lifecycleMatches = profileLifecycle(profile) === lifecycleFilter;
          if (!platformMatches) return false;
          if (!lifecycleMatches) return false;
          if (!query) return true;
          return groupMatchesSearch(group, query) || profileMatchesSearch(profile, group, query);
        }),
      }))
      .map((group) => ({ ...group, summary: summarizeProfiles(group.profiles) }))
      .filter((group) => group.profiles.length > 0);
  }, [displayGroups, platformFilter, lifecycleFilter, searchTerm]);

  const flattenedProfilesCount = displayGroups.reduce((total, group) => total + group.profiles.length, 0);
  const filteredProfilesCount = filteredGroups.reduce((total, group) => total + group.profiles.length, 0);
  const hasActiveSearch = normalizeSearch(searchTerm).length > 0;
  const hasActivePlatformFilter = platformFilter !== "All";
  const hasActiveLifecycleFilter = lifecycleFilter !== "active";
  const emptyStateType = loading
    ? "loading"
    : syncError
      ? "relay_error"
      : liveProfiles.length === 0
        ? "no_backend_accounts"
          : filteredProfilesCount === 0 && (hasActiveSearch || hasActivePlatformFilter || hasActiveLifecycleFilter)
          ? "filter_no_match"
          : filteredProfilesCount === 0
            ? "grouping_empty"
            : "has_profiles";

  useEffect(() => {
    console.info("[botapp] profiles_renderer_state", {
      patch: "manage-sync-v1",
      profileGroupsLength: groups.length,
      profilesLength: profiles.length,
      flattenedProfilesCount,
      filteredGroupsLength: filteredGroups.length,
      filteredProfilesCount,
      selectedPlatform: platformFilter,
      selectedLifecycle: lifecycleFilter,
      searchQuery: searchTerm,
      profilesMetaAccountsCount: profilesMeta?.accountsCount ?? null,
      profilesMetaSource: profilesMeta?.source ?? null,
      syncErrorPresent: Boolean(syncError),
      emptyStateType,
    });
  }, [groups.length, liveProfiles.length, flattenedProfilesCount, filteredGroups.length, filteredProfilesCount, platformFilter, lifecycleFilter, searchTerm, profilesMeta, syncError, emptyStateType]);

  useEffect(() => {
    if (!autoLoginFlow) return;
    const progress = window.botappDesktop?.profiles?.runProgress;
    if (!progress) return;

    const accountId = autoLoginFlow.profile.id;
    const requestId = autoLoginFlow.state.requestId;
    let cancelled = false;

    const pollProgress = async () => {
      const result = await progress({ accountId, requestId });
      if (cancelled || !result.ok || !result.data) return;
      const snapshot = result.data;
      setAutoLoginFlow((latest) => {
        if (!latest || latest.profile.id !== accountId) return latest;
        return {
          profile: latest.profile,
          state: mergeAutoLoginProgressSnapshot(latest.state, snapshot),
        };
      });
    };

    void pollProgress();
    const interval = window.setInterval(() => {
      void pollProgress();
    }, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [autoLoginFlow?.profile.id, autoLoginFlow?.state.requestId]);

  const sourceLabel = `Profiles patch active: manage-sync-v1 · ${
    profilesMeta
      ? `Source: Shared backend API · ${profilesMeta.accountsCount} account${profilesMeta.accountsCount === 1 ? "" : "s"} (${profilesMeta.source})`
      : liveProfiles.length
        ? `Source: Shared backend API · ${liveProfiles.length} account${liveProfiles.length === 1 ? "" : "s"}`
        : "Source: Shared backend API · 0 accounts"
  }`;

  function handleToolbar(profile: BotProfile, action: ProfileToolbarAction) {
    if (action === "play" || action === "auto_login" || action === "restore_login_screen" || action === "check_readiness" || action === "assign_now" || action === "archive" || action === "delete" || action === "restore" || action === "stop") {
      if (action === "stop") setStopReason("");
      setConfirmAction({ kind: action, profile });
      return;
    }
    if (action === "targets") {
      setDrawer({ kind: "targets", profile });
      return;
    }
    setDrawer({ kind: action, profile });
  }

  async function handlePhoneView(group: DeviceProfileGroup) {
    setPhoneViewMessage("");
    if (!group.deviceView.available) {
      setPhoneViewMessage(group.deviceView.unavailableReason || "Phone unavailable.");
      return;
    }

    const wasOpen = openDeviceViews.some((view) => view.deviceSerial === group.deviceSerial);
    const result = await openDeviceView({
      deviceSerial: group.deviceSerial,
      deviceLabel: group.deviceLabel,
    });
    if (result.ok) {
      setOpenDeviceViews(result.data);
      onMockSubmit(wasOpen ? `Focused ${group.deviceLabel} phone view.` : `Opened ${group.deviceLabel} phone view.`);
      return;
    }
    setPhoneViewMessage(result.error || "Could not open phone view.");
  }

  async function openPhoneForProfile(profile: BotProfile) {
    const group = displayGroups.find((item) => item.deviceId === profile.deviceId || item.profiles.some((candidate) => candidate.id === profile.id));
    if (!group) {
      setPhoneViewMessage("No assigned phone group found for this profile.");
      return;
    }
    await handlePhoneView(group);
  }

  async function handleOpenViewDockClick(view: DeviceViewState) {
    const result = await focusDeviceView(view.deviceSerial);
    if (result.ok) {
      setOpenDeviceViews(result.data);
      return;
    }
    setPhoneViewMessage(result.error || "Could not focus phone view.");
  }

  function mockSave(label: string, tone?: "success" | "error" | "info") {
    if (tone) {
      onMockSubmit(label, tone);
      if (tone === "success") setDrawer(null);
      return;
    }
    onAction(label, drawer?.profile.username ?? "profile", false);
    setDrawer(null);
  }

  async function performSafeAccountAction(profile: BotProfile, action: "start" | "stop" | "archive" | "trash" | "restore", reason: string) {
    const perform = window.botappDesktop?.profiles?.actions?.perform;
    if (!perform) {
      onMockSubmit(`${action} backend relay unavailable in this runtime.`);
      return;
    }
    const result = await perform({ accountId: profile.id, action, reason });
    if (!result.ok) {
      onMockSubmit(result.error || `${action} account action failed.`);
      return;
    }
    const data = (result.data ?? {}) as Record<string, unknown>;
    onMockSubmit(`${action} account OK: ${String(data.status_before || "unknown")} → ${String(data.status_after || "unknown")} · run=${String(data.run_started ?? false)}.`);
    onRefresh();
  }

  async function startAccountRun(profile: BotProfile) {
    const startRun = window.botappDesktop?.profiles?.startRun;
    if (!startRun) {
      onMockSubmit("Run start relay unavailable in this runtime.", "error");
      return;
    }
    const result = await startRun({ accountId: profile.id, username: profile.username });
    if (!result.ok) {
      onMockSubmit(result.error || "Run start failed.", "error");
      return;
    }
    const data = (result.data ?? {}) as Record<string, unknown>;
    const requestId = String(data.request_id || "").slice(0, 8);
    const status = String(data.status || "queued");
    const runType = String(data.requested_run_type || "account_session");
    setOptimisticRunControls((current) => ({
      ...current,
      [profile.id]: {
        requestId: String(data.request_id || "") || null,
        requestStatus: status,
        runId: String(data.run_id || "") || null,
        runStatus: String(data.run_status || "") || null,
        expiresAt: Date.now() + 120000,
      },
    }));
    onMockSubmit(`Run queued: ${runType} · request=${requestId || "created"} · status=${status}.`, "success");
    onRefresh();
  }

  async function stopAccountRun(profile: BotProfile, reason: string) {
    const stopRun = window.botappDesktop?.profiles?.stopRun;
    if (!stopRun) {
      onMockSubmit("Run stop relay unavailable in this runtime.", "error");
      return;
    }
    const result = await stopRun({ accountId: profile.id, reason });
    if (!result.ok) {
      onMockSubmit(result.error || "Run stop failed.", "error");
      return;
    }
    const data = (result.data ?? {}) as Record<string, unknown>;
    onMockSubmit(`Run stop: ${String(data.message || "stop requested")} · canceled=${String(data.canceled_request ?? false)} · stopped=${String(data.stopped ?? false)}.`, "success");
    onRefresh();
  }

  async function assignProfileNow(profile: BotProfile) {
    const assignNow = window.botappDesktop?.profiles?.assignNow;
    if (!assignNow) {
      onMockSubmit("Assign Now backend relay unavailable in this runtime.");
      return;
    }
    const result = await assignNow({ accountId: profile.id });
    if (!result.ok) {
      onMockSubmit(result.error || "Assign Now failed.");
      return;
    }
    const data = (result.data ?? {}) as Record<string, unknown>;
    onMockSubmit(`Assign Now: ${String(data.status || "unknown")} · ${String(data.reason || "no_reason")} · run=${String(data.run_started ?? false)}.`);
    onRefresh();
  }

  async function checkReadinessNow(profile: BotProfile) {
    const readinessNow = window.botappDesktop?.profiles?.readinessNow;
    if (!readinessNow) {
      onMockSubmit("Refresh readiness relay unavailable in this runtime.", "error");
      return;
    }
    const result = await readinessNow({ accountId: profile.id });
    if (!result.ok) {
      onMockSubmit(result.error || "Refresh readiness failed.", "error");
      return;
    }
    const data = (result.data ?? {}) as Record<string, unknown>;
    const readinessStatus = String(data.readiness_status || "unknown");
    const clientStatus = String(data.client_status || "unknown");
    const reason = String(data.reason || "no_reason");
    const nextAction = String(data.next_action || "none");
    onMockSubmit(`Refresh readiness: ${readinessStatus} · ${clientStatus} · ${reason} · next=${nextAction} · device_run=false.`);
    onRefresh();
  }

  async function startRestoreLoginScreen(profile: BotProfile) {
    const start = window.botappDesktop?.profiles?.restoreLoginScreen;
    if (!start) {
      onMockSubmit("Restore login screen relay unavailable in this runtime.", "error");
      return;
    }
    const payload = buildRestoreLoginScreenPayload(profile);
    const result = await start({ accountId: profile.id, username: profile.username, ...payload });
    if (!result.ok) {
      onMockSubmit(`Restore login screen failed: ${String(result.error || "request_failed")}`, "error");
      return;
    }
    const data = (result.data ?? {}) as Record<string, unknown>;
    onMockSubmit(`Restore login screen queued: request ${String(data.request_id || "").slice(0, 8) || "created"}.`, "success");
    onRefresh();
  }

  async function startAutoLogin(profile: BotProfile) {
    const start = window.botappDesktop?.profiles?.autoLogin;
    const startingState = createAutoLoginStartingState(profile);
    const previousState = autoLoginFlow?.profile.id === profile.id ? autoLoginFlow.state : null;
    const stateWithHistory = previousState
      ? {
        ...startingState,
        processLog: [
          ...previousState.processLog,
          autoLoginLogEntry("REQUEST", "Retry Auto Login requested after previous attempt."),
          ...startingState.processLog,
        ].slice(-80),
      }
      : startingState;
    setAutoLoginFlow({ profile, state: stateWithHistory });
    if (!start) {
      setAutoLoginFlow({ profile, state: { ...stateWithHistory, globalStatus: "failed", safeReason: "BotApp relay unavailable.", processLog: [...stateWithHistory.processLog, autoLoginLogEntry("ERROR", "Auto Login relay unavailable in this runtime.")] } });
      return;
    }
    const result = await start({ accountId: profile.id, username: profile.username });
    if (!result.ok) {
      const reason = sanitizeAutoLoginText(result.error, "Auto Login request failed before the backend returned a reason.");
      setAutoLoginFlow({
        profile,
        state: {
          ...stateWithHistory,
          globalStatus: "failed",
          safeReason: reason,
          nextAction: "retry_auto_login",
          processLog: [
            ...stateWithHistory.processLog,
            autoLoginLogEntry("ERROR", `Auto Login request failed: ${reason}.`),
          ],
          steps: stateWithHistory.steps.map((step) => step.status === "running" || step.id === "result" ? { ...step, status: "failed" } : step),
        },
      });
      onMockSubmit(`Auto Login failed: ${reason}`, "error");
      return;
    }
    const data = (result.data ?? {}) as Record<string, unknown>;
    const nextState = autoLoginStateFromStartResult(profile, data);
    setAutoLoginFlow({
      profile,
      state: previousState ? {
        ...nextState,
        processLog: [
          ...stateWithHistory.processLog,
          autoLoginLogEntry("QUEUE", "Retry request accepted by backend."),
          ...nextState.processLog,
        ].slice(-80),
      } : nextState,
    });
    onMockSubmit(`Auto Login queued: request ${String(data.request_id || "").slice(0, 8) || "created"}.`, "success");
    onRefresh();
  }

  async function stopAutoLogin(profile: BotProfile) {
    const stopRun = window.botappDesktop?.profiles?.stopRun;
    if (!stopRun) {
      onMockSubmit("Run stop relay unavailable in this runtime.", "error");
      return;
    }
    const result = await stopRun({ accountId: profile.id });
    if (!result.ok) {
      onMockSubmit(result.error || "Run stop failed.", "error");
      return;
    }
    setAutoLoginFlow((current) => current && current.profile.id === profile.id ? {
      profile,
      state: {
        ...current.state,
        globalStatus: "stopped",
        processLog: [...current.state.processLog, autoLoginLogEntry("DONE", "Stop requested for active login run/request.")],
      },
    } : current);
    onMockSubmit("Stop requested for Auto Login run/request.", "success");
    onRefresh();
  }

  function executeConfirm(action: { kind: ConfirmKind; profile: BotProfile }) {
    if (action.kind === "play") {
      setConfirmAction(null);
      void startAccountRun(action.profile);
      return;
    }
    if (action.kind === "stop") {
      setConfirmAction(null);
      void stopAccountRun(action.profile, stopReason || "botapp_manual_stop");
      return;
    }
    if (action.kind === "auto_login") {
      if (dispatcherBlocksAutoLogin) {
        onMockSubmit(`Auto Login unavailable: dispatcher is ${dispatcherHealth?.status ?? "unknown"}. Open Runtime Health and resume it first.`, "error");
        setConfirmAction(null);
        return;
      }
      setConfirmAction(null);
      void startAutoLogin(action.profile);
      return;
    }
    if (action.kind === "restore_login_screen") {
      if (dispatcherBlocksAutoLogin) {
        onMockSubmit(`Restore login screen unavailable: dispatcher is ${dispatcherHealth?.status ?? "unknown"}. Open Runtime Health and resume it first.`, "error");
        setConfirmAction(null);
        return;
      }
      setConfirmAction(null);
      void startRestoreLoginScreen(action.profile);
      return;
    }
    if (action.kind === "check_readiness") {
      setConfirmAction(null);
      void checkReadinessNow(action.profile);
      return;
    }
    if (action.kind === "assign_now") {
      setConfirmAction(null);
      void assignProfileNow(action.profile);
      return;
    }
    if (action.kind === "archive") {
      setConfirmAction(null);
      void performSafeAccountAction(action.profile, "archive", "botapp_account_action_archive");
      return;
    }
    if (action.kind === "delete") {
      setConfirmAction(null);
      void performSafeAccountAction(action.profile, "trash", "botapp_account_action_move_to_bin");
      return;
    }
    if (action.kind === "restore") {
      setConfirmAction(null);
      void performSafeAccountAction(action.profile, "restore", "botapp_account_action_restore");
      return;
    }
    const labels: Record<ConfirmKind, string> = {
      play: "Start profile",
      auto_login: "Auto Login",
      restore_login_screen: "Restore login screen",
      check_readiness: "Refresh readiness",
      assign_now: "Assign Now",
      archive: "Archive profile",
      delete: "Delete profile",
      restore: "Restore profile",
      stop: "Stop profile",
    };
    onAction(labels[action.kind], action.profile.username, true);
    setConfirmAction(null);
  }

  return (
    <div className="profiles-screen">
      <Card
        title="Profiles / Accounts"
        subtitle={sourceLabel}
        actions={<>
          <div className="profiles-filters">
            {(["All", "Instagram", "TikTok"] as const).map((item) => (
              <button key={item} type="button" className={platformFilter === item ? "filter-chip active" : "filter-chip"} onClick={() => setPlatformFilter(item)}>{item}</button>
            ))}
          </div>
          <div className="profiles-filters lifecycle-filters">
            {([
              ["active", "Active"],
              ["archived", "Archived"],
              ["bin", "Bin"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" className={lifecycleFilter === id ? "filter-chip active" : "filter-chip"} onClick={() => setLifecycleFilter(id)}>{label}</button>
            ))}
          </div>
          <Button variant="ghost" onClick={onRefresh}>Refresh</Button>
        </>}
      >
        <div className="profiles-search-row">
          <input
            className="input"
            placeholder="Search username, name, package, phone, platform, timeslot"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <Button className="new-profile-button" onClick={() => setAddProfileOpen(true)}>+ New profile</Button>
        </div>
      </Card>

      {openDeviceViews.length ? (
        <div className="phone-view-dock" aria-label="Open phone views">
          <span className="phone-view-dock-label">Open phone views</span>
          {openDeviceViews.map((view) => (
            <button
              key={view.deviceSerial}
              type="button"
              className="phone-view-dock-item"
              onClick={() => void handleOpenViewDockClick(view)}
            >
              <AndroidViewIcon />
              <span>{view.deviceLabel}</span>
            </button>
          ))}
        </div>
      ) : null}

      {phoneViewMessage ? <div className="phone-view-message">{phoneViewMessage}</div> : null}

      {emptyStateType === "loading" ? (
        <div className="empty-state profiles-empty">
          <strong>Loading profiles from shared backend</strong>
          <span>Syncing account list through the backend relay.</span>
        </div>
      ) : emptyStateType === "relay_error" ? (
        <div className="empty-state profiles-empty">
          <strong>Relay error / unable to load backend accounts</strong>
          <span>{syncError}</span>
        </div>
      ) : emptyStateType === "no_backend_accounts" ? (
        <div className="empty-state profiles-empty">
          <strong>No accounts returned from shared backend</strong>
          <span>Check relay URL, relay credential, and deployed backend endpoints.</span>
        </div>
      ) : emptyStateType === "filter_no_match" ? (
        <div className="empty-state profiles-empty">
          <strong>No profiles match this search</strong>
          <span>Try another username, package, phone, platform, status, or timeslot.</span>
        </div>
      ) : emptyStateType === "grouping_empty" ? (
        <div className="empty-state profiles-empty">
          <strong>Accounts loaded but not visible in groups</strong>
          <span>{profiles.length} account(s) received from shared backend. Refresh or check device grouping.</span>
        </div>
      ) : null}

      {filteredGroups.map((group) => (
        <section key={group.deviceId} className="phone-group">
          <header className="phone-group-header">
            <div>
              <strong>{group.deviceLabel} · {group.deviceSerialLabel}</strong>
              {(() => {
                const runtimeStatus = resolveDeviceRuntimeStatus(group.profiles, group.phoneStatus);
                return <Badge tone={phoneStatusTone(runtimeStatus as DeviceProfileGroup["phoneStatus"])}>{runtimeStatus}</Badge>;
              })()}
            </div>
            <div className="phone-group-header-actions">
              <div className="phone-group-summary mono">
                {phoneGroupSummaryLabel(group)}
              </div>
              {(() => {
                const isViewOpen = openDeviceViews.some((view) => view.deviceSerial === group.deviceSerial);
                return (
                  <span className="tooltip-wrap" data-tooltip={phoneViewTooltip(group, isViewOpen)}>
                    <button
                      type="button"
                      className={`phone-view-button${isViewOpen ? " is-open" : ""}`}
                      aria-label={isViewOpen ? "Focus phone view" : "Open phone view"}
                      disabled={!group.deviceView.available}
                      onClick={() => void handlePhoneView(group)}
                    >
                      {isViewOpen ? <AndroidViewIcon /> : <EyeIcon />}
                    </button>
                  </span>
                );
              })()}
            </div>
          </header>
          <div className="phone-group-body">
            {group.profiles.map((profile) => (
              <AccountRow key={profile.id} profile={profile} onSelect={onSelect} onToolbar={handleToolbar} />
            ))}
          </div>
        </section>
      ))}

      {drawer?.kind === "stats" ? <StatsDrawer profile={drawer.profile} onClose={() => setDrawer(null)} onSave={() => mockSave("Save profile stats")} /> : null}
      {drawer?.kind === "logs" ? <LogsDrawer profile={drawer.profile} onClose={() => setDrawer(null)} /> : null}
      {drawer?.kind === "targets" ? <TargetsDrawer profile={drawer.profile} onClose={() => setDrawer(null)} onAction={(label) => mockSave(label)} /> : null}
      {drawer?.kind === "settings" ? (
        <SettingsDrawer
          profile={drawer.profile}
          onClose={() => setDrawer(null)}
          onConfirm={() => mockSave("Save profile settings")}
          onSaved={(message, tone) => mockSave(message, tone)}
          onRefreshProfiles={onRefresh}
          onOpenTargets={() => setDrawer({ kind: "targets", profile: drawer.profile })}
        />
      ) : null}
      {drawer?.kind === "filters" ? <FiltersDrawer profile={drawer.profile} onClose={() => setDrawer(null)} onSave={() => mockSave("Save profile filters")} /> : null}
      {addProfileOpen ? (
        <AddProfileDrawer
          groups={groups}
          onClose={() => setAddProfileOpen(false)}
          onSubmit={async (payload, mode) => {
            const createFn = mode === "create" ? window.botappDesktop?.profiles?.create : window.botappDesktop?.profiles?.createDryRun;
            if (!createFn) {
              const message = mode === "create" ? "Add Profile backend create unavailable in this runtime." : "Add Profile backend dry-run unavailable in this runtime.";
              onMockSubmit(message, "error");
              return { ok: false, message };
            }
            if (mode === "create") {
              console.info("[botapp] profiles_refresh_after_create_started");
            }
            const result = await createFn(payload);
            if (!result.ok) {
              const partial = (result as { partial?: { account_created?: boolean; account_id?: string; assignment_failed?: boolean; credentials_saved?: boolean } }).partial;
              const message = result.error || (mode === "create" ? "Add Profile backend create failed." : "Add Profile backend dry-run failed.");
              if (mode === "create" && partial?.account_created && partial?.account_id) {
                console.info("[botapp] profiles_refresh_after_create_started", { partial: true, account_id: partial.account_id });
                await Promise.resolve(onRefresh());
                console.info("[botapp] profiles_refresh_after_create_ok", { partial: true });
                const partialMessage = partial.credentials_saved === false
                  ? `Account created, but credentials were not saved (${message}). Retry credentials from Settings.`
                  : `Profile created but schedule assignment failed (${message}). Refresh the list and repair schedule from Settings.`;
                onMockSubmit(
                  partialMessage,
                  "error",
                );
                return { ok: false, message: partialMessage, partial: true };
              }
              if (mode === "create") {
                console.info("[botapp] profiles_refresh_after_create_failed", { reason: message });
              }
              onMockSubmit(message, "error");
              return { ok: false, message };
            }
            const account = (result.data?.account ?? {}) as Record<string, unknown>;
            if (mode === "create") {
              console.info("[botapp] profiles_refresh_after_create_started", { account_id: account.id || null });
              await Promise.resolve(onRefresh());
              console.info("[botapp] profiles_refresh_after_create_ok", { count: "refreshed" });
            }
            const resolvedUsername = String(account.username || "unknown");
            const credentialsRequested = Boolean(String(payload.password || "").trim()) || payload.login_method === "credentials";
            const credentialsState = mode === "create"
              ? resolveAddProfileCredentialsState(result.data as Record<string, unknown> | undefined, credentialsRequested, resolvedUsername)
              : null;
            const message = mode === "create"
              ? credentialsState?.footerMessage || `Profile created: @${resolvedUsername}`
              : `Add Profile dry-run OK: @${resolvedUsername} · ${String(account.status || "validated")} · no mutation executed.`;
            onMockSubmit(message, mode === "create" ? (credentialsState?.globalStatus === "partial" ? "error" : "success") : "info");
            return { ok: true, message, data: result.data as Record<string, unknown> | undefined };
          }}
        />
      ) : null}

      {confirmAction ? (
        <Modal
          title={confirmTitle(confirmAction.kind, confirmAction.profile)}
          danger={confirmAction.kind === "delete" || confirmAction.kind === "archive" || confirmAction.kind === "stop" || (confirmAction.kind === "play" && confirmAction.profile.eligibility !== "can_start")}
          confirmLabel={confirmAction.kind === "play" ? "Start" : confirmAction.kind === "stop" ? "Stop" : confirmAction.kind === "auto_login" ? "Confirm Auto Login" : confirmAction.kind === "restore_login_screen" ? "Restore login screen" : confirmAction.kind === "check_readiness" ? "Refresh" : confirmAction.kind === "assign_now" ? "Assign now" : confirmAction.kind === "archive" ? "Confirm archive" : confirmAction.kind === "delete" ? "Move to Bin" : confirmAction.kind === "restore" ? "Restore" : "Confirm"}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => executeConfirm(confirmAction)}
        >
          {confirmAction.kind === "play" ? <StartConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "stop" ? (
            <StopConfirmation profile={confirmAction.profile} stopReason={stopReason} onStopReasonChange={setStopReason} />
          ) : null}
          {confirmAction.kind === "auto_login" ? <AutoLoginConfirmation profile={confirmAction.profile} dispatcherHealth={dispatcherHealth} /> : null}
          {confirmAction.kind === "restore_login_screen" ? <RestoreLoginScreenConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "check_readiness" ? <ReadinessNowConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "assign_now" ? <AssignNowConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "archive" ? <ArchiveConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "delete" ? <DeleteConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "restore" ? <RestoreConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind !== "play" && confirmAction.kind !== "stop" && confirmAction.kind !== "auto_login" && confirmAction.kind !== "restore_login_screen" && confirmAction.kind !== "check_readiness" && confirmAction.kind !== "assign_now" && confirmAction.kind !== "archive" && confirmAction.kind !== "delete" && confirmAction.kind !== "restore" ? <GenericConfirmation profile={confirmAction.profile} /> : null}
        </Modal>
      ) : null}

      {autoLoginFlow ? (
        <AutoLoginFlowModal
          profile={autoLoginFlow.profile}
          state={autoLoginFlow.state}
          onOpenPhone={() => openPhoneForProfile(autoLoginFlow.profile)}
          onCheckLogin={() => checkReadinessNow(autoLoginFlow.profile)}
          onRetryAutoLogin={() => startAutoLogin(autoLoginFlow.profile)}
          onStop={() => stopAutoLogin(autoLoginFlow.profile)}
          onClose={() => setAutoLoginFlow(null)}
        />
      ) : null}
    </div>
  );
}

function confirmTitle(kind: ConfirmKind, profile: BotProfile) {
  if (kind === "play") return `Start account run for ${profile.username}?`;
  if (kind === "stop") return `Stop account run for ${profile.username}?`;
  if (kind === "auto_login") return `Auto Login ${profile.username}?`;
  if (kind === "restore_login_screen") return `Restore login screen for ${profile.username}?`;
  if (kind === "check_readiness") return "Refresh login readiness?";
  if (kind === "assign_now") return "Assign phone slot now?";
  if (kind === "archive") return "Archive account?";
  if (kind === "delete") return "Move account to Bin?";
  if (kind === "restore") return "Restore account?";
  return `Confirm action for ${profile.username}?`;
}

function StartConfirmation({ profile }: { profile: BotProfile }) {
  const payload = buildStartPayload(profile);
  return (
    <div className="run-confirmation">
      <p><strong>This creates a real account run request.</strong></p>
      <p className="assign-now-copy">BotApp will call the secure runtime relay to create an account_session account_run_request. Manual / Run manually accounts can start now; scheduled accounts are still protected by the backend schedule gate.</p>
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Device</span><code>{profile.deviceName}</code>
        <span>Timeslot</span><code>{profile.activeWindow}</code>
        <span>Current status</span><code>{profile.status}</code>
        <span>Package</span><code>{profile.package}</code>
        <span>Endpoint</span><code>/api/instagram-dashboard/runs/start</code>
        <span>Run type</span><code>account_session</code>
        <span>Source</span><code>botapp_manual_play</code>
      </div>
      <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre>
    </div>
  );
}

function StopConfirmation({
  profile,
  stopReason,
  onStopReasonChange,
}: {
  profile: BotProfile;
  stopReason: string;
  onStopReasonChange: (value: string) => void;
}) {
  const payload = buildStopPayload(profile, stopReason);
  return (
    <div className="run-confirmation">
      <p><strong>This stops or cancels the active account run.</strong></p>
      <p className="assign-now-copy">BotApp will call the secure runtime stop relay to cancel an active account_run_request or reconcile an active ig_run.</p>
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Current status</span><code>{profile.status}</code>
        <span>Last session</span><code>{profile.lastSessionAt ?? "none"}</code>
        <span>Expected effect</span><span>Cancel active account_run_requests and request stop/reconcile active ig_runs.</span>
        <span>Endpoint</span><code>/api/instagram-dashboard/stop</code>
        <span>Source</span><code>botapp_manual_stop</code>
      </div>
      <label className="stop-reason-field">
        Optional stop reason
        <input
          className="input"
          value={stopReason}
          onChange={(event) => onStopReasonChange(event.target.value)}
          placeholder="manual_stop"
        />
      </label>
      <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre>
    </div>
  );
}

function AutoLoginConfirmation({ profile, dispatcherHealth }: { profile: BotProfile; dispatcherHealth: BotAppDispatcherHealth | null }) {
  const payload = buildAutoLoginPayload(profile);
  const dispatcherBlocked = Boolean(dispatcherHealth && dispatcherHealth.status !== "running");
  return (
    <div className="run-confirmation">
      <p><strong>Login request prepared.</strong></p>
      {!profile.autoLoginRequirement.enabled ? <p className="run-control-warning">{profile.autoLoginRequirement.detail}</p> : null}
      {dispatcherBlocked ? <p className="run-control-warning">Dispatcher is {dispatcherHealth?.status}. Open Runtime Health and resume it before Auto Login or runs.</p> : null}
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Platform</span><code>{profile.platform}</code>
        <span>Device</span><code>{profile.deviceName}</code>
        <span>Credential status</span><code>{profile.credentialStatus}</code>
        <span>Login status</span><code>{profile.loginStatus}</code>
        <span>Assignment</span><code>{profile.assignmentState}</code>
        <span>Dispatcher</span><code>{dispatcherHealth?.status ?? "unknown"}</code>
        <span>launch_enabled</span><code>{dispatcherHealth ? String(dispatcherHealth.launchEnabled) : "unknown"}</code>
        <span>Endpoint</span><code>/api/instagram-dashboard/runs/start</code>
        <span>Contract</span><code>secure BotApp relay · login_provisioning · manual trigger</code>
      </div>
      <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre>
    </div>
  );
}

function RestoreLoginScreenConfirmation({ profile }: { profile: BotProfile }) {
  const payload = buildRestoreLoginScreenPayload(profile);
  return (
    <div className="run-confirmation">
      <p><strong>Bounded orphan recovery on the assigned clone.</strong></p>
      {!profile.restoreLoginScreenRequirement.enabled ? <p className="run-control-warning">{profile.restoreLoginScreenRequirement.detail}</p> : null}
      <p className="assign-now-copy">This queues one internal recovery request. It performs a single controlled Back action, never sends credentials or codes, and stops immediately if the screen stays ambiguous.</p>
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Device</span><code>{profile.deviceName}</code>
        <span>Clone</span><code>{profile.appInstanceLabel || profile.appInstanceId || "assigned clone"}</code>
        <span>Endpoint</span><code>/api/instagram-dashboard/accounts/:account_id/restore-login-screen</code>
        <span>Contract</span><code>secure BotApp relay · login_orphan_challenge_recovery</code>
      </div>
      <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre>
    </div>
  );
}

function ReadinessNowConfirmation({ profile }: { profile: BotProfile }) {
  const state = createReadinessNowState(profile);
  const payload = buildReadinessNowPayload(profile);
  const projection = state.projection;
  return (
    <div className="run-confirmation readiness-now-confirmation">
      <p><strong>{projection.client_message}.</strong></p>
      <p className="assign-now-copy">This refreshes saved credentials, login status, assignment, and connect readiness through the secure relay. It does not start a Growth session, social action, or device login run. Use Auto Login / Connect for the real Instagram connection.</p>
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Platform</span><code>{profile.platform}</code>
        <span>Device</span><code>{profile.deviceName}</code>
        <span>Credential status</span><code>{profile.credentialStatus}</code>
        <span>Login status</span><code>{profile.loginStatus}</code>
        <span>Readiness status</span><code>{projection.readiness_status}</code>
        <span>Client status</span><code>{projection.client_status}</code>
        <span>Assignment</span><code>{projection.assignment_status}</code>
        <span>Next action</span><code>{projection.next_action}</code>
        <span>Reason</span><code>{projection.reason}</code>
        <span>Endpoint</span><code>/api/instagram-dashboard/readiness/now</code>
        <span>Contract</span><code>secure BotApp relay · readiness refresh · dry_run=true · no device run</code>
      </div>
      <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre>
    </div>
  );
}

function AssignNowConfirmation({ profile }: { profile: BotProfile }) {
  const state = createAssignNowState(profile);
  const payload = buildAssignNowPayload(profile);
  const candidate = state.candidate;
  return (
    <div className="run-confirmation">
      <p><strong>{candidate.schedule_gate.ok ? "Ready to assign." : candidate.schedule_gate.label}</strong></p>
      <p className="assign-now-copy">This creates or repairs the current phone assignment window. It will not start a run.</p>
      {!candidate.schedule_gate.ok ? <p className="run-control-warning">{candidate.schedule_gate.detail}</p> : null}
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{candidate.account_username}</code>
        <span>Platform</span><code>{candidate.platform}</code>
        <span>Phone/device</span><code>{candidate.device_label}</code>
        <span>Device serial</span><code>{candidate.safe_device_serial}</code>
        <span>App instance</span><code>{candidate.app_instance_label}</code>
        <span>Clone slot</span><code>{candidate.clone_slot}</code>
        <span>Current slot</span><code>{candidate.current_slot ? `${candidate.current_slot.starts_at}-${candidate.current_slot.ends_at}` : "none"}</code>
        <span>Candidate slot</span><code>{candidate.candidate_slot ? `${candidate.candidate_slot.starts_at}-${candidate.candidate_slot.ends_at}` : "none"}</code>
        <span>Timeslot</span><code>{profile.activeWindow}</code>
        <span>Schedule gate</span><code>{candidate.schedule_gate.reason}</code>
        <span>Expected result</span><span>{candidate.schedule_gate.ok ? "Create or repair assignment through the secure relay." : "Backend will re-check and return a safe blocker if no slot is available now."}</span>
        <span>Endpoint</span><code>/api/instagram-dashboard/assignments/now</code>
        <span>Runtime</span><code>run_started=false</code>
      </div>
      {candidate.warnings.length ? (
        <div className="assign-now-warnings">
          <strong>Warnings</strong>
          {candidate.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}
      <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre>
    </div>
  );
}

function ArchiveConfirmation({ profile }: { profile: BotProfile }) {
  const state = createArchiveState(profile);
  const warning = lifecycleWarning(profile);
  return (
    <div className="run-confirmation lifecycle-confirmation">
      <p><strong>This account will be moved out of active profiles.</strong></p>
      <p className="assign-now-copy">
        Archive this account? It will stop all runs and move to Archived. You can restore it for 30 days.
      </p>
      {warning ? <p className="run-control-warning">{warning}</p> : null}
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Platform</span><code>{profile.platform}</code>
        <span>Current phone/device</span><code>{profile.deviceName}</code>
        <span>Current status</span><code>{state.lifecycleStatus}</code>
        <span>Lifecycle action</span><code>archive</code>
        <span>Scheduled trash</span><code>{state.retentionPolicy.scheduledTrashAt}</code>
        <span>Restore</span><span>You can restore it later from Archives.</span>
        <span>Expected result</span><span>Removed from active profiles; account data and credentials remain retained by the admin lifecycle policy.</span>
        <span>Endpoint</span><code>/api/instagram-dashboard/accounts/lifecycle</code>
      </div>
      <pre className="payload-preview">{JSON.stringify(state.payload, null, 2)}</pre>
    </div>
  );
}

function DeleteConfirmation({ profile }: { profile: BotProfile }) {
  const state = createDeleteState(profile);
  const warning = lifecycleWarning(profile);
  return (
    <div className="run-confirmation lifecycle-confirmation">
      <p><strong>This action removes the account from active profiles.</strong></p>
      <p className="assign-now-copy">
        Move this account to Bin? It will stop all runs and can be restored for 30 days.
      </p>
      <p className="run-control-warning">This is not an immediate hard delete.</p>
      {warning ? <p className="run-control-warning">{warning}</p> : null}
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Platform</span><code>{profile.platform}</code>
        <span>Current phone/device</span><code>{profile.deviceName}</code>
        <span>Current status</span><code>{state.lifecycleStatus}</code>
        <span>Lifecycle action</span><code>move_to_trash</code>
        <span>Trash status</span><code>{state.retentionPolicy.trashStatus}</code>
        <span>Restore available</span><code>30 days</code>
        <span>Delete after</span><code>{state.retentionPolicy.scheduledDeleteAt}</code>
        <span>Permanent delete</span><span>Pending in admin; the current dashboard disables permanent delete.</span>
        <span>Expected result</span><span>Moved to Trash, restorable during the retention window, and blocked from runs/assignment while trashed.</span>
        <span>Endpoint</span><code>/api/instagram-dashboard/accounts/lifecycle</code>
      </div>
      <pre className="payload-preview">{JSON.stringify(state.payload, null, 2)}</pre>
    </div>
  );
}

function RestoreConfirmation({ profile }: { profile: BotProfile }) {
  const payload = {
    account_id: profile.id,
    action: "restore",
    reason: "botapp_account_action_restore",
    start_run: false,
    provisioning_enabled: false,
    login_enabled: false,
  };
  return (
    <div className="run-confirmation lifecycle-confirmation">
      <p><strong>This restores the account to Active.</strong></p>
      <p className="assign-now-copy">Restore writes lifecycle status only. It does not launch Auto Login, provisioning, account_session, or social actions.</p>
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Current lifecycle</span><code>{profile.lifecycleStatus ?? profile.status}</code>
        <span>Archived at</span><code>{profile.archivedAt ?? "none"}</code>
        <span>Bin date</span><code>{profile.trashedAt ?? "none"}</code>
        <span>Restore until</span><code>{profile.scheduledDeleteAt ?? "admin policy"}</code>
        <span>Endpoint</span><code>/api/instagram-dashboard/accounts/lifecycle</code>
        <span>Runtime</span><code>run_started=false</code>
      </div>
      <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre>
    </div>
  );
}

function GenericConfirmation({ profile }: { profile: BotProfile }) {
  return (
    <>
      <p><strong>Action preview.</strong></p>
      <div className="detail-list play-eligibility">
        <span>Readiness</span><code>{profile.readiness}</code>
        <span>Eligibility</span><code>{profile.eligibilityDetail.status}</code>
        <span>Primary block</span><code className="mono">{profile.eligibilityDetail.primary_block_reason || "none"}</code>
        {profile.runControlLabel ? (
          <>
            <span>Run control</span><code className="mono">{profile.runControlLabel}</code>
          </>
        ) : null}
        <span>Reason label</span><code>{profile.eligibilityDetail.reason_label}</code>
        <span>Description</span><span>{profile.eligibilityDetail.reason_description}</span>
        <span>Credential status</span><code>{profile.credentialStatus}</code>
        <span>Login status</span><code>{profile.loginStatus}</code>
        <span>Device availability</span><code>{profile.deviceAvailability}</code>
        <span>Assignment state</span><code>{profile.assignmentState}</code>
        <span>Entitlements</span><code>{profile.entitlements.join(", ")}</code>
        <span>Device lock</span><code className="mono">{profile.runtimeLock}</code>
      </div>
    </>
  );
}
