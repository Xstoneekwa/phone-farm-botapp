import { useEffect, useMemo, useState } from "react";
import type { AutoRestartOverview } from "../api/types";
import type { BotAppDispatcherHealth, BotAppRelayHealth } from "../api/types";
import { Badge, Modal, type BadgeTone } from "../design/components";
import { projectAutoRestartTruth } from "./auto-restart-status";
import "./auto-restart.css";

type SettingsPatch = {
  auto_restart_enabled: boolean;
  mode: "production";
  check_every_minutes: number;
  restart_delay_minutes: number;
  max_attempts_per_session: number;
  max_restarts_per_day_per_account: number;
  max_restarts_per_window_per_account: number;
  restart_yellow_accounts: boolean;
  restart_red_accounts: boolean;
  respect_blackout_windows: boolean;
  respect_six_hour_window: boolean;
  resume_follow_if_quota_remaining: boolean;
  resume_unfollow_if_quota_remaining: boolean;
  block_on_challenge: boolean;
  block_on_restriction: boolean;
  block_on_account_mismatch: boolean;
  block_on_device_offline: boolean;
  notify_on_blocked_restart: boolean;
};

function toPatch(overview: AutoRestartOverview): SettingsPatch {
  return {
    auto_restart_enabled: overview.rules.enabled,
    mode: "production",
    check_every_minutes: overview.rules.checkEveryMinutes,
    restart_delay_minutes: overview.rules.restartDelayMinutes,
    max_attempts_per_session: overview.rules.maxAttemptsPerSession,
    max_restarts_per_day_per_account: overview.rules.maxRestartsPerAccountPerDay,
    max_restarts_per_window_per_account: overview.rules.maxRestartsPerAccountPerWindow,
    restart_yellow_accounts: overview.rules.restartYellowAccounts,
    restart_red_accounts: overview.rules.restartRedAccounts,
    respect_blackout_windows: overview.rules.respectFixedBlackouts,
    respect_six_hour_window: overview.rules.respectSixHourWindow,
    resume_follow_if_quota_remaining: overview.rules.resumeFollowIfQuotaRemaining,
    resume_unfollow_if_quota_remaining: overview.rules.resumeUnfollowIfQuotaRemaining,
    block_on_challenge: overview.rules.blockOnChallenge,
    block_on_restriction: overview.rules.blockOnRestriction,
    block_on_account_mismatch: overview.rules.blockOnAccountMismatch,
    block_on_device_offline: overview.rules.blockOnDeviceOffline,
    notify_on_blocked_restart: overview.rules.notifyOnBlockedRestart,
  };
}

function statusDetail(truth: ReturnType<typeof projectAutoRestartTruth>, foundationBlocked: boolean) {
  if (foundationBlocked) return "Blocked — automation foundation is not available.";
  if (truth.operationalState === "active") return "Auto Restart is active in Production mode.";
  if (truth.operationalState === "ready") return "Ready to enable. Gates are green.";
  if (truth.operationalState === "blocked") return truth.autoRestartDetail;
  return "Auto Restart is disabled.";
}

function operationalBadgeLabel(truth: ReturnType<typeof projectAutoRestartTruth>, foundationBlocked: boolean) {
  if (foundationBlocked) return "blocked";
  return truth.heroBadgeLabel;
}

function operationalTitle(truth: ReturnType<typeof projectAutoRestartTruth>, foundationBlocked: boolean) {
  if (foundationBlocked) return "Blocked";
  return truth.autoRestartTitle;
}

export function AutoRestart({
  overview,
  relayHealth,
  dispatcherHealth,
  onAction,
  onRefresh,
  onDryRun,
  onNavigate,
}: {
  overview: AutoRestartOverview;
  relayHealth: BotAppRelayHealth | null;
  dispatcherHealth: BotAppDispatcherHealth | null;
  onAction: (message: string, target: string, danger?: boolean) => void;
  onRefresh: () => void;
  onDryRun: () => void;
  onNavigate: (target: "candidates") => void;
}) {
  const truth = projectAutoRestartTruth({ overview, relayHealth, dispatcherHealth });
  const foundationBlocked = overview.backendSyncStatus !== "relay_ready" || !overview.rules.writable;
  const [patch, setPatch] = useState<SettingsPatch>(() => toPatch(overview));
  const [saving, setSaving] = useState(false);
  const [enableConfirmOpen, setEnableConfirmOpen] = useState(false);

  useEffect(() => {
    setPatch(toPatch(overview));
  }, [overview]);

  const dirty = useMemo(() => JSON.stringify(patch) !== JSON.stringify(toPatch(overview)), [overview, patch]);

  async function saveSettings(nextPatch = patch) {
    setSaving(true);
    try {
      const result = await window.botappDesktop?.autoRestart?.saveSettings?.(nextPatch);
      if (!result?.ok) {
        onAction(result?.error || "Failed to save Auto Restart settings.", "auto-restart-settings", true);
        return;
      }
      onAction("Auto Restart settings saved.", "auto-restart-settings");
      onRefresh();
    } catch (error) {
      onAction(error instanceof Error ? error.message : "Failed to save Auto Restart settings.", "auto-restart-settings", true);
    } finally {
      setSaving(false);
    }
  }

  function requestEnabledToggle(checked: boolean) {
    if (checked && !patch.auto_restart_enabled) {
      setEnableConfirmOpen(true);
      return;
    }
    setPatch((current) => ({ ...current, auto_restart_enabled: checked }));
  }

  async function confirmEnable() {
    const nextPatch = { ...patch, auto_restart_enabled: true };
    setPatch(nextPatch);
    setEnableConfirmOpen(false);
    await saveSettings(nextPatch);
  }

  const eligibleCount = overview.quotaCandidates.filter((candidate) => candidate.decision === "Eligible").length;
  const blockedCount = Math.max(0, overview.activeAccountsAffected - eligibleCount);

  return (
    <div className="auto-restart-screen">
      <header className="auto-restart-hero">
        <div className="auto-restart-hero-copy">
          <span>Operations</span>
          <h2>Auto Restart</h2>
          <p>{statusDetail(truth, foundationBlocked)}</p>
        </div>
        <div className="auto-restart-hero-status">
          <Badge tone={toneForState(truth, foundationBlocked)} dot>{operationalBadgeLabel(truth, foundationBlocked)}</Badge>
          <strong>{operationalTitle(truth, foundationBlocked)}</strong>
          <small>Operating mode: Production</small>
        </div>
      </header>

      {!foundationBlocked ? (
        <>
          <section className="auto-restart-panel">
            <h3>Automation settings</h3>
            <div className="auto-restart-fields">
              <label className="auto-restart-field auto-restart-toggle">
                <span>Enabled</span>
                <input type="checkbox" checked={patch.auto_restart_enabled} onChange={(event) => requestEnabledToggle(event.target.checked)} />
              </label>
              <article className="auto-restart-field auto-restart-static">
                <span>Operating mode</span>
                <strong>Production</strong>
                <small>Eligible accounts are determined by active schedules.</small>
              </article>
            </div>
            <div className="auto-restart-actions">
              <button type="button" className="auto-restart-secondary" onClick={onDryRun}>Run dry-run check</button>
              <button type="button" className="auto-restart-secondary" onClick={onRefresh}>Refresh</button>
            </div>
          </section>

          <section className="auto-restart-panel">
            <h3>Schedule and limits</h3>
            <div className="auto-restart-fields">
              <NumberInput label="Check interval (minutes)" value={patch.check_every_minutes} min={1} max={1440} onChange={(value) => setPatch((c) => ({ ...c, check_every_minutes: value }))} />
              <NumberInput label="Restart delay (minutes)" value={patch.restart_delay_minutes} min={1} max={1440} onChange={(value) => setPatch((c) => ({ ...c, restart_delay_minutes: value }))} />
              <NumberInput label="Max restart attempts per session" value={patch.max_attempts_per_session} min={0} max={20} onChange={(value) => setPatch((c) => ({ ...c, max_attempts_per_session: value }))} />
              <NumberInput label="Max restarts per day" value={patch.max_restarts_per_day_per_account} min={0} max={50} onChange={(value) => setPatch((c) => ({ ...c, max_restarts_per_day_per_account: value }))} />
              <NumberInput label="Max restarts per window" value={patch.max_restarts_per_window_per_account} min={0} max={50} onChange={(value) => setPatch((c) => ({ ...c, max_restarts_per_window_per_account: value }))} />
              <ToggleInput label="Yellow threshold" checked={patch.restart_yellow_accounts} onChange={(checked) => setPatch((c) => ({ ...c, restart_yellow_accounts: checked }))} />
              <ToggleInput label="Red threshold" checked={patch.restart_red_accounts} onChange={(checked) => setPatch((c) => ({ ...c, restart_red_accounts: checked }))} />
              <ToggleInput label="Respect fixed blackouts" checked={patch.respect_blackout_windows} onChange={(checked) => setPatch((c) => ({ ...c, respect_blackout_windows: checked }))} />
              <ToggleInput label="Respect 6-hour business window" checked={patch.respect_six_hour_window} onChange={(checked) => setPatch((c) => ({ ...c, respect_six_hour_window: checked }))} />
            </div>
          </section>

          <section className="auto-restart-panel">
            <h3>Safety and resume</h3>
            <div className="auto-restart-fields">
              <ToggleInput label="Resume follow" checked={patch.resume_follow_if_quota_remaining} onChange={(checked) => setPatch((c) => ({ ...c, resume_follow_if_quota_remaining: checked }))} />
              <ToggleInput label="Resume unfollow" checked={patch.resume_unfollow_if_quota_remaining} onChange={(checked) => setPatch((c) => ({ ...c, resume_unfollow_if_quota_remaining: checked }))} />
              <ToggleInput label="Stop on challenge/checkpoint" checked={patch.block_on_challenge} onChange={(checked) => setPatch((c) => ({ ...c, block_on_challenge: checked }))} />
              <ToggleInput label="Stop on restriction/action block" checked={patch.block_on_restriction} onChange={(checked) => setPatch((c) => ({ ...c, block_on_restriction: checked }))} />
              <ToggleInput label="Stop on identity mismatch" checked={patch.block_on_account_mismatch} onChange={(checked) => setPatch((c) => ({ ...c, block_on_account_mismatch: checked }))} />
              <ToggleInput label="Stop on device/offline issue" checked={patch.block_on_device_offline} onChange={(checked) => setPatch((c) => ({ ...c, block_on_device_offline: checked }))} />
              <ToggleInput label="Notify on blocked restart" checked={patch.notify_on_blocked_restart} onChange={(checked) => setPatch((c) => ({ ...c, notify_on_blocked_restart: checked }))} />
            </div>
          </section>

          <section className="auto-restart-panel auto-restart-runtime">
            <h3>Runtime status</h3>
            <div className="auto-restart-runtime-grid">
              <RuntimeStat label="Eligible accounts" value={String(eligibleCount)} />
              <RuntimeStat label="Blocked accounts" value={String(blockedCount)} />
              <RuntimeStat label="Next evaluation" value={overview.nextEligibleRestartAt ?? "Not scheduled"} />
              <RuntimeStat label="Last evaluation" value={overview.lastRestartAt ?? "None"} />
            </div>
            <div className="auto-restart-actions">
              <button type="button" className="auto-restart-secondary" onClick={() => onNavigate("candidates")}>View candidates</button>
            </div>
          </section>

          <div className="auto-restart-actions auto-restart-save-row">
            <button type="button" className="auto-restart-primary" disabled={saving || !dirty} onClick={() => void saveSettings()}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </>
      ) : null}

      {enableConfirmOpen ? (
        <Modal
          title="Enable Auto Restart?"
          confirmLabel="Enable"
          onClose={() => setEnableConfirmOpen(false)}
          onConfirm={() => void confirmEnable()}
        >
          <p>Enable Auto Restart in Production mode? Eligible accounts with active schedules will be evaluated on each tick.</p>
        </Modal>
      ) : null}
    </div>
  );
}

function toneForState(truth: ReturnType<typeof projectAutoRestartTruth>, foundationBlocked: boolean): BadgeTone {
  if (foundationBlocked) return "error";
  return truth.autoRestartTone;
}

function RuntimeStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="auto-restart-runtime-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="auto-restart-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (!Number.isFinite(parsed)) return;
          onChange(Math.min(max, Math.max(min, Math.trunc(parsed))));
        }}
      />
    </label>
  );
}

function ToggleInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="auto-restart-field auto-restart-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
