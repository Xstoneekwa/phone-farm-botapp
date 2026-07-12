import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Modal } from "../design/components";
import type { BotAppSchedulerDailyPipelineAccount, BotAppSchedulerStatus } from "../api/types";
import { createDevicesAutoRefreshController } from "./devices-auto-refresh";
import {
  AUTO_RESTART_DECISIONS_NOTE,
  SCHEDULER_REFRESH_INTERVAL_MS,
  backendModeCopy,
  buildAccountAutoRestartStatusRows,
  dailyEngineCopy,
  decisionNavigationAccountId,
  decisionReasonDetail,
  decisionReasonLabel,
  decisionRowLabel,
  decisionTone,
  engineBadgeCopy,
  formatTickInterval,
  formatTimestamp,
  isResumePlanMissingDecision,
  isSchedulerConfigDecision,
  pipelineStatusLabel,
  pipelineStatusTone,
  preflightBlockedOperatorLabel,
  preflightKeyguardContext,
  restartStateLabel,
  shortReasonLabel,
  upcomingWindowBadge,
  upcomingWindowDayLabel,
  yesNoLabel,
} from "./scheduler-status";
import "./scheduler.css";

/**
 * Scheduler view — observability + global backend switch only.
 */
export function Scheduler({ onOpenProfile }: { onOpenProfile: (accountId: string) => void }) {
  const [status, setStatus] = useState<BotAppSchedulerStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [confirmEnable, setConfirmEnable] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const result = await window.botappDesktop?.scheduler?.status?.();
    if (!mountedRef.current) return;
    if (result?.ok && result.data) {
      setStatus(result.data);
      setLoadError(null);
      return;
    }
    setLoadError(result?.error || "Scheduler status unavailable.");
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const controller = createDevicesAutoRefreshController({
      refresh: () => {
        void refresh();
      },
      intervalMs: SCHEDULER_REFRESH_INTERVAL_MS,
    });
    controller.start(true);
    return () => {
      mountedRef.current = false;
      controller.stop();
    };
  }, [refresh]);

  async function applyBackendMode(enabled: boolean) {
    if (switchBusy) return;
    setSwitchBusy(true);
    setSwitchError(null);
    try {
      const result = await window.botappDesktop?.scheduler?.setEnabled?.({ enabled });
      if (!result?.ok) {
        setSwitchError(result?.error || "Could not update the Scheduler switch.");
        return;
      }
      await refresh();
    } finally {
      if (mountedRef.current) setSwitchBusy(false);
    }
  }

  function onSwitchClick() {
    if (!status || switchBusy) return;
    if (status.backend_mode === "disabled_by_config") {
      setConfirmEnable(true);
      return;
    }
    void applyBackendMode(false);
  }

  const engineCopy = status ? engineBadgeCopy[status.engine_status] : engineBadgeCopy.unknown;
  const modeCopy = status ? backendModeCopy[status.backend_mode] : null;
  const backendOn = status?.backend_mode === "enabled";
  const tickInterval = status ? formatTickInterval(status.tick_interval_seconds) : null;
  const dailyEngine = status?.daily_engine ? dailyEngineCopy[status.daily_engine.state] : null;
  const pipeline = status?.daily_scheduler_pipeline ?? null;
  const accountAutoRestartRows = status ? buildAccountAutoRestartStatusRows(status) : [];

  return (
    <div className="scheduler-view" data-testid="scheduler-view">
      <Card
        title="Scheduler"
        subtitle="Canonical backend scheduler — the dispatcher tick decides, BotApp only observes."
        actions={
          <div className="scheduler-header-actions">
            <Badge tone={engineCopy.tone} dot>{`Auto Restart engine: ${engineCopy.label}`}</Badge>
            {dailyEngine ? <Badge tone={dailyEngine.tone} dot>{dailyEngine.label}</Badge> : null}
            {modeCopy ? <Badge tone={modeCopy.tone} dot>{`Scheduler: ${modeCopy.label}`}</Badge> : null}
            <span
              title={backendOn
                ? "Turn OFF: the next canonical tick stops creating scheduled runs. Active runs keep running."
                : "Turn ON: the next canonical tick may select eligible accounts."}
            >
              <Button
                variant={backendOn ? "secondary" : "primary"}
                disabled={!status || switchBusy}
                onClick={onSwitchClick}
              >
                {switchBusy ? "Applying..." : backendOn ? "Turn OFF" : "Turn ON"}
              </Button>
            </span>
          </div>
        }
      >
        {loadError ? (
          <div className="scheduler-error" role="alert">
            <strong>Scheduler status unavailable.</strong>
            <span>{loadError}</span>
            <Button variant="ghost" onClick={() => void refresh()}>Retry</Button>
          </div>
        ) : null}
        {switchError ? (
          <div className="scheduler-error" role="alert">
            <strong>Switch not applied.</strong>
            <span>{switchError}</span>
          </div>
        ) : null}
        {!status && !loadError ? <p className="scheduler-loading">Loading scheduler status…</p> : null}
      </Card>

      {status && pipeline ? (
        <Card
          title="Daily Scheduler Pipeline"
          subtitle="Scheduled run pipeline — preflight → account session."
        >
          <dl className="scheduler-metrics">
            <div>
              <dt>Last daily cron</dt>
              <dd>{formatTimestamp(pipeline.global.last_cron_at)}</dd>
            </div>
            <div>
              <dt>Last success</dt>
              <dd>{formatTimestamp(pipeline.global.last_success_at)}</dd>
            </div>
            {status.daily_runtime_gate ? (
              <>
                <div>
                  <dt>Daily runtime gate</dt>
                  <dd>{status.daily_runtime_gate.scheduler_connected ? "passing" : "blocked"}</dd>
                </div>
                <div>
                  <dt>BotApp heartbeat age</dt>
                  <dd>{status.daily_runtime_gate.heartbeat_age_seconds === null ? "unknown" : `${status.daily_runtime_gate.heartbeat_age_seconds}s`}</dd>
                </div>
                <div>
                  <dt>Last daily block reason</dt>
                  <dd title={status.daily_runtime_gate.reason}>{shortReasonLabel(pipeline.global.last_daily_block_reason || status.daily_runtime_gate.reason)}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>Accounts evaluated</dt>
              <dd>{pipeline.global.accounts_evaluated}</dd>
            </div>
            <div>
              <dt>Last evaluated account</dt>
              <dd>{pipeline.global.last_evaluated_username || pipeline.global.last_evaluated_account_id || "none"}</dd>
            </div>
          </dl>

          {pipeline.accounts.length === 0 ? (
            <p className="scheduler-empty">No active scheduled account in the current projection window.</p>
          ) : (
            <ul className="scheduler-pipeline">
              {pipeline.accounts.map((account) => (
                <PipelineAccountRow key={account.account_id} account={account} onOpenProfile={onOpenProfile} />
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {status ? (
        <Card
          title={`Upcoming windows (${status.windows_horizon_hours ?? 48}h)`}
          subtitle="Daily recurrence derived from each account's Schedule — read-only projection, no run is created here."
        >
          {(status.upcoming_windows ?? []).length === 0 ? (
            <p className="scheduler-empty">
              No scheduled window in the next {status.windows_horizon_hours ?? 48}h.
              Accounts in manual-only mode are never scheduled automatically.
            </p>
          ) : (
            <ul className="scheduler-decisions scheduler-windows">
              {(status.upcoming_windows ?? []).map((window, index) => {
                const badge = upcomingWindowBadge(window);
                const label = window.username || window.account_id;
                return (
                  <li key={`${window.account_id}-${window.starts_at}-${index}`}>
                    <button
                      type="button"
                      className="scheduler-decision-account"
                      title="Open in Profiles"
                      onClick={() => onOpenProfile(window.account_id)}
                    >
                      {label}
                    </button>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    <span className="scheduler-decision-reason" title={`${window.starts_at} → ${window.ends_at} (${window.timezone})`}>
                      {window.local_slot} · {upcomingWindowDayLabel(window, new Date())}
                      {window.device_name ? ` · ${window.device_name}` : ""}
                    </span>
                    <span className="scheduler-decision-time">{formatTimestamp(window.starts_at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {status ? (
        <Card
          title="Auto Restart Engine"
          subtitle="Auto Restart decisions only — not scheduled run attempts."
        >
          <dl className="scheduler-metrics">
            <div>
              <dt>Last Auto Restart tick</dt>
              <dd>{formatTimestamp(status.last_tick_at)}</dd>
            </div>
            <div>
              <dt>Last success</dt>
              <dd>{formatTimestamp(status.last_success_at)}</dd>
            </div>
            {tickInterval ? (
              <div>
                <dt>Tick interval</dt>
                <dd>{tickInterval}</dd>
              </div>
            ) : null}
            <div>
              <dt>Decisions ({status.decisions_window_hours}h)</dt>
              <dd title="Auto Restart tick only">{status.examined_count}</dd>
            </div>
            <div>
              <dt>Runs enqueued ({status.decisions_window_hours}h)</dt>
              <dd title="Auto Restart enqueues only">{status.enqueued_count}</dd>
            </div>
            <div>
              <dt>Blocked ({status.decisions_window_hours}h)</dt>
              <dd title="Auto Restart blocked resume decisions only">{status.blocked_count}</dd>
            </div>
            {status.last_error ? (
              <div>
                <dt>Last error</dt>
                <dd className="scheduler-error-value" title={status.last_error.reason}>
                  {shortReasonLabel(status.last_error.reason)} · {formatTimestamp(status.last_error.at)}
                </dd>
              </div>
            ) : null}
          </dl>

          <span className="scheduler-note" title={AUTO_RESTART_DECISIONS_NOTE}>{AUTO_RESTART_DECISIONS_NOTE}</span>

          <h3 className="scheduler-subtitle">Account Auto Restart status</h3>
          {accountAutoRestartRows.length === 0 ? (
            <p className="scheduler-empty">No active scheduled account in the current projection window.</p>
          ) : (
            <ul className="scheduler-decisions">
              {accountAutoRestartRows.map((account) => (
                <li key={account.account_id}>
                  <button
                    type="button"
                    className="scheduler-decision-account"
                    title="Open in Profiles"
                    onClick={() => onOpenProfile(account.account_id)}
                  >
                    {account.username}
                  </button>
                  <Badge tone={account.restart_state === "scheduled" ? "success" : account.restart_state === "blocked" ? "warning" : "neutral"}>
                    {restartStateLabel(account.restart_state)}
                  </Badge>
                  <span
                    className="scheduler-decision-reason"
                    title={account.latest_decision ? decisionReasonDetail(account.latest_decision) || account.latest_decision.reason : account.reason}
                  >
                    {account.last_session_state} · {account.reason}
                    {account.decision_count > 1 ? ` · ${account.decision_count} recent decisions` : ""}
                  </span>
                  <span className="scheduler-decision-time">{formatTimestamp(account.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="scheduler-subtitle">Recent Auto Restart decisions</h3>

          {status.recent_decisions.length === 0 ? (
            <p className="scheduler-empty">
              {backendOn
                ? "No Auto Restart decision recorded in this window."
                : "Scheduler is OFF: Auto Restart ticks skip selection."}
            </p>
          ) : (
            <ul className="scheduler-decisions">
              {status.recent_decisions.map((decision, index) => {
                const accountId = decisionNavigationAccountId(decision);
                const configEvent = isSchedulerConfigDecision(decision);
                const label = decisionRowLabel(decision);
                const detail = decisionReasonDetail(decision);
                return (
                  <li key={`${decision.created_at}-${decision.account_id}-${index}`}>
                    {accountId ? (
                      <button
                        type="button"
                        className="scheduler-decision-account"
                        title="Open in Profiles"
                        onClick={() => onOpenProfile(accountId)}
                      >
                        {label}
                      </button>
                    ) : (
                      <span className="scheduler-decision-account scheduler-decision-account-static">{label}</span>
                    )}
                    {configEvent ? (
                      <Badge tone="neutral">config</Badge>
                    ) : (
                      <Badge tone={decisionTone(decision.decision)}>{decision.decision || "unknown"}</Badge>
                    )}
                    {configEvent ? null : (
                      <span
                        className="scheduler-decision-reason"
                        title={detail || decision.reason}
                      >
                        {decisionReasonLabel(decision)}
                        {isResumePlanMissingDecision(decision) ? " · not a scheduled run failure" : ""}
                      </span>
                    )}
                    <span className="scheduler-decision-time">{formatTimestamp(decision.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {confirmEnable ? (
        <Modal
          title="Turn Scheduler ON?"
          confirmLabel="Turn ON"
          onClose={() => setConfirmEnable(false)}
          onConfirm={() => {
            setConfirmEnable(false);
            void applyBackendMode(true);
          }}
        >
          <p>
            The next canonical tick may enqueue runs for eligible accounts.
            No run starts from this click.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

function PipelineAccountRow({
  account,
  onOpenProfile,
}: {
  account: BotAppSchedulerDailyPipelineAccount;
  onOpenProfile: (accountId: string) => void;
}) {
  const preflight = account.preflight;
  const keyguard = preflightKeyguardContext(preflight);
  const preflightLabel = preflight?.status === "preflight_ready"
    ? "Preflight ready"
    : preflightBlockedOperatorLabel(preflight);
  return (
    <li className="scheduler-pipeline-row">
      <div className="scheduler-pipeline-head">
        <button
          type="button"
          className="scheduler-decision-account"
          onClick={() => onOpenProfile(account.account_id)}
        >
          {account.username || account.account_id}
        </button>
        <Badge tone={pipelineStatusTone(account.pipeline_status)}>{pipelineStatusLabel(account.pipeline_status)}</Badge>
        <span className="scheduler-pipeline-meta">
          {account.phone_name || "No phone"} · {account.package_name || "package unknown"}
        </span>
        <span className="scheduler-pipeline-meta">
          Window {account.current_window || "—"} → next {account.next_window || "—"}
        </span>
      </div>

      {preflight ? (
        <dl className="scheduler-pipeline-details">
          <div><dt>Preflight</dt><dd title={preflight.reason_code || undefined}>{preflightLabel}</dd></div>
          <div><dt>preflight_id</dt><dd className="mono">{preflight.preflight_id}</dd></div>
          <div><dt>request_id</dt><dd className="mono">{preflight.request_id || "—"}</dd></div>
          <div><dt>phase</dt><dd>{preflight.phase || "—"}</dd></div>
          <div><dt>reason_code</dt><dd>{preflight.reason_code || "—"}</dd></div>
          <div><dt>screen_type</dt><dd>{preflight.screen_type || "—"}</dd></div>
          <div><dt>detection_reason</dt><dd>{preflight.detection_reason || "—"}</dd></div>
          <div><dt>identity_guard_stage</dt><dd>{preflight.identity_guard_stage || "—"}</dd></div>
          <div><dt>expected_username</dt><dd>{preflight.expected_username || "—"}</dd></div>
          <div><dt>actual_logged_in_username</dt><dd>{preflight.actual_logged_in_username || "—"}</dd></div>
          <div><dt>screenshot_captured</dt><dd>{yesNoLabel(preflight.screenshot_captured)}</dd></div>
          <div><dt>xml_dump_captured</dt><dd>{yesNoLabel(preflight.xml_dump_captured)}</dd></div>
          <div><dt>unlock_result</dt><dd>{preflight.unlock_result || "—"}</dd></div>
          <div><dt>worker_id</dt><dd className="mono">{preflight.worker_id || "—"}</dd></div>
          <div><dt>updated_at</dt><dd>{formatTimestamp(preflight.updated_at)}</dd></div>
          {keyguard ? <div><dt>keyguard</dt><dd>{keyguard}</dd></div> : null}
        </dl>
      ) : null}

      {account.account_session.exists ? (
        <dl className="scheduler-pipeline-details">
          <div><dt>Account session</dt><dd>{account.account_session.status || "unknown"}</dd></div>
          <div><dt>request_id</dt><dd className="mono">{account.account_session.request_id || "—"}</dd></div>
          <div><dt>worker_id</dt><dd className="mono">{account.account_session.worker_id || "—"}</dd></div>
          <div><dt>started_at</dt><dd>{formatTimestamp(account.account_session.started_at)}</dd></div>
          <div><dt>completed_at</dt><dd>{formatTimestamp(account.account_session.completed_at)}</dd></div>
          <div><dt>reason/error</dt><dd>{account.account_session.reason || "—"}</dd></div>
          <div><dt>phone state</dt><dd>{account.account_session.phone_state}</dd></div>
        </dl>
      ) : account.account_session_absent_reason ? (
        <span className="scheduler-pipeline-absent">{account.account_session_absent_reason}</span>
      ) : null}
    </li>
  );
}
