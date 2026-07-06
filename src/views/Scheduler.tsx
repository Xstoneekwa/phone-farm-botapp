import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Modal } from "../design/components";
import type { BotAppSchedulerStatus } from "../api/types";
import { createDevicesAutoRefreshController } from "./devices-auto-refresh";
import {
  SCHEDULER_REFRESH_INTERVAL_MS,
  backendModeCopy,
  decisionNavigationAccountId,
  decisionTone,
  engineBadgeCopy,
  formatTickInterval,
  formatTimestamp,
  shortReasonLabel,
  shouldPollScheduler,
} from "./scheduler-status";
import "./scheduler.css";

/**
 * Scheduler view — observability + global backend switch only.
 *
 * Everything displayed comes from the backend read-model. The switch flips
 * the canonical `auto_restart_enabled` flag through the existing settings
 * endpoint; the next canonical tick applies the mode. This view never
 * computes eligibility and never creates runs.
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
    const onVisibilityChange = () => {
      controller.handleVisibilityChange(document.visibilityState === "visible");
    };
    controller.start(shouldPollScheduler("scheduler", document.visibilityState));
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
      // Reflect only the confirmed backend state, never a local assumption.
      await refresh();
    } finally {
      if (mountedRef.current) setSwitchBusy(false);
    }
  }

  function onSwitchClick() {
    if (!status || switchBusy) return;
    if (status.backend_mode === "disabled_by_config") {
      // OFF → ON can allow new runs on the next canonical tick: confirm first.
      setConfirmEnable(true);
      return;
    }
    void applyBackendMode(false);
  }

  const engineCopy = status ? engineBadgeCopy[status.engine_status] : engineBadgeCopy.unknown;
  const modeCopy = status ? backendModeCopy[status.backend_mode] : null;
  const backendOn = status?.backend_mode === "enabled";
  const tickInterval = status ? formatTickInterval(status.tick_interval_seconds) : null;

  return (
    <div className="scheduler-view" data-testid="scheduler-view">
      <Card
        title="Scheduler"
        subtitle="Canonical backend scheduler — the dispatcher tick decides, BotApp only observes."
        actions={
          <div className="scheduler-header-actions">
            <Badge tone={engineCopy.tone} dot>{`Engine: ${engineCopy.label}`}</Badge>
            {modeCopy ? <Badge tone={modeCopy.tone} dot>{`Backend: ${modeCopy.label}`}</Badge> : null}
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
        {status ? (
          <dl className="scheduler-metrics">
            <div>
              <dt>Last tick</dt>
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
              <dt>Accounts examined ({status.decisions_window_hours}h)</dt>
              <dd>{status.examined_count}</dd>
            </div>
            <div>
              <dt>Runs enqueued ({status.decisions_window_hours}h)</dt>
              <dd>{status.enqueued_count}</dd>
            </div>
            <div>
              <dt>Blocked ({status.decisions_window_hours}h)</dt>
              <dd>{status.blocked_count}</dd>
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
        ) : !loadError ? (
          <p className="scheduler-loading">Loading scheduler status…</p>
        ) : null}
      </Card>

      {status ? (
        <Card title="Recent decisions" subtitle={`Canonical tick decisions · last ${status.decisions_window_hours}h`}>
          {status.recent_decisions.length === 0 ? (
            <p className="scheduler-empty">
              {backendOn
                ? "No decision recorded in this window. The next tick decides."
                : "Scheduler is OFF: ticks skip selection, so no decision is recorded."}
            </p>
          ) : (
            <ul className="scheduler-decisions">
              {status.recent_decisions.map((decision, index) => {
                const accountId = decisionNavigationAccountId(decision);
                const label = decision.username || decision.account_id || "unknown account";
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
                    <Badge tone={decisionTone(decision.decision)}>{decision.decision || "unknown"}</Badge>
                    <span className="scheduler-decision-reason" title={decision.reason}>
                      {shortReasonLabel(decision.reason)}
                    </span>
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
