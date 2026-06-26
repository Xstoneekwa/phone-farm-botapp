import type { BotAppClientAccount } from "../api/types";

export type NeedsMoreTargetsAction = "mark" | "clear";

export type NeedsMoreTargetsAvailability = {
  action: NeedsMoreTargetsAction;
  label: string;
  disabled: boolean;
  disabledReason: string | null;
  requiresConfirmation: boolean;
  description: string;
};

export function needsMoreTargetsActionLabel(action: NeedsMoreTargetsAction) {
  if (action === "clear") return "Clear needs more targets";
  return "Needs more target accounts";
}

export function needsMoreTargetsActionAvailability(
  account: BotAppClientAccount,
  relayAvailable: boolean,
): NeedsMoreTargetsAvailability {
  const action: NeedsMoreTargetsAction = account.needsMoreTargets ? "clear" : "mark";
  const eligibleCount = Number.isFinite(account.eligibleTargetCount) ? account.eligibleTargetCount : 0;

  if (!relayAvailable) {
    return {
      action,
      label: needsMoreTargetsActionLabel(action),
      disabled: true,
      disabledReason: "Secure relay not connected — action unavailable.",
      requiresConfirmation: true,
      description: "Inform operations that this account needs more eligible target accounts.",
    };
  }

  if (action === "clear") {
    return {
      action,
      label: needsMoreTargetsActionLabel(action),
      disabled: false,
      disabledReason: null,
      requiresConfirmation: true,
      description: `Dismiss the active needs-more-targets signal (${eligibleCount} eligible CT).`,
    };
  }

  return {
    action,
    label: needsMoreTargetsActionLabel(action),
    disabled: false,
    disabledReason: null,
    requiresConfirmation: true,
    description: `Signal operations that @${account.username} needs more eligible target accounts (${eligibleCount} eligible CT).`,
  };
}

export type ApplyNeedsMoreTargetsInput = {
  account: BotAppClientAccount;
  confirmed?: boolean;
};

export type ApplyNeedsMoreTargetsDeps = {
  relayAvailable: boolean;
  send: (payload: {
    accountId: string;
    action: NeedsMoreTargetsAction;
    reason: string;
    metadata: Record<string, string>;
  }) => Promise<{ ok: boolean; error?: string | null }>;
};

export async function applyNeedsMoreTargetsAction(
  input: ApplyNeedsMoreTargetsInput,
  deps: ApplyNeedsMoreTargetsDeps,
) {
  const availability = needsMoreTargetsActionAvailability(input.account, deps.relayAvailable);
  if (availability.disabled) {
    return { ok: false as const, error: availability.disabledReason || "Action unavailable." };
  }
  if (availability.requiresConfirmation && !input.confirmed) {
    return { ok: false as const, needsConfirmation: true as const, availability };
  }

  const result = await deps.send({
    accountId: input.account.accountId,
    action: availability.action,
    reason: `client_accounts_needs_more_targets_${availability.action}`,
    metadata: {
      source_surface: "client_accounts",
      username: input.account.username,
      eligible_target_count: String(input.account.eligibleTargetCount ?? 0),
      expected_effect: "needs_more_target_accounts_signal_only",
    },
  });

  if (!result.ok) {
    return { ok: false as const, error: result.error || "Could not update needs more targets signal." };
  }

  return { ok: true as const, label: availability.label, action: availability.action };
}
