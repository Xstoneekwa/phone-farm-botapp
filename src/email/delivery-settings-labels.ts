import type { BotAppEmailDeliverySettingsProjection } from "../api/types";

export function formatDeliverySettingsUxState(
  state: BotAppEmailDeliverySettingsProjection["uxState"] | string | undefined | null,
) {
  switch (state) {
    case "schema_migration_pending":
      return "Schema migration pending";
    case "not_configured":
      return "Sender identity sync is not configured";
    case "not_refreshed":
      return "Refresh sender identities";
    case "invalid_credentials":
      return "Postmark Account Token rejected";
    case "provider_unavailable":
      return "Postmark sync unavailable";
    case "no_confirmed_senders":
      return "No confirmed sender identities found";
    case "ready":
      return "Ready";
    case "stale":
      return "Sender identities stale";
    default:
      return "Unavailable";
  }
}

export function formatDeliverySettingsSaveError(error: string | null | undefined) {
  if (!error) return "Save failed.";
  return error.replace(/postmark[_-]?account[_-]?token/gi, "[redacted]");
}

export function deliverySettingsBadgeTone(
  uxState: BotAppEmailDeliverySettingsProjection["uxState"] | string | undefined | null,
): "success" | "warning" | "neutral" {
  if (uxState === "ready") return "success";
  if (uxState === "schema_migration_pending" || uxState === "not_configured") return "neutral";
  return "warning";
}
