import assert from "node:assert/strict";
import test from "node:test";
import { formatDeliverySettingsSaveError, formatDeliverySettingsUxState } from "./delivery-settings-labels.ts";

test("delivery settings ux labels cover required states", () => {
  assert.equal(formatDeliverySettingsUxState("schema_migration_pending"), "Schema migration pending");
  assert.equal(formatDeliverySettingsUxState("sender_sync_unavailable"), "Sender identity sync is not configured");
  assert.equal(formatDeliverySettingsUxState("no_confirmed_senders"), "No confirmed sender identities found");
  assert.equal(formatDeliverySettingsUxState("ready"), "Ready");
});

test("delivery settings save errors are redacted", () => {
  assert.match(formatDeliverySettingsSaveError("POSTMARK_ACCOUNT_TOKEN missing"), /\[redacted\]/i);
});
