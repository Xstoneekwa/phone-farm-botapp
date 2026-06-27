import type {
  BotAppAccountLifecycleDeliveryState,
  BotAppAccountLifecyclePreviewDecision,
} from "../api/types";

export function formatAccountLifecycleDecision(
  decision: BotAppAccountLifecyclePreviewDecision,
) {
  switch (decision) {
    case "would_open_episode_on_future_transition":
      return "Would open on future transition";
    case "would_keep_active":
      return "Would keep active";
    case "would_resolve_episode":
      return "Would resolve episode";
    case "legacy_state_no_backfill":
      return "Legacy state (no backfill)";
    default:
      return "No action";
  }
}

export function formatAccountLifecycleDeliveryState(
  state: BotAppAccountLifecycleDeliveryState,
) {
  switch (state) {
    case "delivery_ready":
      return "Delivery ready";
    case "blocked_missing_client_email":
      return "Blocked: missing client email";
    case "blocked_canceled_account":
      return "Blocked: canceled account";
    case "blocked_missing_transition_evidence":
      return "Blocked: missing transition evidence";
    default:
      return state;
  }
}
