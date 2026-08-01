import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Drawer } from "../design/components";
import { parseIncidentDetail, type IncidentDetail, type IncidentNotification } from "./incident-detail-contract";
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

function stringField(row: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function numberField(row: Record<string, unknown> | null | undefined, key: string, fallback = 0): number {
  const parsed = Number(row?.[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function objectField(row: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  const value = row?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function formatWindowBound(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function recoveryStateLabel(recovery: IncidentRecovery | undefined): string | null {
  const state = recovery?.state;
  if (!state || state === "none") return null;
  return state === "awaiting_human_resume_authorization"
    ? incidentStateCopy("action_required").label
    : incidentStateCopy(state).label;
}

function channelState(row: IncidentNotification | null): { label: string; tone: "neutral" | "success" | "warning" | "error" } {
  if (!row) return { label: "No delivery", tone: "neutral" };
  if (row.status === "sent") return { label: "Delivered", tone: "success" };
  if (row.status === "failed") return { label: "Failed", tone: "error" };
  return { label: row.status || "Pending", tone: "warning" };
}

function actionErrorMessage(result: { status?: number; error?: string } | undefined): string {
  if (result?.status === 409) return "Incident changed; reload before retrying.";
  if (result?.status === 401) return "Relay authentication failed.";
  if (result?.status === 403) return "Incident action is forbidden.";
  return result?.error || "Incident action failed.";
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
  const [resolutionReason, setResolutionReason] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [confirmingReview, setConfirmingReview] = useState(false);
  const [confirmingResolve, setConfirmingResolve] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [actionProof, setActionProof] = useState<{ action: string; ok: boolean; message: string; status?: string | null } | null>(null);
  const requestSequence = useRef(0);
  const activeRequestId = useRef<string | null>(null);

  const cancelActiveRequest = useCallback(() => {
    const requestId = activeRequestId.current;
    activeRequestId.current = null;
    if (requestId) void window.botappDesktop?.incidents?.cancelDetail?.(requestId);
  }, []);

  const reload = useCallback(async () => {
    if (!incidentId || !window.botappDesktop?.incidents?.detail) return;
    cancelActiveRequest();
    const sequence = ++requestSequence.current;
    const requestId = crypto.randomUUID();
    activeRequestId.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const result = await window.botappDesktop.incidents.detail(incidentId, requestId);
      if (sequence !== requestSequence.current || activeRequestId.current !== requestId) return;
      if (!result?.ok) {
        if (result?.errorKind !== "cancelled") setError(result?.message || "Incident detail request failed.");
        setDetail(null);
        return;
      }
      const parsed = parseIncidentDetail(result.data);
      if (!parsed.ok) {
        setError(parsed.error);
        setDetail(null);
        return;
      }
      setDetail(parsed.data);
    } catch (exc) {
      if (sequence === requestSequence.current) {
        setError(exc instanceof Error ? exc.message : "Incident detail network request failed.");
        setDetail(null);
      }
    } finally {
      if (sequence === requestSequence.current) {
        activeRequestId.current = null;
        setLoading(false);
      }
    }
  }, [cancelActiveRequest, incidentId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- drawer state follows the selected incident lifecycle */
    if (open && incidentId) void reload();
    if (!open) {
      requestSequence.current += 1;
      cancelActiveRequest();
      setDetail(null);
      setResolutionNote("");
      setResolutionReason("");
      setReviewNote("");
      setConfirmingReview(false);
      setConfirmingResolve(false);
      setError(null);
    }
    return () => {
      requestSequence.current += 1;
      cancelActiveRequest();
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, incidentId, reload, cancelActiveRequest]);

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    if (!incidentId || !detail || acting) return;
    const label = action.replace(/_/g, " ");
    if (!window.confirm(`Confirm incident action: ${label}?`)) return;
    setActing(action);
    setError(null);
    try {
      const result = await window.botappDesktop?.incidents?.action?.({
        incident_id: incidentId,
        action,
        expected_version: detail.incident.version,
        idempotency_key: `botapp:${action}:${incidentId}:${crypto.randomUUID()}`,
        ...extra,
      });
      if (!result?.ok) {
        const message = actionErrorMessage(result);
        setError(message);
        setActionProof({ action, ok: false, message });
        return;
      }
      setActionProof({ action, ok: true, message: `Action ${action} recorded.`, status: typeof result.data?.status === "string" ? result.data.status : null });
      if (result.data?.detail) {
        const parsed = parseIncidentDetail(result.data.detail);
        if (parsed.ok) setDetail(parsed.data);
        else await reload();
      } else {
        await reload();
      }
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
        const message = String(result?.message || result?.error || "Review could not be recorded. Reload the incident and retry.");
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
      setError("Review backend is temporarily unavailable.");
    } finally {
      setActing(null);
    }
  }

  const incident = detail?.incident;
  const linked = detail?.linked ?? {};
  const device = objectField(linked, "device");
  const run = objectField(linked, "run");
  const request = objectField(linked, "request");
  const recovery = (detail?.recovery ?? undefined) as IncidentRecovery | undefined;
  const canAcknowledge = Boolean(detail?.lifecycle.acknowledgeSupported);
  const canResolve = Boolean(detail?.lifecycle.resolveSupported);
  const showReadyToResume = shouldShowReadyToResume(recovery);
  const showAcknowledge = shouldShowAcknowledge(recovery, canAcknowledge);
  const showResolve = shouldShowResolve(recovery, canResolve);
  const showKeepPaused = shouldShowKeepPaused(recovery);
  const armedOrPending = isArmedOrPendingRecovery(recovery);
  const recoveryReason = recoveryReasonCopy(recovery?.reason ?? null);
  const recoveryStateText = recoveryStateLabel(recovery);
  const operatorReviewAction = detail?.operatorReviewAction;
  const incidentState = incidentStateCopy(incident?.displayState || incident?.status || "open");

  if (!open) return null;

  return (
    <Drawer title="Incident review" subtitle={incident?.reason || "Human review"} onClose={onClose} wide panelClassName="incident-drawer-panel" data-testid="incident-drawer">
      {loading ? <p data-testid="incident-drawer-loading">Loading incident…</p> : null}
      {error ? (
        <div className="incident-drawer-error" data-testid="botapp-incident-action-error">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void reload()}>Retry detail</button>
        </div>
      ) : null}
      {actionProof ? <p className={actionProof.ok ? "incident-drawer-action-proof ok" : "incident-drawer-action-proof error"} data-testid="botapp-incident-action-proof" data-action={actionProof.action} data-status={actionProof.ok ? "ok" : "error"}>{actionProof.action.replace(/_/g, " ")}: {actionProof.message}</p> : null}
      {incident ? (
        <div className="incident-drawer-body" data-testid="incident-drawer-loaded">
          <div className="incident-drawer-header">
            <Badge tone={incident.severity === "critical" || incident.severity === "error" ? "error" : "warning"}>{incident.severity}</Badge>
            <Badge tone={incidentState.tone}>{incidentState.label}</Badge>
            <span className="mono">{incident.reason}</span>
          </div>
          <p>{stringField(incident, "summary") || "No additional summary was recorded."}</p>
          <dl className="incident-drawer-meta" data-testid="incident-drawer-detail-ready">
            <div><dt>{incident.operatorReviewStatus === "pending" ? "Action required" : "Review status"}</dt><dd>{incident.operatorReviewStatus === "reviewed" ? "Reviewed" : stringField(incident, "actionRequired") || "No operator action pending"}</dd></div>
            <div><dt>Account</dt><dd>{incident.accountUsername || "—"}</dd></div>
            <div><dt>Device</dt><dd>{stringField(device, "label") || "—"}</dd></div>
            <div><dt>Host</dt><dd>{stringField(device, "hostMachine") || "—"}</dd></div>
            <div><dt>Occurrences</dt><dd>{numberField(incident, "occurrenceCount", 1)}</dd></div>
            <div><dt>Run / request</dt><dd className="mono">{stringField(run, "id") || stringField(request, "id") || stringField(incident, "runId", "requestId") || "—"}</dd></div>
            <div><dt>Source</dt><dd>{stringField(incident, "source") || "—"}</dd></div>
            <div><dt>Worker</dt><dd className="mono">{stringField(incident, "workerRelease", "workerCommit") || "—"}</dd></div>
          </dl>
          <section data-testid="incident-notification-channels">
            <h4>Notification delivery</h4>
            <div className="incident-channel-grid">
              {(["slack", "discord"] as const).map((channel) => {
                const current = detail.notificationChannels[channel].current;
                const state = channelState(current);
                const retryable = current?.status === "failed" && current.attemptCount < 3 && detail.lifecycle.retryFailedNotificationSupported;
                return (
                  <article key={channel} data-testid={`incident-channel-${channel}`}>
                    <strong>{channel === "slack" ? "Slack" : "Discord"}</strong>
                    <Badge tone={state.tone}>{state.label}</Badge>
                    <span>{current ? `${current.attemptCount} attempt${current.attemptCount === 1 ? "" : "s"}` : "No history"}</span>
                    {retryable ? <button type="button" className="btn btn-secondary" disabled={Boolean(acting)} onClick={() => void runAction("retry_notification", { channel, notification_id: current.id })}>Retry failed {channel}</button> : null}
                  </article>
                );
              })}
            </div>
          </section>
          {recovery && (recovery.state !== "none" || recovery.reason) ? (
            <section className="incident-drawer-recovery" data-testid="incident-drawer-recovery">
              <h4>Controlled recovery</h4>
              <dl className="incident-drawer-meta">
                <div><dt>Recovery state</dt><dd data-testid="incident-recovery-state">{recoveryStateText || "—"}</dd></div>
                <div><dt>Recovery window</dt><dd data-testid="incident-recovery-window">{recovery.windowStart || recovery.windowEnd ? `${formatWindowBound(recovery.windowStart)} → ${formatWindowBound(recovery.windowEnd)}${recovery.windowActive ? " (active)" : " (closed)"}` : "—"}</dd></div>
                {recovery.authorizationStatus ? <div><dt>Authorization</dt><dd data-testid="incident-recovery-authorization">{authorizationStatusCopy(recovery.authorizationStatus) ?? recovery.authorizationStatus}</dd></div> : null}
              </dl>
              {!showReadyToResume && recoveryReason ? <p className="incident-drawer-recovery-reason" data-testid="incident-recovery-reason">{recoveryReason}</p> : null}
              {armedOrPending ? <p className="incident-drawer-recovery-armed" data-testid="incident-recovery-armed-notice">Resume authorized — awaiting next tick. No further resume action is available until the tick runs or the window closes.</p> : null}
            </section>
          ) : null}
          <section className="incident-drawer-audit" data-testid="incident-drawer-audit-timeline">
            <h4>Canonical audit timeline</h4>
            {detail.timeline.length ? <ul className="incident-drawer-list">{detail.timeline.slice(0, 12).map((row, index) => <li key={row.id || `${row.actionType}-${index}`}>{row.createdAt || "—"}: {row.actionType} — {row.message}{row.actorType ? ` (${row.actorType}${row.actorId ? ` ${row.actorId.slice(0, 8)}…` : ""})` : ""}</li>)}</ul> : <p>No canonical audit events loaded yet.</p>}
          </section>
          {operatorReviewAction ? (
            <section className="incident-drawer-operator-review" data-testid="incident-drawer-operator-review">
              {confirmingReview ? <div role="group" aria-label="Confirm operator review"><p>Confirm this action has been reviewed by a human operator.</p><label className="incident-drawer-note">Review note (optional)<textarea data-testid="botapp-operator-review-note" value={reviewNote} maxLength={500} rows={2} disabled={Boolean(acting)} onChange={(event) => setReviewNote(event.target.value)} /></label><div className="incident-drawer-actions"><button type="button" className="btn btn-primary" data-testid="botapp-operator-review-confirm" disabled={Boolean(acting)} onClick={() => void markOperatorReviewed()}>{acting === "mark_reviewed" ? "Marking…" : "Confirm review"}</button><button type="button" className="btn btn-secondary" disabled={Boolean(acting)} onClick={() => setConfirmingReview(false)}>Cancel</button></div></div> : <button type="button" className="btn btn-primary" data-testid="botapp-operator-review-mark" disabled={Boolean(acting)} onClick={() => setConfirmingReview(true)}>Mark reviewed</button>}
            </section>
          ) : null}
          {detail.lifecycle.addNoteSupported ? <label className="incident-drawer-note">Operator note<textarea data-testid="botapp-incident-operator-note" value={resolutionNote} maxLength={1000} onChange={(event) => setResolutionNote(event.target.value)} rows={3} /></label> : null}
          <div className="incident-drawer-actions">
            {detail.lifecycle.addNoteSupported ? <button type="button" className="btn btn-secondary" disabled={Boolean(acting) || !resolutionNote.trim()} onClick={() => void runAction("add_note", { note: resolutionNote.trim() })}>Add note</button> : null}
            {showAcknowledge ? <button type="button" className="btn btn-secondary" data-testid="botapp-incident-action-acknowledge" disabled={Boolean(acting)} onClick={() => void runAction("acknowledge", { note: resolutionNote.trim() || null })}>Acknowledge / mark investigating</button> : null}
            {showReadyToResume ? <button type="button" className="btn btn-primary" data-testid="botapp-incident-action-ready-to-resume" disabled={Boolean(acting)} onClick={() => void runAction("ready_to_resume", { resolution_note: resolutionNote })}>Ready to resume</button> : null}
            {showResolve ? <button type="button" className="btn btn-secondary" data-testid="botapp-incident-action-resolve" disabled={Boolean(acting)} onClick={() => setConfirmingResolve(true)}>{resolveButtonLabel(recovery)}</button> : null}
            {showKeepPaused ? <button type="button" className="btn btn-secondary" data-testid="botapp-incident-action-keep-paused" disabled={Boolean(acting)} onClick={() => void runAction("keep_paused", { resolution_note: resolutionNote })}>Keep paused</button> : null}
          </div>
          {confirmingResolve ? <section className="incident-drawer-resolve" role="group" aria-label="Confirm resolution"><label className="incident-drawer-note">Resolution reason (required)<input value={resolutionReason} maxLength={160} onChange={(event) => setResolutionReason(event.target.value)} placeholder="verified_and_resolved" /></label><p>Resolving updates the database first. Slack and Discord deliveries are tracked independently.</p><div className="incident-drawer-actions"><button type="button" className="btn btn-primary" disabled={Boolean(acting) || !resolutionReason.trim()} onClick={() => void runAction("resolve", { resolution_reason: resolutionReason.trim(), note: resolutionNote.trim() || null })}>Confirm resolve</button><button type="button" className="btn btn-secondary" disabled={Boolean(acting)} onClick={() => setConfirmingResolve(false)}>Cancel</button></div></section> : null}
          {!detail.lifecycle.reopenSupported && incident.status === "resolved" ? <p>Reopen is not supported by the current incident lifecycle.</p> : null}
        </div>
      ) : null}
    </Drawer>
  );
}
