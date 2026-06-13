import { useState } from "react";
import type { AutoRestartControl, AutoRestartOverview, AutoRestartSafetyStatus, AutoRestartStatus } from "../api/types";
import { Badge, Card, Modal, type BadgeTone } from "../design/components";
import "./auto-restart.css";

function statusTone(status: AutoRestartStatus | AutoRestartSafetyStatus): BadgeTone {
  if (status === "enabled" || status === "safe") return "success";
  if (status === "blocked" || status === "unavailable") return "error";
  if (status === "watch" || status === "backend_pending") return "warning";
  return "neutral";
}

function valueOrPending(value: string | number | null) {
  if (value === null || value === "") return "No data";
  return String(value);
}

type AutoRestartNavTarget = "accounts" | "devices" | "credentials" | "activity" | "compass" | "safety" | "candidates";

export function AutoRestart({
  overview,
  onAction,
  onRefresh,
  onDryRun,
  onPreviewControl,
  onNavigate,
}: {
  overview: AutoRestartOverview;
  onAction: (action: string, target: string, danger?: boolean) => void;
  onRefresh: () => void;
  onDryRun: () => void;
  onPreviewControl: (control: AutoRestartControl) => void;
  onNavigate: (target: AutoRestartNavTarget) => void;
}) {
  const [pendingControl, setPendingControl] = useState<AutoRestartControl | null>(null);

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
      setPendingControl(control);
      return;
    }
    onPreviewControl(control);
  }

  function confirmControl() {
    if (!pendingControl) return;
    onPreviewControl(pendingControl);
    onAction(pendingControl.label, `${pendingControl.action} · ${pendingControl.requestId}`, true);
    setPendingControl(null);
  }

  return (
    <div className="auto-restart-screen">
      <header className="auto-restart-hero">
        <div>
          <span>Automation runtime</span>
          <h2>Auto Restart</h2>
          <p>{overview.sourceSummary || "Shared-backend restart preview and scheduler controls."}</p>
        </div>
        <div className="auto-restart-hero-status">
          <Badge tone={statusTone(overview.status)} dot>{overview.status.replaceAll("_", " ")}</Badge>
          <strong>{overview.enabled ? "Enabled" : "Disabled"}</strong>
          <small>{overview.mode.replaceAll("_", " ")} · {overview.backendSyncStatus.replaceAll("_", " ")}</small>
        </div>
      </header>

      <section className="auto-restart-action-bar" aria-label="Auto Restart actions">
        <button type="button" onClick={onRefresh}>Refresh overview</button>
        <button type="button" onClick={onDryRun}>Run dry-run preview</button>
        <button type="button" onClick={() => onNavigate("candidates")}>View candidates</button>
        <button type="button" onClick={() => copySafeSummary(overview)}>Copy safe summary</button>
      </section>

      <section className="auto-restart-kpis" aria-label="Auto Restart overview">
        <Kpi label="Current mode" value={overview.mode.replaceAll("_", " ")} detail={overview.backendSyncStatus.replaceAll("_", " ")} tone={statusTone(overview.status)} />
        <Kpi label="Last check" value={valueOrPending(overview.lastRestartAt)} detail="Scheduler heartbeat" tone="neutral" />
        <Kpi label="Next check" value={valueOrPending(overview.nextEligibleRestartAt)} detail="Next scheduler pass" tone="warning" />
        <Kpi label="Affected accounts" value={overview.activeAccountsAffected} detail="Eligible or blocked" tone={overview.activeAccountsAffected ? "warning" : "neutral"} />
        <Kpi label="Safety" value={overview.safetyStatus.replaceAll("_", " ")} detail="Gates summary" tone={statusTone(overview.safetyStatus)} />
      </section>

      <section className="auto-restart-grid">
        <Card title="Rules">
          <div className="auto-restart-toggle-grid">
            <ToggleCard label="Auto Restart" checked={overview.rules.enabled} disabled={!overview.rules.writable} />
            <ToggleCard label="Restart Yellow Accounts" checked={overview.rules.restartYellowAccounts} disabled={!overview.rules.writable} />
            <ToggleCard label="Restart Red Accounts" checked={overview.rules.restartRedAccounts} disabled={!overview.rules.writable} />
            <ToggleCard label="Respect Fixed Blackouts" checked={overview.rules.respectFixedBlackouts} disabled={!overview.rules.writable} />
            <ToggleCard label="Respect 6h Session Window" checked={overview.rules.respectSixHourWindow} disabled={!overview.rules.writable} />
          </div>
          {!overview.rules.writable ? <p className="auto-restart-compact-note">Read-only until scheduler settings are wired.</p> : null}
        </Card>

        <Card title="Limits">
          <div className="auto-restart-number-grid">
            <NumberCard label="Check every" value={overview.rules.checkEveryMinutes} suffix="min" />
            <NumberCard label="Max restarts/day" value={overview.rules.maxRestartsPerAccountPerDay} suffix="per account" />
            <NumberCard label="Max restarts/window" value={overview.rules.maxRestartsPerAccountPerWindow} suffix="per window" />
          </div>
        </Card>
      </section>

      <section className="auto-restart-grid">
        <Card title="Quota Resume">
          <div className="resume-grid">
            <Metric label="Paused due to quota" value={overview.sessionResume.pausedDueToQuota} />
            <Metric label="Eligible to resume" value={overview.sessionResume.eligibleToResume} />
            <Metric label="Follows left" value={valueOrPending(overview.sessionResume.remainingDailyQuota.follows)} />
            <Metric label="Unfollows left" value={valueOrPending(overview.sessionResume.remainingDailyQuota.unfollows)} />
            <Metric label="DMs left" value={valueOrPending(overview.sessionResume.remainingDailyQuota.dms)} />
            <Metric label="Next window" value={valueOrPending(overview.sessionResume.nextResumeWindow)} />
          </div>
          {overview.sessionResume.resumeBlockedReason ? <InfoLine label="Blocked reason" value={overview.sessionResume.resumeBlockedReason} /> : null}
        </Card>

        <Card title="Runtime Controls">
          <div className="auto-restart-button-grid">
            {runtimeControls(overview.controls).map((control) => (
              <button key={control.action} type="button" disabled={control.backendStatus !== "relay_ready"} onClick={() => requestControl(control)} title={control.backendStatus !== "relay_ready" ? "Scheduler not wired" : control.detail}>
                <strong>{control.label}</strong>
                <small>{control.backendStatus === "relay_ready" ? control.detail : "Scheduler not wired"}</small>
              </button>
            ))}
          </div>
        </Card>
      </section>

      <section className="auto-restart-grid">
        <Card title="Navigation">
          <div className="auto-restart-button-grid">
            {navigationControls(overview.controls).map((control) => (
              <button key={control.action} type="button" onClick={() => requestControl(control)}>
                <strong>{control.label}</strong>
                <small>{control.detail}</small>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Phone / Device Rest">
          <div className="rest-summary">
            <Metric label="Phones resting" value={overview.phoneRest.phonesResting} />
            <Metric label="Phones active" value={overview.phoneRest.phonesActive} />
            <Metric label="Next rest" value={valueOrPending(overview.phoneRest.nextRestWindow)} />
          </div>
          {overview.phoneRest.devices.length ? (
            <div className="device-rest-list">
              {overview.phoneRest.devices.map((device) => (
                <button key={device.deviceId} type="button" onClick={() => onNavigate("devices")}>
                  <strong>{device.deviceLabel}</strong>
                  <Badge tone={device.status === "active" ? "success" : device.status === "offline" ? "error" : "warning"}>{device.status}</Badge>
                  <small>{device.reason}</small>
                </button>
              ))}
            </div>
          ) : <Empty title="No device gates." detail="No data" />}
        </Card>
      </section>

      <Card title="Candidate Accounts">
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
        ) : <Empty title="No candidates." detail="No data" />}
      </Card>

      <Card title="Safety Gates">
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

      <Card title="Last Decisions">
        {overview.decisions.length ? (
          <div className="auto-restart-table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Account</th><th>Action</th><th>Reason</th><th>Request</th></tr></thead>
              <tbody>
                {overview.decisions.map((decision) => (
                  <tr key={decision.id}>
                    <td>{decision.decisionTime ?? "No time"}</td>
                    <td>{decision.account}</td>
                    <td>{decision.action}</td>
                    <td>{decision.reason}</td>
                    <td>{decision.requestId ?? "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No decisions." detail="No data" />}
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
            <p>Request id: <code>{pendingControl.requestId}</code></p>
          </div>
        </Modal>
      ) : null}
    </div>
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
  const actions = new Set<AutoRestartControl["action"]>([
    "enable_auto_restart",
    "disable_auto_restart",
    "restart_eligible_sessions",
    "resume_quota_paused",
    "pause_device_rest",
    "resume_phone",
  ]);
  return controls.filter((control) => actions.has(control.action));
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

function copySafeSummary(overview: AutoRestartOverview) {
  const summary = [
    `Auto Restart: ${overview.enabled ? "enabled" : "disabled"}`,
    `Mode: ${overview.mode}`,
    `Eligible: ${overview.activeAccountsAffected}`,
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

function Kpi({ label, value, detail, tone }: { label: string; value: string | number; detail: string; tone: BadgeTone }) {
  return <article className={`auto-restart-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="auto-restart-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function InfoLine({ label, value }: { label: string; value: string | number }) {
  return <div className="auto-restart-info-line"><span>{label}</span><strong>{value}</strong></div>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{detail}</span></div>;
}
