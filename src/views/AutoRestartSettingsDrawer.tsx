import { useEffect, useState } from "react";
import type { AutoRestartOverview } from "../api/types";
import { Modal } from "../design/components";

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

export function AutoRestartSettingsDrawer({
  open,
  overview,
  onClose,
  onSaved,
}: {
  open: boolean;
  overview: AutoRestartOverview;
  onClose: () => void;
  onSaved: (message: string, tone: "success" | "error") => void;
}) {
  const [patch, setPatch] = useState<SettingsPatch>(() => toPatch(overview));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setPatch(toPatch(overview));
  }, [open, overview]);

  async function save() {
    setSaving(true);
    try {
      const result = await window.botappDesktop?.autoRestart?.saveSettings?.(patch);
      if (!result?.ok) {
        onSaved(result?.error || "Failed to save Auto Restart settings.", "error");
        return;
      }
      onSaved("Auto Restart settings saved.", "success");
      onClose();
    } catch (error) {
      onSaved(error instanceof Error ? error.message : "Failed to save Auto Restart settings.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <Modal title="Edit Auto Restart" onClose={onClose}>
      <div className="auto-restart-settings-drawer">
        <p className="auto-restart-compact-note">Operating mode: Production. Eligible accounts are determined by active schedules.</p>
        <label>
          <span>Enabled</span>
          <input type="checkbox" checked={patch.auto_restart_enabled} onChange={(event) => setPatch((current) => ({ ...current, auto_restart_enabled: event.target.checked }))} />
        </label>
        <label><span>Check interval (min)</span><input type="number" min={1} max={1440} value={patch.check_every_minutes} onChange={(event) => setPatch((current) => ({ ...current, check_every_minutes: Number(event.target.value) }))} /></label>
        <label><span>Restart delay (min)</span><input type="number" min={1} max={1440} value={patch.restart_delay_minutes} onChange={(event) => setPatch((current) => ({ ...current, restart_delay_minutes: Number(event.target.value) }))} /></label>
        <label><span>Max attempts per session</span><input type="number" min={0} max={20} value={patch.max_attempts_per_session} onChange={(event) => setPatch((current) => ({ ...current, max_attempts_per_session: Number(event.target.value) }))} /></label>
        <label><span>Max restarts/day</span><input type="number" min={0} max={50} value={patch.max_restarts_per_day_per_account} onChange={(event) => setPatch((current) => ({ ...current, max_restarts_per_day_per_account: Number(event.target.value) }))} /></label>
        <label><span>Max restarts/window</span><input type="number" min={0} max={50} value={patch.max_restarts_per_window_per_account} onChange={(event) => setPatch((current) => ({ ...current, max_restarts_per_window_per_account: Number(event.target.value) }))} /></label>
        <div className="auto-restart-settings-actions">
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
