import { useEffect, useMemo, useState } from "react";
import type { BotProfile, DeviceProfileGroup, ProfileAutoLoginState, ProfileToolbarAction } from "../../api/types";
import { Badge, Button, Card, Modal } from "../../design/components";
import type { DeviceViewState } from "../../desktop/device-views";
import { focusDeviceView, listOpenDeviceViews, openDeviceView, subscribeDeviceViewState } from "../../desktop/device-views";
import { ProfileToolbar } from "./ProfileToolbar";
import { StatsDrawer } from "./drawers/StatsDrawer";
import { LogsDrawer } from "./drawers/LogsDrawer";
import { TargetsDrawer } from "./drawers/TargetsDrawer";
import { SettingsDrawer } from "./drawers/SettingsDrawer";
import { FiltersDrawer } from "./drawers/FiltersDrawer";
import { AddProfileDrawer } from "./drawers/AddProfileDrawer";
import { AutoLoginFlowModal } from "./AutoLoginFlowModal";
import { buildAssignNowPayload, createAssignNowState } from "./assign-now-flow";
import { buildAutoLoginPayload, createAutoLoginState } from "./auto-login-flow";
import { createArchiveState, createDeleteState, lifecycleWarning } from "./lifecycle-flow";
import { buildReadinessNowPayload, createReadinessNowState } from "./readiness-now-flow";
import {
  buildStartPayload,
  buildStopPayload,
  isStartDisabled,
  isStopEnabled,
  mockCurrentRunId,
  mockRunRequestId,
  projectRunEligibility,
  startDisabledReason,
  stopDisabledReason,
} from "./run-control";
import "./profiles.css";

type DrawerKind = "stats" | "logs" | "targets" | "settings" | "filters";
type ConfirmKind = "play" | "auto_login" | "check_readiness" | "assign_now" | "archive" | "delete" | "stop";

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
    `#${profile.profileNumber}`,
    String(profile.profileNumber),
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
  const running = group.profiles.filter((profile) => profile.status === "running").length;
  if (running > 0) return `${total} profiles · ${running} running`;
  if (group.phoneStatus === "running" || group.phoneStatus === "active") return `${total} profiles · ready`;
  return `${total} profiles · idle`;
}

function phoneStatusTone(status: DeviceProfileGroup["phoneStatus"]) {
  if (status === "running") return "success" as const;
  if (status === "active") return "accent" as const;
  if (status === "inactive") return "error" as const;
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

function AccountRow({
  profile,
  onSelect,
  onToolbar,
}: {
  profile: BotProfile;
  onSelect: (id: string) => void;
  onToolbar: (profile: BotProfile, action: ProfileToolbarAction) => void;
}) {
  return (
    <div className="profile-account-row">
      <span className={`profile-dot status-${profile.status}`} />

      <div className="profile-name-cell">
        <button className="link-button profile-username" onClick={() => onSelect(profile.id)}>{profile.username}</button>
        <div className="profile-badges">
          <Badge tone={profile.readiness === "ready" ? "success" : "warning"}>{profile.readiness}</Badge>
          <Badge tone={profile.eligibility === "can_start" ? "success" : "warning"}>{profile.eligibilityDetail.reason_label}</Badge>
        </div>
      </div>

      <div className="profile-client-cell">
        <div className="profile-platform-index">
          <PlatformLogo platform={profile.platform} />
          <span className="profile-index mono">#{profile.profileNumber}</span>
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
        <span>{profile.counters.follow.current}/{profile.counters.follow.max} F</span>
        <span>{profile.counters.unfollow.current}/{profile.counters.unfollow.max} UF</span>
        <span>{profile.counters.like.current}/{profile.counters.like.max} L</span>
        <span>{profile.counters.comment.current}/{profile.counters.comment.max} C</span>
        <span>{profile.counters.dm.current}/{profile.counters.dm.max} DM</span>
      </div>

      <span className={`delta-pill ${profile.followerDelta > 0 ? "up" : "flat"}`}>{profile.followerDelta > 0 ? `+${profile.followerDelta}` : profile.followerDelta}</span>

      <ProfileToolbar profile={profile} onAction={(action) => onToolbar(profile, action)} />
    </div>
  );
}

export function ProfilesView({
  groups,
  onSelect,
  onAction,
  onMockSubmit,
}: {
  groups: DeviceProfileGroup[];
  onSelect: (id: string) => void;
  onAction: (action: string, target: string, danger?: boolean) => void;
  onMockSubmit: (message: string) => void;
}) {
  const [platformFilter, setPlatformFilter] = useState<"All" | "Instagram" | "TikTok">("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [drawer, setDrawer] = useState<{ kind: DrawerKind; profile: BotProfile } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: ConfirmKind; profile: BotProfile } | null>(null);
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [stopReason, setStopReason] = useState("");
  const [openDeviceViews, setOpenDeviceViews] = useState<DeviceViewState[]>([]);
  const [phoneViewMessage, setPhoneViewMessage] = useState("");
  const [autoLoginFlow, setAutoLoginFlow] = useState<{ profile: BotProfile; state: ProfileAutoLoginState } | null>(null);

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

  const filteredGroups = useMemo(() => {
    const query = normalizeSearch(searchTerm);
    return groups
      .map((group) => ({
        ...group,
        profiles: group.profiles.filter((profile) => {
          const platformMatches = platformFilter === "All" || profile.platform === platformFilter;
          if (!platformMatches) return false;
          if (!query) return true;
          return groupMatchesSearch(group, query) || profileMatchesSearch(profile, group, query);
        }),
      }))
      .map((group) => ({ ...group, summary: summarizeProfiles(group.profiles) }))
      .filter((group) => group.profiles.length > 0);
  }, [groups, platformFilter, searchTerm]);

  function handleToolbar(profile: BotProfile, action: ProfileToolbarAction) {
    if (action === "play" || action === "auto_login" || action === "check_readiness" || action === "assign_now" || action === "archive" || action === "delete" || action === "stop") {
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

  async function handleOpenViewDockClick(view: DeviceViewState) {
    const result = await focusDeviceView(view.deviceSerial);
    if (result.ok) {
      setOpenDeviceViews(result.data);
      return;
    }
    setPhoneViewMessage(result.error || "Could not focus phone view.");
  }

  function mockSave(label: string) {
    onAction(label, drawer?.profile.username ?? "profile", false);
    setDrawer(null);
  }

  function executeConfirm(action: { kind: ConfirmKind; profile: BotProfile }) {
    if (action.kind === "play") {
      const payload = buildStartPayload(action.profile);
      void payload;
      onMockSubmit("Start payload prepared for future secure BotApp relay.");
      setConfirmAction(null);
      return;
    }
    if (action.kind === "stop") {
      const payload = buildStopPayload(action.profile, stopReason);
      void payload;
      onMockSubmit("Stop payload prepared for future secure BotApp relay.");
      setConfirmAction(null);
      return;
    }
    if (action.kind === "auto_login") {
      setAutoLoginFlow({ profile: action.profile, state: createAutoLoginState(action.profile) });
      setConfirmAction(null);
      return;
    }
    if (action.kind === "check_readiness") {
      const state = createReadinessNowState(action.profile);
      void state;
      onMockSubmit("Check Login request prepared for future secure BotApp relay.");
      setConfirmAction(null);
      return;
    }
    if (action.kind === "assign_now") {
      const state = createAssignNowState(action.profile);
      void state;
      onMockSubmit("Assign Now request prepared for future secure BotApp relay.");
      setConfirmAction(null);
      return;
    }
    if (action.kind === "archive") {
      const state = createArchiveState(action.profile);
      void state;
      onMockSubmit("Archive request prepared for future secure BotApp relay.");
      setConfirmAction(null);
      return;
    }
    if (action.kind === "delete") {
      const state = createDeleteState(action.profile);
      void state;
      onMockSubmit("Move to trash request prepared for future secure BotApp relay.");
      setConfirmAction(null);
      return;
    }
    const labels: Record<ConfirmKind, string> = {
      play: "Start profile",
      auto_login: "Auto Login",
      check_readiness: "Check Login",
      assign_now: "Assign Now",
      archive: "Archive profile",
      delete: "Delete profile",
      stop: "Stop profile",
    };
    onAction(labels[action.kind], action.profile.username, true);
    setConfirmAction(null);
  }

  return (
    <div className="profiles-screen">
      <Card
        title="Profiles / Accounts"
        subtitle=""
        actions={<>
          <div className="profiles-filters">
            {(["All", "Instagram", "TikTok"] as const).map((item) => (
              <button key={item} type="button" className={platformFilter === item ? "filter-chip active" : "filter-chip"} onClick={() => setPlatformFilter(item)}>{item}</button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => onAction("Refresh profiles", "all profiles")}>Refresh</Button>
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

      {filteredGroups.length === 0 ? (
        <div className="empty-state profiles-empty">
          <strong>No profiles match this search</strong>
          <span>Try another username, package, phone, platform, status, or timeslot.</span>
        </div>
      ) : null}

      {filteredGroups.map((group) => (
        <section key={group.deviceId} className="phone-group">
          <header className="phone-group-header">
            <div>
              <strong>{group.deviceLabel} · {group.deviceSerialLabel}</strong>
              <Badge tone={phoneStatusTone(group.phoneStatus)}>{group.phoneStatus}</Badge>
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
          onOpenTargets={() => setDrawer({ kind: "targets", profile: drawer.profile })}
        />
      ) : null}
      {drawer?.kind === "filters" ? <FiltersDrawer profile={drawer.profile} onClose={() => setDrawer(null)} onSave={() => mockSave("Save profile filters")} /> : null}
      {addProfileOpen ? (
        <AddProfileDrawer
          groups={groups}
          onClose={() => setAddProfileOpen(false)}
          onSubmitMock={(payload) => {
            void payload;
            onMockSubmit("Add Profile payload is prepared for the secure admin create contract.");
          }}
        />
      ) : null}

      {confirmAction ? (
        <Modal
          title={confirmTitle(confirmAction.kind, confirmAction.profile)}
          danger={confirmAction.kind === "delete" || confirmAction.kind === "archive" || confirmAction.kind === "stop" || (confirmAction.kind === "play" && confirmAction.profile.eligibility !== "can_start")}
          confirmLabel={confirmAction.kind === "play" ? "Start" : confirmAction.kind === "stop" ? "Stop" : confirmAction.kind === "auto_login" ? "Confirm Auto Login" : confirmAction.kind === "check_readiness" ? "Run check" : confirmAction.kind === "assign_now" ? "Assign now" : confirmAction.kind === "archive" ? "Confirm archive" : confirmAction.kind === "delete" ? "Confirm delete" : "Confirm"}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => executeConfirm(confirmAction)}
        >
          {confirmAction.kind === "play" ? <StartConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "stop" ? (
            <StopConfirmation profile={confirmAction.profile} stopReason={stopReason} onStopReasonChange={setStopReason} />
          ) : null}
          {confirmAction.kind === "auto_login" ? <AutoLoginConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "check_readiness" ? <ReadinessNowConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "assign_now" ? <AssignNowConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "archive" ? <ArchiveConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind === "delete" ? <DeleteConfirmation profile={confirmAction.profile} /> : null}
          {confirmAction.kind !== "play" && confirmAction.kind !== "stop" && confirmAction.kind !== "auto_login" && confirmAction.kind !== "check_readiness" && confirmAction.kind !== "assign_now" && confirmAction.kind !== "archive" && confirmAction.kind !== "delete" ? <GenericConfirmation profile={confirmAction.profile} /> : null}
        </Modal>
      ) : null}

      {autoLoginFlow ? (
        <AutoLoginFlowModal
          profile={autoLoginFlow.profile}
          state={autoLoginFlow.state}
          onStateChange={(state) => setAutoLoginFlow({ profile: autoLoginFlow.profile, state })}
          onClose={() => setAutoLoginFlow(null)}
        />
      ) : null}
    </div>
  );
}

function confirmTitle(kind: ConfirmKind, profile: BotProfile) {
  if (kind === "play") return `Start manual run for ${profile.username}?`;
  if (kind === "stop") return `Stop current run for ${profile.username}?`;
  if (kind === "auto_login") return `Auto Login ${profile.username}?`;
  if (kind === "check_readiness") return "Run login/readiness check?";
  if (kind === "assign_now") return "Assign phone slot now?";
  if (kind === "archive") return "Archive account?";
  if (kind === "delete") return "Delete account?";
  return `Confirm action for ${profile.username}?`;
}

function StartConfirmation({ profile }: { profile: BotProfile }) {
  const eligibility = projectRunEligibility(profile);
  const payload = buildStartPayload(profile);
  const disabledReason = startDisabledReason(profile);
  return (
    <div className="run-confirmation">
      <p><strong>Prepared for secure relay execution.</strong></p>
      {isStartDisabled(profile) ? <p className="run-control-warning">{disabledReason}</p> : null}
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Device</span><code>{profile.deviceName}</code>
        <span>Timeslot</span><code>{profile.activeWindow}</code>
        <span>Eligibility</span><code>{eligibility.eligibility_status}</code>
        <span>Package</span><code>{profile.package}</code>
        <span>Reason / warnings</span><span>{eligibility.reason_label} · {eligibility.reason_description}</span>
        <span>Future endpoint</span><code>/api/botapp/instagram-dashboard/runs/start</code>
        <span>Future contract</span><code>create_account_run_request relay</code>
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
  const disabledReason = stopDisabledReason(profile);
  return (
    <div className="run-confirmation">
      <p><strong>Prepared for secure relay execution.</strong></p>
      {!isStopEnabled(profile) ? <p className="run-control-warning">{disabledReason}</p> : null}
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Current run/session</span><code>{mockCurrentRunId(profile) ?? profile.lastSessionAt ?? "none"}</code>
        <span>Run request</span><code>{mockRunRequestId(profile) ?? "none"}</code>
        <span>Expected effect</span><span>Cancel active account_run_requests and request stop/reconcile active ig_runs through a future secure BotApp relay.</span>
        <span>Future endpoint</span><code>/api/botapp/instagram-dashboard/stop</code>
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

function AutoLoginConfirmation({ profile }: { profile: BotProfile }) {
  const payload = buildAutoLoginPayload(profile);
  return (
    <div className="run-confirmation">
      <p><strong>Login request prepared.</strong></p>
      {!profile.autoLoginRequirement.enabled ? <p className="run-control-warning">{profile.autoLoginRequirement.detail}</p> : null}
      <div className="detail-list play-eligibility">
        <span>Account</span><code>@{profile.username}</code>
        <span>Platform</span><code>{profile.platform}</code>
        <span>Device</span><code>{profile.deviceName}</code>
        <span>Credential status</span><code>{profile.credentialStatus}</code>
        <span>Login status</span><code>{profile.loginStatus}</code>
        <span>Assignment</span><code>{profile.assignmentState}</code>
        <span>Future endpoint</span><code>/api/botapp/instagram-dashboard/connect/now</code>
        <span>Future contract</span><code>secure BotApp relay to login_provisioning</code>
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
      <p className="assign-now-copy">This checks Instagram login/readiness now. It will not start a Growth session.</p>
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
        <span>Future endpoint</span><code>/api/botapp/instagram-dashboard/readiness/now</code>
        <span>Future contract</span><code>secure BotApp relay to login_provisioning</code>
      </div>
      {projection.expected_preflight_request ? (
        <p className="readiness-now-note">The secure relay should enqueue a login provisioning preflight request if the backend re-checks pass.</p>
      ) : null}
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
        <span>Expected result</span><span>{candidate.schedule_gate.ok ? "Prepare assignment creation or repair through the future secure relay." : "Keep the action blocked until the assignment gate is ready."}</span>
        <span>Future endpoint</span><code>/api/botapp/instagram-dashboard/assignments/now</code>
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
        It will move to Archives, keep its data, and be scheduled to move to Trash after 30 days. You can restore it later while the admin lifecycle allows restore.
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
        <span>Future endpoint</span><code>/api/botapp/instagram-dashboard/accounts/lifecycle</code>
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
        The account will be moved to Trash. Restore is available for 30 days; after 30 days it is scheduled for permanent deletion when the admin cleanup flow exists.
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
        <span>Future endpoint</span><code>/api/botapp/instagram-dashboard/accounts/lifecycle</code>
      </div>
      <pre className="payload-preview">{JSON.stringify(state.payload, null, 2)}</pre>
    </div>
  );
}

function GenericConfirmation({ profile }: { profile: BotProfile }) {
  return (
    <>
      <p><strong>Prepared for secure relay execution.</strong></p>
      <div className="detail-list play-eligibility">
        <span>Readiness</span><code>{profile.readiness}</code>
        <span>Eligibility</span><code>{profile.eligibilityDetail.status}</code>
        <span>Primary block</span><code className="mono">{profile.eligibilityDetail.primary_block_reason || "none"}</code>
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
