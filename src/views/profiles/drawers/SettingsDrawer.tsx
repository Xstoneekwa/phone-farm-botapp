import { useEffect, useState } from "react";
import { mockClient } from "../../../api/mock-client";
import type { BotProfile, ProfileSettings } from "../../../api/types";
import { Badge, Button, Drawer } from "../../../design/components";

const tabs = ["General", "Schedule", "Follow", "DM", "Followback", "Sources", "Filters"] as const;
type SettingsTab = (typeof tabs)[number];

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

export function SettingsDrawer({ profile, onClose, onConfirm }: { profile: BotProfile; onClose: () => void; onConfirm: () => void }) {
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("General");

  useEffect(() => {
    let cancelled = false;
    void mockClient.getProfileSettings(profile.id).then((result) => {
      if (!cancelled && result.ok) setSettings(result.data);
    });
    return () => { cancelled = true; };
  }, [profile.id]);

  if (!settings) return <Drawer title="Settings" subtitle={profile.username} wide onClose={onClose}><div className="empty-state">Loading mock settings...</div></Drawer>;

  return (
    <Drawer title="Settings" subtitle={profile.username} wide onClose={onClose} footer={<>
      <div className="drawer-footer-left">
        <select className="input" defaultValue={settings.dm.templateName ?? ""}><option value="">Select template</option><option value="default">Default mock</option></select>
        <Button variant="ghost" onClick={onConfirm}>Save as template</Button>
      </div>
      <Button onClick={onConfirm}>Confirm mock</Button>
    </>}>
      <div className="settings-tabs" role="tablist" aria-label="Profile settings sections">
        {tabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
      </div>

      {activeTab === "General" ? <div className="settings-grid">
        <section className="settings-card full"><header><h4>General summary</h4><Badge tone="neutral">Read-only</Badge></header><p className="muted">Operational changes live in Schedule, Follow, DM, Followback, Sources, Filters, Credentials, and the account action menu.</p></section>
        <section className="settings-card"><header><h4>Account identity</h4><Badge tone="neutral">Read-only</Badge></header><Field label="Username" value={settings.general.username} mono /><Field label="Display name" value={settings.general.displayName || "Not available"} /></section>
        <section className="settings-card"><header><h4>Credentials</h4><Badge tone="warning">Safe</Badge></header><Field label="Credential status" value={credentialLabel(settings.general.credentialStatus)} /><Field label="Credential source" value={settings.general.credentialSource} /><ToggleLine label="2FA enabled" checked={settings.general.twoFactorEnabled} /><Button variant="ghost" onClick={onConfirm}>Update credentials</Button></section>
        <section className="settings-card"><header><h4>Package and runtime</h4><Badge tone="info">Runtime summary</Badge></header><Field label="Commercial package" value={settings.general.commercialPackage} /><Field label="Add-ons / entitlements" value={settings.general.entitlements} /><Field label="Runtime profile" value={settings.general.runtimeProfile} mono /><Field label="Slot kind" value={settings.general.slotKind} mono /></section>
        <section className="settings-card"><header><h4>Status</h4><Badge tone="neutral">Read-only</Badge></header><Field label="Readiness status" value={settings.general.readinessStatus} /><Field label="Eligibility status" value={settings.general.eligibilityStatus} /><Field label="Assignment status" value={settings.general.assignmentStatus} /></section>
      </div> : null}

      {activeTab === "Schedule" ? <div className="settings-grid">
        <section className="settings-card"><header><h4>Schedule summary</h4><Badge tone="info">Managed in schedule</Badge></header><Field label="Current slot" value={settings.schedule.currentSlot} mono /><Field label="Business window" value={settings.schedule.businessWindow} mono /><Field label="Assignment status" value={settings.schedule.assignmentStatus} /></section>
        <section className="settings-card"><header><h4>Phone reservation</h4><Badge tone="warning">Device lock aware</Badge></header><Field label="Slot kind" value={settings.schedule.slotKind} mono /><Field label="Device lock" value={settings.schedule.deviceLock} /><Field label="Clone/session buffer" value={`${settings.schedule.cloneBufferMinutes} min`} /><Field label="Phone rest" value={settings.schedule.phoneRest} /><Field label="Schedule source" value={settings.schedule.scheduleSource} /></section>
      </div> : null}

      {activeTab === "Follow" ? <div className="settings-grid">
        <section className="settings-card"><header><h4>Follow limits</h4><Badge tone="info">Mock caps</Badge></header><Field label="Follows per day" value={settings.follow.followPerDay} /><Field label="Max follow / session" value={settings.follow.maxFollowPerSession} /><Field label="Effective limit" value={settings.follow.effectiveFollowLimit} mono /><Field label="Source" value={settings.follow.source} /></section>
        <section className="settings-card"><header><h4>Follow toggles</h4><Badge tone="neutral">Preview only</Badge></header><ToggleLine label="Do follows first" checked={settings.follow.doFollowsFirst} /><ToggleLine label="Mute after follow" checked={settings.follow.muteAfterFollow} /><ToggleLine label="End if limit reached" checked={settings.follow.endIfLimitReached} /><ToggleLine label="Turn off follow" checked={settings.follow.turnOffFollow} /></section>
      </div> : null}

      {activeTab === "DM" ? <div className="settings-grid">
        <section className="settings-card"><header><h4>DM features</h4><Badge tone="warning">No real send</Badge></header><ToggleLine label="Welcome DM" checked={settings.dm.welcomeDmEnabled} /><ToggleLine label="Cold DM Outreach" checked={settings.dm.coldDmEnabled} /><Field label="Safe DM limit" value={settings.dm.safeDmLimit} /><Field label="Template" value={settings.dm.templateName ?? "none"} /></section>
        <section className="settings-card full"><header><h4>Prompts and templates</h4><Badge tone="neutral">Mock only</Badge></header><label>Welcome DM</label><textarea className="input settings-textarea" readOnly value={settings.dm.welcomeDmBody} /><label>AI comment prompt</label><textarea className="input settings-textarea" readOnly value={settings.dm.aiCommentPrompt} /><label>Cold DM Outreach</label><textarea className="input settings-textarea" readOnly value={settings.dm.coldDmBody} /></section>
      </div> : null}

      {activeTab === "Followback" ? <div className="settings-grid">
        <section className="settings-card"><header><h4>Unfollow / followback</h4><Badge tone="info">Mock caps</Badge></header><Field label="Unfollow per day" value={settings.followback.unfollowPerDay} /><Field label="After X days" value={settings.followback.unfollowAfterDays} /><Field label="Stop after skipped" value={settings.followback.stopAfterUnfollowSkipped} /><Field label="Unfollow mode" value={settings.followback.unfollowSort} /><Field label="Followback ratio summary" value={settings.followback.followbackRatioSummary} /><Field label="Effective limit" value={settings.followback.effectiveUnfollowLimit} mono /></section>
      </div> : null}

      {activeTab === "Sources" ? <div className="settings-grid">
        <section className="settings-card"><header><h4>CT / source groups</h4><Badge tone={settings.sources.syncReadiness === "ready" ? "success" : "warning"}>Sync {settings.sources.syncReadiness}</Badge></header><Field label="Main source" value={settings.sources.mainSource} /><Field label="Source groups" value={settings.sources.sourceGroups} /><Field label="Target account refs" value={settings.sources.targetAccountRefs} /><Field label="CT quality summary" value={settings.sources.ctQualitySummary} /></section>
      </div> : null}

      {activeTab === "Filters" ? <div className="settings-grid">
        <section className="settings-card"><header><h4>Profile filters</h4><Badge tone="neutral">Mock safe list</Badge></header><ToggleLine label="Skip follower" checked={settings.filters.skipFollower} /><ToggleLine label="Skip following" checked={settings.filters.skipFollowing} /><ToggleLine label="Skip non-business profiles" checked={settings.filters.skipNonBusiness} /><ToggleLine label="Skip business profiles" checked={settings.filters.skipBusiness} /><ToggleLine label="Follow private profiles" checked={settings.filters.followPrivate} /><ToggleLine label="Follow ONLY private profiles" checked={settings.filters.followOnlyPrivate} /><ToggleLine label="DM private profiles" checked={settings.filters.dmPrivate} /></section>
        <section className="settings-card"><header><h4>Numeric filters</h4><Badge tone="info">Thresholds</Badge></header><Field label="Min followers" value={settings.filters.minFollowers} /><Field label="Max followers" value={settings.filters.maxFollowers} /><Field label="Min following" value={settings.filters.minFollowing} /><Field label="Max following" value={settings.filters.maxFollowing} /><Field label="Min posts" value={settings.filters.minPosts} /></section>
        <section className="settings-card full"><header><h4>Bio & name</h4><Badge tone="warning">Safe mock words</Badge></header><label>Blacklisted words</label><textarea className="input settings-textarea" readOnly value={settings.filters.blacklistedWords} /><label>Mandatory words</label><textarea className="input settings-textarea" readOnly value={settings.filters.mandatoryWords || ""} /></section>
      </div> : null}
    </Drawer>
  );
}
