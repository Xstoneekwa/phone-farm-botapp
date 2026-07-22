import { useMemo, useState } from "react";
import type {
  BotAppCredentialsAction,
  BotAppCredentialsFilter,
  BotAppCredentialsOverview,
} from "../api/types";
import "./credentials.css";

type CredentialsProps = {
  overview: BotAppCredentialsOverview;
  selectedAccountId: string | null;
  onOpenProfile: (profileId: string) => void;
};

const filters: Array<{ key: BotAppCredentialsFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "password", label: "Password" },
  { key: "verification_code", label: "Verification code" },
  { key: "credentials", label: "Credentials" },
  { key: "needs_review", label: "Needs review" },
  { key: "completed", label: "Completed" },
];

function priorityTone(priority: string) {
  if (priority === "critical") return "critical";
  if (priority === "warning") return "warning";
  return "info";
}

function statusTone(status: string) {
  if (status === "resolved" || status === "dismissed") return "good";
  if (status === "code_submitted" || status === "pending_verification" || status === "pending") return "pending";
  if (status === "acknowledged") return "acknowledged";
  return "neutral";
}

function ownerTone(action: BotAppCredentialsAction) {
  if (action.requiresClientAction || action.audience === "client") return "client";
  if (action.audience === "admin") return "admin";
  return "neutral";
}

function labelize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ownerLabel(action: BotAppCredentialsAction) {
  if (action.requiresClientAction || action.audience === "client") return "Client action";
  if (action.audience === "admin") return "Admin action";
  return "Ops action";
}

function matchesFilter(action: BotAppCredentialsAction, filter: BotAppCredentialsFilter) {
  if (filter === "all") return true;
  if (filter === "password") return action.actionType === "update_instagram_password" || action.actionType === "submit_instagram_credentials";
  if (filter === "verification_code") return action.actionType === "enter_email_verification_code" || action.actionType === "complete_two_factor" || action.actionType === "resolve_checkpoint";
  if (filter === "credentials") return action.actionType.includes("credential") || action.actionType === "reconnect_instagram";
  if (filter === "needs_review") return action.audience === "admin" || action.actionType.startsWith("review_");
  return action.status === "resolved" || action.status === "dismissed";
}

function countForFilter(actions: BotAppCredentialsAction[], filter: BotAppCredentialsFilter) {
  return actions.filter((action) => matchesFilter(action, filter)).length;
}

function baseActionPayload(action: BotAppCredentialsAction, command: string) {
  return {
    action: command,
    action_id: action.id,
    account_id: action.accountId,
    client_id: action.clientId,
    username: action.username,
    source: "BotApp",
    requested_by: null,
    idempotency_key: `botapp:credentials:${action.accountId}:${action.id}:${command}`,
    metadata_safe: {
      credentials_action_type: action.actionType,
      username: action.username,
      expected_effect: "future_secure_relay_credentials_action",
    },
  };
}

function actionPayload(action: BotAppCredentialsAction, command: string, verificationCodeLength?: number) {
  if (command === "request_password_update") {
    return {
      ...baseActionPayload(action, command),
      relay_target: "/api/instagram-dashboard/client-accounts/password-update-request",
      reason: "password_update_required",
      idempotency_key: `botapp:credentials:${action.accountId}:update_instagram_password`,
      notification: {
        notification_type: "password_update_required",
        audience: "client",
        status: "pending",
        action_label: "Update password",
        action_deep_link: "/instagram-client?view=account",
      },
      email: {
        email_template: "instagram_password_update_required",
        delivery_status: "pending_backend",
      },
    };
  }

  if (command === "mark_reviewed") {
    return {
      ...baseActionPayload(action, "mark_credentials_action_reviewed"),
      relay_target: "/api/instagram-dashboard/dashboard-actions/review",
      review_status: "reviewed",
      reviewed_by: null,
      reviewed_at: null,
      source_for_backend: "botapp_relay",
      metadata_safe: {
        ...baseActionPayload(action, command).metadata_safe,
        keep_action_active_until_readiness_ok: true,
      },
    };
  }

  if (command === "submit_verification_code") {
    return {
      ...baseActionPayload(action, command),
      relay_target: "/api/instagram-dashboard/dashboard-actions/submit-verification-code",
      code_present: true,
      code_length: verificationCodeLength ?? 0,
      metadata_safe: {
        ...baseActionPayload(action, command).metadata_safe,
        code_is_never_logged: true,
      },
    };
  }

  return baseActionPayload(action, command);
}

export function Credentials({ overview, selectedAccountId, onOpenProfile }: CredentialsProps) {
  const [filter, setFilter] = useState<BotAppCredentialsFilter>("all");
  const [message, setMessage] = useState("");
  const [verificationAction, setVerificationAction] = useState<BotAppCredentialsAction | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const selectedAction = selectedAccountId ? overview.actions.find((action) => action.accountId === selectedAccountId) ?? null : null;

  const visibleActions = useMemo(() => {
    const filtered = overview.actions.filter((action) => matchesFilter(action, filter));
    if (!selectedAccountId) return filtered;
    const selected = filtered.filter((action) => action.accountId === selectedAccountId);
    return selected.length ? selected : filtered;
  }, [filter, overview.actions, selectedAccountId]);

  function prepareAction(action: BotAppCredentialsAction, command: string) {
    if (command === "open_account") {
      onOpenProfile(action.profileId);
      return;
    }
    if (command === "enter_verification_code") {
      setVerificationCode("");
      setVerificationAction(action);
      return;
    }
    const payload = actionPayload(action, command);
    void payload;
    setMessage(`${action.username}: ${command.replaceAll("_", " ")} prepared for secure relay for this account only.`);
  }

  async function submitVerificationCode(action: BotAppCredentialsAction) {
    const trimmed = verificationCode.trim();
    const submit = window.botappDesktop?.profiles?.submitVerificationCode;
    if (!submit) {
      setMessage(`${action.username}: secure verification relay unavailable.`);
      return;
    }
    setVerificationSubmitting(true);
    try {
      const result = await submit({ accountId: action.accountId, actionId: action.id, verificationCode: trimmed });
      if (!result.ok) {
        setMessage(`${action.username}: ${String(result.error || "verification_code_submit_failed")}`);
        return;
      }
      setVerificationAction(null);
      setVerificationCode("");
      setMessage(`${action.username}: verification code accepted. Login resume is queued or already active.`);
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : "verification_code_submit_failed";
      setMessage(`${action.username}: ${safeMessage}`);
    } finally {
      setVerificationSubmitting(false);
    }
  }

  return (
    <div className="credentials-screen">
      <header className="credentials-header">
        <div>
          <span>Credentials</span>
          <h2>Credentials</h2>
          <p>Credential action worklist focused on account safety, client actions, and login blockers.</p>
        </div>
        <button type="button" onClick={() => setMessage("Credentials refresh prepared for secure relay.")}>Refresh</button>
      </header>

      <section className="credentials-kpis" aria-label="Credentials summary">
        <Kpi label="Open actions" value={overview.summary.openActions} tone={overview.summary.openActions ? "warning" : "good"} />
        <Kpi label="Password updates" value={overview.summary.passwordUpdates} tone={overview.summary.passwordUpdates ? "danger" : "good"} />
        <Kpi label="Verification codes" value={overview.summary.verificationCodes} tone={overview.summary.verificationCodes ? "danger" : "good"} />
        <Kpi label="Needs review" value={overview.summary.needsReview} tone={overview.summary.needsReview ? "warning" : "good"} />
        <Kpi label="Client action required" value={overview.summary.clientActionRequired} tone={overview.summary.clientActionRequired ? "warning" : "good"} />
      </section>

      <section className="credentials-card">
        <div className="credentials-card-heading">
          <span>Worklist</span>
          <h3>Credential actions</h3>
          {selectedAction ? <p>Context from Client Accounts: @{selectedAction.username} · {selectedAction.clientName}</p> : null}
        </div>

        <nav className="credentials-filters" aria-label="Credential action filters">
          {filters.map((item) => (
            <button key={item.key} type="button" className={filter === item.key ? "active" : ""} onClick={() => setFilter(item.key)}>
              <span>{item.label}</span>
              <strong>{countForFilter(overview.actions, item.key)}</strong>
            </button>
          ))}
        </nav>

        <div className="credentials-list">
          {visibleActions.map((action) => (
            <article key={action.id} className={`credentials-action ${selectedAccountId === action.accountId ? "selected" : ""} ${action.priority}`}>
              <div className="credentials-action-header">
                <div className="credentials-action-title">
                  <span>{labelize(action.actionType)}</span>
                  <h4>{action.title}</h4>
                  <strong>@{action.username} · {action.clientName}</strong>
                </div>
                <div className="credentials-action-badges">
                  <Badge label="Severity" value={labelize(action.priority)} tone={priorityTone(action.priority)} title={`${labelize(action.priority)} priority for this account action`} />
                  <Badge label="Status" value={labelize(action.status)} tone={statusTone(action.status)} title={`${labelize(action.status)} is the current dashboard action status`} />
                  <Badge label="Owner" value={ownerLabel(action)} tone={ownerTone(action)} title={`${ownerLabel(action)} means who must act next`} />
                </div>
              </div>

              <p className="credentials-action-description">{action.description}</p>

              <div className="credentials-action-grid">
                <Field label="Account" value={`@${action.username}`} />
                <Field label="Client" value={action.clientName} />
                <Field label="Credentials" value={action.credentialStatus} />
                <Field label="Login" value={action.loginStatus} />
                <Field label="Phone" value={action.assignedPhone} />
                <Field label="Age" value={action.ageLabel} />
                <Field label="Updated" value={action.updatedAtLabel} />
                <Field label="Source" value={action.sourceLabel} />
              </div>

              <div className="credentials-next-action">
                <span>Next action</span>
                <strong>{action.nextAction}</strong>
              </div>

              <div className="credentials-actions">
                <button type="button" onClick={() => prepareAction(action, "open_account")}>Open account</button>
                {action.actionType === "update_instagram_password" ? (
                  <button type="button" onClick={() => prepareAction(action, "request_password_update")}>Request password update</button>
                ) : null}
                {action.actionType === "enter_email_verification_code" ? (
                  <button type="button" onClick={() => prepareAction(action, "enter_verification_code")}>Enter verification code</button>
                ) : null}
                <button type="button" onClick={() => prepareAction(action, "mark_reviewed")}>Mark reviewed</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {message ? <div className="credentials-message">{message}</div> : null}

      {verificationAction ? (
        <div className="credentials-modal-backdrop" role="presentation" onMouseDown={() => setVerificationAction(null)}>
          <section
            className="credentials-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Enter verification code"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span>Verification code</span>
            <h3>Enter verification code for @{verificationAction.username}</h3>
            <p>The code is sent only through the future secure relay. It is not logged, displayed in messages, or stored in the local action payload.</p>
            <input
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              placeholder="Enter code"
              autoFocus
            />
            <div className="credentials-modal-actions">
              <button type="button" onClick={() => setVerificationAction(null)}>Cancel</button>
              <button type="button" className="primary" disabled={!verificationCode.trim() || verificationSubmitting} onClick={() => void submitVerificationCode(verificationAction)}>{verificationSubmitting ? "Submitting…" : "Submit code"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`credentials-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="credentials-field">
      <span>{label}</span>
      <strong>{value || "unknown"}</strong>
    </span>
  );
}

function Badge({ label, value, tone, title }: { label: string; value: string; tone: string; title: string }) {
  return (
    <span className={`credentials-badge ${tone}`} title={title}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}
