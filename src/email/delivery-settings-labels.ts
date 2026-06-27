export function formatDeliverySettingsUxState(state: string | undefined | null) {
  switch (state) {
    case "schema_migration_pending":
      return "Schema migration pending";
    case "sender_sync_unavailable":
      return "Sender identity sync is not configured";
    case "no_confirmed_senders":
      return "No confirmed sender identities found";
    case "ready":
      return "Ready";
    default:
      return "Unavailable";
  }
}

export function formatDeliverySettingsSaveError(error: string | null | undefined) {
  if (!error) return "Save failed.";
  return error.replace(/postmark[_-]?account[_-]?token/gi, "[redacted]");
}
