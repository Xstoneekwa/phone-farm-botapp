import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { BotAppClientAccount, BotAppRelayHealth, BotAppRuntimeIntegrationStatus } from "../../api/types";
import {
  applyClientAccountLifecycleAction,
  buildLifecycleAvailability,
  lifecycleActionLabel,
  relayActionsAvailable,
  type ClientAccountLifecycleAction,
  type ClientAccountLifecycleAvailability,
} from "../../data/client-accounts-actions";
import {
  applyNeedsMoreTargetsAction,
  needsMoreTargetsActionAvailability,
  type NeedsMoreTargetsAvailability,
} from "../../data/needs-more-targets-actions";

type AccountStatusActionMenuProps = {
  account: BotAppClientAccount;
  relayHealth: BotAppRelayHealth | null;
  runtimeStatus: BotAppRuntimeIntegrationStatus | null;
  isOpen: boolean;
  onClose: () => void;
  onMessage: (message: string, tone?: "success" | "error") => void;
  onRefresh: () => Promise<void> | void;
};

const lifecycleDescriptions: Record<ClientAccountLifecycleAction, string> = {
  pause: "Suspends billing and campaign activity. Slot and clone stay reserved.",
  cancel: "Cancels Stripe billing and releases slot when runtime is terminal.",
  mark_needs_assistance: "Blocks runs but keeps assignment for support review.",
  reactivate: "Resumes Stripe billing and campaign eligibility before pause expiry.",
};

export function AccountStatusActionMenu({
  account,
  relayHealth,
  runtimeStatus,
  isOpen,
  onClose,
  onMessage,
  onRefresh,
}: AccountStatusActionMenuProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [pendingNeedsMoreTargets, setPendingNeedsMoreTargets] = useState<NeedsMoreTargetsAvailability | null>(null);
  const relayAvailable = relayActionsAvailable(relayHealth, {
    relayUrlConfigured: runtimeStatus?.compassAi?.relayUrlConfigured,
    relayKeyConfigured: runtimeStatus?.compassAi?.relayKeyConfigured,
  });
  const availability = useMemo(
    () => buildLifecycleAvailability(account, relayAvailable),
    [account, relayAvailable],
  );
  const needsMoreTargetsAvailability = useMemo(
    () => needsMoreTargetsActionAvailability(account, relayAvailable),
    [account, relayAvailable],
  );

  useEffect(() => {
    if (!isOpen) {
      setPendingCancel(false);
      setPendingNeedsMoreTargets(null);
    }
  }, [isOpen]);

  async function runAction(action: ClientAccountLifecycleAction, confirmed = false) {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await applyClientAccountLifecycleAction(
        { account, action, confirmed },
        {
          relayAvailable,
          send: async (payload: {
            accountId: string;
            action: ClientAccountLifecycleAction;
            reason: string;
            metadata: Record<string, string>;
          }) => {
            const response = await window.botappDesktop?.clientAccounts?.applyStatus?.(payload);
            return {
              ok: Boolean(response?.ok),
              error: response?.error || null,
              data: (response?.data && typeof response.data === "object") ? response.data as Record<string, unknown> : undefined,
            };
          },
        },
      );

      if ("needsConfirmation" in result && result.needsConfirmation) {
        setPendingCancel(true);
        return;
      }

      if (!result.ok) {
        onMessage(result.error || "Could not update account status.", "error");
        return;
      }

      if ("pending" in result && result.pending) {
        onMessage(
          `${account.username}: ${result.label} — convergence en cours${result.reason ? ` (${result.reason})` : ""}.`,
          "error",
        );
        await onRefresh();
        return;
      }

      onClose();
      setPendingCancel(false);
      onMessage(`${account.username}: ${result.label} updated.`, "success");
      await onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function runNeedsMoreTargetsAction(confirmed = false) {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await applyNeedsMoreTargetsAction(
        { account, confirmed },
        {
          relayAvailable,
          send: async (payload) => {
            const response = await window.botappDesktop?.clientAccounts?.applyNeedsMoreTargets?.(payload);
            return { ok: Boolean(response?.ok), error: response?.error || null };
          },
        },
      );

      if ("needsConfirmation" in result && result.needsConfirmation) {
        setPendingNeedsMoreTargets(result.availability);
        return;
      }

      if (!result.ok) {
        onMessage(result.error || "Could not update needs more targets signal.", "error");
        return;
      }

      onClose();
      setPendingNeedsMoreTargets(null);
      onMessage(`${account.username}: ${result.label} updated.`, "success");
      await onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <span className="client-accounts-status-popover" role="menu">
        {!relayAvailable ? (
          <small className="client-accounts-status-menu-relay">
            Secure relay not connected — action unavailable.
          </small>
        ) : null}
        {availability.map((item: ClientAccountLifecycleAvailability) => {
          const description = item.disabledReason || lifecycleDescriptions[item.action];
          const danger = item.action === "cancel";
          return (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              className={danger ? "danger" : ""}
              disabled={isSaving || item.disabled}
              title={description}
              aria-label={`${lifecycleActionLabel(item.action)}: ${description}`}
              onClick={() => void runAction(item.action)}
            >
              {lifecycleIcon(item.action)}
              <span>
                <strong>{lifecycleActionLabel(item.action)}</strong>
                <small>{description}</small>
              </span>
            </button>
          );
        })}
        <span className="client-accounts-status-menu-divider" aria-hidden="true" />
        <button
          type="button"
          role="menuitem"
          disabled={isSaving || needsMoreTargetsAvailability.disabled}
          title={needsMoreTargetsAvailability.disabledReason || needsMoreTargetsAvailability.description}
          aria-label={`${needsMoreTargetsAvailability.label}: ${needsMoreTargetsAvailability.description}`}
          onClick={() => void runNeedsMoreTargetsAction()}
        >
          <TargetsIcon />
          <span>
            <strong>{needsMoreTargetsAvailability.label}</strong>
            <small>{needsMoreTargetsAvailability.disabledReason || needsMoreTargetsAvailability.description}</small>
          </span>
        </button>
      </span>

      {pendingNeedsMoreTargets ? (
        <div className="client-accounts-confirm-backdrop" role="presentation" onMouseDown={() => setPendingNeedsMoreTargets(null)}>
          <section
            className="client-accounts-confirm"
            role="dialog"
            aria-modal="true"
            aria-label={pendingNeedsMoreTargets.label}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span>{pendingNeedsMoreTargets.label}</span>
            <h3>{pendingNeedsMoreTargets.action === "clear" ? `Clear signal for @${account.username}?` : `Signal needs more targets for @${account.username}?`}</h3>
            <p>{pendingNeedsMoreTargets.description} This is audited on the backend and does not start runs, login, or phone actions.</p>
            <div className="client-accounts-confirm-actions">
              <button type="button" onClick={() => setPendingNeedsMoreTargets(null)} disabled={isSaving}>Keep current state</button>
              <button type="button" disabled={isSaving} onClick={() => void runNeedsMoreTargetsAction(true)}>
                {isSaving ? "Saving…" : pendingNeedsMoreTargets.label}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingCancel ? (
        <div className="client-accounts-confirm-backdrop" role="presentation" onMouseDown={() => setPendingCancel(false)}>
          <section
            className="client-accounts-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Cancel account"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span>Cancel account</span>
            <h3>Cancel @{account.username}?</h3>
            <p>
              Releases the slot and app instance only when no run is active. This action is audited on the backend.
            </p>
            <div className="client-accounts-confirm-actions">
              <button type="button" onClick={() => setPendingCancel(false)} disabled={isSaving}>Keep account</button>
              <button type="button" className="danger" disabled={isSaving} onClick={() => void runAction("cancel", true)}>
                {isSaving ? "Cancelling…" : "Cancel account"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function lifecycleIcon(action: ClientAccountLifecycleAction): ReactElement {
  if (action === "pause") return <PauseIcon />;
  if (action === "cancel") return <CancelIcon />;
  if (action === "mark_needs_assistance") return <LifeBuoyIcon />;
  return <RefreshIcon />;
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

function RefreshIcon() {
  return <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>;
}

function TargetsIcon() {
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /></svg>;
}
