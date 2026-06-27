import type {
  BotAppNeedsMoreTargetsDeliveryState,
  BotAppNeedsMoreTargetsLifecycleDecision,
} from "../api/types";

export function formatNeedsMoreTargetsLifecycleDecision(
  decision: BotAppNeedsMoreTargetsLifecycleDecision,
) {
  switch (decision) {
    case "would_open_episode":
      return "Would open episode";
    case "would_keep_active":
      return "Would keep active";
    case "would_resolve_episode":
      return "Would resolve episode";
    default:
      return "No action";
  }
}

export function formatNeedsMoreTargetsDeliveryState(
  state: BotAppNeedsMoreTargetsDeliveryState,
) {
  switch (state) {
    case "delivery_ready":
      return "Delivery ready";
    case "blocked_missing_client_email":
      return "Blocked: missing client email";
    case "blocked_canceled_account":
      return "Blocked: canceled account";
    case "blocked_inactive_signal":
      return "Blocked: inactive signal";
    case "blocked_target_count_above_threshold":
      return "Blocked: above threshold";
    default:
      return state;
  }
}
