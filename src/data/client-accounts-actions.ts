import type { BotAppClientAccount } from "../api/types";

export type ClientAccountLifecycleAction = "pause" | "cancel" | "mark_needs_assistance" | "reactivate";

export type ClientAccountLifecycleAvailability = {
  action: ClientAccountLifecycleAction;
  disabled: boolean;
  disabledReason: string | null;
  requiresConfirmation: boolean;
};

type RelayHealthLike = {
  ok?: boolean;
  relay_authenticated?: boolean;
  message?: string | null;
} | null;

type RuntimeStatusLike = {
  relayUrlConfigured?: boolean;
  relayKeyConfigured?: boolean;
} | null;

const lifecycleActions: ClientAccountLifecycleAction[] = [
  "pause",
  "cancel",
  "mark_needs_assistance",
  "reactivate",
];

function operationsStatus(account: BotAppClientAccount) {
  return account.actionsNeeded.length > 0 ? "needs-assistance" : account.accountStatus;
}

function hasActiveRunSignal(account: BotAppClientAccount) {
  const reason = `${account.eligibilityReason} ${account.reasonLabel}`.toLowerCase();
  return ["running", "already_running", "active_run", "active request", "active_run"].some((term) => reason.includes(term));
}

export function relayActionsAvailable(relayHealth: RelayHealthLike, runtimeStatus: RuntimeStatusLike) {
  if (!runtimeStatus?.relayUrlConfigured || !runtimeStatus?.relayKeyConfigured) return false;
  if (!relayHealth?.ok) return false;
  if (relayHealth.relay_authenticated === false) return false;
  return true;
}

export function lifecycleActionAvailability(
  account: BotAppClientAccount,
  action: ClientAccountLifecycleAction,
  relayAvailable: boolean,
): ClientAccountLifecycleAvailability {
  const status = operationsStatus(account);

  if (!relayAvailable) {
    return {
      action,
      disabled: true,
      disabledReason: "Secure relay not connected — action unavailable.",
      requiresConfirmation: action === "cancel",
    };
  }

  if (action === "pause") {
    return {
      action,
      disabled: status === "paused" || status === "cancelled",
      disabledReason: status === "paused"
        ? "Account is already paused."
        : status === "cancelled"
          ? "Cancelled accounts cannot be paused."
          : null,
      requiresConfirmation: false,
    };
  }

  if (action === "cancel") {
    const runBlocked = hasActiveRunSignal(account);
    return {
      action,
      disabled: status === "cancelled" || runBlocked,
      disabledReason: status === "cancelled"
        ? "Account is already cancelled."
        : runBlocked
          ? "Cannot cancel while a run or run request is active."
          : null,
      requiresConfirmation: true,
    };
  }

  if (action === "mark_needs_assistance") {
    return {
      action,
      disabled: status === "needs-assistance" || status === "cancelled",
      disabledReason: status === "needs-assistance"
        ? "Account already needs assistance."
        : status === "cancelled"
          ? "Cancelled accounts cannot be marked for support."
          : null,
      requiresConfirmation: false,
    };
  }

  return {
    action,
    disabled: status === "active",
    disabledReason: status === "active" ? "Account is already active." : null,
    requiresConfirmation: false,
  };
}

export function buildLifecycleAvailability(
  account: BotAppClientAccount,
  relayAvailable: boolean,
): ClientAccountLifecycleAvailability[] {
  return lifecycleActions.map((action) => lifecycleActionAvailability(account, action, relayAvailable));
}

export function lifecycleActionLabel(action: ClientAccountLifecycleAction) {
  if (action === "pause") return "Pause account";
  if (action === "cancel") return "Cancel account";
  if (action === "mark_needs_assistance") return "Mark needs assistance";
  return "Reactivate account";
}

export type ApplyLifecycleActionInput = {
  account: BotAppClientAccount;
  action: ClientAccountLifecycleAction;
  confirmed?: boolean;
};

export type ApplyLifecycleActionDeps = {
  relayAvailable: boolean;
  send: (payload: {
    accountId: string;
    action: ClientAccountLifecycleAction;
    reason: string;
    metadata: Record<string, string>;
  }) => Promise<{ ok: boolean; error?: string | null }>;
};

export async function applyClientAccountLifecycleAction(
  input: ApplyLifecycleActionInput,
  deps: ApplyLifecycleActionDeps,
) {
  const availability = lifecycleActionAvailability(input.account, input.action, deps.relayAvailable);
  if (availability.disabled) {
    return { ok: false as const, error: availability.disabledReason || "Action unavailable." };
  }
  if (availability.requiresConfirmation && !input.confirmed) {
    return { ok: false as const, needsConfirmation: true as const };
  }

  const status = operationsStatus(input.account);
  const result = await deps.send({
    accountId: input.account.accountId,
    action: input.action,
    reason: `client_accounts_${input.action}`,
    metadata: {
      source_status: status,
      username: input.account.username,
      source_surface: "client_accounts",
    },
  });

  if (!result.ok) {
    return { ok: false as const, error: result.error || "Could not update account status." };
  }

  return { ok: true as const, label: lifecycleActionLabel(input.action) };
}
