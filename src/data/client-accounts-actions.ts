import type { BotAppClientAccount } from "../api/types";

export type ClientAccountLifecycleAction = "pause" | "cancel" | "mark_needs_assistance" | "reactivate";
export type ClientAccountLifecycleLocale = "en" | "fr";
export type ClientAccountPrimaryStatus =
  | "cancelled"
  | "paused"
  | "needs_assistance"
  | "operator_review_required"
  | "login_required"
  | "identity_verification_required"
  | "needs_more_target_accounts"
  | "target_replacement_required"
  | "target_removed"
  | "active"
  | "pending";

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

const copy = {
  en: {
    statuses: {
      cancelled: "cancelled",
      paused: "paused",
      needs_assistance: "needs assistance",
      operator_review_required: "operator review required",
      login_required: "login required",
      identity_verification_required: "identity verification required",
      needs_more_target_accounts: "needs more target accounts",
      target_replacement_required: "target replacement required",
      target_removed: "target removed",
      active: "active",
      pending: "pending",
    },
    actions: {
      pause: { label: "Suspend campaign", description: "Suspends billing and campaign activity. The phone and clone remain reserved." },
      reactivate: { label: "Resume campaign", description: "Resumes billing and campaign eligibility." },
      cancel: { label: "Cancel account service", description: "Cancels the subscription and starts the cancellation lifecycle." },
      mark_needs_assistance: { label: "Mark needs assistance", description: "Blocks business runs while keeping the assignment available for support review." },
    },
    reasons: {
      relay: "Secure relay not connected — action unavailable.",
      alreadyPaused: "Campaign is already paused.",
      alreadyActive: "Campaign is already active.",
      alreadyCancelled: "Account is cancelled.",
      notPaused: "Only a paused campaign can be resumed.",
      notActive: "Only an active campaign can be paused.",
      activeRun: "Wait for the active run or request to finish before cancelling.",
      alreadyNeedsAssistance: "Account already needs assistance.",
    },
  },
  fr: {
    statuses: {
      cancelled: "résilié",
      paused: "en pause",
      needs_assistance: "assistance requise",
      operator_review_required: "revue opérateur requise",
      login_required: "connexion requise",
      identity_verification_required: "vérification d’identité requise",
      needs_more_target_accounts: "comptes cibles supplémentaires requis",
      target_replacement_required: "remplacement de compte cible requis",
      target_removed: "compte cible retiré",
      active: "actif",
      pending: "en attente",
    },
    actions: {
      pause: { label: "Suspendre la campagne", description: "Suspend la facturation et l’activité de la campagne. Le téléphone et le clone restent réservés." },
      reactivate: { label: "Reprendre la campagne", description: "Réactive la facturation et l’éligibilité de la campagne." },
      cancel: { label: "Résilier le service du compte", description: "Résilie l’abonnement et engage le lifecycle d’annulation." },
      mark_needs_assistance: { label: "Signaler un besoin d’assistance", description: "Bloque les runs métier tout en conservant l’affectation pour la revue support." },
    },
    reasons: {
      relay: "Relais sécurisé non connecté — action indisponible.",
      alreadyPaused: "La campagne est déjà en pause.",
      alreadyActive: "La campagne est déjà active.",
      alreadyCancelled: "Le compte est résilié.",
      notPaused: "Seule une campagne en pause peut être reprise.",
      notActive: "Seule une campagne active peut être suspendue.",
      activeRun: "Attendez la fin du run ou de la demande active avant de résilier.",
      alreadyNeedsAssistance: "Le compte nécessite déjà une assistance.",
    },
  },
} as const;

function hasActiveRun(account: BotAppClientAccount): boolean {
  const reason = `${account.eligibilityReason || ""} ${account.reasonLabel || ""}`.toLowerCase();
  return /already_running|active_run|run_request_active|account_session_running/.test(reason);
}

function hasOperatorReview(account: BotAppClientAccount): boolean {
  const reason = `${account.eligibilityReason || ""} ${account.reasonLabel || ""} ${account.actionsNeeded.join(" ")}`.toLowerCase();
  return /operator.review|blocking.dashboard.action/.test(reason);
}

export function clientAccountPrimaryStatus(account: BotAppClientAccount): ClientAccountPrimaryStatus {
  if (account.accountStatus === "cancelled" || account.lifecycleStatus === "deleted") return "cancelled";
  if (account.accountStatus === "paused") return "paused";
  if (hasOperatorReview(account)) return "operator_review_required";
  if (account.actionsNeeded.length > 0) return "needs_assistance";
  if (account.loginStatus !== "connected") return "login_required";
  if (/identity/.test(`${account.eligibilityReason} ${account.reasonLabel}`.toLowerCase())) return "identity_verification_required";
  if (account.needsMoreTargets) return "needs_more_target_accounts";
  if (/target_replacement/.test(`${account.eligibilityReason} ${account.reasonLabel}`.toLowerCase())) return "target_replacement_required";
  if (/target_removed/.test(`${account.eligibilityReason} ${account.reasonLabel}`.toLowerCase())) return "target_removed";
  if (account.accountStatus === "active" && account.readiness === "ready") return "active";
  return "pending";
}

export function lifecycleActionCopy(action: ClientAccountLifecycleAction, locale: ClientAccountLifecycleLocale = "en") {
  return copy[locale].actions[action];
}

export function clientAccountStatusCopy(
  status: ClientAccountPrimaryStatus,
  locale: ClientAccountLifecycleLocale = "en",
) {
  return copy[locale].statuses[status];
}

export function lifecycleDisabledReason(
  key: keyof typeof copy.en.reasons,
  locale: ClientAccountLifecycleLocale = "en",
) {
  return copy[locale].reasons[key];
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
  locale: ClientAccountLifecycleLocale = "en",
): ClientAccountLifecycleAvailability {
  const status = account.accountStatus;

  if (!relayAvailable) {
    return {
      action,
      disabled: true,
      disabledReason: lifecycleDisabledReason("relay", locale),
      requiresConfirmation: action === "cancel",
    };
  }

  if (action === "pause") {
    const disabled = status !== "active";
    return {
      action,
      disabled,
      disabledReason: status === "paused"
        ? lifecycleDisabledReason("alreadyPaused", locale)
        : status === "cancelled"
          ? lifecycleDisabledReason("alreadyCancelled", locale)
          : disabled
            ? lifecycleDisabledReason("notActive", locale)
            : null,
      requiresConfirmation: false,
    };
  }

  if (action === "cancel") {
    const activeRun = hasActiveRun(account);
    return {
      action,
      disabled: status === "cancelled" || activeRun,
      disabledReason: status === "cancelled"
        ? lifecycleDisabledReason("alreadyCancelled", locale)
        : activeRun
          ? lifecycleDisabledReason("activeRun", locale)
          : null,
      requiresConfirmation: true,
    };
  }

  if (action === "mark_needs_assistance") {
    return {
      action,
      disabled: account.actionsNeeded.length > 0 || status === "cancelled",
      disabledReason: account.actionsNeeded.length > 0
        ? lifecycleDisabledReason("alreadyNeedsAssistance", locale)
        : status === "cancelled"
          ? lifecycleDisabledReason("alreadyCancelled", locale)
          : null,
      requiresConfirmation: false,
    };
  }

  const disabled = status !== "paused";
  return {
    action,
    disabled,
    disabledReason: status === "active"
      ? lifecycleDisabledReason("alreadyActive", locale)
      : status === "cancelled"
        ? lifecycleDisabledReason("alreadyCancelled", locale)
        : disabled
          ? lifecycleDisabledReason("notPaused", locale)
          : null,
    requiresConfirmation: false,
  };
}

export function buildLifecycleAvailability(
  account: BotAppClientAccount,
  relayAvailable: boolean,
  locale: ClientAccountLifecycleLocale = "en",
): ClientAccountLifecycleAvailability[] {
  return lifecycleActions.map((action) => lifecycleActionAvailability(account, action, relayAvailable, locale));
}

export function lifecycleActionLabel(action: ClientAccountLifecycleAction, locale: ClientAccountLifecycleLocale = "en") {
  return lifecycleActionCopy(action, locale).label;
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
  }) => Promise<{ ok: boolean; error?: string | null; data?: Record<string, unknown> }>;
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

  const status = input.account.accountStatus;
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

  const data = result.data ?? {};
  const actionRequired = data.action_required === true;
  const converged = data.converged !== false;
  if (actionRequired || !converged) {
    return {
      ok: true as const,
      label: lifecycleActionLabel(input.action),
      pending: true as const,
      reason: typeof data.action_required_reason === "string" ? data.action_required_reason : null,
    };
  }

  return { ok: true as const, label: lifecycleActionLabel(input.action) };
}
