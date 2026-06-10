import { useMemo, useState } from "react";
import type { BotProfile, DeviceProfileGroup, ProfileToolbarAction } from "../../api/types";
import { Badge, Button, Card, Modal } from "../../design/components";
import { ProfileToolbar } from "./ProfileToolbar";
import { StatsDrawer } from "./drawers/StatsDrawer";
import { LogsDrawer } from "./drawers/LogsDrawer";
import { TargetsDrawer } from "./drawers/TargetsDrawer";
import { SettingsDrawer } from "./drawers/SettingsDrawer";
import { FiltersDrawer } from "./drawers/FiltersDrawer";
import "./profiles.css";

type DrawerKind = "stats" | "logs" | "targets" | "settings" | "filters";
type ConfirmKind = "play" | "auto_login" | "assign_now" | "archive" | "delete" | "stop";

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

function phoneStatusTone(status: DeviceProfileGroup["phoneStatus"]) {
  if (status === "running") return "success" as const;
  if (status === "active") return "accent" as const;
  if (status === "inactive") return "error" as const;
  return "warning" as const;
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
}: {
  groups: DeviceProfileGroup[];
  onSelect: (id: string) => void;
  onAction: (action: string, target: string, danger?: boolean) => void;
}) {
  const [platformFilter, setPlatformFilter] = useState<"All" | "Instagram" | "TikTok">("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [drawer, setDrawer] = useState<{ kind: DrawerKind; profile: BotProfile } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: ConfirmKind; profile: BotProfile } | null>(null);

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
    if (action === "play" || action === "auto_login" || action === "assign_now" || action === "archive" || action === "delete" || action === "stop") {
      setConfirmAction({ kind: action, profile });
      return;
    }
    if (action === "targets" || action === "view") {
      setDrawer({ kind: "targets", profile });
      return;
    }
    setDrawer({ kind: action, profile });
  }

  function mockSave(label: string) {
    onAction(label, drawer?.profile.username ?? "profile", false);
    setDrawer(null);
  }

  return (
    <div className="profiles-screen">
      <Card
        title="Profiles / Accounts"
        subtitle="Phones first, then assigned accounts. Toolbar actions open mock drawers only."
        actions={<>
          <div className="profiles-filters">
            {(["All", "Instagram", "TikTok"] as const).map((item) => (
              <button key={item} type="button" className={platformFilter === item ? "filter-chip active" : "filter-chip"} onClick={() => setPlatformFilter(item)}>{item}</button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => onAction("Refresh profiles", "all profiles")}>Refresh mock</Button>
        </>}
      >
        <div className="profiles-search-row">
          <input
            className="input"
            placeholder="Search username, name, package, phone, platform, timeslot"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <Button>+ New profile</Button>
        </div>
      </Card>

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
              <strong>{group.deviceLabel} · {group.deviceSerial}</strong>
              <Badge tone={phoneStatusTone(group.phoneStatus)}>{group.phoneStatus}</Badge>
            </div>
            <div className="phone-group-summary mono">
              {group.summary.total} profiles · {group.summary.normal} normal · {group.summary.dual} dual · {group.summary.other} other
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
      {drawer?.kind === "settings" ? <SettingsDrawer profile={drawer.profile} onClose={() => setDrawer(null)} onConfirm={() => mockSave("Save profile settings")} /> : null}
      {drawer?.kind === "filters" ? <FiltersDrawer profile={drawer.profile} onClose={() => setDrawer(null)} onSave={() => mockSave("Save profile filters")} /> : null}

      {confirmAction ? (
        <Modal
          title={`${confirmAction.kind.replace("_", " ")} ${confirmAction.profile.username}?`}
          danger={confirmAction.kind === "delete" || confirmAction.kind === "archive" || confirmAction.kind === "stop" || confirmAction.profile.eligibility !== "can_start"}
          confirmLabel="Preview only"
          onClose={() => setConfirmAction(null)}
          onConfirm={() => {
            const labels: Record<ConfirmKind, string> = {
              play: "Start profile",
              auto_login: "Auto Login",
              assign_now: "Assign Now",
              archive: "Archive profile",
              delete: "Delete profile",
              stop: "Stop profile",
            };
            onAction(labels[confirmAction.kind], confirmAction.profile.username, true);
            setConfirmAction(null);
          }}
        >
          <p><strong>Mock only — no backend action executed.</strong></p>
          <div className="detail-list play-eligibility">
            <span>Readiness</span><code>{confirmAction.profile.readiness}</code>
            <span>Eligibility</span><code>{confirmAction.profile.eligibilityDetail.status}</code>
            <span>Primary block</span><code className="mono">{confirmAction.profile.eligibilityDetail.primary_block_reason || "none"}</code>
            <span>Reason label</span><code>{confirmAction.profile.eligibilityDetail.reason_label}</code>
            <span>Description</span><span>{confirmAction.profile.eligibilityDetail.reason_description}</span>
            <span>Credential status</span><code>{confirmAction.profile.credentialStatus}</code>
            <span>Login status</span><code>{confirmAction.profile.loginStatus}</code>
            <span>Device availability</span><code>{confirmAction.profile.deviceAvailability}</code>
            <span>Assignment state</span><code>{confirmAction.profile.assignmentState}</code>
            <span>Entitlements</span><code>{confirmAction.profile.entitlements.join(", ")}</code>
            <span>Device lock</span><code className="mono">{confirmAction.profile.runtimeLock}</code>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
