import { useCallback, useEffect, useState } from "react";
import { Badge, Drawer } from "../design/components";
import {
  authorizationStatusCopy,
  incidentStateCopy,
  isArmedOrPendingRecovery,
  recoveryReasonCopy,
  resolveButtonLabel,
  shouldShowAcknowledge,
  shouldShowKeepPaused,
  shouldShowReadyToResume,
  shouldShowResolve,
} from "./incidents-view";
import "./incident-drawer.css";

type IncidentRow = {
  id: string;
  status?: string;
  severity?: string;
  reason?: string;
  actionRequired?: string;
  accountUsername?: string | null;
  deviceLabel?: string | null;
  occurrenceCount?: number;
  hostMachine?: string | null;
  runId?: string | null;
  requestId?: string | null;
  triggerSource?: string | null;
  executionWorkerId?: string | null;
};

/** P3 recovery view: computed server-side, read-only for the drawer. */
type IncidentRecovery = {
  state?: string;
  eligible?: boolean;
  reason?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  windowActive?: boolean;
  authorizationId?: string | null;
  authorizationStatus?: string | null;
};

type IncidentDetail = {
  incident: IncidentRow;
  recovery?: IncidentRecovery;
  operatorReviewAction?: {
    id: string;
    accountId: string;
    status: string;
    blockingCampaign: boolean;
  } | null;
  timeline?: Array<{ actionType?: string; message?: string; createdAt?: string }>;
  notifications?: Array<{ channel?: string; status?: string; attemptCount?: number }>;
};

function formatWindowBound(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function recoveryStateLabel(recovery: IncidentRecovery | undefined): string | null {
  const state = recovery?.state;
  if (!state || state === "none") return null;
  if (state === "awaiting_human_resume_authorization") {
    return incidentStateCopy("action_required").label;
  }
  return incidentStateCopy(state).label;
}

export function IncidentDrawer({
  open,
  incidentId,
  onClose,
  onChanged,
  onProfilesChanged,
}: {
  open: boolean;
  incidentId: string | null;
  onClose: () => void;
  onChanged?: () => void;
  onProfilesChanged?: () => void;
}) {
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [confirmingReview, setConfirmingReview] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [actionProof, setActionProof] = useState<{ action: string; ok: boolean; message: string; status?: string | null } | null>(null);

  const reload = useCallback(async () => {
    if (!incidentId || !window.botappDesktop?.incidents?.detail) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.botappDesktop.incidents.detail(incidentId);
      if (!result?.ok) {
        setError(result?.message || "Incident detail unavailable.");
        setDetail(null);
        return;
      }
      setDetail(result.data as IncidentDetail);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Incident detail failed.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- drawer state follows the selected incident lifecycle */
    if (open && incidentId) void reload();
    if (!open) {
      setDetail(null);
      setResolutionNote("");
      setReviewNote("");
      setConfirmingReview(false);
      setError(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, incidentId, reload]);

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    if (!incidentId) return;
    const label = action.replace(/_/g, " ");
    if (!window.confirm(`Confirm incident action: ${label}?`)) return;
    setActing(action);
    setError(null);
    try {
      const result = await window.botappDesktop?.incidents?.action?.({
        incident_id: incidentId,
        action,
        idempotency_key: `botapp:${action}:${incidentId}`,
        ...extra,
      });
      if (!result?.ok) {
        setError(result?.error || "Incident action failed.");
        setActionProof({ action, ok: false, message: result?.error || "Incident action failed." });
        return;
      }
      setActionProof({
        action,
        ok: true,
        message: `Action ${action} recorded.`,
        status: typeof result.data?.status === "string" ? result.data.status : null,
      });
      await reload();
      onChanged?.();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Incident action failed.");
    } finally {
      setActing(null);
    }
  }

  async function markOperatorReviewed() {
    const reviewAction = detail?.operatorReviewAction;
    if (!reviewAction || acting) return;
    setActing("mark_reviewed");
    setError(null);
    try {
      const result = await window.botappDesktop?.incidents?.markReviewed?.({
        action_id: reviewAction.id,
        account_id: reviewAction.accountId,
        note: reviewNote.trim() || null,
      });
      if (!result?.ok) {
        const message = "Could not mark reviewed. Please try again.";
        setError(message);
        setActionProof({ action: "mark_reviewed", ok: false, message });
        return;
      }
      setConfirmingReview(false);
      setActionProof({ action: "mark_reviewed", ok: true, message: "Operator review recorded.", status: "resolved" });
      await reload();
      onChanged?.();
      onProfilesChanged?.();
    } catch {
      setError("Could not mark reviewed. Please try again.");
    } finally {
      setActing(null);
    }
  }

  const incident = detail?.incident;
  const recovery = detail?.recovery;
  const canAcknowledge = incident?.status === "open";
  const canResolve = incident?.status === "open" || incident?.status === "acknowledged";
  const showReadyToResume = shouldShowReadyToResume(recovery);
  const showAcknowledge = shouldShowAcknowledge(recovery, canAcknowledge);
  const showResolve = shouldShowResolve(recovery, canResolve);
  const showKeepPaused = shouldShowKeepPaused(recovery);
  const armedOrPending = isArmedOrPendingRecovery(recovery);
  const recoveryReason = recoveryReasonCopy(recovery?.reason ?? null);
  const recoveryStateText = recoveryStateLabel(recovery);
  const operatorReviewAction = detail?.operatorReviewAction;

  if (!open) return null;

  return (
    <Drawer title="Incident review" subtitle={incident?.reason || "Human review"} onClose={onClose} wide panelClassName="incident-drawer-panel" data-testid="incident-drawer">
      {loading ? <p>Loading incident…</p> : null}
      {error ? <p className="incident-drawer-error" data-testid="botapp-incident-action-error">{error}</p> : null}
      {actionProof ? (
        <p
          className={actionProof.ok ? "incident-drawer-action-proof ok" : "incident-drawer-action-proof error"}
          data-testid="botapp-incident-action-proof"
          data-action={actionProof.action}
          data-status={actionProof.ok ? "ok" : "error"}
        >
          {actionProof.action.replace(/_/g, " ")}: {actionProof.message}
        </p>
      ) : null}
      {incident ? (
        <div className="incident-drawer-body" data-testid="incident-drawer-loaded">
          <div className="incident-drawer-header">
            <Badge tone={incident.severity === "critical" ? "error" : "warning"}>{incident.severity || "warning"}</Badge>
            <Badge tone="neutral">{incident.status || "open"}</Badge>
            <span className="mono">{incident.reason || "—"}</span>
          </div>
          <dl className="incident-drawer-meta" data-testid="incident-drawer-detail-ready">
            <div><dt>Action required</dt><dd>{incident.actionRequired || "Human review"}</dd></div>
            <div><dt>Account</dt><dd>{incident.accountUsername || "—"}</dd></div>
            <div><dt>Device</dt><dd>{incident.deviceLabel || "—"}</dd></div>
            <div><dt>Host</dt><dd>{incident.hostMachine || "—"}</dd></div>
            <div><dt>Occurrences</dt><dd>{incident.occurrenceCount ?? 1}</dd></div>
            <div><dt>Run / request</dt><dd className="mono">{incident.runId || incident.requestId || "—"}</dd></div>
            <div><dt>Trigger</dt><dd>{incident.triggerSource || "—"}</dd></div>
            <div><dt>Worker</dt><dd className="mono">{incident.executionWorkerId || "—"}</dd></div>
          </dl>
          {detail?.notifications?.length ? (
            <section>
              <h4>Notifications</h4>
              <ul className="incident-drawer-list">
                {detail.notifications.map((row, index) => (
                  <li key={`${row.channel}-${index}`}>{row.channel}: {row.status} ({row.attemptCount ?? 0} attempts)</li>
                ))}
              </ul>
            </section>
          ) : null}
          {recovery && (recovery.state !== "none" || recovery.reason) ? (
            <section className="incident-drawer-recovery" data-testid="incident-drawer-recovery">
              <h4>Controlled recovery</h4>
              <dl className="incident-drawer-meta">
                <div>
                  <dt>Recovery state</dt>
                  <dd data-testid="incident-recovery-state">
                    {recoveryStateText || "—"}
                  </dd>
                </div>
                <div>
                  <dt>Recovery window</dt>
                  <dd data-testid="incident-recovery-window">
                    {recovery.windowStart || recovery.windowEnd
                      ? `${formatWindowBound(recovery.windowStart)} → ${formatWindowBound(recovery.windowEnd)}${recovery.windowActive ? " (active)" : " (closed)"}`
                      : "—"}
                  </dd>
                </div>
                {recovery.authorizationStatus ? (
                  <div>
                    <dt>Authorization</dt>
                    <dd data-testid="incident-recovery-authorization">
                      {authorizationStatusCopy(recovery.authorizationStatus) ?? recovery.authorizationStatus}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {!showReadyToResume && recoveryReason ? (
                <p className="incident-drawer-recovery-reason" data-testid="incident-recovery-reason">{recoveryReason}</p>
              ) : null}
              {armedOrPending ? (
                <p className="incident-drawer-recovery-armed" data-testid="incident-recovery-armed-notice">
                  Resume authorized — awaiting next tick. No further resume action is available until the tick runs or the window closes.
                </p>
              ) : null}
            </section>
          ) : null}
          <section className="incident-drawer-audit" data-testid="incident-drawer-audit-timeline">
            <h4>Canonical audit timeline</h4>
            {detail?.timeline?.length ? (
              <ul className="incident-drawer-list">
                {detail.timeline.slice(0, 8).map((row, index) => (
                  <li key={`${row.actionType}-${index}`}>{row.createdAt}: {row.actionType} — {row.message}</li>
                ))}
              </ul>
            ) : <p>No canonical audit events loaded yet.</p>}
          </section>
          {operatorReviewAction ? (
            <section className="incident-drawer-operator-review" data-testid="incident-drawer-operator-review">
              {confirmingReview ? (
                <div role="group" aria-label="Confirm operator review">
                  <p>Confirm this action has been reviewed by a human operator.</p>
                  <label className="incident-drawer-note">
                    Review note (optional)
                    <textarea
                      data-testid="botapp-operator-review-note"
                      value={reviewNote}
                      maxLength={500}
                      rows={2}
                      disabled={Boolean(acting)}
                      onChange={(event) => setReviewNote(event.target.value)}
                    />
                  </label>
                  <div className="incident-drawer-actions">
                    <button type="button" className="btn btn-primary" data-testid="botapp-operator-review-confirm" disabled={Boolean(acting)} onClick={() => void markOperatorReviewed()}>
                      {acting === "mark_reviewed" ? "Marking…" : "Confirm review"}
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={Boolean(acting)} onClick={() => setConfirmingReview(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn-primary" data-testid="botapp-operator-review-mark" disabled={Boolean(acting)} onClick={() => setConfirmingReview(true)}>
                  Mark reviewed
                </button>
              )}
            </section>
          ) : null}
          {(showAcknowledge || showResolve || showKeepPaused || showReadyToResume) ? (
            <>
              <label className="incident-drawer-note">
                Resolution note
                <textarea data-testid="botapp-incident-resolution-note" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={3} />
              </label>
              <div className="incident-drawer-actions">
                {showAcknowledge ? (
                  <button type="button" className="btn btn-secondary" data-testid="botapp-incident-action-acknowledge" disabled={Boolean(acting)} onClick={() => void runAction("acknowledge", { resolution_note: resolutionNote })}>
                    Acknowledge
                  </button>
                ) : null}
                {showReadyToResume ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-testid="botapp-incident-action-ready-to-resume"
                    disabled={Boolean(acting)}
                    onClick={() => void runAction("ready_to_resume", { resolution_note: resolutionNote })}
                  >
                    Ready to resume
                  </button>
                ) : null}
                {showResolve ? (
                  <button type="button" className="btn btn-secondary" data-testid="botapp-incident-action-resolve" disabled={Boolean(acting)} onClick={() => void runAction("resolve", { resolution_note: resolutionNote })}>
                    {resolveButtonLabel(recovery)}
                  </button>
                ) : null}
                {showKeepPaused ? (
                  <button type="button" className="btn btn-secondary" data-testid="botapp-incident-action-keep-paused" disabled={Boolean(acting)} onClick={() => void runAction("keep_paused", { resolution_note: resolutionNote })}>
                    Keep paused
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
