import { useMemo, useState, type ReactElement } from "react";
import type {
  BotAppClientAccount,
  BotAppClientAccountsFilters,
  BotAppClientAccountsOverview,
  ClientAccountPasswordUpdatePayload,
} from "../api/types";
import "./client-accounts.css";

type ClientAccountsProps = {
  overview: BotAppClientAccountsOverview;
  onOpenProfile: (profileId: string) => void;
  onOpenCredentials: (account: BotAppClientAccount) => void;
};

type AccountStatusAction = "pause" | "cancel" | "mark_needs_assistance" | "reactivate";

const filterOptions: Array<{ key: BotAppClientAccountsFilters["status"]; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "onboarding", label: "Onboarding" },
  { key: "paused", label: "Paused" },
  { key: "cancelled", label: "Cancelled" },
  { key: "needs-assistance", label: "Needs assistance" },
];

function statusTone(value: string | null | undefined) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("active") || normalized.includes("ready") || normalized.includes("connected")) return "good";
  if (normalized.includes("cancel") || normalized.includes("blocked") || normalized.includes("invalid") || normalized.includes("required")) return "danger";
  if (normalized.includes("pending") || normalized.includes("paused") || normalized.includes("onboarding") || normalized.includes("needs")) return "warning";
  return "neutral";
}

function countForFilter(items: BotAppClientAccount[], filter: BotAppClientAccountsFilters["status"]) {
  if (filter === "all") return items.length;
  if (filter === "needs-assistance") return items.filter((item) => item.actionsNeeded.length > 0).length;
  return items.filter((item) => item.accountStatus === filter).length;
}

function matchesFilter(item: BotAppClientAccount, filters: BotAppClientAccountsFilters) {
  if (filters.status === "needs-assistance") return item.actionsNeeded.length > 0;
  if (filters.status === "all") return true;
  return item.accountStatus === filters.status;
}

function relayActionPayload(account: BotAppClientAccount, action: string) {
  return {
    action,
    account_id: account.accountId,
    source: "BotApp",
    requested_by: null,
    metadata_safe: {
      username: account.username,
      client_name: account.clientName,
      current_status: account.accountStatus,
      expected_effect: action === "view_account" || action === "refresh"
        ? "read_only_client_account_projection"
        : "future_secure_relay_action",
    },
  };
}

function passwordUpdatePayload(account: BotAppClientAccount): ClientAccountPasswordUpdatePayload {
  return {
    action: "request_password_update",
    account_id: account.accountId,
    client_id: account.clientId,
    username: account.username,
    requested_by: null,
    source: "BotApp",
    reason: "password_update_required",
    idempotency_key: `botapp:client_accounts:${account.accountId}:password_update_required`,
    notification: {
      notification_type: "password_update_required",
      audience: "client",
      status: "pending",
      message: `Password update required for @${account.username}. Please update your Instagram password so we can reconnect your account safely.`,
      action_label: "Update password",
      action_deep_link: "/instagram-client?view=account",
    },
    email: {
      email_template: "instagram_password_update_required",
      delivery_status: "pending_relay",
      include: ["client_name", "username", "client_action_link"],
    },
    metadata_safe: {
      source_surface: "client_accounts",
      expected_effect: "future_secure_relay_password_update_request",
    },
  };
}

export function ClientAccounts({ overview, onOpenProfile, onOpenCredentials }: ClientAccountsProps) {
  const [filters, setFilters] = useState<BotAppClientAccountsFilters>({ query: "", status: "all" });
  const [openMenuAccountId, setOpenMenuAccountId] = useState<string | null>(null);
  const [passwordRequestAccount, setPasswordRequestAccount] = useState<BotAppClientAccount | null>(null);
  const [message, setMessage] = useState("");

  const visibleItems = useMemo(
    () => overview.items.filter((item) => matchesFilter(item, filters)),
    [filters, overview.items],
  );

  function prepareAction(account: BotAppClientAccount, action: string) {
    if (action === "view_account") {
      onOpenProfile(account.profileId);
      return;
    }
    if (action === "open_credentials") {
      onOpenCredentials(account);
      return;
    }
    if (action === "request_password_update") {
      setPasswordRequestAccount(account);
      return;
    }
    const payload = relayActionPayload(account, action);
    void payload;
    setMessage(`${account.username}: ${action.replaceAll("_", " ")} payload prepared for secure relay.`);
  }

  function confirmPasswordUpdateRequest(account: BotAppClientAccount) {
    const payload = passwordUpdatePayload(account);
    void payload;
    setPasswordRequestAccount(null);
    setMessage(`${account.username}: password update request prepared. Client will receive a backend notification and email after secure relay approval.`);
  }

  return (
    <div className="client-accounts-screen">
      <header className="client-accounts-header">
        <div>
          <span>Accounts</span>
          <h2>Client Accounts</h2>
        </div>
      </header>

      <section className="client-accounts-kpis" aria-label="Client Accounts summary">
        <Kpi label="Total" value={overview.summary.total} detail="Safe account rows" />
        <Kpi label="Active" value={overview.summary.active} detail="Lifecycle active + admin active" tone="good" />
        <Kpi label="Pending" value={overview.summary.pending} detail="Pending customer, subscription, or provisioning" tone={overview.summary.pending ? "warning" : "neutral"} />
        <Kpi label="Onboarding" value={overview.summary.onboarding} detail="Onboarding status projection" tone={overview.summary.onboarding ? "warning" : "neutral"} />
        <Kpi label="Paused" value={overview.summary.paused} detail="Paused business status" tone={overview.summary.paused ? "warning" : "neutral"} />
        <Kpi label="Cancelled" value={overview.summary.cancelled} detail="Cancelled customer/subscription status" tone={overview.summary.cancelled ? "danger" : "neutral"} />
        <Kpi label="Needs assistance" value={overview.summary.needsAssistance} detail={`${overview.summary.reauthRequired} reauth required`} tone={overview.summary.needsAssistance ? "danger" : "good"} />
      </section>

      <section className="client-accounts-card">
        <div className="client-accounts-card-heading">
          <span>Client accounts</span>
          <h3>Account operations worklist</h3>
        </div>
        <div className="client-accounts-toolbar">
          <nav className="client-accounts-filters" aria-label="Client account status filters">
            {filterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={filters.status === option.key ? "active" : ""}
                onClick={() => setFilters((current) => ({ ...current, status: option.key }))}
              >
                <span>{option.label}</span>
                <strong>{countForFilter(overview.items, option.key)}</strong>
              </button>
            ))}
          </nav>
        </div>

        <div className="client-accounts-table-wrap">
          <table className="client-accounts-table">
            <colgroup>
              <col style={{ width: "27%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Account</th>
                <th>Email</th>
                <th>Password</th>
                <th>2FA</th>
                <th>Created At</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.accountId}>
                  <td>
                    <div className="client-accounts-account-row">
                      <AccountAvatar account={item} />
                      <div className="client-accounts-account-cell">
                        <button type="button" className="client-account-link" onClick={() => prepareAction(item, "view_account")}>
                          {item.username}
                        </button>
                        <small>{item.clientName ?? "Client pending"} · {item.lifecycleStatus}</small>
                        <small className={statusTone(item.instagramVerificationStatus)}>username {item.instagramVerificationStatus}</small>
                      </div>
                    </div>
                  </td>
                  <td>{item.safeEmailDisplay}</td>
                  <td><Badge value={passwordLabel(item.passwordStatus)} tone={passwordTone(item.passwordStatus)} /></td>
                  <td><Badge value={item.twoFactorDisplay} tone={twoFactorTone(item.twoFactorDisplay)} /></td>
                  <td>{item.createdAtLabel}</td>
                  <td>
                    <div className="client-accounts-status-cell">
                      <span>Status</span>
                      <Badge value={item.actionsNeeded.length ? "needs assistance" : item.accountStatus} tone={item.actionsNeeded.length ? "danger" : statusTone(item.accountStatus)} />
                      <small className={statusTone(item.accountStatus)}>{item.adminStatus} · {item.customerStatus} · {item.subscriptionStatus}</small>
                    </div>
                  </td>
                  <td>
                    <ActionList
                      account={item}
                      isMenuOpen={openMenuAccountId === item.accountId}
                      onToggleMenu={() => setOpenMenuAccountId((current) => current === item.accountId ? null : item.accountId)}
                      onAction={(action) => prepareAction(item, action)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {visibleItems.length === 0 ? (
          <div className="client-accounts-empty">
            <span>No accounts</span>
            <strong>No client accounts match this filter.</strong>
            <p>Use All to return to the complete support worklist.</p>
          </div>
        ) : null}
      </section>

      {message ? <div className="client-accounts-message">{message}</div> : null}

      {passwordRequestAccount ? (
        <div className="client-accounts-confirm-backdrop" role="presentation" onMouseDown={() => setPasswordRequestAccount(null)}>
          <section
            className="client-accounts-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Send password update request"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span>Request password update</span>
            <h3>Send password update request?</h3>
            <p>
              Client will receive a backend notification and email after the secure relay accepts this request.
            </p>
            <strong>@{passwordRequestAccount.username}</strong>
            <div className="client-accounts-confirm-actions">
              <button type="button" onClick={() => setPasswordRequestAccount(null)}>Cancel</button>
              <button type="button" className="primary" onClick={() => confirmPasswordUpdateRequest(passwordRequestAccount)}>Send request</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, detail, tone = "neutral" }: { label: string; value: number; detail: string; tone?: "neutral" | "good" | "warning" | "danger" }) {
  return (
    <article className={`client-accounts-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Badge({ value, tone }: { value: string; tone: string }) {
  return <span className={`client-account-badge ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

function AccountAvatar({ account }: { account: BotAppClientAccount }) {
  const initial = (account.username.replace(/^@/, "").trim()[0] || "?").toUpperCase();
  return (
    <span className="client-accounts-avatar" aria-label={`${account.username} profile image pending`}>
      {initial}
    </span>
  );
}

function ActionList({
  account,
  isMenuOpen,
  onToggleMenu,
  onAction,
}: {
  account: BotAppClientAccount;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onAction: (action: string) => void;
}) {
  return (
    <div className="client-accounts-actions">
      <IconButton label="View Account: Open the read-only account detail." onClick={() => onAction("view_account")}>
        <UserIcon />
      </IconButton>
      <IconButton label="Open credentials worklist" onClick={() => onAction("open_credentials")}>
        <KeyIcon />
      </IconButton>
      <IconButton label="Request password update: Client will receive a backend notification and email." onClick={() => onAction("request_password_update")}>
        <RefreshIcon />
      </IconButton>
      <span className="client-accounts-status-menu">
        <IconButton label={`Status actions for ${account.username}`} expanded={isMenuOpen} onClick={onToggleMenu}>
          <SlidersIcon />
        </IconButton>
        {isMenuOpen ? <StatusPopover account={account} onAction={onAction} /> : null}
      </span>
    </div>
  );
}

function StatusPopover({ account, onAction }: { account: BotAppClientAccount; onAction: (action: AccountStatusAction) => void }) {
  const operationsStatus = account.actionsNeeded.length ? "needs-assistance" : account.accountStatus;
  const items: Array<{ action: AccountStatusAction; label: string; description: string; danger?: boolean; disabled: boolean; icon: ReactElement }> = [
    { action: "pause", label: "Pause account", description: "Blocks runs but keeps the assigned slot and app instance.", disabled: operationsStatus === "paused", icon: <PauseIcon /> },
    { action: "cancel", label: "Cancel account", description: "Releases the slot and app instance when no run is active.", danger: true, disabled: operationsStatus === "cancelled", icon: <CancelIcon /> },
    { action: "mark_needs_assistance", label: "Mark needs assistance", description: "Blocks runs but keeps assignment for support review.", disabled: operationsStatus === "needs-assistance", icon: <LifeBuoyIcon /> },
    { action: "reactivate", label: "Reactivate account", description: "Requests reactivation; runtime gates still decide readiness.", disabled: operationsStatus === "active", icon: <RefreshIcon /> },
  ];
  return (
    <span className="client-accounts-status-popover" role="menu">
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className={item.danger ? "danger" : ""}
          disabled={item.disabled}
          onClick={() => onAction(item.action)}
        >
          {item.icon}
          <span>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </span>
        </button>
      ))}
    </span>
  );
}

function IconButton({ label, children, disabled = false, expanded, onClick }: { label: string; children: ReactElement; disabled?: boolean; expanded?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="client-accounts-icon-button" title={label} aria-label={label} disabled={disabled} aria-expanded={expanded} onClick={onClick}>
      {children}
    </button>
  );
}

function passwordLabel(value: BotAppClientAccount["passwordStatus"]) {
  if (value === "reauth_required") return "reauth required";
  if (value === "update_needed") return "update needed";
  return value;
}

function passwordTone(value: BotAppClientAccount["passwordStatus"]) {
  if (value === "configured") return "good";
  if (value === "reauth_required" || value === "update_needed") return "danger";
  if (value === "missing") return "warning";
  return "neutral";
}

function twoFactorTone(value: string) {
  if (value === "enabled" || value === "disabled") return "good";
  if (value === "code required") return "danger";
  if (value === "pending action" || value === "checkpoint" || value === "blocked") return "warning";
  return "neutral";
}

function UserIcon() {
  return <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}

function KeyIcon() {
  return <svg viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="4.5" /><path d="M11 12l9-9" /><path d="M15 7l2 2" /><path d="M17 5l2 2" /></svg>;
}

function RefreshIcon() {
  return <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>;
}

function SlidersIcon() {
  return <svg viewBox="0 0 24 24"><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M1 14h6" /><path d="M9 8h6" /><path d="M17 16h6" /></svg>;
}

function PauseIcon() {
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M10 8v8" /><path d="M14 8v8" /></svg>;
}

function CancelIcon() {
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6" /><path d="M9 9l6 6" /></svg>;
}

function LifeBuoyIcon() {
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><path d="M4.9 4.9l4.2 4.2" /><path d="M14.9 14.9l4.2 4.2" /><path d="M14.9 9.1l4.2-4.2" /><path d="M4.9 19.1l4.2-4.2" /></svg>;
}
