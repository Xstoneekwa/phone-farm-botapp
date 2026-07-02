import { useState } from "react";
import type { AutoRestartControl, AutoRestartOverview, AutoRestartSafetyStatus, AutoRestartStatus } from "../api/types";
import type { BotAppDispatcherHealth, BotAppRelayHealth } from "../api/types";
import { Badge, Card, Modal, type BadgeTone } from "../design/components";
import {
  formatAutoRestartDisplayValue,
  formatBlockedCandidatesReason,
  formatUnavailableValue,
  controlLabel,
  deviceStatusLabel,
  safetyStatusLabel,
  humanizeDeviceRestReason,
} from "./auto-restart-labels";
import {
  isRuntimeMutationControl,
  projectAutoRestartTruth,
  runtimeControlDisabled,
} from "./auto-restart-status";
import { AutoRestartSettingsDrawer } from "./AutoRestartSettingsDrawer";
import "./auto-restart.css";

function statusTone(status: AutoRestartStatus | AutoRestartSafetyStatus): BadgeTone {
  if (status === "enabled" || status === "safe") return "success";
  if (status === "blocked" || status === "unavailable") return "error";
  if (status === "watch" || status === "backend_pending") return "warning";
  return "neutral";
}

type AutoRestartNavTarget = "accounts" | "devices" | "credentials" | "activity" | "compass" | "safety" | "candidates";

export function AutoRestart({
  overview,
  relayHealth,
  dispatcherHealth,
  onAction,
  onRefresh,
  onDryRun,
  onPreviewControl,
  onExecuteControl,
  onNavigate,
}: {
  overview: AutoRestartOverview;
  relayHealth: BotAppRelayHealth | null;
  dispatcherHealth: BotAppDispatcherHealth | null;
  onAction: (action: string, target: string, danger?: boolean) => void;
  onRefresh: () => void;
  onDryRun: () => void;
  onPreviewControl: (control: AutoRestartControl) => void;
  onExecuteControl: (control: AutoRestartControl) => Promise<void>;
  onNavigate: (target: AutoRestartNavTarget) => void;
}) {
  const [pendingControl, setPendingControl] = useState<AutoRestartControl | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPhoneDeviceId, setSelectedPhoneDeviceId] = useState("");
  const truth = projectAutoRestartTruth({ overview, relayHealth, dispatcherHealth });

  function requestControl(control: AutoRestartControl) {
    if (control.action === "refresh_overview") {
      onRefresh();
      return;
    }
    if (control.action === "dry_run_preview") {
      onDryRun();
      return;
    }
    const navTarget = navigationTarget(control.action);
    if (navTarget) {
      onPreviewControl(control);
      onNavigate(navTarget);
      return;
    }
    if (control.confirmationRequired) {
      setPendingControl({
        ...control,
        targetDeviceId: selectedPhoneDeviceId || control.targetDeviceId,
      });
      return;
    }
    onPreviewControl(control);
  }

  async function confirmControl() {
    if (!pendingControl) return;
    await onExecuteControl(pendingControl);
    setPendingControl(null);
  }

  const modeLabel = overview.mode === "dry_run"
    ? "Dry-run preview"
    : overview.mode === "backend_pending"
      ? "Backend pending"
      : overview.mode === "active"
        ? "Active"
        : "Disabled";

  return (
    <div className="auto-restart-screen">
      <header className="auto-restart-hero">
        <div className="auto-restart-hero-copy">
          <span>Automation runtime</span>
          <h2>Auto Restart</h2>
          <p>{overview.sourceSummary || "Automatic resume preview and controls via the shared backend."}</p>
        </div>
        <div className="auto-restart-hero-status">
          <Badge tone={truth.autoRestartTone} dot>{truth.heroBadgeLabel}</Badge>
          <strong>{truth.autoRestartTitle}</strong>
          <small>{truth.autoRestartDetail}</small>
        </div>
      </header>

      {truth.blockReasons.length ? (
        <p className="auto-restart-compact-note" role="status">{truth.blockReasons.join(", ")}</p>
      ) : null}

      <section className="auto-restart-action-bar" aria-label="Auto Restart actions">
        <button type="button" onClick={onRefresh}>Refresh</button>
        <button type="button" onClick={onDryRun}>Run dry-run check</button>
        <button type="button" onClick={() => onNavigate("candidates")}>View candidates</button>
        <button type="button" onClick={() => copySafeSummary(overview, truth)}>Copy safe summary</button>
        {overview.rules.writable ? <button type="button" onClick={() => setSettingsOpen(true)}>Edit Auto Restart</button> : null}
      </section>

      <section className="auto-restart-kpis" aria-label="Auto Restart summary">
        <Kpi label="Current mode" value={modeLabel} detail={truth.operationalState} tone={statusTone(overview.status)} />
        <Kpi label="Pilot account" value={overview.rules.pilotUsername ? `@${overview.rules.pilotUsername}` : "Not set"} detail={overview.rules.pilotAccountId || "Required before activation"} tone={overview.rules.pilotAccountId ? "warning" : "neutral"} />
        <Kpi label="Check interval" value={`${overview.rules.checkEveryMinutes} min`} detail="Scheduler cadence" tone="neutral" />
        <Kpi label="Restart delay" value={`${overview.rules.restartDelayMinutes} min`} detail="Between attempts" tone="neutral" />
        <Kpi label="Affected accounts" value={overview.activeAccountsAffected} detail="Eligible or blocked" tone={overview.activeAccountsAffected ? "warning" : "neutral"} />
        <Kpi label="Safety" value={safetyStatusLabel(overview.safetyStatus)} detail="Safety gates summary" tone={statusTone(overview.safetyStatus)} />
      </section>

      <section className="auto-restart-grid">
        <Card title="Rules">
          <div className="auto-restart-toggle-grid">
            <ToggleCard label="Auto Restart" checked={overview.rules.enabled} disabled={!overview.rules.writable} />
            <ToggleCard label="Restart yellow accounts" checked={overview.rules.restartYellowAccounts} disabled={!overview.rules.writable} />
            <ToggleCard label="Restart red accounts" checked={overview.rules.restartRedAccounts} disabled={!overview.rules.writable} />
            <ToggleCard label="Respect fixed blackouts" checked={overview.rules.respectFixedBlackouts} disabled={!overview.rules.writable} />
            <ToggleCard label="Respect 6-hour window" checked={overview.rules.respectSixHourWindow} disabled={!overview.rules.writable} />
          </div>
          {!overview.rules.writable ? (
            <p className="auto-restart-compact-note">Read-only — backend migration required before editing.</p>
          ) : (
            <p className="auto-restart-compact-note">Settings persisted in Supabase via authenticated relay.</p>
          )}
        </Card>

        <Card title="Limits">
          <div className="auto-restart-number-grid">
            <NumberCard label="Max attempts/session" value={overview.rules.maxAttemptsPerSession} suffix="per session" />
            <NumberCard label="Max restarts/day" value={overview.rules.maxRestartsPerAccountPerDay} suffix="per account" />
            <NumberCard label="Max restarts/window" value={overview.rules.maxRestartsPerAccountPerWindow} suffix="per window" />
          </div>
        </Card>
      </section>

      <section className="auto-restart-grid">
        <Card title="Quota resume">
          <div className="resume-grid">
            <MetricDisplay label="Paused (quota)" value={overview.sessionResume.pausedDueToQuota} truth={truth} />
            <MetricDisplay label="Eligible to resume" value={overview.sessionResume.eligibleToResume} truth={truth} />
            <MetricDisplay label="Follows remaining" value={overview.sessionResume.remainingDailyQuota.follows} truth={truth} />
            <MetricDisplay label="Unfollows remaining" value={overview.sessionResume.remainingDailyQuota.unfollows} truth={truth} />
            <MetricDisplay label="DMs remaining" value={overview.sessionResume.remainingDailyQuota.dms} truth={truth} />
            <MetricUnavailable label="Next window" value={overview.sessionResume.nextResumeWindow} />
          </div>
          {overview.sessionResume.resumeBlockedReason ? (
            <InfoLine label="Block reason" value={formatBlockedCandidatesReason(overview.sessionResume.resumeBlockedReason, truth) ?? overview.sessionResume.resumeBlockedReason} />
          ) : null}
        </Card>

        <Card title="Runtime controls">
          <p className="auto-restart-compact-note">{truth.controlsUnavailableReason}</p>
          <div className="auto-restart-button-grid auto-restart-runtime-grid">
            {runtimeControls(overview.controls).map((control) => {
              const disabled = runtimeControlDisabled(control, truth);
              const disabledReason = disabled ? truth.controlsUnavailableReason : control.detail;
              return (
                <button
                  key={control.action}
                  type="button"
                  disabled={disabled}
                  onClick={() => requestControl(control)}
                  title={disabledReason}
                >
                  <strong>{controlLabel(control)}</strong>
                  <small>{disabledReason}</small>
                </button>
              );
            })}
          </div>
        </Card>
      </section>

      <section className="auto-restart-grid">
        <Card title="Navigation">
          <div className="auto-restart-button-grid auto-restart-navigation-grid">
            {navigationControls(overview.controls).map((control) => (
              <button key={control.action} type="button" onClick={() => requestControl(control)}>
                <strong>{controlLabel(control)}</strong>
                <small>{control.detail}</small>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Phone rest">
          <label className="auto-restart-device-picker">
            <span>Target phone for pause/resume</span>
            <select
              value={selectedPhoneDeviceId}
              onChange={(event) => setSelectedPhoneDeviceId(event.target.value)}
            >
              <option value="">Select a phone</option>
              {overview.phoneRest.devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>{device.deviceLabel}</option>
              ))}
            </select>
          </label>
          {overview.phoneRest.devices.length ? (
            <div className="device-rest-list">
              {overview.phoneRest.devices.map((device) => (
                <button key={device.deviceId} type="button" onClick={() => onNavigate("devices")}>
                  <strong>{device.deviceLabel}</strong>
                  <Badge tone={device.status === "active" ? "success" : device.status === "offline" ? "error" : "warning"}>{deviceStatusLabel(device.status)}</Badge>
                  <small>{humanizeDeviceRestReason(device.reason, false)}</small>
                </button>
              ))}
            </div>
          ) : <Empty title="No devices listed." detail="Unavailable" secondary="Scheduler is not connected to runtime yet." />}
        </Card>
      </section>

      <Card title="Candidate accounts">
        {overview.quotaCandidates.length ? (
          <div className="auto-restart-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Package</th>
                  <th>Follow</th>
                  <th>Unfollow</th>
                  <th>Welcome</th>
                  <th>Outreach</th>
                  <th>Next run</th>
                  <th>Decision</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {overview.quotaCandidates.map((candidate) => (
                  <tr key={candidate.accountId}>
                    <td><button type="button" className="auto-restart-link" onClick={() => onNavigate("accounts")}><strong>@{candidate.username}</strong><small>{candidate.phoneName}</small></button></td>
                    <td>{candidate.packageLabel}</td>
                    <td>{candidate.followRemaining}</td>
                    <td>{candidate.unfollowRemaining}</td>
                    <td>{candidate.welcomeRemaining}</td>
                    <td>{candidate.outreachRemaining}</td>
                    <td>{candidate.plannedRunType}</td>
                    <td>{candidate.decision}</td>
                    <td>{candidate.reason || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : overview.affectedAccounts.length ? (
          <div className="auto-restart-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th>Quota</th>
                  <th>Device</th>
                  <th>Next action</th>
                  <th>Blocker</th>
                </tr>
              </thead>
              <tbody>
                {overview.affectedAccounts.map((account) => (
                  <tr key={account.accountId}>
                    <td><button type="button" className="auto-restart-link" onClick={() => onNavigate("accounts")}><strong>@{account.username}</strong><small>{account.clientName}</small></button></td>
                    <td>{account.packageLabel}</td>
                    <td>{account.status}</td>
                    <td>{account.quotaStatus} · {account.resumeEligibility}</td>
                    <td><button type="button" className="auto-restart-link" onClick={() => onNavigate("devices")}>{account.assignedDevice}</button></td>
                    <td>{account.nextAction}</td>
                    <td>{account.blockingReason ?? "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No candidates." detail="Unavailable" secondary="Scheduler is not connected to runtime yet." />}
      </Card>

      <Card title="Safety gates">
        <div className="safety-rules">
          {overview.safetyRules.map((rule) => (
            <article key={rule.id}>
              <Badge tone={statusTone(rule.status)}>{rule.status.replaceAll("_", " ")}</Badge>
              <strong>{rule.label}</strong>
              <small>{rule.detail}</small>
            </article>
          ))}
        </div>
      </Card>

      <Card title="Recent decisions">
        {overview.decisions.length ? (
          <div className="auto-restart-table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Account</th><th>Action</th><th>Reason</th><th>Request</th></tr></thead>
              <tbody>
                {overview.decisions.map((decision) => (
                  <tr key={decision.id}>
                    <td>{decision.decisionTime ?? truth.emptyValueLabel}</td>
                    <td>{decision.account}</td>
                    <td>{decision.action}</td>
                    <td>{decision.reason}</td>
                    <td>{decision.requestId ?? "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No decisions." detail="Unavailable" secondary="Scheduler is not connected to runtime yet." />}
      </Card>

      {pendingControl ? (
        <Modal
          title={`${pendingControl.label}?`}
          danger
          confirmLabel="Confirm"
          onClose={() => setPendingControl(null)}
          onConfirm={confirmControl}
        >
          <div className="auto-restart-confirm">
            <p><strong>Impact:</strong> {pendingControl.impact}</p>
            <p>Affected accounts: <strong>{pendingControl.affectedAccountsCount}</strong></p>
            <p>Affected devices: <strong>{pendingControl.affectedDevicesCount}</strong></p>
            <p>Dry-run: <strong>{pendingControl.dryRun ? "Yes" : "No"}</strong></p>
            <p>Request id : <code>{pendingControl.requestId}</code></p>
          </div>
        </Modal>
      ) : null}

      <AutoRestartSettingsDrawer
        open={settingsOpen}
        overview={overview}
        onClose={() => setSettingsOpen(false)}
        onSaved={(message, tone) => {
          onAction(message, "auto-restart-settings", tone === "error");
          if (tone === "success") onRefresh();
        }}
      />
    </div>
  );
}

function InfraStatus({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: BadgeTone }) {
  return (
    <article className={`auto-restart-infra-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function navigationTarget(action: AutoRestartControl["action"]): AutoRestartNavTarget | null {
  if (action === "open_affected_accounts") return "accounts";
  if (action === "open_device") return "devices";
  if (action === "open_credentials") return "credentials";
  if (action === "open_activity_log") return "activity";
  if (action === "open_compass_issue") return "compass";
  if (action === "view_safety_gates") return "safety";
  if (action === "view_candidates") return "candidates";
  return null;
}

function runtimeControls(controls: AutoRestartControl[]) {
  return controls.filter((control) => isRuntimeMutationControl(control.action));
}

function navigationControls(controls: AutoRestartControl[]) {
  const actions = new Set<AutoRestartControl["action"]>([
    "open_affected_accounts",
    "open_device",
    "open_compass_issue",
    "open_credentials",
    "open_activity_log",
    "view_safety_gates",
    "view_candidates",
    "export_preview",
  ]);
  return controls.filter((control) => actions.has(control.action));
}

function copySafeSummary(overview: AutoRestartOverview, truth: ReturnType<typeof projectAutoRestartTruth>) {
  const summary = [
    `Relay: ${truth.relayLabel}`,
    `Dispatcher: ${truth.dispatcherLabel}`,
    `Auto Restart: ${truth.autoRestartTitle}`,
    `Mode: ${overview.mode}`,
    `Operational state: ${truth.operationalState}`,
    `Safety: ${overview.safetyStatus}`,
  ].join("\n");
  void navigator.clipboard?.writeText(summary);
}

function ToggleCard({ label, checked, disabled }: { label: string; checked: boolean; disabled: boolean }) {
  return (
    <label className={`auto-restart-toggle-card ${disabled ? "disabled" : ""}`}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} readOnly />
      <strong>{checked ? "On" : "Off"}</strong>
    </label>
  );
}

function NumberCard({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <article className="auto-restart-number-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{suffix}</small>
    </article>
  );
}

function KpiUnavailable({ label, value, detail, tone }: { label: string; value: string | null; detail: string; tone: BadgeTone }) {
  if (!value) {
    const unavailable = formatUnavailableValue();
    return (
      <article className={`auto-restart-kpi ${tone}`}>
        <span>{label}</span>
        <strong>{unavailable.primary}</strong>
        <small>{unavailable.secondary}</small>
      </article>
    );
  }
  return <Kpi label={label} value={value} detail={detail} tone={tone} />;
}

function MetricDisplay({
  label,
  value,
  truth,
  previewMetric = false,
}: {
  label: string;
  value: string | number | null;
  truth: ReturnType<typeof projectAutoRestartTruth>;
  previewMetric?: boolean;
}) {
  const display = formatAutoRestartDisplayValue(value, truth, { previewMetric });
  return (
    <div className="auto-restart-metric">
      <span>{label}</span>
      <strong>{display.primary}</strong>
      {display.secondary ? <small className="auto-restart-metric-note">{display.secondary}</small> : null}
    </div>
  );
}

function MetricUnavailable({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    const unavailable = formatUnavailableValue();
    return (
      <div className="auto-restart-metric">
        <span>{label}</span>
        <strong>{unavailable.primary}</strong>
        <small className="auto-restart-metric-note">{unavailable.secondary}</small>
      </div>
    );
  }
  return <Metric label={label} value={value} />;
}

function Kpi({ label, value, detail, tone }: { label: string; value: string | number; detail: string; tone: BadgeTone }) {
  return <article className={`auto-restart-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="auto-restart-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function InfoLine({ label, value }: { label: string; value: string | number }) {
  return <div className="auto-restart-info-line"><span>{label}</span><strong>{value}</strong></div>;
}

function Empty({ title, detail, secondary }: { title: string; detail: string; secondary?: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{detail}</span>
      {secondary ? <small className="auto-restart-metric-note">{secondary}</small> : null}
    </div>
  );
}
