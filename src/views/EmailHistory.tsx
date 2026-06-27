import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Drawer } from "../design/components";
import type {
  BotAppEmailHistoryDetail,
  BotAppEmailHistoryProjection,
  BotAppNeedsMoreTargetsLifecyclePreview,
} from "../api/types";
import {
  formatNeedsMoreTargetsDeliveryState,
  formatNeedsMoreTargetsLifecycleDecision,
} from "../email/needs-more-targets-preview-labels";
import {
  canBrowseEmailHistory,
  readEmailFeatureProjection,
  resolveEmailHistoryLoad,
  type EmailFeatureLoadState,
} from "../email/email-feature-load";
import "./email-history.css";

type Period = "7d" | "30d" | "90d" | "custom";

const emptyProjection = (): BotAppEmailHistoryProjection => ({
  featureAvailable: false,
  fromEmail: "growth@boostmybusinesses.com",
  page: 1,
  pageSize: 25,
  totalCount: 0,
  totalPages: 0,
  items: [],
});

export function EmailHistory() {
  const [loadState, setLoadState] = useState<EmailFeatureLoadState<BotAppEmailHistoryProjection>>({
    status: "infrastructure_pending",
    projection: emptyProjection(),
    message: "Email infrastructure not enabled yet.",
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("30d");
  const [clientEmail, setClientEmail] = useState("");
  const [category, setCategory] = useState("");
  const [trigger, setTrigger] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BotAppEmailHistoryDetail | null>(null);
  const [lifecyclePreview, setLifecyclePreview] = useState<BotAppNeedsMoreTargetsLifecyclePreview | null>(null);
  const [lifecyclePreviewLoading, setLifecyclePreviewLoading] = useState(false);
  const [lifecyclePreviewMessage, setLifecyclePreviewMessage] = useState<string | null>(null);

  const projection = readEmailFeatureProjection(loadState, emptyProjection);
  const canBrowse = canBrowseEmailHistory(loadState);

  async function loadHistory(page = projection.page) {
    setLoading(true);
    try {
      const result = await window.botappDesktop?.email?.listHistory?.({
        period,
        client_email: clientEmail || undefined,
        category: category || undefined,
        trigger: trigger || undefined,
        status: status || undefined,
        page,
        page_size: projection.pageSize,
      });
      const nextState = resolveEmailHistoryLoad(result);
      if (nextState.status === "ready") {
        setLoadState(nextState);
      } else if (nextState.status === "infrastructure_pending") {
        setLoadState({
          ...nextState,
          projection: nextState.projection ?? emptyProjection(),
        });
      } else {
        setLoadState(nextState);
      }
      setMessage(nextState.status === "ready" ? null : nextState.message);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Email history unavailable.";
      setLoadState({ status: "relay_error", message: nextMessage });
      setMessage(nextMessage);
    } finally {
      setLoading(false);
    }
  }

  async function refreshLifecyclePreview() {
    setLifecyclePreviewLoading(true);
    try {
      const result = await window.botappDesktop?.email?.needsMoreTargetsPreview?.();
      if (result?.ok && result.data) {
        setLifecyclePreview(result.data);
        setLifecyclePreviewMessage(null);
      } else {
        setLifecyclePreview(null);
        setLifecyclePreviewMessage(result?.error ?? "Needs-more lifecycle preview unavailable.");
      }
    } catch (error) {
      setLifecyclePreview(null);
      setLifecyclePreviewMessage(error instanceof Error ? error.message : "Needs-more lifecycle preview unavailable.");
    } finally {
      setLifecyclePreviewLoading(false);
    }
  }

  async function openDetail(intentId: string) {
    setSelectedId(intentId);
    const result = await window.botappDesktop?.email?.historyDetail?.(intentId);
    if (result?.data?.detail) setDetail(result.data.detail);
    else {
      setDetail(null);
      setMessage(result?.error ?? "Email intent detail unavailable.");
    }
  }

  useEffect(() => {
    void loadHistory(1);
  }, [period]);

  const headline = useMemo(() => {
    if (loadState.status === "ready") {
      return projection.totalCount === 0
        ? "No email activity yet. Outbox and delivery events will appear here after the first send intent."
        : "Canonical email outbox and delivery journal from the shared backend.";
    }
    if (loadState.status === "infrastructure_pending") {
      return "Email infrastructure not enabled yet.";
    }
    return loadState.message;
  }, [loadState, projection.totalCount]);

  const badgeLabel = loadState.status === "ready"
    ? "Ready"
    : loadState.status === "infrastructure_pending"
      ? "Infrastructure pending"
      : "Relay unavailable";

  return (
    <div className="email-history-screen">
      <header className="email-history-header">
        <div>
          <Badge tone={loadState.status === "ready" ? "success" : "warning"} dot>
            {badgeLabel}
          </Badge>
          <h2>Email History</h2>
          <p>{headline}</p>
        </div>
        <Button onClick={() => void loadHistory(1)} disabled={loading}>Refresh</Button>
      </header>

      {message ? <div className="email-history-message">{message}</div> : null}

      <section className="email-history-lifecycle-preview" aria-label="Needs more target accounts lifecycle preview">
        <div className="email-history-lifecycle-header">
          <div>
            <h3>Needs more target accounts lifecycle</h3>
            <p>Read-only production preview. No episode, intent, email, or lifecycle mutation is performed.</p>
          </div>
          <Button onClick={() => void refreshLifecyclePreview()} disabled={lifecyclePreviewLoading}>
            Refresh preview
          </Button>
        </div>

        {lifecyclePreviewMessage ? <div className="email-history-message">{lifecyclePreviewMessage}</div> : null}

        {lifecyclePreview ? (
          <>
            <div className="email-history-lifecycle-summary">
              <p><span>Accounts analyzed</span><strong>{lifecyclePreview.accountsAnalyzed}</strong></p>
              <p><span>Would open episode</span><strong>{lifecyclePreview.summary.wouldOpenEpisode}</strong></p>
              <p><span>Active episodes</span><strong>{lifecyclePreview.summary.activeEpisodes}</strong></p>
              <p><span>Blocked: missing email</span><strong>{lifecyclePreview.summary.blockedMissingClientEmail}</strong></p>
              <p><span>Resolved / above threshold</span><strong>{lifecyclePreview.summary.resolvedOrAboveThreshold}</strong></p>
              <p><span>Canceled accounts</span><strong>{lifecyclePreview.summary.canceled}</strong></p>
              <p><span>Last preview</span><strong>{new Date(lifecyclePreview.previewedAt).toLocaleString()}</strong></p>
            </div>

            {lifecyclePreview.items.length === 0 ? (
              <div className="email-history-empty">
                <strong>No pertinent accounts right now</strong>
                <span>No active needs-more signal or active lifecycle episode matched the preview scope.</span>
              </div>
            ) : (
              <div className="email-history-table-wrap">
                <table className="email-history-lifecycle-table">
                  <thead>
                    <tr>
                      <th>Instagram</th>
                      <th>Client</th>
                      <th>Eligible CT</th>
                      <th>Lifecycle</th>
                      <th>Delivery</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lifecyclePreview.items.map((item) => (
                      <tr key={`${item.instagramUsername ?? "unknown"}-${item.clientLabel ?? "client"}`}>
                        <td>{item.instagramUsername ? `@${item.instagramUsername}` : "—"}</td>
                        <td>{item.clientLabel || "—"}</td>
                        <td>{item.eligibleTargetCount} / {item.threshold}</td>
                        <td>{formatNeedsMoreTargetsLifecycleDecision(item.lifecycleDecision)}</td>
                        <td>{formatNeedsMoreTargetsDeliveryState(item.deliveryState)}</td>
                        <td>{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </section>

      <section className="email-history-filters" aria-label="Email history filters">
        <FilterSelect label="Period" value={period} onChange={(value) => setPeriod(value as Period)} options={[
          { value: "7d", label: "7 days" },
          { value: "30d", label: "30 days" },
          { value: "90d", label: "90 days" },
          { value: "custom", label: "Custom range" },
        ]} />
        <FilterInput
          label="Client email"
          value={clientEmail}
          onChange={setClientEmail}
          placeholder="client@example.com"
        />
        <FilterSelect label="Category" value={category} onChange={setCategory} options={[
          { value: "", label: "All" },
          { value: "account_paused", label: "Account paused" },
          { value: "account_canceled", label: "Account canceled" },
          { value: "needs_assistance", label: "Needs assistance" },
          { value: "needs_more_target_accounts", label: "Needs more targets" },
        ]} />
        <FilterSelect label="Trigger" value={trigger} onChange={setTrigger} options={[
          { value: "", label: "All" },
          { value: "manual", label: "Manual" },
          { value: "automatic", label: "Automatic" },
          { value: "reminder", label: "Reminder" },
          { value: "manual_test", label: "Test delivery" },
        ]} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={[
          { value: "", label: "All" },
          { value: "pending", label: "Pending" },
          { value: "scheduled", label: "Scheduled" },
          { value: "sent", label: "Sent" },
          { value: "delivered", label: "Delivered" },
          { value: "failed", label: "Failed" },
          { value: "canceled", label: "Canceled" },
        ]} />
        <Button onClick={() => void loadHistory(1)} disabled={loading || !canBrowse}>Apply filters</Button>
      </section>

      <section className="email-history-table-wrap">
        {loadState.status === "infrastructure_pending" ? (
          <div className="email-history-empty">
            <strong>Email infrastructure not enabled yet</strong>
            <span>No fake history is shown. Apply the backend migration to activate canonical Email History.</span>
          </div>
        ) : loadState.status === "relay_error" || loadState.status === "relay_unavailable" ? (
          <div className="email-history-empty">
            <strong>Email history unavailable</strong>
            <span>{loadState.message}</span>
          </div>
        ) : projection.items.length === 0 ? (
          <div className="email-history-empty">
            <strong>No email activity yet</strong>
            <span>Send intents and delivery events will appear here once transactional email starts flowing.</span>
          </div>
        ) : (
          <table className="email-history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Instagram</th>
                <th>Category</th>
                <th>Type</th>
                <th>Client email</th>
                <th>Sender</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Template</th>
              </tr>
            </thead>
            <tbody>
              {projection.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.createdAt || "—"}</td>
                  <td>{item.clientName || "—"}</td>
                  <td>{item.instagramUsername ? `@${item.instagramUsername}` : "—"}</td>
                  <td>{item.categoryLabel}</td>
                  <td>
                    {item.isTestDelivery && item.deliveryBadgeLabel ? (
                      <Badge tone="warning">{item.deliveryBadgeLabel}</Badge>
                    ) : "Client"}
                  </td>
                  <td>{item.recipientEmail}</td>
                  <td>{item.fromEmail}</td>
                  <td>{item.triggerLabel ?? item.trigger}{item.reminderIndex != null ? ` #${item.reminderIndex}` : ""}</td>
                  <td>{item.deliveryStatus || item.intentStatus}</td>
                  <td>
                    <Button onClick={() => void openDetail(item.id)}>Detail</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {canBrowse ? (
        <div className="email-history-pagination">
          <Button disabled={projection.page <= 1 || loading} onClick={() => void loadHistory(projection.page - 1)}>Previous</Button>
          <span>Page {projection.page} / {Math.max(projection.totalPages, 1)}</span>
          <Button disabled={projection.page >= projection.totalPages || loading} onClick={() => void loadHistory(projection.page + 1)}>Next</Button>
        </div>
      ) : null}

      {selectedId && detail ? (
        <Drawer
          title="Email intent"
          subtitle={detail.categoryLabel}
          wide
          onClose={() => { setSelectedId(null); setDetail(null); }}
        >
          <div className="email-history-detail">
            {detail.isTestDelivery ? (
              <p><Badge tone="warning">{detail.deliveryBadgeLabel ?? "Test delivery"}</Badge></p>
            ) : null}
            <p><strong>Client</strong> {detail.clientName || "—"}</p>
            <p><strong>Instagram</strong> {detail.instagramUsername ? `@${detail.instagramUsername}` : "—"}</p>
            <p><strong>Reason</strong> {detail.triggerLabel ?? detail.trigger} · reminder {detail.reminderIndex ?? "—"}</p>
            <p><strong>Client email</strong> {detail.recipientEmail}</p>
            <p><strong>Sender</strong> {detail.fromEmail}</p>
            <p><strong>Template version</strong> {detail.templateVersion ?? "—"}</p>
            <p><strong>Source notification</strong> {detail.sourceNotificationId || "—"}</p>
            <p><strong>Provider message ID</strong> {detail.providerMessageId || "—"}</p>
            <p><strong>Last error</strong> {detail.lastErrorRedacted || "—"}</p>
            <div>
              <strong>Snapshot</strong>
              <p>{detail.snapshotSubject}</p>
              <pre>{detail.snapshotBodyText}</pre>
            </div>
            <div>
              <strong>Status timeline</strong>
              <ul>
                {detail.timeline.map((event) => (
                  <li key={`${event.status}-${event.occurredAt}`}>
                    {event.occurredAt} · {event.status}
                    {event.lastErrorRedacted ? ` · ${event.lastErrorRedacted}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}

function FilterInput({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="email-history-filter">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="email-history-filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
