import type { BotAppOutboxPreviewDecision } from "../api/types";

export function formatOutboxPreviewDecisionLabel(decision: BotAppOutboxPreviewDecision | string) {
  switch (decision) {
    case "would_open_episode":
      return "Would open episode";
    case "would_create_initial_intent":
      return "Would create initial intent";
    case "would_create_reminder_intent":
      return "Would create reminder intent";
    case "would_close_episode":
      return "Would close episode";
    case "would_cancel_episode":
      return "Would cancel episode";
    case "blocked_legacy_pre_watermark":
      return "Blocked: legacy pre-watermark";
    case "blocked_missing_client_email":
      return "Blocked: missing client email";
    case "blocked_template_unavailable":
      return "Blocked: template unavailable";
    case "blocked_delivery_gate":
      return "Blocked: delivery gate closed";
    default:
      return "No action";
  }
}

export function formatOutboxPreviewDeliveryStateLabel(state: string) {
  switch (state) {
    case "theoretical_dispatch_ready":
      return "Theoretically ready to dispatch";
    case "episode_only":
      return "Episode lifecycle only";
    case "blocked_legacy_pre_watermark":
      return "Blocked by missing watermark";
    case "blocked_missing_client_email":
      return "Blocked: missing client email";
    case "blocked_template_unavailable":
      return "Blocked: template unavailable";
    case "blocked_delivery_gate":
      return "Blocked: delivery gate closed";
    case "blocked_account_canceled":
      return "Blocked: account canceled";
    default:
      return "No action";
  }
}
